// Fail a web deployment if its advertised extension ZIP is missing or mismatched.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const release = JSON.parse(readFileSync(new URL('../../web/src/extension-release.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(readFileSync(new URL('../public/manifest.json', import.meta.url), 'utf8'));
assert.match(release.version, /^\d+\.\d+\.\d+$/);
assert.equal(release.version, manifest.version, 'Run pnpm zip:ext to update the landing download');
assert.equal(release.filename, `zeni-wallet-extension-${release.version}.zip`);
const archive = new URL(`../../web/public/downloads/${release.filename}`, import.meta.url);
assert.equal(createHash('sha256').update(readFileSync(archive)).digest('hex'), release.sha256, 'Landing download checksum mismatch');
assert.deepEqual(JSON.parse(execFileSync('unzip', ['-p', fileURLToPath(archive), 'manifest.json'], { encoding: 'utf8' })), manifest, 'Landing ZIP manifest differs from source');
console.log(`Verified landing download: ${release.filename}`);
