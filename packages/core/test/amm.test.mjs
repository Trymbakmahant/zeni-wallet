import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { ethers } from 'ethers';
import { qorechainTypes, clearSignBytesCache } from '@qorechain/sdk';
import { AMM_ASSETS, AmmSwapClient, NativeTxError, deriveAccountKeys, derivePqcKeypair, minimumSwapOutput, swapReceivedAmount, transactionExplorerUrl } from '../dist/index.js';
const require = createRequire(import.meta.url);
const sdkRequire = createRequire(require.resolve('@qorechain/sdk'));
const { TxRaw, TxBody, AuthInfo } = sdkRequire('cosmjs-types/cosmos/tx/v1beta1/tx');
const account = deriveAccountKeys('test test test test test test test test test test test junk');
const keypair = derivePqcKeypair(account);

function fixture(options = {}) {
  clearSignBytesCache();
  const state = { registered: options.registered ?? true, sequence: 7n, submitted: [], updates: [], requests: [], output: '81062', ...options };
  const reply = (body, status = 200) => new Response(JSON.stringify(body), { status });
  const provider = { async send(method) { assert.equal(method, 'eth_chainId', 'swaps must never broadcast on the EVM lane'); return '0x2648'; } };
  const fetch = async (url, init) => {
    const u = new URL(url), path = u.pathname;
    state.requests.push(path);
    if (path.endsWith('/node_info')) return reply({ default_node_info: { network: 'qorechain-diana' } });
    if (path.includes('/pqc/v1/account/')) return reply(state.registered ? { found: true, account: { public_key: ethers.encodeBase64(keypair.publicKey), possession_proven: true } } : { found: false });
    if (path.includes('/spendable_balances/')) return reply({
      balances: [
        { denom: 'uqor', amount: options.qor ?? '10000000' },
        { denom: AMM_ASSETS.fUSD.denom, amount: '1000000000' },
        { denom: AMM_ASSETS.fETH.denom, amount: '500000000000000000' },
        { denom: AMM_ASSETS.fBTC.denom, amount: '2000000' },
      ], pagination: {}
    });
    if (path.endsWith('/amm/v1/pools')) return reply({ pools: options.noPool ? [] : [{ id: '2', status: options.paused ? 'paused' : 'active', token_a: AMM_ASSETS.fUSD.denom, token_b: 'uqor', reserve_a: '600000000', reserve_b: '7000000000' }] });
    if (path.endsWith('/amm/v1/params')) return reply({ params: { enabled: !options.disabled, max_swap_impact_bps: 500 } });
    if (path.endsWith('/feemarket/v1/params')) return reply({ params: { min_gas_price: '100000000000' } });
    if (path.endsWith('/protocol_features')) return reply({ features: [{ name: 'pqc-sign-bytes-v2', enabled: true, known: true }] });
    if (path.endsWith('/quote/exact_in')) {
      state.lastQuoteAmount = u.searchParams.get('amount_in');
      return reply({ amount_out: state.output, fee: '3000', impact_bps: options.impact ?? 2 });
    }
    if (path.includes('/auth/v1beta1/accounts/')) return reply({ account: { account_number: '1', sequence: state.sequence.toString() } });
    if (path.endsWith('/simulate') || (path.endsWith('/txs') && init?.method === 'POST')) {
      const bytes = ethers.decodeBase64(JSON.parse(init.body).tx_bytes);
      const raw = TxRaw.decode(bytes), body = TxBody.decode(raw.bodyBytes), auth = AuthInfo.decode(raw.authInfoBytes);
      assert.equal(auth.signerInfos[0].sequence, state.sequence);
      const m = body.messages[0];
      const registration = m.typeUrl.endsWith('MsgRegisterPQCKeyV2');
      if (!registration) {
        assert.equal(m.typeUrl, '/qorechain.amm.v1.MsgSwapExactIn');
        assert.equal(body.extensionOptions[0].typeUrl, '/qorechain.pqc.v1.PQCHybridSignature');
        const swap = qorechainTypes.amm.MsgSwapExactIn.decode(m.value);
        assert.equal(swap.sender, account.cosmosAddress);
        assert.equal(swap.poolId, '2');
        assert.equal(swap.tokenIn.denom, 'uqor');
        assert.equal(swap.tokenIn.amount, '1000000');
        assert.equal(swap.denomOut, AMM_ASSETS.fUSD.denom);
        assert.equal(swap.minOut, '80656');
      }
      if (path.endsWith('/simulate')) return reply({ gas_info: { gas_used: options.gasUsed ?? '150000' } });
      const hash = ethers.sha256(bytes).slice(2).toUpperCase();
      assert.ok(state.updates.some(u => u.hash === hash && u.status === 'PENDING'), 'hash must be saved before broadcasting');
      state.submitted.push({ hash, registration });
      if (options.networkFailure) throw new Error('Connection lost after submission');
      return reply({ tx_response: { code: options.checkCode ?? 0, txhash: hash, raw_log: 'Rejected by CheckTx' } });
    }
    if (path.includes('/txs/')) {
      if (options.lookupFailure) return reply({ message: 'Unavailable' }, 503);
      if (options.notFound) return reply({ message: 'Not found' }, 404);
      state.sequence++;
      const last = state.submitted.at(-1);
      if (last?.registration) state.registered = true;
      return reply({
        tx_response: {
          code: options.deliverCode ?? 0, height: '10201510', txhash: last?.hash, raw_log: 'Execution refused', events: [{
            type: 'coin_received', attributes: [
              { key: 'receiver', value: account.cosmosAddress }, { key: 'amount', value: `81070${AMM_ASSETS.fUSD.denom}` },
            ]
          }]
        }
      });
    }
    throw new Error(`Unexpected request: ${path}`);
  };
  const client = new AmmSwapClient(provider, fetch);
  const observe = async (update, stage) => { state.updates.push({ ...update, stage }); };
  return { client, state, observe };
}

