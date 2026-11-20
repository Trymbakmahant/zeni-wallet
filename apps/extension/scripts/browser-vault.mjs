// Real extension + real vault UI + local EVM. Native QoreChain setup is simulated.
// No public-chain requests leave this harness. Use only the public fixture wallet.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, existsSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ethers } from 'ethers';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { deriveAccountKeys, derivePqcKeypair } from '@zeni/core';

assert.ok(process.env.CHROME_BIN, 'Set CHROME_BIN to an extension-capable Chromium executable.');
const directory = fileURLToPath(new URL('../dist/', import.meta.url));
const profile = mkdtempSync(join(tmpdir(), 'zeni-real-extension-'));
const browser = spawn(process.env.CHROME_BIN, ['--headless=new', '--no-first-run', '--disable-background-networking', '--disable-component-update', '--disable-features=BraveWallet', `--user-data-dir=${profile}`, `--disable-extensions-except=${directory}`, `--load-extension=${directory}`, '--remote-debugging-port=0', 'about:blank'], { stdio: 'ignore' });
const clients = [];
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(action, label) {
  for (let i = 0; i < 600; i++) { const result = await action(); if (result) return result; await delay(100); }
  throw new Error('Timed out: ' + label);
}
async function connect(url) {
  const socket = new WebSocket(url);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  const callbacks = new Map(), listeners = new Map(); let id = 0;
  socket.onmessage = event => {
    const data = JSON.parse(event.data), callback = callbacks.get(data.id);
    if (callback) { callbacks.delete(data.id); clearTimeout(callback.timer); data.error ? callback.reject(new Error(data.error.message)) : callback.resolve(data.result); }
    if (data.method) listeners.get(data.method)?.(data.params);
  };
  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const next = ++id, timer = setTimeout(() => { callbacks.delete(next); reject(new Error('CDP timeout: ' + method)); }, 20000);
    callbacks.set(next, { resolve, reject, timer }); socket.send(JSON.stringify({ id: next, method, params }));
  });
  const evaluate = async expression => {
    const result = await call('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error('Browser evaluation failed: ' + result.exceptionDetails.text);
    return result.result.value;
  };
  const client = { socket, call, evaluate, on: (event, callback) => listeners.set(event, callback) };
  clients.push(client); return client;
}

