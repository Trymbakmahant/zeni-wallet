import React, { useEffect, useRef, useState } from "react";
import { useWallet } from "../context/WalletContext";

/** Keep routing hidden until the background has positively identified the vault. */
export const StartupScreen: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isBootstrapping, startupError, retryStartup } = useWallet();
  const [visible, setVisible] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const startedAt = useRef(performance.now());
  const ready = !isBootstrapping && !startupError;

  useEffect(() => {
    if (!ready) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const remaining = reducedMotion ? 0 : Math.max(0, 1050 - (performance.now() - startedAt.current));
    let finish: ReturnType<typeof setTimeout>;
    const reveal = setTimeout(() => {
      setLeaving(true);
      finish = setTimeout(() => setVisible(false), reducedMotion ? 0 : 240);
    }, remaining);
    return () => { clearTimeout(reveal); clearTimeout(finish); };
  }, [ready]);

  return (
    <div className="wallet-startup-root">
      {ready && !visible && (
        <div className="wallet-startup-content">
          {children}
        </div>
      )}
      {visible && (
        <div className={`wallet-startup${leaving ? " wallet-startup--leaving" : ""}`}>
          <div className="wallet-startup-center">
            {/* Trace the ring and square from the supplied zeni-coin.png mark.
                SVG keeps the drawing crisp at popup size without a video decoder. */}
            <svg className="wallet-startup-logo" viewBox="0 0 200 200" fill="none" aria-hidden="true">
              <circle className="wallet-startup-ring" cx="100" cy="100" r="87" stroke="currentColor" strokeWidth="5.2" strokeLinecap="round" pathLength="1" transform="rotate(-90 100 100)" />
              <path className="wallet-startup-square" d="M88.5 88.5H111.5V111.5H88.5Z" stroke="currentColor" strokeWidth="3.8" pathLength="1" />
            </svg>
            <div className="wallet-startup-wordmark">zeni</div>
            <div className="wallet-startup-status" role="status" aria-live="polite">
              {startupError ? "We couldn’t open your wallet" : "Opening your wallet"}
            </div>
            {startupError ? (
              <div className="wallet-startup-error">
                <p>{startupError}</p>
                <button type="button" onClick={retryStartup}>Try again</button>
              </div>
            ) : (
              <div className="wallet-startup-progress" aria-hidden="true"><span /></div>
            )}
          </div>
          <div className="wallet-startup-caption">YOUR WALLET. YOUR PEACE OF MIND.</div>
        </div>
      )}
    </div>
  );
};
