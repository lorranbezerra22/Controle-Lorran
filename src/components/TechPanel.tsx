import React from "react";

interface TechPanelProps {
  title?: React.ReactNode;
  icon?: React.ReactNode;
  badge?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}

export function TechPanel({ title, icon, badge, right, children, className = "", bodyClassName = "p-4" }: TechPanelProps) {
  return (
    <div className={`tech-panel ${className}`}>
      {(title || badge || right) && (
        <div className="px-5 py-4 border-b border-border/60 flex items-start justify-between flex-wrap gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-[10px] uppercase tracking-[0.2em] text-primary">{badge ?? "Live"}</span>
            </div>
            {title && (
              <h3 className="text-sm font-semibold flex items-center gap-2 text-foreground">
                {icon}
                {title}
              </h3>
            )}
          </div>
          {right}
        </div>
      )}
      <div className={bodyClassName}>{children}</div>
    </div>
  );
}