const require = createRequire(import.meta.url);
const coreRequire = createRequire(require.resolve('@zeni/core'));
const sdkRequire = createRequire(coreRequire.resolve('@qorechain/sdk'));
const { TxRaw, TxBody, AuthInfo } = sdkRequire('cosmjs-types/cosmos/tx/v1beta1/tx');
const { qorechainTypes, pqcVerify, hybridSignBytesV2 } = await import(coreRequire.resolve('@qorechain/sdk'));
const account = deriveAccountKeys('test test test test test test test test test test test junk');
const keypair = derivePqcKeypair(account);
const server = createServer();
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const localPort = server.address().port;
await new Promise(resolve => server.close(resolve));
const anvil = spawn(process.env.ANVIL_BIN || 'anvil', ['--port', String(localPort), '--chain-id', '9800', '--silent'], { stdio: 'ignore' });
let rpcId = 0;
async function rpc(method, params = []) {
  const response = await fetch(`http://127.0.0.1:${localPort}`, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({jsonrpc:'2.0',id:++rpcId,method,params}) });
  const data = await response.json();
  if (data.error) throw Object.assign(new Error(data.error.message), {rpcError:data.error});
  return data.result;
}
const state = {registered:false, setups:[], evm:[], windows:[], receipts:new Map(), failures:[]};
try {
  await until(async () => {try {return await rpc('eth_chainId');} catch {return false;}}, 'Anvil');
  await rpc('anvil_setBalance', [account.classicalAddress, ethers.toQuantity(ethers.parseEther('100'))]);
  const activePort = join(profile, 'DevToolsActivePort');
  await until(() => existsSync(activePort), 'browser debugging port');
  const port = readFileSync(activePort, 'utf8').split('\n')[0];
  const targets = () => fetch(`http://127.0.0.1:${port}/json/list`).then(r => r.json());
  const workerTarget = await until(async () => (await targets()).find(t => t.type === 'service_worker' && t.url.endsWith('/background.js')), 'extension service worker');
  const worker = await connect(workerTarget.webSocketDebuggerUrl);
  await worker.call('Fetch.enable', {patterns:[{urlPattern:'https://*'}]});
  worker.on('Fetch.requestPaused', event => void (async () => {
    let result;
    try {
      const {request} = event, url = new URL(request.url), path = url.pathname;
      if (url.hostname === 'evm-testnet.qore.host') {
        const body = JSON.parse(request.postData);
        const dispatch = async item => {
          try {
            if (item.method === 'eth_sendRawTransaction') {
              const tx = ethers.Transaction.from(item.params[0]);
              const window = state.windows.at(-1);
              assert.ok(window && !window.consumed, 'window before EVM');
              assert.equal(tx.from, account.classicalAddress);
              assert.equal(tx.chainId, 9800n);
              assert.equal(tx.nonce, Number(BigInt(await rpc('eth_getTransactionCount',[account.classicalAddress,'pending']))));
              assert.ok(tx.value + tx.gasLimit * (tx.gasPrice ?? tx.maxFeePerGas) <= BigInt(window.maxValue) * 10n**12n);
              assert.deepEqual(window.allowedTargets, tx.to ? [tx.to] : []);
              window.consumed = true; state.evm.push(tx);
            }
            return {jsonrpc:'2.0',id:item.id,result:await rpc(item.method,item.params)};
          } catch (error) { if (!error.rpcError) state.failures.push(error.message); return {jsonrpc:'2.0',id:item.id,error:error.rpcError || {code:-32000,message:error.message}}; }
        };
        result = Array.isArray(body) ? await Promise.all(body.map(dispatch)) : await dispatch(body);
      } else if (url.hostname === 'api-testnet.qore.host') {
        if (path.endsWith('/node_info')) result = {default_node_info:{network:'qorechain-diana'}};
        else if (path.includes('/pqc/v1/account/')) result = state.registered ? {found:true,account:{public_key:ethers.encodeBase64(keypair.publicKey),possession_proven:true}} : {found:false};
        else if (path.endsWith('/by_denom')) result = {balance:{denom:'uqor',amount:String(BigInt(await rpc('eth_getBalance',[account.classicalAddress,'latest'])) / 10n**12n)}};
        else if (path.endsWith('/feemarket/v1/params')) result = {params:{min_gas_price:'100000000000'}};
        else if (path.endsWith('/protocol_features')) result = {features:[{name:'pqc-sign-bytes-v2',enabled:true,known:true}]};
        else if (path.includes('/auth/v1beta1/accounts/')) result = {account:{account_number:'42',sequence:String(BigInt(await rpc('eth_getTransactionCount',[account.classicalAddress,'pending'])))}};
        else if (path.endsWith('/simulate')) result = {gas_info:{gas_used:'100000'}};
        else if (path.endsWith('/txs') && request.method === 'POST') {
          const bytes = ethers.decodeBase64(JSON.parse(request.postData).tx_bytes);
          const raw = TxRaw.decode(bytes), body = TxBody.decode(raw.bodyBytes), auth = AuthInfo.decode(raw.authInfoBytes);
          const sequence = BigInt(await rpc('eth_getTransactionCount',[account.classicalAddress,'pending']));
          assert.equal(auth.signerInfos[0].sequence, sequence);
          const msg = body.messages[0];
          if (msg.typeUrl.endsWith('MsgRegisterPQCKeyV2')) state.registered = true;
          else {
            assert.equal(msg.typeUrl, '/qorechain.pqc.v1.MsgOpenEVMWindow');
            const window = qorechainTypes.pqc.MsgOpenEVMWindow.decode(msg.value);
            assert.equal(String(window.maxTxs),'1'); assert.equal(String(window.blocks),'120');
            const ext = qorechainTypes.pqcHybrid.PQCHybridSignature.decode(body.extensionOptions[0].value);
            assert.ok(pqcVerify(keypair.publicKey, hybridSignBytesV2('qorechain-diana', TxBody.encode({...body,extensionOptions:[]}).finish(), raw.authInfoBytes), ext.pqcSignature));
            state.windows.push(window);
          }
          const hash = ethers.sha256(bytes).slice(2).toUpperCase();
          state.setups.push(hash); state.receipts.set(hash,{height:'1',code:0,txhash:hash});
          await rpc('anvil_setNonce',[account.classicalAddress,ethers.toQuantity(sequence+1n)]);
          result = {tx_response:{code:0,txhash:hash}};
        } else if (path.includes('/txs/')) result = {tx_response:state.receipts.get(path.split('/').at(-1))};
        else result = {balances:[],pools:[],tx_responses:[],pagination:{total:'0'}};
      } else throw new Error('Unexpected network host: '+url.hostname);
      await worker.call('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'application/json'}],body:Buffer.from(JSON.stringify(result)).toString('base64')});
    } catch(error) {
      state.failures.push(error.message);
      await worker.call('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:500,body:Buffer.from(JSON.stringify({message:error.message})).toString('base64')});
    }
  })());
  const base = workerTarget.url.slice(0,-'background.js'.length);
  async function newPage(url) {
    const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`,{method:'PUT'})).json();
    return connect(target.webSocketDebuggerUrl);
  }
  const control = await newPage(base+'index.html');
  await until(() => control.evaluate('!!globalThis.chrome?.runtime?.id'), 'extension control');
  const message = payload => control.evaluate(`new Promise(resolve => chrome.runtime.sendMessage(${JSON.stringify(payload)},resolve))`);
  assert.equal((await message({type:'CREATE_VAULT',mnemonic:'test test test test test test test test test test test junk',password:'public fixture password 014'})).success,true);
  const page = await newPage(process.env.VAULT_URL || 'http://127.0.0.1:3019/vault');
  await until(() => page.evaluate('!!window.zeni && !!document.querySelector(".vault-page")'), 'vault page with real provider');
  async function click(client,text) {
    await until(() => client.evaluate(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()===${JSON.stringify(text)}&&!b.disabled)`),text+' enabled');
    await client.evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()===${JSON.stringify(text)}).click()`);
  }
  const body = client => client.evaluate('document.body.textContent');
  async function review() {
    const target = await until(async () => (await targets()).find(t=>t.url===base+'index.html?approval=1'),'approval window');
    return connect(target.webSocketDebuggerUrl);
  }
  await click(page,'Connect Zeni');
  await click(await review(),'Approve');
  await until(async () => (await body(page)).includes(account.classicalAddress),'connected');
  async function transact(button, action, reject = false) {
    console.log('Testing '+action+(reject ? ' rejection' : ' approval'));
    await click(page,button);
    const approval = await review();
    if(reject) {
      await click(approval,'Reject');
      await until(async () => (await body(page)).includes(action+' · failed'),'rejection');
      return;
    }
    await approval.call('Emulation.setDeviceMetricsOverride', {width:400,height:600,deviceScaleFactor:1,mobile:false});
    await until(() => approval.evaluate(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.includes('Authorize & send')&&!b.disabled)`),'fee review ready');
    assert.equal(await approval.evaluate('!!document.querySelector("input[type=checkbox]")'), false);
    assert.ok(await approval.evaluate(`(() => {const el=document.querySelector('[data-approval-content]');return el.scrollHeight<=el.clientHeight+1;})()`), 'default review fits without scrolling');
    const screenshot = await approval.call('Page.captureScreenshot', {format:'png'});
    writeFileSync(join(tmpdir(), 'zeni-review-'+action+'.png'), Buffer.from(screenshot.data,'base64'));
    await approval.evaluate('document.querySelector("details summary").click()');
    assert.ok(await approval.evaluate('document.querySelector("details").open'));
    assert.ok((await body(approval)).includes('Gas limit:'));
    assert.ok(await approval.evaluate(`(() => {const b=Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Authorize & send'));const r=b.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;})()`), 'actions stay visible with expanded details');
    await approval.evaluate('document.querySelector("details summary").click()');
    await click(approval,'Authorize & send');
    await until(async () => {
      const text=await body(page);
      if(text.includes(action+' · unknown')) throw Error(text);
      return text.includes(action+' · confirmed');
    }, action+' receipt');
    assert.deepEqual(state.failures,[]);
    console.log('PASS: '+action+' signed in extension and confirmed on local EVM');
  }
  await transact('Deploy test vault','deploy',true);
  assert.equal(state.setups.length+state.evm.length,0);
  await transact('Deploy test vault','deploy');
  const address = await page.evaluate('document.querySelector("#vault-address").value');
  assert.match(address,/^0x[0-9a-f]{40}$/i);
  await until(async () => (await body(page)).includes('Contract bytecode matches'),'runtime verification');
  await transact('Deposit QOR','deposit',true);
  assert.equal(state.evm.length,1);
  await transact('Deposit QOR','deposit');
  const iface = new ethers.Interface(['function deposits(address) view returns (uint256)']);
  async function deposited() {return BigInt(await rpc('eth_call',[{to:address,data:iface.encodeFunctionData('deposits',[account.classicalAddress])},'latest']));}
  assert.equal(await deposited(),ethers.parseEther('0.01'));
  await until(() => page.evaluate('document.querySelector(".vault-deposited strong").textContent.includes("0.01")'),'deposit balance');
  await page.call('Page.enable');
  await page.call('Page.reload');
  await until(() => page.evaluate('!!window.zeni && !!document.querySelector(".vault-page")'), 'vault reload');
  await click(page,'Connect Zeni');
  await until(() => page.evaluate('document.querySelector(".vault-deposited strong").textContent.includes("0.01")'), 'saved vault auto-verifies and reads deposit after reload');
  assert.ok(await page.evaluate(`Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='Deposit QOR'&&!b.disabled)`));
  console.log('PASS: reconnecting after reload restores the verified vault, deposit balance and enabled deposit button');
  async function changeVault(value) {
    await page.evaluate(`(() => {const input=document.querySelector('#vault-address');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,${JSON.stringify(value)});input.dispatchEvent(new Event('input',{bubbles:true}));})()`);
  }
  await changeVault(account.classicalAddress);
  await until(async () => (await body(page)).includes('This address does not match the demo vault'), 'wrong contract explanation');
  assert.ok(await page.evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.trim()==='Deposit QOR').disabled`));
  await changeVault(address);
  await until(() => page.evaluate('document.querySelector(".vault-deposited strong").textContent.includes("0.01")'), 'correct vault restores automatically');

  await transact('Withdraw QOR','withdraw');
  assert.equal(await deposited(),0n);
  assert.equal(state.evm.length,3); assert.equal(state.windows.length,3); assert.equal(state.setups.length,4);
  assert.deepEqual(state.failures,[]);
  console.log('PASS: real provider discovery on localhost, connection, rejection without broadcasts, deployment, exact bytecode verification, deposit, withdrawal, real receipts, PQC signatures, scoped windows and shared nonces. Public testnet acceptance remains a manual check.');
} finally {
  for(const client of clients) client.socket.close();
  browser.kill('SIGTERM'); anvil.kill('SIGTERM');
  await delay(1000);
  rmSync(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});
}
