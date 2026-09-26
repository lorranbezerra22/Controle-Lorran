import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, ListOrdered, CreditCard, LogOut, Wallet, StickyNote,
  Landmark, TrendingUp, Sparkles, HandCoins, Plane, Coins,
  Scale, Settings as SettingsIcon, ChevronDown, Check,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import { motion } from "framer-motion";
import { useState, useRef, useEffect } from "react";
import { workspaceFromPath, WORKSPACES } from "@/lib/workspace";

const NAV_FAMILIA = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/financeiro", label: "Financeiro", icon: TrendingUp },
  { to: "/lancamentos", label: "Lançamentos", icon: ListOrdered },
  { to: "/cartoes", label: "Cartões", icon: CreditCard },
  { to: "/base", label: "Configurações", icon: SettingsIcon },
  { to: "/conta", label: "Contas", icon: Landmark },
  { to: "/solucao-financeira", label: "Solução Financeira", icon: HandCoins },
  { to: "/anotacoes", label: "Anotações", icon: StickyNote },
];

const NAV_MILHAS = [
  { to: "/milhas", label: "Dashboard", icon: LayoutDashboard },
  { to: "/milhas/registros", label: "Registros", icon: Coins },
  { to: "/milhas/comparacao", label: "Comparação", icon: Scale },
  { to: "/milhas/planejamento", label: "Planejamento", icon: Plane },
  { to: "/milhas/config", label: "Configurações", icon: SettingsIcon },
];

function WorkspaceSwitcher({ current }: { current: "familia" | "milhas" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const active = WORKSPACES.find((w) => w.id === current)!;

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className="relative mb-4">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-sidebar-accent/40 hover:bg-sidebar-accent/60 transition-colors border border-sidebar-border"
      >
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shadow-md" style={{ background: "var(--gradient-primary)" }}>
          {current === "milhas" ? (
            <Plane className="w-5 h-5" style={{ color: "#0F1B2E" }} />
          ) : (
            <Wallet className="w-5 h-5" style={{ color: "#0F1B2E" }} />
          )}
        </div>
        <div className="flex-1 text-left min-w-0">
          <div className="text-[10px] uppercase tracking-[0.18em] text-primary">Bem-vindo</div>
          <div className="text-sm font-semibold text-sidebar-foreground truncate">{active.label}</div>
        </div>
        <ChevronDown className={cn("w-4 h-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-xl border border-sidebar-border bg-sidebar shadow-xl overflow-hidden">
          {WORKSPACES.map((w) => (
            <button
              key={w.id}
              onClick={() => { setOpen(false); navigate({ to: w.path }); }}
              className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-sidebar-accent/50 transition-colors"
            >
              <span className="text-lg w-6 text-center">{w.icon}</span>
              <span className="flex-1 text-sm text-sidebar-foreground">{w.label}</span>
              {w.id === current && <Check className="w-4 h-4 text-primary" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const loc = useLocation();
  const navigate = useNavigate();
  const workspace = workspaceFromPath(loc.pathname);
  const NAV = workspace === "milhas" ? NAV_MILHAS : NAV_FAMILIA;

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login", search: { next: "" } });
  };

  return (
    <div className="flex min-h-screen bg-background">
      <aside className="hidden md:flex w-64 flex-col p-4 border-r border-sidebar-border" style={{ background: "var(--gradient-sidebar)" }}>
        <WorkspaceSwitcher current={workspace} />

        <nav className="flex-1 space-y-1">
          {NAV.map((n) => {
            const active = loc.pathname === n.to;
            const Icon = n.icon;
            return (
              <Link
                key={n.to}
                to={n.to}
                className={cn(
                  "group relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all duration-200",
                  active
                    ? "text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/75 hover:text-sidebar-accent-foreground hover:bg-sidebar-accent/40"
                )}
                style={
                  active
                    ? {
                        background:
                          "linear-gradient(135deg, color-mix(in oklab, var(--color-primary) 18%, transparent), color-mix(in oklab, var(--color-accent) 10%, transparent))",
                        boxShadow:
                          "0 0 0 1px color-mix(in oklab, var(--color-primary) 30%, transparent), 0 8px 20px -12px oklch(0.04 0.03 260 / 0.65)",
                      }
                    : undefined
                }
              >
                {active && (
                  <span aria-hidden className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full" style={{ background: "var(--gradient-primary)" }} />
                )}
                <Icon className={cn("w-4 h-4 transition-transform group-hover:scale-110", active && "text-primary-foreground")} />
                <span className="flex-1 truncate">{n.label}</span>
                {active && <Sparkles className="w-3 h-3 opacity-70" />}
              </Link>
            );
          })}
        </nav>

        <div className="mt-4 flex items-center gap-2">
          <button onClick={signOut} className="flex-1 flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm text-destructive/90 hover:text-destructive hover:bg-destructive/10 transition-colors">
            <LogOut className="w-4 h-4" /> Sair
          </button>
          <ThemeToggle />
        </div>

        <div className="mt-4 pt-4 border-t border-sidebar-border text-[10px] text-muted-foreground uppercase tracking-[0.2em]">
          v2 · {workspace === "milhas" ? "Milhas" : "Navy"}
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="md:hidden flex items-center justify-between p-4 border-b border-border bg-sidebar/80 backdrop-blur">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--gradient-primary)" }}>
              <Wallet className="w-4 h-4 text-primary-foreground" />
            </div>
            <span className="font-semibold tracking-tight">{workspace === "milhas" ? "CRM Milhas" : "Gestão Família"}</span>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <button onClick={signOut} className="text-sm text-muted-foreground p-2" aria-label="Sair"><LogOut className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="md:hidden flex gap-1 p-2 border-b border-border overflow-x-auto bg-sidebar/60 backdrop-blur">
          {WORKSPACES.map((w) => (
            <Link
              key={w.id}
              to={w.path}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors",
                w.id === workspace ? "bg-primary/20 border border-primary/30 text-primary-foreground" : "text-muted-foreground border border-transparent"
              )}
            >
              <span>{w.icon}</span> {w.label}
            </Link>
          ))}
        </div>
        <div className="md:hidden flex gap-1 p-2 border-b border-border overflow-x-auto bg-sidebar/60 backdrop-blur">
          {NAV.map((n) => {
            const active = loc.pathname === n.to;
            const Icon = n.icon;
            return (
              <Link key={n.to} to={n.to} className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-xs whitespace-nowrap transition-colors",
                active ? "bg-primary/20 text-primary-foreground border border-primary/30" : "text-muted-foreground hover:bg-sidebar-accent/40"
              )}>
                <Icon className="w-3.5 h-3.5" /> {n.label}
              </Link>
            );
          })}
        </div>

        <main className="flex-1 p-3 sm:p-5 md:p-8 max-w-7xl w-full mx-auto">
          <motion.div key={loc.pathname} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15, ease: "easeOut" }}>
            {children}
          </motion.div>
        </main>
      </div>
    </div>
  );
}
