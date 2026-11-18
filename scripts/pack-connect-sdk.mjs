import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const destination = resolve(root, 'artifacts/connect-sdk');
mkdirSync(destination, { recursive: true });
for (const directory of ['connect-protocol', 'connect', 'react']) {
  const cwd = resolve(root, 'packages', directory);
  const source = JSON.parse(readFileSync(resolve(cwd, 'package.json'), 'utf8'));
  execFileSync('pnpm', ['pack', '--pack-destination', destination], { cwd, stdio: 'inherit' });
  const archive = resolve(destination, `${source.name.replace('@', '').replace('/', '-')}-${source.version}.tgz`);
  const files = execFileSync('tar', ['-tzf', archive], { encoding: 'utf8' }).trim().split('\n');
  for (const file of files) {
    assert.match(file, /^package\/(?:package\.json|README\.md|LICENSE|dist\/[\w/.-]+\.(?:js|d\.ts))$/, `Unexpected publish content: ${file}`);
  }
  for (const required of ['LICENSE', 'README.md', 'dist/index.js', 'dist/index.d.ts']) {
    assert.ok(files.includes(`package/${required}`), `${source.name} missing ${required}`);
  }
  const manifestText = execFileSync('tar', ['-xOzf', archive, 'package/package.json'], { encoding: 'utf8' });
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.name, source.name);
  assert.equal(manifest.version, source.version);
  assert.equal(manifest.publishConfig.access, 'public');
  assert.ok(!manifest.private);
  assert.ok(!manifestText.includes('workspace:'), 'Use pnpm pack to replace workspace dependencies');
  for (const [name, version] of Object.entries(manifest.dependencies || {})) {
    assert.ok(!/^(?:file:|link:)/.test(version), `Local dependency: ${name}`);
    if (name.startsWith('@zeni/')) {
      assert.ok(['@zeni/connect', '@zeni/connect-protocol'].includes(name), `Private runtime dependency: ${name}`);
      const dependency = JSON.parse(readFileSync(resolve(root, 'packages', name.slice(6), 'package.json'), 'utf8'));
      assert.equal(version, `^${dependency.version}`);
    }
  }
  console.log(`Verified ${archive} (${files.length} public files)`);
}
