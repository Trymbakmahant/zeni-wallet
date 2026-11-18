import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import './components/page-loader.css';
import './not-found.css';

export function NotFoundPage() {
  return (
    <div className="not-found-page">
      <title>Page not found — Zeni Wallet</title>
      <meta name="robots" content="noindex" />
      <meta name="description" content="This page could not be found. Return to Zeni Wallet or explore the integration docs." />
      <header className="not-found-header">
        <a className="not-found-brand" href="/" aria-label="Zeni home">
          <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <circle cx="16" cy="16" r="13" stroke="currentColor" strokeWidth="2" />
            <path d="M12 12h8v8h-8z" stroke="currentColor" strokeWidth="2" />
          </svg>
          zeni
        </a>
        <a className="not-found-docs-link" href="/docs">Developer docs <ArrowUpRight size={16} aria-hidden="true" /></a>
      </header>

      <main className="not-found-main">
        <div className="not-found-art" aria-hidden="true">
          <span>4</span>
          <div className="not-found-coin">
            <svg viewBox="0 0 200 200" fill="none">
              <circle cx="100" cy="100" r="87" stroke="currentColor" strokeWidth="1" opacity=".15" />
              <circle className="zeni-page-loader-ring" cx="100" cy="100" r="87" stroke="currentColor" strokeWidth="5.2" strokeLinecap="round" pathLength="1" transform="rotate(-90 100 100)" />
              <path className="zeni-page-loader-square" d="M88.5 88.5H111.5V111.5H88.5Z" stroke="currentColor" strokeWidth="3.8" pathLength="1" />
            </svg>
          </div>
          <span>4</span>
        </div>
        <p className="not-found-eyebrow">404 / Page not found</p>
        <h1>This page is off the map.</h1>
        <p className="not-found-description">The link may be broken, or the page may have moved.<br className="not-found-desktop-break" /> Let’s get you back to Zeni.</p>
        <nav className="not-found-actions" aria-label="Find your way back">
          <a className="not-found-home" href="/"><ArrowLeft size={18} aria-hidden="true" />Back to home</a>
          <a className="not-found-secondary" href="/docs">Explore the docs<ArrowUpRight size={18} aria-hidden="true" /></a>
        </nav>
      </main>

      <footer className="not-found-footer">
        <span>Zeni Wallet</span>
        <span>A wrong turn. An easy way back.</span>
      </footer>
    </div>
  );
}
