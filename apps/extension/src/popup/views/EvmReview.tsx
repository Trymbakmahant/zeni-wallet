import { Interface, formatEther, MaxUint256 } from 'ethers';
import type { EvmIntent, EvmQuote } from '@zeni/core';

const knownCalls = new Interface([
  'function approve(address spender,uint256 amount)',
  'function setApprovalForAll(address operator,bool approved)',
  'function transfer(address to,uint256 amount)',
  'function deposit() payable',
  'function withdraw(uint256 amount)',
]);

export function EvmReview({ intent, quote }: { intent: EvmIntent; quote: EvmQuote | null }) {
  let decoded: ReturnType<Interface['parseTransaction']> = null;
  try { decoded = knownCalls.parseTransaction({ data: intent.data, value: intent.value }); } catch { /* Unknown ABI: show exact calldata. */ }
  const panel = 'p-3 rounded-2xl bg-[#0D0D10] border border-[#222226] text-xs space-y-2';
  return <div className="mt-3 space-y-2">
    <div className={panel}>
      <p className="text-zinc-400">{intent.to ? 'Contract / destination' : 'New contract deployment'}{decoded && <span className="text-white"> · {decoded.name}()</span>}</p>
      <p className="font-mono text-[11px] break-all">{intent.to || 'Creates a new contract'}</p>
      <div className="flex justify-between gap-3 pt-2 border-t border-[#222226]"><span className="text-zinc-400 shrink-0">QOR sent</span><strong className="text-right break-all">{formatEther(BigInt(intent.value))} QOR</strong></div>
      <div className="flex justify-between gap-3"><span className="text-zinc-400 shrink-0">Maximum fee</span><strong className="text-right break-all">{quote ? `${quote.maxNetworkFee} QOR` : 'Calculating…'}</strong></div>
      <p className="text-[11px] text-zinc-500">Includes gas and required authorization setup.</p>
      {decoded?.name === 'approve' && <div className="text-orange-200 break-all"><p>Token spending approval for: {String(decoded.args[0])}</p><p>Allowance: {decoded.args[1] === MaxUint256 ? 'Unlimited' : `${decoded.args[1]} raw token units`}</p><p>This can let the spender move your tokens later.</p></div>}
      {decoded?.name === 'setApprovalForAll' && <p className="text-orange-200 break-all">{decoded.args[1] ? 'Grant access to ALL tokens in this collection' : 'Revoke collection access'} for operator {String(decoded.args[0])}.</p>}
    </div>
    <details className="text-xs rounded-xl border border-[#222226] p-3">
      <summary className="cursor-pointer text-zinc-300 focus-visible:outline focus-visible:outline-[#E06341]">Transaction details</summary>
      <div className="mt-3 space-y-2 text-zinc-400">
      <p>Zeni has not verified this contract’s behavior. Function names are selector matches only.</p>
      {decoded && <><p>Decoded selector: <span className="text-white">{decoded.signature}</span></p>{decoded.args.length > 0 && <p className="break-all">Arguments (raw units): {Array.from(decoded.args, arg => String(arg)).join(', ')}</p>}</>}
      <p>{intent.to ? 'Full transaction data' : 'Deployment bytecode'} ({(intent.data.length - 2) / 2} bytes)</p><pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all font-mono text-[10px]">{intent.data}</pre>
      {quote && <>
      <p>Gas limit: <strong>{quote.gasLimit}</strong></p>
      <p>Maximum EVM gas fee: <strong>{quote.maxEvmFee} QOR</strong></p>
      <p className="text-zinc-400">Zeni opens a post-quantum-authorized window for <strong>one EVM transaction</strong>, up to <strong>{quote.windowBlocks} blocks</strong>, with a value + gas budget of <strong>{formatEther(BigInt(quote.windowValueUqor) * 10n ** 12n)} QOR</strong>.</p>
      <p className="text-zinc-400 break-all">{intent.to ? `Window destination: ${intent.to}.` : 'Deployment authorization cannot be restricted to an existing destination.'} This budget limits native QOR, not token allowances or other contract effects.</p>
      {quote.registrationRequired && <p className="text-zinc-400">First-time PQC key registration is also required and included in the fee limit.</p>}
      <p className="text-zinc-400">The authorization is hybrid signed. The EVM transaction uses your classical key. Setup fees may be charged even if the contract call fails; an unused window remains valid until it expires.</p>
      </>}
      </div>
    </details>
  </div>;
}
