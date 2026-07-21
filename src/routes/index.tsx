import { createFileRoute } from "@tanstack/react-router";
import { ProtectedShell } from "@/components/ProtectedShell";
import { PageHeader } from "@/components/PageHeader";
import { useTransactions, useInstallments, useCards, useAccounts, useCategories, useInvalidate } from "@/lib/queries";
import { brl, monthLabel } from "@/lib/format";
import { LayoutDashboard, TrendingUp, TrendingDown, Wallet, CreditCard, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CountUp } from "@/components/CountUp";
import { motion } from "framer-motion";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend } from "recharts";
import { MonthPicker } from "@/components/date-picker";
import { personColor } from "@/lib/people";

export const Route = createFileRoute("/")({
  component: () => <ProtectedShell><Dashboard /></ProtectedShell>,
  head: () => ({ meta: [{ title: "Dashboard — Gestão Família" }] }),
});

function inMonth(iso: string, m: number, y: number) {
  const d = new Date(iso + "T00:00:00");
  return d.getMonth() === m && d.getFullYear() === y;
}

function Kpi({ label, value, hint, icon: Icon, tone = "default" }: any) {
  const toneCls = tone === "up" ? "text-success" : tone === "down" ? "text-destructive" : "text-foreground";
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="tech-panel p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="text-xs uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
        {Icon && <Icon className="w-4 h-4 text-primary/70" />}
      </div>
      <div className={`text-2xl font-bold tabular-nums ${toneCls}`}>
        <CountUp value={Number(value) || 0} format={(n) => brl(n)} />
      </div>
      {hint && <div className="text-xs text-muted-foreground mt-2">{hint}</div>}
    </motion.div>
  );
}

