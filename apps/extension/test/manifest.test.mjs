import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const manifest = JSON.parse(readFileSync(new URL('../public/manifest.json', import.meta.url), 'utf8'));
const sites = ['https://zeni-connect-demo.vercel.app/*', 'https://zeni-wallet.vercel.app/*'];

test('store beta injects only on the demo and docs HTTPS origins', () => {
  assert.equal(manifest.content_scripts.length, 1);
  assert.deepEqual(manifest.content_scripts[0].matches, sites);
  assert.equal(manifest.content_scripts[0].all_frames, false);
  assert.equal(manifest.web_accessible_resources.length, 1);
  assert.deepEqual(manifest.web_accessible_resources[0].matches, sites);
  assert.deepEqual(manifest.web_accessible_resources[0].resources, ['inpage.js']);
  assert.equal(manifest.content_scripts[0].match_origin_as_fallback, undefined);
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
  assert.equal(manifest.name, 'Zeni Wallet — QoreChain Testnet');
});
