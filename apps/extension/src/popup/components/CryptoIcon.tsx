import React from "react";

export const BtcIcon: React.FC<{ className?: string }> = ({ className = "w-9 h-9" }) => (
  <svg className={className} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="18" cy="18" r="18" fill="#F7931A" />
    <path
      d="M23.189 15.308c.314-2.096-1.283-3.223-3.465-3.975l.708-2.84-1.728-.43-.69 2.765c-.454-.114-.92-.22-1.385-.326l.695-2.783-1.728-.431-.709 2.839c-.376-.086-.745-.17-1.104-.258l.002-.007-2.385-.595-.46 1.846s1.283.294 1.256.312c.7.175.827.638.806 1.006l-.807 3.238c.048.012.11.03.179.057l-.182-.045-1.132 4.536c-.086.213-.304.533-.796.411.018.025-1.257-.314-1.257-.314l-.858 1.978 2.25.561c.419.105.829.213 1.233.318l-.716 2.875 1.727.431.708-2.84c.472.127.93.245 1.378.357l-.705 2.828 1.728.431.716-2.868c2.948.558 5.164.333 6.097-2.333.752-2.146-.037-3.385-1.587-4.192 1.128-.26 1.977-1.002 2.206-2.533zm-3.945 5.536c-.535 2.146-4.152.986-5.325.694l.95-3.808c1.173.293 4.929.872 4.375 3.114zm.535-5.568c-.488 1.954-3.498.962-4.475.718l.861-3.453c.977.244 4.12.7 3.614 2.735z"
      fill="#FFFFFF"
    />
  </svg>
);

export const EthIcon: React.FC<{ className?: string }> = ({ className = "w-9 h-9" }) => (
  <svg className={className} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="18" cy="18" r="18" fill="#627EEA" />
    <g fillRule="evenodd">
      <path d="M18 5v9.88l8.347 3.738L18 5z" fill="#FFFFFF" fillOpacity=".65" />
      <path d="M18 5L9.653 18.618 18 14.88V5z" fill="#FFFFFF" />
      <path d="M18 24.286v6.711l8.351-11.597L18 24.286z" fill="#FFFFFF" fillOpacity=".65" />
      <path d="M18 30.997v-6.711L9.653 19.4 18 30.997z" fill="#FFFFFF" />
      <path d="M18 22.842l8.347-4.962L18 14.142v8.7z" fill="#FFFFFF" fillOpacity=".25" />
      <path d="M9.653 17.88L18 22.842v-8.7l-8.347 3.738z" fill="#FFFFFF" fillOpacity=".65" />
    </g>
  </svg>
);

export const UsdIcon: React.FC<{ className?: string }> = ({ className = "w-9 h-9" }) => (
  <svg className={className} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="18" cy="18" r="18" fill="#2775CA" />
    <circle cx="18" cy="18" r="14" stroke="#FFFFFF" strokeOpacity=".3" strokeWidth="1.2" strokeDasharray="3 2" />
    <path
      d="M18.8 11.2c-3.1 0-5.1 1.6-5.1 3.9 0 2.2 1.6 3.3 4.4 3.7l1.1.2c1.7.3 2.5.8 2.5 1.8 0 1.2-1.3 2-3 2-1.6 0-3-.6-3.8-1.5l-1.3 1.5c1.1 1.2 2.8 1.9 4.8 2v1.7h1.6v-1.7c3.1-.2 5-1.9 5-4.1 0-2.3-1.7-3.4-4.5-3.8l-1.1-.2c-1.5-.2-2.3-.7-2.3-1.6 0-1.1 1.2-1.8 2.7-1.8 1.4 0 2.5.5 3.3 1.2l1.2-1.4c-1.1-1-2.5-1.5-4.2-1.6v-1.6h-1.6v1.6z"
      fill="#FFFFFF"
    />
  </svg>
);

export const QorIcon: React.FC<{ className?: string }> = ({ className = "w-9 h-9" }) => (
  <svg className={className} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="qorBorderGrad" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#00F0FF" />
        <stop offset="100%" stopColor="#9939FF" />
      </linearGradient>
      <linearGradient id="qorTopGrad" x1="10" y1="8" x2="26" y2="14" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#38F9D7" />
        <stop offset="100%" stopColor="#00F0FF" />
      </linearGradient>
    </defs>
    <circle cx="18" cy="18" r="18" fill="#0D111A" />
    <circle cx="18" cy="18" r="17" stroke="url(#qorBorderGrad)" strokeWidth="1.5" />
    {/* Quantum Faceted Crystal / Gem Logo */}
    <path d="M18 7.5L26 13.5L18 28.5L10 13.5L18 7.5Z" fill="#00F0FF" fillOpacity="0.15" />
    <path d="M18 7.5L26 13.5H10L18 7.5Z" fill="url(#qorTopGrad)" />
    <path d="M10 13.5L18 28.5V13.5H10Z" fill="#00D2E0" fillOpacity="0.85" />
    <path d="M26 13.5L18 28.5V13.5H26Z" fill="#9939FF" fillOpacity="0.9" />
  </svg>
);

export const CryptoIcon: React.FC<{ symbol: string; className?: string }> = ({
  symbol,
  className = "w-9 h-9",
}) => {
  const norm = symbol.toUpperCase().replace(/^F/, "");
  if (norm === "BTC") return <BtcIcon className={className} />;
  if (norm === "ETH") return <EthIcon className={className} />;
  if (norm === "USD" || norm === "USDC" || norm === "USDT") return <UsdIcon className={className} />;
  return <QorIcon className={className} />;
};