test('bank balances use real token denominations and 6/18/8 decimals', async () => {
  const { client } = fixture();
  assert.deepEqual(await client.balances(account.cosmosAddress), { QOR: '10.0', fUSD: '1000.0', fETH: '0.5', fBTC: '0.02' });
});

test('quote uses live amount-out and enforces integer slippage', async () => {
  const { client, state } = fixture();
  const quote = await client.prepareSwap(account, 'QOR', 'fUSD', '1', 50);
  assert.equal(quote.amountOut, '0.081062');
  assert.equal(quote.minAmountOut, '0.080656');
  assert.equal(quote.swapFee, '0.003');
  assert.equal(quote.maxNetworkFee, '0.09');
  assert.equal(state.lastQuoteAmount, '1000000');
  assert.equal(state.submitted.length, 0);
});

test('confirmed swap uses real signed hash, hybrid signature, minOut, and actual receipt amount', async () => {
  const { client, state, observe } = fixture();
  const quote = await client.prepareSwap(account, 'QOR', 'fUSD', '1', 50);
  const result = await client.executeSwap(account, quote, () => { }, observe);
  assert.equal(result.status, 'CONFIRMED');
  assert.equal(result.hash, state.submitted[0].hash);
  assert.equal(result.amountOut, '0.08107', 'actual receipt output can differ from the estimate');
  assert.equal(result.explorerUrl, `https://explore.qore.network/tx/${result.hash}`);
  assert.deepEqual(state.updates.map(u => u.status), ['PENDING', 'CONFIRMED']);
});

test('first swap registers PQC then signs the swap with the new sequence', async () => {
  const { client, state, observe } = fixture({ registered: false });
  const quote = await client.prepareSwap(account, 'QOR', 'fUSD', '1', 50);
  assert.equal(quote.registrationRequired, true);
  assert.equal(quote.maxNetworkFee, '0.18');
  await client.executeSwap(account, quote, () => { }, observe);
  assert.deepEqual(state.submitted.map(t => t.registration), [true, false]);
  assert.deepEqual(state.updates.map(u => u.stage), ['registration', 'registration', 'swap', 'swap']);
});

