import { createFileRoute } from "@tanstack/react-router";
import { ProtectedShell } from "@/components/ProtectedShell";
import { Wallet, TrendingUp, CreditCard, Plane } from "lucide-react";

export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => ({ meta: [{ title: "Dashboard — Gestão Família" }] }),
});

function HomePage() {
  return (
    <ProtectedShell>
      <div className="space-y-6">
        <header>
          <p className="text-xs uppercase tracking-[0.25em] text-primary">Fase 1 concluída</p>
          <h1 className="text-3xl md:text-4xl font-bold mt-1">Bem-vindo à sua Gestão Família</h1>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            Design system, autenticação, layout e schema do banco estão prontos. As telas
            de Dashboard, Lançamentos, Cartões e Milhas serão implementadas nas próximas fases.
          </p>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: Wallet, label: "Contas", desc: "Fase 2" },
            { icon: TrendingUp, label: "Financeiro", desc: "Fase 2" },
            { icon: CreditCard, label: "Cartões", desc: "Fase 2" },
            { icon: Plane, label: "Milhas", desc: "Fase 3" },
          ].map((c) => {
            const Icon = c.icon;
            return (
              <div key={c.label} className="tech-panel p-5">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center mb-3" style={{ background: "var(--gradient-primary)" }}>
                  <Icon className="w-5 h-5" style={{ color: "#0F1B2E" }} />
                </div>
                <div className="text-sm font-medium">{c.label}</div>
                <div className="text-xs text-muted-foreground mt-1">{c.desc}</div>
              </div>
            );
          })}
        </div>

        <div className="tech-panel p-6">
          <h2 className="text-lg font-semibold mb-3">Roadmap</h2>
          <ol className="space-y-2 text-sm text-muted-foreground">
            <li><strong className="text-foreground">Fase 1 ✓</strong> — Design system, auth, shell e schema Supabase</li>
            <li><strong className="text-foreground">Fase 2</strong> — Dashboard, Lançamentos, Cartões, Contas, Categorias</li>
            <li><strong className="text-foreground">Fase 3</strong> — Módulo Milhas completo (7 sub-rotas)</li>
            <li><strong className="text-foreground">Fase 4</strong> — Anotações, Importações, Solução Financeira, polish</li>
          </ol>
        </div>
      </div>
    </ProtectedShell>
  );
}
