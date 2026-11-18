// Read-only Diana diagnostics. Never reads wallet secrets or sends transactions.
import { ethers } from 'ethers';
import { mldsa87 } from '@qorechain/pqc';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const RPC_URL = 'https://evm-testnet.qore.host';
export const VERIFY = '0x0000000000000000000000000000000000000a01';
export const STATUS = '0x0000000000000000000000000000000000000a02';
export const abi = new ethers.Interface([
  'function pqcVerify(bytes pubkey, bytes signature, bytes message) view returns (bool)',
  'function pqcKeyStatus(address account) view returns (bool registered, uint8 algorithmId, bytes pubkey)',
]);

export async function diagnose(provider, account, proof) {
  account = ethers.getAddress(account);
  if (account === ethers.ZeroAddress) throw new Error('Use a nonzero account address.');
  if (BigInt(await provider.send('eth_chainId', [])) !== 9800n) throw new Error('Expected Diana chain ID 9800.');
  const block = await provider.send('eth_blockNumber', []);
  if (!/^0x[0-9a-f]+$/i.test(block)) throw new Error('Invalid block number.');
  const call = async (to, name, args) => abi.decodeFunctionResult(name, await provider.send('eth_call', [
    { to, data: abi.encodeFunctionData(name, args) }, block,
  ]));
  const [registered, algorithmId, pubkey] = await call(STATUS, 'pqcKeyStatus', [account]);
  if (registered && (algorithmId !== 1n || ethers.getBytes(pubkey).length !== 2592)) {
    throw new Error('Unsupported or malformed registered PQC key.');
  }
  // Random, disposable self-test key. Never registered, saved, or used as an account key.
  const keypair = mldsa87.keygen(ethers.randomBytes(32));
  try {
    const message = ethers.randomBytes(32);
    const signature = mldsa87.sign(keypair.secretKey, message);
    const args = [ethers.hexlify(keypair.publicKey), ethers.hexlify(signature), ethers.hexlify(message)];
    const [valid] = await call(VERIFY, 'pqcVerify', args);
    if (valid !== true) throw new Error('PQC precompile rejected a valid diagnostic signature.');
    message[0] ^= 1;
    const [invalid] = await call(VERIFY, 'pqcVerify', [args[0], args[1], ethers.hexlify(message)]);
    if (invalid !== false) throw new Error('PQC precompile accepted an altered message.');
    let registeredSignature = 'not supplied';
    if (proof !== undefined) {
      if (!registered) throw new Error('Cannot verify an account signature without a registered key.');
      if (!proof || !ethers.isHexString(proof.message) || !ethers.isHexString(proof.signature)
          || ethers.getBytes(proof.signature).length !== 4627
          || ethers.getBytes(proof.message).length < 1 || ethers.getBytes(proof.message).length > 4096) {
        throw new Error('Proof needs hex message (1–4096 bytes) and signature (4627 bytes).');
      }
      if (!mldsa87.verify(ethers.getBytes(pubkey), ethers.getBytes(proof.message), ethers.getBytes(proof.signature))) {
        throw new Error('Signature does not verify against the account’s registered key.');
      }
      const [verified] = await call(VERIFY, 'pqcVerify', [pubkey, proof.signature, proof.message]);
      if (verified !== true) throw new Error('Precompile rejected the registered-key signature.');
      registeredSignature = 'verified against registered key; not a login or authorization';
    }
    return {
      chainId: 9800, block: BigInt(block).toString(), account, registered,
      algorithmId: Number(algorithmId), publicKeyHash: registered ? ethers.keccak256(pubkey) : null,
      signaturePrecompile: 'valid signature accepted; altered message rejected (disposable diagnostic key)',
      registeredSignature, broadcast: false,
      note: 'Read-only diagnostic. Does not implement SIWQ, spending limits, or Cross-VM execution, and does not award project badges.',
    };
  } finally { keypair.secretKey.fill(0); }
}

export async function main(args = process.argv.slice(2)) {
  if (args.length === 1 && args[0] === '--help') {
    console.log('Usage: pnpm --filter @zeni/contracts prove <0x-account> [public-proof.json]\nRead-only. No PRIVATE_KEY, seed phrase, deployment, gas, or EVM window required.');
    return;
  }
  if (args.length < 1 || args.length > 2) throw new Error('Provide an account address. Run prove --help for usage.');
  // Only public signature data belongs in this optional file; never a wallet export.
  const proof = args[1] ? JSON.parse(readFileSync(args[1], 'utf8')) : undefined;
  const request = new ethers.FetchRequest(RPC_URL);
  request.timeout = 15_000;
  const provider = new ethers.JsonRpcProvider(request, undefined, { batchMaxCount: 1 });
  try { console.log(JSON.stringify(await diagnose(provider, args[0], proof), null, 2)); }
  finally { provider.destroy(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error('PQC diagnostic failed. Check the account, public proof, network, and precompile availability. No transactions were sent.'); process.exitCode = 1; });
}
