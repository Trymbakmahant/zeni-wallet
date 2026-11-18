import { useEffect, useState } from 'react';
import { Check, Copy, Terminal } from 'lucide-react';

function Highlight({ code }: { code: string }) {
  const tokens = code.split(/(\/\/[^\n]*|#[^\n]*|'[^'\n]*'|"[^"\n]*"|\b(?:import|from|export|default|function|return|const|await|async|new|if|try|catch)\b)/g);
  return <>{tokens.map((token, i) => <span key={i} className={token.startsWith('//') || token.startsWith('#') ? 'syntax-comment' : /^['"]/.test(token) ? 'syntax-string' : /^(import|from|export|default|function|return|const|await|async|new|if|try|catch)$/.test(token) ? 'syntax-keyword' : undefined}>{token}</span>)}</>;
}
export function CodeBlock({ code, label = 'TypeScript' }: { code: string; label?: string }) {
  const [status, setStatus] = useState('Copy');
  useEffect(() => { if (status === 'Copy') return; const timer = setTimeout(() => setStatus('Copy'), 2200); return () => clearTimeout(timer); }, [status]);
  return <div className="docs-code"><div className="docs-code-bar"><span><Terminal size={13} />{label}</span><button type="button" aria-label={`Copy ${label} code`} onClick={async () => { try { await navigator.clipboard.writeText(code); setStatus('Copied'); } catch { setStatus('Select to copy'); } }}>{status === 'Copied' ? <Check size={13} /> : <Copy size={13} />}<span aria-live="polite">{status}</span></button></div><pre tabIndex={0} aria-label={`${label} code example`}><code><Highlight code={code} /></code></pre></div>;
}
