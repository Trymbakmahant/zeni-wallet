import { useEffect, useState } from 'react';
import { resolveTransactionExplorerUrl } from '@zeni/core/explorer';
import { ExternalLink } from 'lucide-react';

export function TransactionExplorerLink({ hash }: { hash: string }) {
  const [result, setResult] = useState<{ hash: string; url: string | null; error?: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setResult(null);
    resolveTransactionExplorerUrl(hash).then(url => { if (!cancelled) setResult({ hash, url }); })
      .catch(() => { if (!cancelled) setResult({ hash, url: null, error: 'Explorer lookup is unavailable.' }); });
    return () => { cancelled = true; };
  }, [hash, attempt]);
  const current = result?.hash === hash ? result : null;
  if (current?.url) return <a href={current.url} target="_blank" rel="noreferrer">View in explorer (Testnet)<ExternalLink size={13} /></a>;
  return <div role="status"><p>{current ? current.error || 'Waiting for explorer indexing.' : 'Finding explorer link…'}</p>{current && <button type="button" className="switch-mobile" onClick={() => setAttempt(n => n + 1)}>Retry explorer lookup</button>}</div>;
}
