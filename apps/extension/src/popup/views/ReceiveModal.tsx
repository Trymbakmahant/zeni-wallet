import React, { useState, useEffect } from "react";
import { X, Copy, Check, QrCode, ShieldCheck } from "lucide-react";
import { useWallet } from "../context/WalletContext";
import QRCode from "qrcode";

export const ReceiveModal: React.FC = () => {
  const { openModal, activeAddress, cosmosAddress } = useWallet();
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [copiedType, setCopiedType] = useState<"evm" | "cosmos" | null>(null);

  useEffect(() => {
    if (activeAddress) {
      QRCode.toDataURL(activeAddress, {
        width: 220,
        margin: 1,
        color: {
          dark: "#000000",
          light: "#FFFFFF",
        },
      }).then((url) => setQrDataUrl(url));
    }
  }, [activeAddress]);

  const copyToClipboard = (text: string, type: "evm" | "cosmos") => {
    navigator.clipboard.writeText(text);
    setCopiedType(type);
    setTimeout(() => setCopiedType(null), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/85 backdrop-blur-sm z-50 flex flex-col justify-end">
      <div className="bg-[#0D0D10] border-t border-[#222226] rounded-t-3xl p-5 w-full flex flex-col items-center animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between w-full pb-3 border-b border-[#222226]">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-[#E06341]/15 flex items-center justify-center text-[#E06341]">
              <QrCode className="w-4 h-4" />
            </div>
            <h2 className="font-bold text-base text-white">Receive Assets</h2>
          </div>
          <button
            onClick={() => openModal(null)}
            className="w-7 h-7 rounded-full bg-[#18181C] hover:bg-[#27272A] flex items-center justify-center text-zinc-400"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* QR Code */}
        <div className="my-5 p-3 bg-white rounded-2xl shadow-xl flex items-center justify-center">
          {qrDataUrl ? (
            <img src={qrDataUrl} alt="Deposit QR Code" className="w-44 h-44 rounded-lg" />
          ) : (
            <div className="w-44 h-44 flex items-center justify-center text-gray-500 text-xs">
              Generating QR...
            </div>
          )}
        </div>

        <div className="w-full space-y-3">
          {/* EVM Address */}
          <div>
            <div className="flex justify-between items-center text-xs text-zinc-400 mb-1">
              <span>EVM Address (Ethereum Lane)</span>
              {copiedType === "evm" && <span className="text-emerald-400 font-semibold">Copied!</span>}
            </div>
            <button
              onClick={() => activeAddress && copyToClipboard(activeAddress, "evm")}
              className="w-full p-2.5 rounded-xl bg-black hover:bg-[#18181B] border border-[#222226] flex items-center justify-between font-mono text-xs text-white transition-colors cursor-pointer"
            >
              <span className="truncate pr-2">{activeAddress || "No active account"}</span>
              {copiedType === "evm" ? (
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <Copy className="w-4 h-4 text-zinc-400 shrink-0" />
              )}
            </button>
          </div>

          {/* Cosmos Address */}
          <div>
            <div className="flex justify-between items-center text-xs text-zinc-400 mb-1">
              <span>Cosmos Address (qor1... Lane)</span>
              {copiedType === "cosmos" && <span className="text-emerald-400 font-semibold">Copied!</span>}
            </div>
            <button
              onClick={() => cosmosAddress && copyToClipboard(cosmosAddress, "cosmos")}
              className="w-full p-2.5 rounded-xl bg-black hover:bg-[#18181B] border border-[#222226] flex items-center justify-between font-mono text-xs text-white transition-colors cursor-pointer"
            >
              <span className="truncate pr-2">{cosmosAddress || "No active account"}</span>
              {copiedType === "cosmos" ? (
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              ) : (
                <Copy className="w-4 h-4 text-zinc-400 shrink-0" />
              )}
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-center gap-1.5 text-[11px] text-zinc-400">
          <ShieldCheck className="w-3.5 h-3.5 text-[#E06341]" />
          <span>QoreChain Diana Testnet (Chain ID 9800)</span>
        </div>
      </div>
    </div>
  );
};
