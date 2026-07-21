import { motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface PageHeaderProps {
  icon: LucideIcon;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function PageHeader({ icon: Icon, eyebrow, title, subtitle, actions }: PageHeaderProps) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4"
    >
      <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: "var(--gradient-primary)" }}>
        <Icon className="w-5 h-5" style={{ color: "#0F1B2E" }} />
      </div>
      <div className="min-w-0 flex-1">
        {eyebrow && <p className="text-[10px] uppercase tracking-[0.25em] text-primary">{eyebrow}</p>}
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight truncate">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground truncate">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2 items-center">{actions}</div>}
    </motion.header>
  );
}
