import { motion } from "framer-motion";
import React from "react";
import { CountUp } from "@/components/CountUp";

export interface KpiTileProps {
  icon: React.ReactNode;
  label: string;
  value: number;
  sub?: React.ReactNode;
  tone?: string;
  index?: number;
  format?: (n: number) => string;
  highlight?: boolean;
  onClick?: () => void;
  className?: string;
  headerExtra?: React.ReactNode;
}

const brl = (n: number) =>
  (n ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function KpiTile({
  icon,
  label,
  value,
  sub,
  tone = "text-primary",
  index = 0,
  format = brl,
  highlight = false,
  onClick,
  className = "",
  headerExtra,
}: KpiTileProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      className={`relative overflow-hidden rounded-2xl border border-border/60 p-5 group ${onClick ? "cursor-pointer" : ""} ${className}`}
      style={{
        background: highlight
          ? "linear-gradient(135deg, color-mix(in oklab, var(--primary) 10%, var(--card)), var(--card))"
          : "var(--gradient-card)",
        boxShadow: "var(--shadow-elegant)",
      }}
    >
      <div className="flex items-start justify-between relative">
        <div className="space-y-1 min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
            {headerExtra}
          </div>
          <div className={`text-2xl font-bold tabular-nums ${tone}`}>
            <CountUp value={value} format={format} />
          </div>
        </div>
        <div className={`rounded-xl p-2.5 bg-background/60 backdrop-blur border border-border/50 ${tone} group-hover:scale-110 transition-transform shrink-0`}>
          {icon}
        </div>
      </div>
      {sub !== undefined && sub !== null && sub !== "" && (
        <div className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border/50 relative">{sub}</div>
      )}
    </motion.div>
  );
}
