import test from 'node:test';
import assert from 'node:assert/strict';
import { AMM_ASSETS, computeMarkets, computePriceHistory } from '../dist/index.js';

const d = (s) => AMM_ASSETS[s].denom;
const pool = (id, a, b, ra, rb, status = 'active') => ({ id, token_a: d(a), token_b: d(b), reserve_a: ra, reserve_b: rb, status });

const swap = (t, poolId, inSym, inAmt, outSym, outAmt) => ({
  timestamp: new Date(t).toISOString(), txhash: 'AA'.repeat(32),
  events: [{ type: 'amm_swap', attributes: [
    { key: 'pool_id', value: String(poolId) },
    { key: 'denom_in', value: d(inSym) },
    { key: 'denom_out', value: d(outSym) },
    { key: 'amount_in', value: String(inAmt) },
    { key: 'amount_out', value: String(outAmt) },
  ] }],
});
const units = (n, s) => {
  const [w, f = ''] = String(n).split('.');
  return (w + (f + '0'.repeat(AMM_ASSETS[s].decimals)).slice(0, AMM_ASSETS[s].decimals)).replace(/^0+/, '') || '0';
};

test('markets price each asset in fUSD through its most liquid pool', () => {
  const markets = computeMarkets([
    pool('1', 'fETH', 'QOR', '960415', '1041349'),                         // dust pool, ignored for fETH
    pool('2', 'fUSD', 'QOR', '369729710', '12938383185'),                  // 369.73 fUSD : 12938.38 QOR
    pool('3', 'fETH', 'fUSD', '136063510507896433', '393123761'),          // 0.136 fETH : 393.12 fUSD
    pool('4', 'fBTC', 'QOR', '1005777', '18935960935'),
    pool('5', 'fBTC', 'fUSD', '1000', '1000'),
    { id: '6', token_a: 'erc20:0xunknown', token_b: d('QOR'), reserve_a: '1', reserve_b: '1', status: 'active' },
    pool('7', 'fBTC', 'QOR', '1', '999999999999', 'inactive'),
  ]);
  const by = Object.fromEntries(markets.map((m) => [m.symbol, m]));
  assert.deepEqual(Object.keys(by).sort(), ['QOR', 'fBTC', 'fETH', 'fUSD']);
  assert.ok(Math.abs(by.QOR.priceUsd - 369.72971 / 12938.383185) < 1e-9);
  assert.equal(by.fETH.poolId, '3');
  assert.ok(Math.abs(by.fETH.priceUsd - 393.123761 / 0.136063510507896433) < 1e-6);
  assert.equal(by.fBTC.poolId, '4');
  assert.ok(by.fBTC.priceUsd > 40_000 && by.fBTC.priceUsd < 70_000);
  assert.equal(by.fUSD.priceUsd, 1);
});

test('markets tolerate missing or empty pools', () => {
  assert.deepEqual(computeMarkets([]).map((m) => m.symbol), ['fUSD']);
  assert.deepEqual(computeMarkets([pool('1', 'fUSD', 'QOR', '0', '5')]).map((m) => m.symbol), ['fUSD']);
});

test('price history derives USD points per market from executed swaps', () => {
  const pools = [
    pool('2', 'fUSD', 'QOR', '369729710', '12938383185'),
    pool('3', 'fETH', 'fUSD', '136063510507896433', '393123761'),
    pool('4', 'fBTC', 'QOR', '1005777', '18935960935'),
  ];
  const t0 = 1_700_000_000_000;
  const history = computePriceHistory(pools, [
    swap(t0 + 0, 2, 'QOR', String(units(1000, 'QOR')), 'fUSD', String(units(30, 'fUSD'))),      // QOR = $0.03
    swap(t0 + 1, 3, 'fUSD', String(units(200, 'fUSD')), 'fETH', String(units(0.05, 'fETH'))),   // fETH = $4000
    swap(t0 + 2, 4, 'fBTC', String(units(0.5, 'fBTC')), 'QOR', String(units(700_000, 'QOR'))),  // 0.5 fBTC -> 700k QOR = $21k -> $42k
    swap(t0 + 3, 9, 'fETH', String(units(1, 'fETH')), 'fUSD', String(units(1, 'fUSD'))),        // unknown pool ignored
  ]);
  assert.deepEqual(history.QOR.points, [[t0, 0.03]]);
  assert.deepEqual(history.fETH.points, [[t0 + 1, 4000]]);
  assert.deepEqual(history.fBTC.points, [[t0 + 2, 42000]]);
  assert.deepEqual(history.fUSD.points, [[t0, 1]]);
  assert.equal(history.fETH.trades[0].side, 'buy');
  assert.equal(history.fBTC.trades[0].side, 'sell');
  assert.equal(history.fBTC.trades[0].amountUsd, 21000);
});

test('price history prices QOR-quoted trades at the latest observed QOR rate', () => {
  const pools = [
    pool('2', 'fUSD', 'QOR', '369729710', '12938383185'),
    pool('4', 'fBTC', 'QOR', '1005777', '18935960935'),
  ];
  const t0 = 1_700_000_000_000;
  const history = computePriceHistory(pools, [
    swap(t0 + 0, 4, 'QOR', String(units(100, 'QOR')), 'fBTC', String(units(0.001, 'fBTC'))),  // before any QOR rate -> skipped
    swap(t0 + 1, 2, 'fUSD', String(units(40, 'fUSD')), 'QOR', String(units(1000, 'QOR'))),    // QOR = $0.04
    swap(t0 + 2, 4, 'QOR', String(units(100, 'QOR')), 'fBTC', String(units(0.001, 'fBTC'))),  // 100k QOR/BTC * $0.04 = $4000
  ]);
  assert.deepEqual(history.fBTC.points, [[t0 + 2, 4000]]);
});
