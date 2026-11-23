import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../public/manifest.json', import.meta.url), 'utf8'));
const sites = ['https://*/*', 'http://localhost/*', 'http://127.0.0.1/*'];

test('provider supports HTTPS apps and loopback development without subframes or script tags', () => {
  assert.equal(manifest.content_scripts.length, 2);
  for (const script of manifest.content_scripts) {
    assert.deepEqual(script.matches, sites);
    assert.equal(script.all_frames, false);
    assert.equal(script.run_at, 'document_start');
    assert.equal(script.match_origin_as_fallback, undefined);
  }
  assert.deepEqual(manifest.content_scripts[0].js, ['content.js']);
  assert.equal(manifest.content_scripts[0].world, undefined);
  assert.deepEqual(manifest.content_scripts[1].js, ['inpage.js']);
  assert.equal(manifest.content_scripts[1].world, 'MAIN');
  assert.deepEqual(manifest.web_accessible_resources, []);
});

test('store beta requests only storage and the two necessary RPC hosts', () => {
  assert.deepEqual(manifest.permissions, ['storage']);
  assert.deepEqual(manifest.host_permissions, ['https://api-testnet.qore.host/*', 'https://evm-testnet.qore.host/*']);
  assert.equal(manifest.optional_host_permissions, undefined);
  assert.equal(manifest.optional_permissions, undefined);
});

test('manifest and extension package versions agree', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.name, 'Zeni — Self-Custody Wallet for QoreChain');
  assert.ok(manifest.description.length <= 132);
});
