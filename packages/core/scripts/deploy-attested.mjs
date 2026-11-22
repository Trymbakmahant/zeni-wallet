// Deploys ZeniAttestedSend to QoreChain Diana testnet.
//
//   node packages/core/scripts/deploy-attested.mjs --owner "testnet mnemonic ..."
//
// The owner's EVM address deploys the contract with a classical signature; the
// script first opens a targetless EVM authorization window (hybrid-signed) so the
// chain admits the deployment — the same flow the wallet uses for every EVM tx.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ethers } from "ethers";
import { deriveAccountKeys, QORECHAIN_CONFIG, SessionClient } from "../dist/index.js";

const arg = (name, dflt) => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : dflt;
};
const fail = (m) => { console.error(`\n${m}`); process.exit(1); };

const mnemonic = arg("owner");
if (!mnemonic) fail("Missing --owner <testnet recovery phrase> — it pays deployment fees.");

const artifactPath = join(dirname(fileURLToPath(import.meta.url)), "../../contracts/out/ZeniAttestedSend.sol/ZeniAttestedSend.json");
const artifact = JSON.parse(readFileSync(artifactPath, "utf8"));
const bytecode = artifact.bytecode?.object ?? artifact.bytecode;
if (typeof bytecode !== "string" || !bytecode.startsWith("0x")) fail("Artifact bytecode missing — run `forge build` in packages/contracts first.");

const account = deriveAccountKeys(mnemonic);
const provider = new ethers.JsonRpcProvider(QORECHAIN_CONFIG.rpcUrls[0], undefined, { staticNetwork: true });
const client = new SessionClient(provider);
const step = (s) => console.log(`\n=== ${s} ===`);

const main = async () => {
  step("account");
  console.log(`cosmos: ${account.cosmosAddress}`);
  console.log(`evm:    ${account.classicalAddress}`);
  const bal = await provider.getBalance(account.classicalAddress);
  console.log(`balance: ${ethers.formatEther(bal)} QOR`);
  if (bal === 0n) fail("This account has no QOR — fund it first.");

  const budget = await client.sessionFeeBudget();

  step("ensure hybrid key registered");
  await client.ensureSessionReady(account, budget, () => {});
  console.log("registered");

  step("open EVM window for the deployment (targetless scope admits contract creation)");
  const fees = await provider.getFeeData();
  const gasPrice = fees.gasPrice ?? fees.maxFeePerGas;
  if (!gasPrice) fail("No EVM gas price from the network.");
  const gasEst = await provider.estimateGas({ from: account.classicalAddress, data: bytecode });
  const gasLimit = (gasEst * 13n + 9n) / 10n;
  const maxFeeWei = gasLimit * gasPrice;
  const WEI_PER_UQOR = 10n ** 12n;
  const windowValueUqor = ((maxFeeWei + WEI_PER_UQOR - 1n) / WEI_PER_UQOR).toString();
  const win = await client.openSessionWindow(account, {
    blocks: 600, maxTxs: 2, maxValue: windowValueUqor, allowedTargets: [],
  }, budget, () => {});
  console.log(`window tx: ${win.hash} (blocks 600, maxTxs 2, ≤ ${windowValueUqor} uqor)`);

  step("deploy ZeniAttestedSend");
  const nonce = await provider.getTransactionCount(account.classicalAddress, "pending");
  const tx = {
    chainId: QORECHAIN_CONFIG.chainId, type: 0, nonce,
    data: bytecode, gasLimit, gasPrice,
  };
  const signed = await new ethers.Wallet(account.classicalPrivateKey).signTransaction(tx);
  const hash = ethers.keccak256(signed);
  console.log(`broadcasting deployment tx ${hash} …`);
  const returned = await provider.send("eth_sendRawTransaction", [signed]);
  if (returned.toLowerCase() !== hash.toLowerCase()) fail(`Unexpected tx hash ${returned}`);
  const receipt = await provider.waitForTransaction(hash, 1, 120_000);
  if (!receipt || receipt.status !== 1) fail(`Deployment reverted — tx ${hash}`);
  console.log(`\nDEPLOYED ZeniAttestedSend: ${receipt.contractAddress}`);
  console.log(`tx: https://explore.qore.network/tx/${hash}`);
  console.log(`\nNext: allowlist it on a session — Apps → Sessions → New session → contract field: ${receipt.contractAddress}`);
};

main().catch((e) => fail(e.stack || String(e)));