for (const [name, opts, pattern] of [
  ['missing pool', { noPool: true }, /No active direct pool/],
  ['paused pool', { paused: true }, /No active direct pool/],
  ['disabled AMM', { disabled: true }, /disabled/],
  ['insufficient gas funds', { qor: '1000001' }, /Leave up to/],
  ['excess price impact', { impact: 501 }, /price-impact/],
]) test(`${name} blocks the quote without broadcasting`, async () => {
  const { client, state } = fixture(opts);
  await assert.rejects(client.prepareSwap(account, 'QOR', 'fUSD', '1', 50), pattern);
  assert.equal(state.submitted.length, 0);
});

test('MAX reserves setup fees and respects token precision', async () => {
  const { client } = fixture({ registered: false });
  const quote = await client.prepareSwap(account, 'QOR', 'fUSD', 'MAX', 50);
  assert.equal(quote.amountIn, '9.82');
  await assert.rejects(client.prepareSwap(account, 'QOR', 'fUSD', '0.0000001', 50));
  await assert.rejects(client.prepareSwap(account, 'QOR', 'QOR', '1', 50), /different/);
  await assert.rejects(client.prepareSwap(account, 'fake', 'fUSD', '1', 50), /Unsupported/);
});

test('price moving below minOut stops before signing/broadcast', async () => {
  const { client, state, observe } = fixture();
  const quote = await client.prepareSwap(account, 'QOR', 'fUSD', '1', 50);
  state.output = '80000';
  await assert.rejects(client.executeSwap(account, quote, () => { }, observe), /price moved/);
  assert.equal(state.submitted.length, 0);
});

test('expired quote and locked wallet cannot swap', async () => {
  const { client, state, observe } = fixture();
  const quote = await client.prepareSwap(account, 'QOR', 'fUSD', '1', 50);
  await assert.rejects(client.executeSwap(account, { ...quote, expiresAt: 0 }, () => { }, observe), /expired/);
  await assert.rejects(client.executeSwap(account, quote, () => { throw new Error('locked'); }, observe), /locked/);
  assert.equal(state.submitted.length, 0);
});

for (const options of [{ checkCode: 5 }, { deliverCode: 5 }]) test(`chain refusal ${JSON.stringify(options)} is failed, never confirmed`, async () => {
  const { client, state, observe } = fixture(options);
  const quote = await client.prepareSwap(account, 'QOR', 'fUSD', '1', 50);
  await assert.rejects(client.executeSwap(account, quote, () => { }, observe), e => e instanceof NativeTxError && e.update.status === 'FAILED');
  assert.deepEqual(state.updates.map(u => u.status), ['PENDING', 'FAILED']);
});

for (const options of [{ networkFailure: true }, { lookupFailure: true }]) test(`uncertain broadcast ${JSON.stringify(options)} retains actual hash as pending`, async () => {
  const { client, state, observe } = fixture(options);
  const quote = await client.prepareSwap(account, 'QOR', 'fUSD', '1', 50);
  await assert.rejects(client.executeSwap(account, quote, () => { }, observe), e => e instanceof NativeTxError && e.update.status === 'PENDING' && e.update.hash === state.submitted[0].hash);
  assert.deepEqual(state.updates.map(u => u.status), ['PENDING']);
});

test('receipt parser ignores other accounts and missing output never becomes quoted output', () => {
  assert.equal(swapReceivedAmount({ events: [] }, account.cosmosAddress, 'fUSD'), undefined);
  assert.equal(swapReceivedAmount({ events: [{ type: 'coin_received', attributes: [{ key: 'receiver', value: 'another-account' }, { key: 'amount', value: `900${AMM_ASSETS.fUSD.denom}` }] }] }, account.cosmosAddress, 'fUSD'), undefined);
  assert.throws(() => minimumSwapOutput(1n, 50), /too small/);
  assert.throws(() => minimumSwapOutput(100n, 501), /Slippage/);
  assert.throws(() => transactionExplorerUrl('fake'), /Invalid/);
});
