import { findBank, bankLogoUrl } from "@/lib/banks";
import { useState } from "react";

interface Props {
  bank?: string | null;
  size?: number;
  square?: boolean;
  className?: string;
}

export function BankIcon({ bank, size = 28, square = false, className = "" }: Props) {
  const b = findBank(bank);
  const [failed, setFailed] = useState(false);
  const url = b.logoUrl ?? bankLogoUrl(b, Math.max(64, size * 2));
  const radius = square ? "rounded-md" : "rounded-full";
  const bg = b.iconBg === "white" ? "bg-white" : "";

  return (
    <span
      className={`inline-flex items-center justify-center overflow-hidden shrink-0 ${radius} ${bg} ${className}`}
      style={{ width: size, height: size, background: bg ? undefined : b.color }}
      title={b.name}
    >
      {url && !failed ? (
        <img
          src={url}
          alt={b.name}
          width={size}
          height={size}
          onError={() => setFailed(true)}
          className="w-full h-full object-contain"
        />
      ) : (
        <span className="text-[11px] font-bold" style={{ color: b.iconBg === "white" ? b.color : "#fff" }}>
          {b.name.slice(0, 2).toUpperCase()}
        </span>
      )}
    </span>
  );
}