function Dashboard() {
  const { data: tx = [] } = useTransactions();
  const { data: inst = [] } = useInstallments();
  const { data: cards = [] } = useCards();
  const { data: accounts = [] } = useAccounts();
  const { data: cats = [] } = useCategories();
  const invalidate = useInvalidate();

  const now = new Date();
  const [m, setM] = useState(now.getMonth());
  const [y, setY] = useState(now.getFullYear());

  // Auto-gera recorrências uma vez por mês
  const ranOnce = useRef(false);
  useEffect(() => {
    if (ranOnce.current) return;
    ranOnce.current = true;
    const key = `recur-gen-${y}-${m + 1}`;
    if (typeof window !== "undefined" && window.localStorage.getItem(key)) return;
    supabase.rpc("generate_recurrences", { target_year: y, target_month: m + 1 }).then(({ data, error }) => {
      if (!error) {
        window.localStorage.setItem(key, "1");
        if ((data ?? 0) > 0) invalidate("transactions");
      }
    });
  }, [m, y, invalidate]);

  const monthTx = tx.filter((t: any) => inMonth(t.due_at, m, y));
  const monthInst = inst.filter((i: any) => inMonth(i.due_at, m, y));

  const receitas = monthTx.filter((t: any) => t.kind === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
  const despesas = monthTx.filter((t: any) => t.kind === "expense" && !t.card_installment_id).reduce((s: number, t: any) => s + Number(t.amount), 0);
  const fatura = monthInst.reduce((s: number, i: any) => s + Number(i.amount), 0);
  const saldoContas = accounts.reduce((s: number, a: any) => s + Number(a.balance || 0), 0);
  const balanco = receitas - despesas - fatura;

  const yearData = useMemo(() => {
    const arr = Array.from({ length: 12 }, (_, mm) => ({ mes: monthLabel(mm), Receitas: 0, Despesas: 0 }));
    tx.forEach((t: any) => {
      const d = new Date(t.due_at + "T00:00:00");
      if (d.getFullYear() !== y) return;
      if (t.kind === "income") arr[d.getMonth()].Receitas += Number(t.amount);
      else if (!t.card_installment_id) arr[d.getMonth()].Despesas += Number(t.amount);
    });
    inst.forEach((i: any) => {
      const d = new Date(i.due_at + "T00:00:00");
      if (d.getFullYear() !== y) return;
      arr[d.getMonth()].Despesas += Number(i.amount);
    });
    return arr;
  }, [tx, inst, y]);

  const catData = useMemo(() => {
    const catMap = new Map<string, string>();
    cats.forEach((c: any) => catMap.set(c.id, `${c.icon ?? ""} ${c.name}`.trim()));
    const map = new Map<string, number>();
    monthTx.filter((t: any) => t.kind === "expense" && !t.card_installment_id).forEach((t: any) => {
      const name = catMap.get(t.category_id) || "Sem categoria";
      map.set(name, (map.get(name) || 0) + Number(t.amount));
    });
    monthInst.forEach((i: any) => {
      const name = i.card_purchases?.categories?.name ? `${i.card_purchases.categories.icon ?? ""} ${i.card_purchases.categories.name}`.trim() : "Cartões";
      map.set(name, (map.get(name) || 0) + Number(i.amount));
    });
    return Array.from(map.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
  }, [monthTx, monthInst, cats]);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={LayoutDashboard}
        eyebrow="Visão geral"
        title="Dashboard"
        subtitle={`${monthLabel(m)} · ${y}`}
        actions={<MonthPicker monthIndex={m} year={y} onChange={(mm, yy) => { setM(mm); setY(yy); }} className="w-40" />}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Kpi label="Receitas" value={receitas} icon={TrendingUp} tone="up" />
        <Kpi label="Despesas" value={despesas} icon={TrendingDown} tone="down" hint="Sem cartão" />
        <Kpi label="Fatura de cartões" value={fatura} icon={CreditCard} />
        <Kpi label="Saldo em contas" value={saldoContas} icon={Wallet} tone={saldoContas >= 0 ? "up" : "down"} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="tech-panel p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-primary">Ano</div>
              <h2 className="text-lg font-semibold">Receitas vs Despesas · {y}</h2>
            </div>
            <Sparkles className="w-4 h-4 text-primary" />
          </div>
          <div className="h-64">
            <ResponsiveContainer>
              <AreaChart data={yearData}>
                <defs>
                  <linearGradient id="gInc" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-success)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="var(--color-success)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gExp" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-destructive)" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="var(--color-destructive)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--color-border)" strokeDasharray="3 3" opacity={0.35} />
                <XAxis dataKey="mes" tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} />
                <YAxis tick={{ fill: "var(--color-muted-foreground)", fontSize: 11 }} tickFormatter={(v) => `R$${(v/1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} formatter={(v: any) => brl(Number(v))} />
                <Area type="monotone" dataKey="Receitas" stroke="var(--color-success)" fill="url(#gInc)" />
                <Area type="monotone" dataKey="Despesas" stroke="var(--color-destructive)" fill="url(#gExp)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="tech-panel p-5">
          <div className="text-xs uppercase tracking-[0.2em] text-primary">Mês</div>
          <h2 className="text-lg font-semibold mb-2">Top categorias</h2>
          <div className="h-64">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={catData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80}>
                  {catData.map((c, i) => (
                    <Cell key={i} fill={personColor(c.name + i)} />
                  ))}
                </Pie>
                <Tooltip formatter={(v: any) => brl(Number(v))} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      </div>

      <div className="tech-panel p-5">
        <div className="flex items-center justify-between mb-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-primary">Projetado</div>
            <h2 className="text-lg font-semibold">Balanço do mês</h2>
          </div>
          <div className={`text-2xl font-bold tabular-nums ${balanco >= 0 ? "text-success" : "text-destructive"}`}>{brl(balanco)}</div>
        </div>
        <div className="text-sm text-muted-foreground">
          {cards.length} cartão(ões) · {accounts.length} conta(s) · {monthTx.length} lançamento(s) no mês
        </div>
      </div>
    </div>
  );
}
