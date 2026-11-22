import test from 'node:test';
import assert from 'node:assert/strict';
import { AMM_ASSETS, computeMarkets } from '../dist/index.js';

const d = (s) => AMM_ASSETS[s].denom;
const pool = (id, a, b, ra, rb, status = 'active') => ({ id, token_a: d(a), token_b: d(b), reserve_a: ra, reserve_b: rb, status });

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
