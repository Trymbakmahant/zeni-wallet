import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AccountActivityClient, parseAccountActivity, mergeAccountActivity } from '../dist/rpc/activity.js';
const account = '0x4a6b5eed1b7f9ca98d3cb6b8aa593c3afe11b76a';
const fixtures = JSON.parse(readFileSync(new URL('./fixtures/activity.json',import.meta.url),'utf8'));
const parse = fixture => parseAccountActivity(fixture.body,fixture.receipt,account);

test('real faucet receipts show incoming QOR and three correctly scaled assets without sender fees', () => {
  const tokens = parse(fixtures[0]);
  assert.equal(tokens.type,'RECEIVE');
  assert.deepEqual(tokens.transfers.map(t=>[t.amount,t.token]),[['0.5','fETH'],['0.02','fBTC'],['1000.0','fUSD']]);
  const qor = parse(fixtures[1]);
  assert.equal(qor.type,'RECEIVE'); assert.equal(qor.amount,'100.0'); assert.equal(qor.token,'QOR');
  assert.equal(qor.transfers.length,1);
});
test('self transfers are never described as new incoming funds', () => {
  assert.equal(parse(fixtures[2]).type,'SELF'); assert.equal(parse(fixtures[3]).type,'SELF');
  assert.equal(parse(fixtures[3]).amount,'0.001');
  assert.equal(parse(fixtures[3]).evmHash,'0x6fcf2a7f9976356180f48fe0c732f8276c60aed25933c4fcc8ea3a65ae920499');
});
test('external swaps use actual receipt asset movements, not minOut or fee amounts', () => {
  const item = parse(fixtures[4]);
  assert.equal(item.type,'SWAP'); assert.equal(item.amountIn,'1.0');
  assert.equal(item.tokenIn,'QOR'); assert.equal(item.tokenOut,'fUSD');
  assert.ok(Number(item.amountOut)>0);
});
test('failed transactions never display received funds or successful swap amounts', () => {
  for (const original of fixtures) {
    const fixture = structuredClone(original); fixture.receipt.code = 5;
    const item = parse(fixture);
    assert.equal(item.status,'FAILED'); assert.equal(item.type,'TRANSACTION');
    assert.deepEqual(item.transfers,[]); assert.equal(item.amount,undefined);
  }
});
test('EVM execution failure fails even when Cosmos envelope code is zero', () => {
  const fixture = structuredClone(fixtures[3]);
  fixture.receipt.events.push({type:'ethereum_tx',attributes:[{key:'ethereumTxFailed',value:'execution reverted'}]});
  assert.equal(parse(fixture).status,'FAILED');
});
test('unrelated and malformed receipts cannot leak into an account history', () => {
  assert.equal(parseAccountActivity(fixtures[0].body,fixtures[0].receipt,'0x'+'11'.repeat(20)),null);
  for (const change of [{txhash:'0x'+'ab'.repeat(32)},{height:'0'},{timestamp:'invalid'},{code:undefined}]) {
    assert.equal(parseAccountActivity(fixtures[0].body,{...fixtures[0].receipt,...change},account),null);
  }
});
test('unknown denomination retains raw units rather than inventing decimals', () => {
  const fixture = structuredClone(fixtures[1]);
  fixture.receipt.events=[];
  fixture.body.body.messages[0].amount=[{denom:'uunknown',amount:'123456789'}];
  assert.equal(parse(fixture).amount,'123456789'); assert.equal(parse(fixture).token,'uunknown (base units)');
});
test('merge deduplicates indexed query overlaps and resolves local pending records', () => {
  const item = parse(fixtures[1]);
  const rows = mergeAccountActivity([{...item,hash:item.hash.toLowerCase(),status:'PENDING',source:'local'}],[item,item]);
  assert.equal(rows.length,1);assert.equal(rows[0].status,'CONFIRMED');assert.equal(rows[0].source,'merged');
});
test('EVM and Cosmos records merge only through an explicit hash alias', () => {
  const item = parse(fixtures[3]);
  assert.equal(mergeAccountActivity([{...item,hash:item.evmHash,status:'PENDING',source:'local'}],[item]).length,1);
  assert.equal(mergeAccountActivity([{...item,hash:'0x'+item.hash.toLowerCase(),source:'local'}],[item]).length,2);
});
function mockNetwork({fail=false,chain='0x2648'}={}) {
  const requests=[];
  const fetch = async (url,options) => {
    if (options.method==='POST') {
      const req=JSON.parse(options.body);
      return new Response(JSON.stringify({jsonrpc:'2.0',id:req.id,result:req.method==='eth_chainId'?chain:'0x1234567'}));
    }
    const u = new URL(url);requests.push(u);
    assert.equal(options.credentials,'omit'); assert.equal(options.redirect,'error');
    if(fail)return new Response('',{status:503});
    const query=u.searchParams.get('query'), page=u.searchParams.get('page');
    assert.match(query,/AND tx.height<=19088743$/);
    // Only one stream has more than 20 results. Other streams MUST NOT be paged again.
    const more=query.startsWith('message.sender=');
    if(page==='2')assert.ok(more,'Do not request out-of-range pages on exhausted streams');
    const fixture=fixtures[1];
    return new Response(JSON.stringify({txs:[fixture.body],tx_responses:[fixture.receipt],total:more?'21':'1'}));
  };
  return {fetch,requests};
}
test('history uses validated addresses, descending indexed queries, fixed height and per-stream pagination', async () => {
  const mock=mockNetwork(),client=new AccountActivityClient(mock.fetch);
  const first=await client.page(account);
  assert.equal(first.items.length,1); assert.equal(mock.requests.length,5);
  assert.deepEqual(first.nextCursor.streams,[0]);
  const next=await client.page(account,first.nextCursor);
  assert.equal(mock.requests.length,6); assert.equal(next.nextCursor,null);
  assert.ok(mock.requests.every(url=>url.searchParams.get('order_by')==='ORDER_BY_DESC'));
  await assert.rejects(client.page('bad address'));
  await assert.rejects(client.page('0x'+'11'.repeat(20),first.nextCursor),/cursor/);
});
test('network and wrong-chain failures are surfaced rather than presented as empty history', async () => {
  await assert.rejects(new AccountActivityClient(mockNetwork({fail:true}).fetch).page(account),/unavailable/);
  await assert.rejects(new AccountActivityClient(mockNetwork({chain:'0x1'}).fetch).page(account),/Diana/);
});
