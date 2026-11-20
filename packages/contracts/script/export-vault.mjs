import { readFileSync, writeFileSync } from 'node:fs';
const artifact = JSON.parse(readFileSync(new URL('../out/ZeniTestVault.sol/ZeniTestVault.json', import.meta.url)));
writeFileSync(new URL('../../../apps/web/src/vault/artifact.json', import.meta.url), JSON.stringify({
  abi: artifact.abi, bytecode: artifact.bytecode.object, deployedBytecode: artifact.deployedBytecode.object,
}, null, 2) + '\n');
console.log('Exported vault ABI and bytecode.');
