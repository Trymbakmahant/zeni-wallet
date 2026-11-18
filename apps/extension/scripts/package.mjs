// Always create a fresh archive so old hashed bundles cannot survive a rebuild.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const dist = join(root, 'apps/extension/dist');
const sourceManifest = readFileSync(join(root, 'apps/extension/public/manifest.json'), 'utf8');
assert.equal(readFileSync(join(dist, 'manifest.json'), 'utf8'), sourceManifest, 'Rebuild before packaging');
const manifest = JSON.parse(sourceManifest);
assert.equal(JSON.parse(readFileSync(join(root, 'apps/extension/package.json'), 'utf8')).version, manifest.version, 'Manifest and package versions must match');
const files = [];
function visit(directory, prefix = '') {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = prefix + entry.name;
    if (entry.isDirectory()) visit(join(directory, entry.name), relative + '/');
    else {
      assert.ok(entry.isFile(), `Unexpected symlink: ${relative}`);
      assert.match(relative, /^(?:manifest\.json|index\.html|(?:background|content|inpage)\.js|(?:assets|icons|art)\/[\w.-]+\.(?:js|css|png|jpg|svg))$/, `Unexpected release file: ${relative}`);
      files.push(relative);
    }
  }
}
visit(dist);
for (const file of ['manifest.json', manifest.action.default_popup, manifest.background.service_worker, ...Object.values(manifest.icons), ...manifest.content_scripts.flatMap(script => script.js), ...manifest.web_accessible_resources.flatMap(resource => resource.resources)]) {
  assert.ok(files.includes(file), `Missing manifest resource: ${file}`);
}
const destination = join(root, 'artifacts/extension');
mkdirSync(destination, { recursive: true });
const temporary = mkdtempSync(join(destination, '.package-'));
try {
  const archive = join(temporary, 'extension.zip');
  execFileSync('zip', ['-q', '-X', archive, ...files.sort()], { cwd: dist, stdio: 'inherit' });
  execFileSync('unzip', ['-tq', archive], { stdio: 'inherit' });
  const packaged = execFileSync('unzip', ['-p', archive, 'manifest.json'], { encoding: 'utf8' });
  assert.equal(packaged, sourceManifest);
  for (const file of files) {
    assert.deepEqual(execFileSync('unzip', ['-p', archive, file], { maxBuffer: 32 * 1024 * 1024 }), readFileSync(join(dist, file)), `ZIP differs from build: ${file}`);
  }
  const target = join(destination, `zeni-wallet-extension-${manifest.version}.zip`);
  renameSync(archive, target);
  copyFileSync(target, join(root, 'zeni-wallet-extension.zip'));
  const filename = `zeni-wallet-extension-${manifest.version}.zip`;
  const sha256 = createHash('sha256').update(readFileSync(target)).digest('hex');
  const downloads = join(root, 'apps/web/public/downloads');
  mkdirSync(downloads, { recursive: true });
  copyFileSync(target, join(downloads, filename));
  // The landing page imports this metadata instead of maintaining its own version.
  writeFileSync(join(root, 'apps/web/src/extension-release.json'), JSON.stringify({ version: manifest.version, filename, sha256 }, null, 2) + '\n');
  console.log(`Upload ZIP: ${target}`);
  console.log(`Files: ${files.length}; bytes: ${readFileSync(target).length}`);
  console.log(`Landing page download: ${filename}`);
  console.log(`SHA-256: ${sha256}`);
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
