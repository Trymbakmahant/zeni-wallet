// Install the actual release archives outside the workspace. No wallet connection or broadcast.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const cwd = mkdtempSync(join(tmpdir(), 'zeni-sdk-consumer-'));
try {
  const archives = ['connect-protocol', 'connect', 'react'].map(directory => {
    const { name, version } = JSON.parse(readFileSync(join(root, 'packages', directory, 'package.json'), 'utf8'));
    return join(root, 'artifacts/connect-sdk', `${name.replace('@', '').replace('/', '-')}-${version}.tgz`);
  });
  writeFileSync(join(cwd, 'package.json'), JSON.stringify({ name: 'zeni-sdk-consumer-check', private: true, type: 'module' }));
  writeFileSync(join(cwd, 'check.mjs'), `
import assert from 'node:assert/strict';
import { secret, seal, open } from '@zeni/connect-protocol';
import { ZeniProvider } from '@zeni/connect';
import { useBrowserWallet, ZeniConnectButton, ZeniConnectProvider, useZeni } from '@zeni/react';
const key = secret(), session = 'a'.repeat(32), message = { type: 'disconnect' };
assert.deepEqual(await open(key, session, 'dapp', await seal(key, session, 'dapp', message)), message);
const provider = new ZeniProvider({ name: 'Install check', relayUrl: 'https://relay.example' });
assert.equal(await provider.request({ method: 'eth_chainId' }), '0x2648');
assert.deepEqual(await provider.request({ method: 'eth_accounts' }), []);
for (const exported of [useBrowserWallet, ZeniConnectButton, ZeniConnectProvider, useZeni]) assert.equal(typeof exported, 'function');
`);
  writeFileSync(join(cwd, 'check.tsx'), `
import { ZeniProvider, type ZeniProviderOptions } from '@zeni/connect';
import { ZeniConnectButton, ZeniConnectProvider, useBrowserWallet, useZeni, type BrowserProvider } from '@zeni/react';
const options: ZeniProviderOptions = { name: 'Types check', relayUrl: 'https://relay.example' };
const provider = new ZeniProvider(options);
void provider.request({ method: 'eth_accounts' });
function Actions() {
  const extension = useBrowserWallet();
  const mobile = useZeni();
  const injected: BrowserProvider | null = extension.provider;
  return <button onClick={() => void (injected ? extension.connect() : mobile.connect())}>Connect</button>;
}
export const App = () => <ZeniConnectProvider {...options}><ZeniConnectButton /><Actions /></ZeniConnectProvider>;
`);
  for (const major of [18, 19]) {
    execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--registry=https://registry.npmjs.org', ...archives, `react@${major}`, `@types/react@${major}`, 'typescript@^5.4.5'], { cwd, stdio: 'inherit' });
    execFileSync(process.execPath, ['check.mjs'], { cwd, stdio: 'inherit' });
    execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--noEmit', '--strict', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', '--jsx', 'react-jsx', 'check.tsx'], { cwd, stdio: 'inherit' });
    console.log(`PASS: npm tarball installation, runtime imports, encryption round trip and TypeScript consumer with React ${major}`);
  }
} finally {
  rmSync(cwd, { recursive: true, force: true });
}
