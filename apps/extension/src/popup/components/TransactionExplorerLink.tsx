import React, { useEffect, useState } from 'react';
import { resolveTransactionExplorerUrl } from '@zeni/core';
import { ExternalLink } from 'lucide-react';

export function TransactionExplorerLink({ hash, className = '' }: { hash: string; className?: string }) {
  const [result, setResult] = useState<{ hash: string; url: string | null; error?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setResult(null);
    resolveTransactionExplorerUrl(hash).then(url => { if (!cancelled) setResult({ hash, url }); })
      .catch(() => { if (!cancelled) setResult({ hash, url: null, error: 'Explorer lookup unavailable.' }); });
    return () => { cancelled = true; };
  }, [hash, attempt]);
  const current = result?.hash === hash ? result : null;
  if (current?.url) return <a href={current.url} target="_blank" rel="noreferrer" className={className} title="View transaction (select Testnet)">View on Explorer<ExternalLink className="w-3.5 h-3.5" /></a>;
  return <span className="text-[10px] text-zinc-400" role="status">{current ? current.error || 'Waiting for explorer indexing.' : 'Finding explorer link…'}{current && <button type="button" onClick={() => setAttempt(n => n + 1)} className="block text-[#E06341] underline">Retry explorer lookup</button>}</span>;
}
