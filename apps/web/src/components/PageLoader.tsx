import './page-loader.css';

/** The same ring-and-square coin mark used by the wallet startup animation. */
export function PageLoader() {
  return (
    <div className="zeni-page-loader" role="status" aria-live="polite">
      <svg className="zeni-page-loader-coin" viewBox="0 0 200 200" fill="none" aria-hidden="true">
        <circle className="zeni-page-loader-ring" cx="100" cy="100" r="87" stroke="currentColor" strokeWidth="5.2" strokeLinecap="round" pathLength="1" transform="rotate(-90 100 100)" />
        <path className="zeni-page-loader-square" d="M88.5 88.5H111.5V111.5H88.5Z" stroke="currentColor" strokeWidth="3.8" pathLength="1" />
      </svg>
      <span className="zeni-page-loader-wordmark" aria-hidden="true">zeni</span>
      <span className="zeni-page-loader-label">Loading Zeni…</span>
    </div>
  );
}
