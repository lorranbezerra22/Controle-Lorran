import { createFileRoute } from "@tanstack/react-router";
import { DatePicker, MonthPicker } from "@/components/date-picker";
import { ProtectedShell } from "@/components/ProtectedShell";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { brl, fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { HandCoins, Plus, TrendingUp, Wallet, AlertTriangle, Coins, CreditCard, CheckCircle2, Calculator, Trash2, History, Calendar, ChevronDown, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { PageHeader } from "@/components/PageHeader";
import { KpiTile } from "@/components/KpiTile";

const MESES_LBL = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

export const Route = createFileRoute("/solucao-financeira")({
  component: () => <ProtectedShell><SolucaoFinanceiraPage /></ProtectedShell>,
  head: () => ({ meta: [{ title: "Solução Financeira — Gestão Família" }] }),
});

type Loan = {
  id: string; borrower_name: string; principal: number; interest_rate: number;
  fixed_rate: number;
  installments: number;
  interest_type: "simple" | "compound" | "monthly_fixed";
  start_date: string; due_date: string | null; status: string;
  funding_source: "cash" | "card" | "account"; card_cost: number; potential_gain: number; notes: string | null;
  cost_basis: number | null;
};

// Custo real do capital emprestado (fallback = principal)
function getCostBasis(loan: Loan): number {
  return loan.cost_basis === null || loan.cost_basis === undefined
    ? Number(loan.principal)
    : Number(loan.cost_basis);
}
type Payment = { id: string; loan_id: string; amount: number; paid_at: string; notes: string | null };

function monthsBetween(start: string, end: Date): number {
  const s = new Date(start + "T00:00:00");
  const diff = (end.getFullYear() - s.getFullYear()) * 12 + (end.getMonth() - s.getMonth());
  const dayAdj = end.getDate() >= s.getDate() ? 0 : -1;
  return Math.max(0, diff + dayAdj + (end.getDate() === s.getDate() ? 0 : (end.getDate() > s.getDate() ? (end.getDate() - s.getDate()) / 30 : 0)));
}

// 1ª parcela: dia 07 do mês seguinte à data de início
function firstDueDate(startISO: string): string {
  const s = new Date(startISO + "T00:00:00");
  const d = new Date(s.getFullYear(), s.getMonth() + 1, 7);
  return d.toISOString().slice(0, 10);
}

function computeTotal(loan: Loan, _asOf: Date = new Date()): number {
  const r = Number(loan.interest_rate) / 100;
  const fx = Number(loan.fixed_rate ?? 0) / 100;
  const parcelas = Math.max(1, Number(loan.installments ?? 1));
  const base = Number(loan.principal) * (1 + fx);
  if (loan.interest_type === "compound") return base * Math.pow(1 + r, parcelas);
  // 5% por parcela em cima do valor base com taxa fixa
  return base * (1 + r * parcelas);
}

function getInstallments(loan: Loan): number {
  return Math.max(1, Number(loan.installments ?? 1));
}

function getCardInstallmentCost(loan: Loan): number {
  return Math.max(0, Number(loan.card_cost) || 0);
}

function computeCardOpenInvestment(loan: Loan, paidInstallments: number): number {
  const installmentCost = getCardInstallmentCost(loan);
  if (installmentCost <= 0) return Math.max(0, getCostBasis(loan) - (paidInstallments * (computeTotal(loan) / getInstallments(loan))));
  return Math.max(0, (getInstallments(loan) - paidInstallments) * installmentCost);
}

function computePotentialLost(loan: Loan): number {
  if (loan.funding_source !== "card") return Math.max(0, Number(loan.potential_gain) || 0);
  const installmentCost = getCardInstallmentCost(loan);
  if (installmentCost <= 0) return Math.max(0, Number(loan.potential_gain) || 0);
  // Potencial perdido = juros pagos ao cartão (custo total no cartão − investimento)
  return Math.max(0, (installmentCost * getInstallments(loan)) - getCostBasis(loan));
}

function computeRealizedProfit(loan: Loan, paid: number, paidInstallments: number): number {
  if (loan.funding_source === "card") {
    const installmentCost = getCardInstallmentCost(loan);
    if (installmentCost <= 0) return Math.max(0, paid - getCostBasis(loan));
    return Math.max(0, paid - (Math.min(paidInstallments, getInstallments(loan)) * installmentCost));
  }
  return Math.max(0, paid - getCostBasis(loan));
}


function SolucaoFinanceiraPage() {
  const qc = useQueryClient();
  const [openNew, setOpenNew] = useState(false);
  const [openSim, setOpenSim] = useState(false);
  const [payLoan, setPayLoan] = useState<Loan | null>(null);
  const [histLoan, setHistLoan] = useState<Loan | null>(null);
  const [editLoan, setEditLoan] = useState<Loan | null>(null);
  const [openKpi, setOpenKpi] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try { return new Set(JSON.parse(window.localStorage.getItem("sol:collapsed") || "[]")); } catch { return new Set(); }
  });
  const toggleCollapsed = (id: string) => setCollapsed(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    if (typeof window !== "undefined") window.localStorage.setItem("sol:collapsed", JSON.stringify(Array.from(n)));
    return n;
  });

  const { data: loans = [] } = useQuery({
    queryKey: ["loans"],
    queryFn: async () => {
      const { data, error } = await supabase.from("emprestimos").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Loan[];
    },
  });

  const { data: payments = [] } = useQuery({
    queryKey: ["loan_payments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("emprestimo_pagamentos").select("*").order("paid_at", { ascending: false });
      if (error) throw error;
      return data as Payment[];
    },
  });

  const paidMap = useMemo(() => {
    const m = new Map<string, number>();
    payments.forEach(p => m.set(p.loan_id, (m.get(p.loan_id) ?? 0) + Number(p.amount)));
    return m;
  }, [payments]);

  const paidCountMap = useMemo(() => {
    const m = new Map<string, number>();
    payments.forEach(p => m.set(p.loan_id, (m.get(p.loan_id) ?? 0) + 1));
    return m;
  }, [payments]);

  const kpis = useMemo(() => {
    let principalAtivo = 0, totalDevidoAtivo = 0, recebido = 0, lucro = 0, lucroAReceber = 0, investimentoCartaoAberto = 0, potencialPerdido = 0, investAtivo = 0, totalEmprestado = 0;
    loans.forEach(l => {
      const paid = paidMap.get(l.id) ?? 0;
      const paidInstallments = paidCountMap.get(l.id) ?? 0;
      const total = computeTotal(l);
      recebido += paid;
      // Empréstimos 100% lucro (cost_basis = 0) não somam ao total emprestado
      if (getCostBasis(l) > 0) totalEmprestado += Number(l.principal);
      potencialPerdido += computePotentialLost(l);
      if (l.funding_source === "card") {
        investimentoCartaoAberto += computeCardOpenInvestment(l, paidInstallments);
      }
      if (l.status === "active" || l.status === "overdue") {
        principalAtivo += Number(l.principal);
        totalDevidoAtivo += total;
        investAtivo += l.funding_source === "card"
          ? computeCardOpenInvestment(l, paidInstallments)
          : Math.max(0, getCostBasis(l) - paid);
      }
      const lucroRealizado = computeRealizedProfit(l, paid, paidInstallments);
      const lucroTotalEsperado = computeRealizedProfit(l, total, getInstallments(l));
      lucro += lucroRealizado;
      if (l.status !== "paid") lucroAReceber += Math.max(0, lucroTotalEsperado - lucroRealizado);
    });
    return { principalAtivo, totalDevidoAtivo, recebido, lucro, lucroAReceber, investimentoCartaoAberto, potencialPerdido, investAtivo, totalEmprestado };
  }, [loans, paidMap, paidCountMap]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["loans"] });
    qc.invalidateQueries({ queryKey: ["loan_payments"] });
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir empréstimo e seu histórico?")) return;
    const { error } = await supabase.from("emprestimos").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Excluído"); invalidate(); }
  };

  const markPaid = async (loan: Loan) => {
    const { error } = await supabase.from("emprestimos").update({ status: "paid" }).eq("id", loan.id);
    if (error) toast.error(error.message); else { toast.success("Marcado como quitado"); invalidate(); }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <PageHeader
        icon={HandCoins}
        eyebrow="Empréstimos & Juros"
        title="Solução Financeira"
        subtitle="Gerencie empréstimos a terceiros, juros, custos e lucro realizado"
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setOpenSim(true)} className="gap-2">
              <Calculator className="h-4 w-4" /> Simulador
            </Button>
            <Button onClick={() => setOpenNew(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Novo empréstimo
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile icon={<HandCoins className="h-5 w-5" />} label="Total emprestado" value={kpis.totalEmprestado} tone="text-violet-500" index={0} onClick={() => setOpenKpi("totalEmprestado")} />
        <KpiTile icon={<CheckCircle2 className="h-5 w-5" />} label="Lucro realizado" value={kpis.lucro} tone="text-emerald-500" index={1} sub={<span>A receber: <span className="font-semibold text-emerald-500">{brl(kpis.lucroAReceber)}</span></span>} onClick={() => setOpenKpi("lucro")} />
        <KpiTile icon={<AlertTriangle className="h-5 w-5" />} label="Potencial perdido" value={kpis.potencialPerdido} tone="text-amber-500" index={2} onClick={() => setOpenKpi("potencialPerdido")} />
        <KpiTile icon={<Coins className="h-5 w-5" />} label="Total recebido" value={kpis.recebido} tone="text-blue-500" index={3} onClick={() => setOpenKpi("recebido")} />
        <KpiTile icon={<Wallet className="h-5 w-5" />} label="Investimento em aberto" value={kpis.investAtivo} tone="text-primary" index={4} onClick={() => setOpenKpi("investAtivo")} />
        <KpiTile icon={<CreditCard className="h-5 w-5" />} label="Investimento do cartão em aberto" value={kpis.investimentoCartaoAberto} tone="text-red-500" index={5} onClick={() => setOpenKpi("investCartao")} />
        <KpiTile icon={<TrendingUp className="h-5 w-5" />} label="A receber (com juros)" value={Math.max(0, kpis.totalDevidoAtivo - loans.filter(l => l.status === "active" || l.status === "overdue").reduce((s, l) => s + (paidMap.get(l.id) ?? 0), 0))} tone="text-emerald-500" index={6} onClick={() => setOpenKpi("aReceber")} />
        <KpiTile icon={<Wallet className="h-5 w-5" />} label="Empréstimos ativos" value={loans.filter(l => l.status === "active" || l.status === "overdue").length} tone="text-primary" index={7} format={(n) => String(n)} onClick={() => setOpenKpi("ativos")} />
      </div>

      <KpiDetailDialog
        openKpi={openKpi}
        onClose={() => setOpenKpi(null)}
        loans={loans}
        paidMap={paidMap}
        paidCountMap={paidCountMap}
      />


      {/* Resumo mensal */}
      <MonthlySummary payments={payments} loans={loans} />

      {/* Lista */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}
        className="tech-panel overflow-hidden"
        style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-elegant)" }}
      >
        <div className="p-4 sm:p-5 border-b border-border/60 flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2"><HandCoins className="h-5 w-5 text-primary" /> Empréstimos</h2>
          <span className="text-xs text-muted-foreground">{loans.length} registro(s)</span>
        </div>
        {loans.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Nenhum empréstimo cadastrado. Clique em <strong>Novo empréstimo</strong> para começar.</div>
        ) : (
          <div className="divide-y divide-border/60">
            {loans.map((l, idx) => {
              const paid = paidMap.get(l.id) ?? 0;
              const total = computeTotal(l);
              const rest = Math.max(0, total - paid);
              const totalInst = l.installments ?? 1;
              const paidCount = Math.min(totalInst, paidCountMap.get(l.id) ?? 0);
              const realizedProfit = computeRealizedProfit(l, paid, paidCount);
              const firstDue = l.due_date ?? firstDueDate(l.start_date);
              const fd = new Date(firstDue + "T00:00:00");
              const nextDue = new Date(fd.getFullYear(), fd.getMonth() + paidCount, fd.getDate());
              const today = new Date(); today.setHours(0, 0, 0, 0);
              const isOverdue = l.status !== "paid" && paidCount < totalInst && nextDue < today;
              const displayStatus = isOverdue ? "overdue" : l.status;
              const isCollapsed = collapsed.has(l.id);
              const pct = total > 0 ? Math.min(100, (paid / total) * 100) : 0;
              return (
                <motion.div
                  key={l.id}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: Math.min(idx * 0.03, 0.3) }}
                  className="p-4 sm:p-5 transition-colors hover:bg-muted/30"
                >
                  <div className="flex items-start gap-3">
                    <button
                      type="button"
                      onClick={() => toggleCollapsed(l.id)}
                      className="mt-0.5 h-7 w-7 shrink-0 grid place-items-center rounded-md border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                      title={isCollapsed ? "Expandir" : "Recolher"}
                      aria-label={isCollapsed ? "Expandir" : "Recolher"}
                    >
                      {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </button>
                    <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap text-sm">
                          <span className="font-semibold">{l.borrower_name}</span>
                          <StatusBadge status={displayStatus} />
                          <Badge variant="outline" className="text-[10px]">{labelSource(l.funding_source)}</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Iniciado em {fmtDate(l.start_date)} · {paidCount}/{totalInst} parcelas pagas · 1ª parcela {fmtDate(l.due_date ?? firstDueDate(l.start_date))}
                        </div>
                        {isCollapsed && (
                          <div className="mt-2 h-1.5 max-w-[240px] bg-muted rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${pct}%` }} />
                          </div>
                        )}
                        {!isCollapsed && l.notes && <div className="text-xs text-muted-foreground mt-1 italic">{l.notes}</div>}
                      </div>
                      {!isCollapsed && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-6 text-right animate-in fade-in slide-in-from-top-1 duration-200">
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Investimento</div>
                            <div className="font-semibold">{brl(getCostBasis(l))}</div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Juros</div>
                            <div className="font-semibold text-emerald-500">{brl(total - getCostBasis(l))}</div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Restante</div>
                            <div className={`font-semibold ${rest > 0 ? "text-amber-500" : "text-emerald-500"}`}>{brl(rest)}</div>
                          </div>
                          <div>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Lucro</div>
                            <div className={`font-semibold ${realizedProfit > 0 ? "text-emerald-500" : "text-muted-foreground"}`}>
                              {brl(realizedProfit)}
                            </div>
                          </div>
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => setHistLoan(l)}><History className="h-4 w-4 mr-1" /> Parcelas</Button>
                        <Button size="sm" variant="outline" onClick={() => setEditLoan(l)}>Editar</Button>
                        {l.status !== "paid" && rest <= 0.01 && paidCount < totalInst && (
                          <Button size="sm" variant="secondary" onClick={() => markPaid(l)}>Quitar</Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => handleDelete(l.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>


      <NewLoanDialog open={openNew} onOpenChange={setOpenNew} onSaved={invalidate} />
      <SimulatorDialog open={openSim} onOpenChange={setOpenSim} />
      <PayDialog loan={payLoan} onOpenChange={(o) => !o && setPayLoan(null)} onSaved={invalidate} />
      <HistoryDialog loan={histLoan} payments={payments.filter(p => p.loan_id === histLoan?.id)} onOpenChange={(o) => !o && setHistLoan(null)} onChanged={invalidate} />
      <EditLoanDialog loan={editLoan} onOpenChange={(o) => !o && setEditLoan(null)} onSaved={invalidate} />
    </div>
  );
}

function labelType(t: string) {
  return t === "compound" ? "composto/mês" : t === "monthly_fixed" ? "fixo/mês" : "simples/mês";
}
function labelSource(s: string) {
  return s === "card" ? "Cartão" : s === "account" ? "Conta" : "Caixa";
}

function MonthlySummary({ payments, loans }: { payments: Payment[]; loans: Loan[] }) {
  const now = new Date();
  const [year, setYear] = useState<number>(now.getFullYear());
  const [openMonth, setOpenMonth] = useState<number | null>(null);
  const years = useMemo(() => {
    const s = new Set<number>();
    payments.forEach(p => s.add(new Date(p.paid_at + "T00:00:00").getFullYear()));
    loans.forEach(l => s.add(new Date(l.start_date + "T00:00:00").getFullYear()));
    s.add(now.getFullYear());
    return Array.from(s).sort((a, b) => b - a);
  }, [payments, loans]);

  const loanMap = useMemo(() => Object.fromEntries(loans.map(l => [l.id, l])), [loans]);

  const rows = useMemo(() => {
    const arr = MESES_LBL.map((m, idx) => ({ mes: m, idx, recebido: 0, lucro: 0, custo: 0, count: 0 }));
    payments.forEach(p => {
      const d = new Date(p.paid_at + "T00:00:00");
      if (d.getFullYear() !== year) return;
      const l = loanMap[p.loan_id];
      const idx = d.getMonth();
      const amt = Number(p.amount);
      arr[idx].recebido += amt;
      arr[idx].count += 1;
      if (l) {
        const inst = Math.max(1, Number(l.installments ?? 1));
        const installmentCost = l.funding_source === "card" ? Math.max(0, Number(l.card_cost) || 0) : (Number(l.cost_basis ?? l.principal) / inst);
        arr[idx].custo += installmentCost;
        arr[idx].lucro += Math.max(0, amt - installmentCost);
      }
    });
    return arr;
  }, [payments, year, loanMap]);

  const totalRecebido = rows.reduce((s, r) => s + r.recebido, 0);
  const totalLucro = rows.reduce((s, r) => s + r.lucro, 0);
  const totalCusto = rows.reduce((s, r) => s + r.custo, 0);
  const maxRecebido = Math.max(1, ...rows.map(r => r.recebido));
  const currentMonth = now.getFullYear() === year ? now.getMonth() : -1;

  const monthDetails = useMemo(() => {
    if (openMonth === null) return [];
    return payments
      .filter(p => {
        const d = new Date(p.paid_at + "T00:00:00");
        return d.getFullYear() === year && d.getMonth() === openMonth;
      })
      .map(p => {
        const l = loanMap[p.loan_id];
        const amt = Number(p.amount);
        const inst = Math.max(1, Number(l?.installments ?? 1));
        const custo = l ? (l.funding_source === "card" ? Math.max(0, Number(l.card_cost) || 0) : Number(l.cost_basis ?? l.principal) / inst) : 0;
        const lucro = Math.max(0, amt - custo);
        return { id: p.id, paid_at: p.paid_at, amount: amt, borrower: l?.borrower_name ?? "—", source: l?.funding_source, custo, lucro, notes: p.notes };
      })
      .sort((a, b) => a.paid_at.localeCompare(b.paid_at));
  }, [openMonth, payments, year, loanMap]);

  const detailRow = openMonth !== null ? rows[openMonth] : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }}
      className="tech-panel overflow-hidden"
      style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-elegant)" }}
    >
      <div className="p-4 sm:p-5 border-b border-border/60 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2"><Calendar className="h-5 w-5 text-primary" /> Resumo mensal</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Recebido: <strong className="text-blue-500 tabular-nums">{brl(totalRecebido)}</strong> · Custo: <strong className="text-amber-500 tabular-nums">{brl(totalCusto)}</strong> · Lucro: <strong className="text-emerald-500 tabular-nums">{brl(totalLucro)}</strong></p>
        </div>
        <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
          <SelectTrigger className="h-8 w-[110px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {years.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="p-4 sm:p-5">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {rows.map((r) => {
            const pct = Math.round((r.recebido / maxRecebido) * 100);
            const isCurrent = r.idx === currentMonth;
            const isPast = year < now.getFullYear() || (year === now.getFullYear() && r.idx < now.getMonth());
            const hasData = r.recebido > 0;
            return (
              <motion.button
                type="button"
                key={r.mes}
                onClick={() => hasData && setOpenMonth(r.idx)}
                disabled={!hasData}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.3, delay: r.idx * 0.02 }}
                whileHover={hasData ? { y: -2 } : undefined}
                className={`relative rounded-xl border p-3 transition-all overflow-hidden text-left ${
                  isCurrent
                    ? "border-primary/60 bg-primary/5 shadow-[0_0_0_1px_hsl(var(--primary)/0.3)]"
                    : hasData
                    ? "border-border/60 bg-card/40 hover:border-primary/40 hover:bg-primary/[0.04] cursor-pointer"
                    : "border-border/40 bg-muted/20 opacity-60 cursor-not-allowed"
                }`}
              >
                {isCurrent && (
                  <span className="absolute top-2 right-2 h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                )}
                <div className="flex items-center justify-between mb-2">
                  <span className={`text-xs font-semibold uppercase tracking-wide ${isCurrent ? "text-primary" : "text-muted-foreground"}`}>
                    {r.mes}
                  </span>
                  {r.count > 0 && (
                    <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-border/60">
                      {r.count}× parc
                    </Badge>
                  )}
                </div>
                <div className="space-y-0.5">
                  <div className={`text-base font-bold tabular-nums ${hasData ? "text-blue-500" : "text-muted-foreground/50"}`}>
                    {brl(r.recebido)}
                  </div>
                  {r.custo > 0 && (
                    <div className="text-[10px] tabular-nums text-amber-500">−{brl(r.custo)} custo</div>
                  )}
                  <div className={`text-[10px] tabular-nums ${r.lucro > 0 ? "text-emerald-500" : "text-muted-foreground/40"}`}>
                    {r.lucro > 0 ? `+${brl(r.lucro)} lucro` : isPast && !hasData ? "sem recebimentos" : "—"}
                  </div>
                </div>

                <div className="mt-2 h-1 bg-muted/60 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 0.6, ease: "easeOut", delay: r.idx * 0.02 }}
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-emerald-500"
                  />
                </div>
              </motion.button>
            );
          })}
        </div>
      </div>

      <Dialog open={openMonth !== null} onOpenChange={(o) => !o && setOpenMonth(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Histórico — {openMonth !== null ? MESES_LBL[openMonth] : ""}/{year}
            </DialogTitle>
          </DialogHeader>
          {detailRow && (
            <div className="grid grid-cols-3 gap-2 text-center text-xs mb-2">
              <div className="rounded-lg border border-border/60 p-2">
                <div className="text-muted-foreground">Recebido</div>
                <div className="text-blue-500 font-bold tabular-nums">{brl(detailRow.recebido)}</div>
              </div>
              <div className="rounded-lg border border-border/60 p-2">
                <div className="text-muted-foreground">Custo</div>
                <div className="text-amber-500 font-bold tabular-nums">{brl(detailRow.custo)}</div>
              </div>
              <div className="rounded-lg border border-border/60 p-2">
                <div className="text-muted-foreground">Lucro</div>
                <div className="text-emerald-500 font-bold tabular-nums">{brl(detailRow.lucro)}</div>
              </div>
            </div>
          )}
          <div className="max-h-[55vh] overflow-y-auto space-y-2">
            {monthDetails.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">Nenhum pagamento neste mês.</p>
            )}
            {monthDetails.map((d) => (
              <div key={d.id} className="rounded-lg border border-border/60 p-3 bg-card/40">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="font-semibold flex items-center gap-2">
                      {d.borrower}
                      {d.source === "card" && <Badge variant="outline" className="h-4 text-[9px] px-1.5"><CreditCard className="h-2.5 w-2.5 mr-0.5" />Cartão</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">{fmtDate(d.paid_at)}</div>
                    {d.notes && <div className="text-xs text-muted-foreground mt-1 italic">{d.notes}</div>}
                  </div>
                  <div className="text-right">
                    <div className="text-blue-500 font-bold tabular-nums">{brl(d.amount)}</div>
                    <div className="text-[10px] tabular-nums text-amber-500">−{brl(d.custo)} custo</div>
                    <div className="text-[10px] tabular-nums text-emerald-500">+{brl(d.lucro)} lucro</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}



function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: "Ativo", cls: "bg-emerald-500/15 text-emerald-500 border-emerald-500/30" },
    paid: { label: "Quitado", cls: "bg-blue-500/15 text-blue-500 border-blue-500/30" },
    overdue: { label: "Atrasado", cls: "bg-red-500/15 text-red-500 border-red-500/30" },
    cancelled: { label: "Cancelado", cls: "bg-muted text-muted-foreground border-border" },
  };
  const x = map[status] ?? map.active;
  return <Badge variant="outline" className={`text-[10px] ${x.cls}`}>{x.label}</Badge>;
}

function SimulatorDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const [valor, setValor] = useState(1000);
  const [parcelas, setParcelas] = useState(3);
  const [cliente, setCliente] = useState("");
  const [origem, setOrigem] = useState<"cash" | "account" | "card">("cash");

  const taxaBase = 0.10;
  const taxaParcela = 0.05;

  const base = valor * (1 + taxaBase);
  const acrescimoParcelas = base * taxaParcela * parcelas;
  const total = base + acrescimoParcelas;
  const valorParcela = parcelas > 0 ? total / parcelas : 0;
  const juros = total - valor;

  const linhas = [1, 2, 3, 4, 6, 10, 12];

  const baixarPDF = async () => {
    if (!cliente.trim()) { toast.error("Informe o nome do cliente"); return; }
    if (parcelas < 1) { toast.error("Informe o nº de parcelas"); return; }
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);



    const doc = new jsPDF();
    const hoje = new Date().toLocaleDateString("pt-BR");

    // Cabeçalho
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 28, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.text("Simulação de Parcelamento", 14, 13);
    doc.setFontSize(10);
    doc.text(`Emitido em ${hoje}`, 14, 21);

    doc.setTextColor(30, 30, 30);
    doc.setFontSize(12);
    doc.text(`Cliente: ${cliente}`, 14, 40);

    // Tabela: Parcelas, Total, Parcela
    const opcoes: Array<[string, string, string]> = [];
    for (let n = 1; n <= parcelas; n++) {
      const t = base * (1 + taxaParcela * n);
      opcoes.push([`${n}x`, brl(t), brl(t / n)]);
    }

    autoTable(doc, {
      startY: 50,
      head: [["Parcelas", "Total", "Parcela"]],
      body: opcoes,
      theme: "striped",
      headStyles: { fillColor: [15, 23, 42], textColor: 255 },
      styles: { fontSize: 11, halign: "center" },
      columnStyles: {
        0: { halign: "center", fontStyle: "bold" },
        1: { halign: "center" },
        2: { halign: "center" },
      },

    });


    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(9);
    doc.setTextColor(110, 110, 110);
    doc.text("Valores sujeitos a confirmação. Esta simulação não constitui oferta vinculante.", 14, finalY);

    doc.save(`simulacao-${cliente.replace(/\s+/g, "_")}.pdf`);
    toast.success("PDF gerado");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5 text-primary" /> Simulador de empréstimo
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="text-xs text-muted-foreground">
            Taxa fixa de <strong>10%</strong> sobre o valor + <strong>5%</strong> por parcela em cima do total com juros.
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Nome do cliente</Label>
              <Input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Ex: João Silva" />
            </div>
            <div>
              <Label className="text-xs">Origem do capital</Label>
              <Select value={origem} onValueChange={(v) => setOrigem(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Caixa</SelectItem>
                  <SelectItem value="account">Conta bancária</SelectItem>
                  <SelectItem value="card">Cartão de crédito</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Valor emprestado</Label>
              <Input type="number" value={valor} onChange={(e) => setValor(Number(e.target.value))} />
            </div>
            <div>
              <Label className="text-xs">Nº de parcelas</Label>
              <Input type="number" min={1} value={parcelas} onChange={(e) => setParcelas(Math.max(1, Number(e.target.value)))} />
            </div>
          </div>

          <div className="rounded-xl border border-border/60 p-4 grid grid-cols-2 gap-3 text-sm" style={{ background: "var(--gradient-card)" }}>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total a receber</div>
              <div className="font-semibold text-emerald-500 text-lg">{brl(total)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Valor da parcela</div>
              <div className="font-semibold text-lg">{brl(valorParcela)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Juros (lucro)</div>
              <div className="font-semibold text-amber-500">+{brl(juros)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Base com 10%</div>
              <div className="font-semibold">{brl(base)}</div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground text-xs border-b border-border/60">
                  <th className="py-2 pr-3">Parcelas</th>
                  <th className="py-2 pr-3">Total</th>
                  <th className="py-2 pr-3">Parcela</th>
                  <th className="py-2 pr-3">Juros</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map(n => {
                  const t = base * (1 + taxaParcela * n);
                  return (
                    <tr key={n} className="border-b border-border/40">
                      <td className="py-2 pr-3 font-medium">{n}x</td>
                      <td className="py-2 pr-3">{brl(t)}</td>
                      <td className="py-2 pr-3">{brl(t / n)}</td>
                      <td className="py-2 pr-3 text-amber-500">+{brl(t - valor)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          <Button onClick={baixarPDF} className="gap-2"><HandCoins className="h-4 w-4" /> Baixar PDF</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}



function NewLoanDialog({ open, onOpenChange, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    borrower_name: "", principal: "", fixed_rate: "10", interest_rate: "5", interest_type: "monthly_fixed",
    installments: "1",
    start_date: today, due_date: firstDueDate(today), funding_source: "cash",
    card_cost: "0", potential_gain: "0", notes: "",
  });
  const submit = async () => {
    if (!form.borrower_name || !form.principal) return toast.error("Preencha nome e valor");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return toast.error("Sessão expirada");
    const due = form.due_date || firstDueDate(form.start_date);
    const { error } = await supabase.from("emprestimos").insert({
      user_id: u.user.id,
      borrower_name: form.borrower_name,
      principal: Number(form.principal),
      fixed_rate: Number(form.fixed_rate) || 0,
      interest_rate: Number(form.interest_rate),
      installments: Math.max(1, Number(form.installments) || 1),
      interest_type: form.interest_type,
      start_date: form.start_date,
      due_date: due,
      funding_source: form.funding_source,
      card_cost: Number(form.card_cost) || 0,
      potential_gain: Number(form.potential_gain) || 0,
      notes: form.notes || null,
    });
    if (error) toast.error(error.message);
    else { toast.success("Empréstimo registrado"); onOpenChange(false); onSaved();
      setForm({ ...form, borrower_name: "", principal: "", card_cost: "0", potential_gain: "0", notes: "" });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Novo empréstimo</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Pessoa</Label>
            <Input value={form.borrower_name} onChange={(e) => setForm({ ...form, borrower_name: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Valor emprestado</Label>
              <Input type="number" step="0.01" value={form.principal} onChange={(e) => setForm({ ...form, principal: e.target.value })} />
            </div>
            <div>
              <Label>Taxa fixa (%)</Label>
              <Input type="number" step="0.1" value={form.fixed_rate} onChange={(e) => setForm({ ...form, fixed_rate: e.target.value })} />
            </div>
            <div>
              <Label>Taxa mensal (%)</Label>
              <Input type="number" step="0.1" value={form.interest_rate} onChange={(e) => setForm({ ...form, interest_rate: e.target.value })} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground -mt-1">A taxa mensal incide sobre o valor já acrescido da taxa fixa.</p>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Tipo de juros</Label>
              <Select value={form.interest_type} onValueChange={(v) => setForm({ ...form, interest_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly_fixed">Fixo mensal</SelectItem>
                  <SelectItem value="simple">Simples</SelectItem>
                  <SelectItem value="compound">Composto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Origem do capital</Label>
              <Select value={form.funding_source} onValueChange={(v) => setForm({ ...form, funding_source: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Caixa</SelectItem>
                  <SelectItem value="account">Conta bancária</SelectItem>
                  <SelectItem value="card">Cartão de crédito</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Data início (recebeu)</Label>
              <DatePicker
                value={form.start_date}
                onChange={(v) => setForm(f => ({ ...f, start_date: v, due_date: firstDueDate(v) }))}
              />
            </div>
            <div>
              <Label>Vencimento 1ª parcela</Label>
              <DatePicker value={form.due_date} onChange={(v) => setForm({ ...form, due_date: v })} />
            </div>
            <div>
              <Label>Nº de parcelas</Label>
              <Input type="number" min={1} value={form.installments} onChange={(e) => setForm({ ...form, installments: e.target.value })} />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground -mt-1">
            As parcelas seguintes vencem no mesmo dia dos meses subsequentes. A taxa mensal de {form.interest_rate}% incide por parcela sobre o valor com taxa fixa.
          </p>
          {form.funding_source === "card" && (
            <div>
              <Label>Parcela do cartão (R$)</Label>
              <Input type="number" step="0.01" value={form.card_cost} onChange={(e) => setForm({ ...form, card_cost: e.target.value })} />
              <p className="text-[11px] text-muted-foreground mt-1">Potencial perdido é calculado automaticamente (total cobrado − custo do cartão).</p>
            </div>
          )}
          <div>
            <Label>Observações</Label>
            <Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PayDialog({ loan, onOpenChange, onSaved }: { loan: Loan | null; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  if (!loan) return null;
  const submit = async () => {
    if (!amount) return toast.error("Informe o valor");
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return toast.error("Sessão expirada");
    const { error } = await supabase.from("emprestimo_pagamentos").insert({
      loan_id: loan.id, user_id: u.user.id, amount: Number(amount), paid_at: date, notes: notes || null,
    });
    if (error) toast.error(error.message);
    else { toast.success("Pagamento registrado"); onOpenChange(false); onSaved(); setAmount(""); setNotes(""); }
  };
  return (
    <Dialog open={!!loan} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Receber de {loan.borrower_name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Valor recebido</Label><Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus /></div>
          <div><Label>Data</Label><DatePicker value={date} onChange={(v) => setDate(v)} /></div>
          <div><Label>Observação</Label><Input value={notes} onChange={(e) => setNotes(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit}>Confirmar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function HistoryDialog({ loan, payments, onOpenChange, onChanged }: { loan: Loan | null; payments: Payment[]; onOpenChange: (o: boolean) => void; onChanged: () => void }) {
  if (!loan) return null;
  const parcelas = Math.max(1, Number(loan.installments ?? 1));
  const total = computeTotal(loan);
  const valorParcela = total / parcelas;
  const firstDue = loan.due_date ?? firstDueDate(loan.start_date);
  const fd = new Date(firstDue + "T00:00:00");

  const schedule = Array.from({ length: parcelas }, (_, i) => {
    const d = new Date(fd.getFullYear(), fd.getMonth() + i, fd.getDate());
    const tag = `Parcela ${i + 1}/${parcelas}`;
    const pago = payments.find(p => (p.notes ?? "").startsWith(tag));
    return { n: i + 1, due: d.toISOString().slice(0, 10), tag, pago };
  });

  const togglePaid = async (n: number, tag: string, pagoId?: string) => {
    const willBePaid = !pagoId;
    if (pagoId) {
      const { error } = await supabase.from("emprestimo_pagamentos").delete().eq("id", pagoId);
      if (error) return toast.error(error.message);
    } else {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return toast.error("Sessão expirada");
      const { error } = await supabase.from("emprestimo_pagamentos").insert({
        loan_id: loan.id, user_id: u.user.id, amount: valorParcela,
        paid_at: new Date().toISOString().slice(0, 10), notes: tag,
      });
      if (error) return toast.error(error.message);
    }
    const pagasDepois = schedule.filter(s => s.pago).length + (willBePaid ? 1 : -1);
    const novoStatus = pagasDepois >= parcelas ? "paid" : "active";
    if (novoStatus !== loan.status) {
      await supabase.from("emprestimos").update({ status: novoStatus }).eq("id", loan.id);
    }
    toast.success(willBePaid ? `Parcela ${n} paga` : `Parcela ${n} desmarcada`);
    onChanged();
  };

  const pagasCount = schedule.filter(s => s.pago).length;

  return (
    <Dialog open={!!loan} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Parcelas — {loan.borrower_name}</DialogTitle>
        </DialogHeader>
        <div className="text-xs text-muted-foreground -mt-2 mb-2">
          {pagasCount}/{parcelas} pagas · Total {brl(total)} · Parcela {brl(valorParcela)}
        </div>
        <div className="max-h-96 overflow-y-auto space-y-2">
          {schedule.map(s => (
            <label key={s.n} className={`flex items-center justify-between rounded-lg border p-3 cursor-pointer transition ${s.pago ? "border-emerald-500/40 bg-emerald-500/5" : "border-border/60 hover:bg-muted/40"}`}>
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={!!s.pago}
                  onChange={() => togglePaid(s.n, s.tag, s.pago?.id)}
                  className="h-4 w-4 accent-emerald-500"
                />
                <div>
                  <div className="text-sm font-medium">Parcela {s.n}/{parcelas}</div>
                  <div className="text-xs text-muted-foreground">
                    Vence {fmtDate(s.due)}{s.pago ? ` · Pago em ${fmtDate(s.pago.paid_at)}` : ""}
                  </div>
                </div>
              </div>
              <div className={`text-sm font-semibold ${s.pago ? "text-emerald-500" : ""}`}>{brl(valorParcela)}</div>
            </label>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditLoanDialog({ loan, onOpenChange, onSaved }: { loan: Loan | null; onOpenChange: (o: boolean) => void; onSaved: () => void }) {
  const [dueDate, setDueDate] = useState("");
  const [startDate, setStartDate] = useState("");
  const [costBasis, setCostBasis] = useState("");
  const [installments, setInstallments] = useState("");

  useEffect(() => {
    if (loan) {
      setDueDate(loan.due_date ?? firstDueDate(loan.start_date));
      setStartDate(loan.start_date);
      setCostBasis(loan.cost_basis == null ? "" : String(loan.cost_basis));
      setInstallments(String(loan.installments ?? 1));
    }
  }, [loan?.id]);

  if (!loan) return null;

  const submit = async () => {
    const payload = {
      due_date: dueDate || firstDueDate(startDate),
      start_date: startDate,
      installments: Math.max(1, Number(installments) || 1),
      cost_basis: costBasis.trim() === "" ? null : Number(costBasis),
    };
    const { error } = await supabase.from("emprestimos").update(payload).eq("id", loan.id);
    if (error) return toast.error(error.message);
    toast.success("Empréstimo atualizado");
    onOpenChange(false);
    onSaved();
  };

  return (
    <Dialog open={!!loan} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>Editar {loan.borrower_name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Data início (recebeu)</Label>
            <DatePicker value={startDate} onChange={(v) => setStartDate(v)} />
          </div>
          <div>
            <Label>Vencimento 1ª parcela</Label>
            <DatePicker value={dueDate} onChange={(v) => setDueDate(v)} />
            <p className="text-[11px] text-muted-foreground mt-1">As parcelas seguintes vencem no mesmo dia dos meses subsequentes.</p>
          </div>
          <div>
            <Label>Nº de parcelas</Label>
            <Input type="number" min={1} value={installments} onChange={(e) => setInstallments(e.target.value)} />
          </div>
          <div>
            <Label>Custo real do capital (R$)</Label>
            <Input type="number" step="0.01" placeholder={String(loan.principal)} value={costBasis} onChange={(e) => setCostBasis(e.target.value)} />
            <p className="text-[11px] text-muted-foreground mt-1">Deixe vazio para usar o valor emprestado. Use <strong>0</strong> se o empréstimo for 100% lucro (sem custo para você).</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit}>Salvar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type KpiKey = "totalEmprestado" | "lucro" | "potencialPerdido" | "recebido" | "investAtivo" | "investCartao" | "aReceber" | "ativos";

const KPI_META: Record<KpiKey, { title: string; tone: string; desc: string }> = {
  totalEmprestado: { title: "Total emprestado", tone: "text-violet-500", desc: "Capital emprestado (exclui empréstimos 100% lucro)" },
  lucro: { title: "Lucro realizado", tone: "text-emerald-500", desc: "Lucro já recebido por empréstimo" },
  potencialPerdido: { title: "Potencial perdido", tone: "text-amber-500", desc: "Custo extra do cartão por empréstimo" },
  recebido: { title: "Total recebido", tone: "text-blue-500", desc: "Valor total já pago pelos devedores" },
  investAtivo: { title: "Investimento em aberto", tone: "text-primary", desc: "Capital ainda em jogo (ativos/atrasados)" },
  investCartao: { title: "Investimento do cartão em aberto", tone: "text-red-500", desc: "Parcelas do cartão ainda não quitadas" },
  aReceber: { title: "A receber (com juros)", tone: "text-emerald-500", desc: "Saldo restante em ativos/atrasados" },
  ativos: { title: "Empréstimos ativos", tone: "text-primary", desc: "Empréstimos em andamento ou atrasados" },
};

function KpiDetailDialog({
  openKpi, onClose, loans, paidMap, paidCountMap,
}: {
  openKpi: string | null;
  onClose: () => void;
  loans: Loan[];
  paidMap: Map<string, number>;
  paidCountMap: Map<string, number>;
}) {
  const key = openKpi as KpiKey | null;
  const meta = key ? KPI_META[key] : null;

  const rows = useMemo(() => {
    if (!key) return [];
    const items = loans.map(l => {
      const paid = paidMap.get(l.id) ?? 0;
      const paidCount = paidCountMap.get(l.id) ?? 0;
      const total = computeTotal(l);
      const inst = getInstallments(l);
      const isActive = l.status === "active" || l.status === "overdue";
      let value = 0;
      let extra = "";
      switch (key) {
        case "totalEmprestado":
          value = getCostBasis(l) > 0 ? Number(l.principal) : 0;
          extra = `${inst}x`;
          break;
        case "lucro":
          value = computeRealizedProfit(l, paid, paidCount);
          extra = `${paidCount}/${inst} parc pagas`;
          break;
        case "potencialPerdido":
          value = computePotentialLost(l);
          extra = l.funding_source === "card" ? "cartão" : "próprio";
          break;
        case "recebido":
          value = paid;
          extra = `${paidCount}/${inst} parc pagas`;
          break;
        case "investAtivo":
          value = isActive
            ? (l.funding_source === "card" ? computeCardOpenInvestment(l, paidCount) : Math.max(0, getCostBasis(l) - paid))
            : 0;
          extra = l.status;
          break;
        case "investCartao":
          value = l.funding_source === "card" ? computeCardOpenInvestment(l, paidCount) : 0;
          extra = `${paidCount}/${inst} parc pagas`;
          break;
        case "aReceber":
          value = isActive ? Math.max(0, total - paid) : 0;
          extra = l.status;
          break;
        case "ativos":
          value = isActive ? 1 : 0;
          extra = l.status;
          break;
      }
      return { l, value, extra };
    })
    .filter(r => r.value > 0)
    .sort((a, b) => b.value - a.value);
    return items;
  }, [key, loans, paidMap, paidCountMap]);

  const total = rows.reduce((s, r) => s + r.value, 0);
  const isCount = key === "ativos";

  return (
    <Dialog open={!!openKpi} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className={`flex items-center gap-2 ${meta?.tone}`}>
            {meta?.title}
          </DialogTitle>
          {meta?.desc && <p className="text-xs text-muted-foreground">{meta.desc}</p>}
        </DialogHeader>
        <div className="rounded-lg border border-border/60 p-3 bg-card/40 flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">Total</span>
          <span className={`text-xl font-bold tabular-nums ${meta?.tone}`}>
            {isCount ? String(rows.length) : brl(total)}
          </span>
        </div>
        <div className="max-h-[55vh] overflow-y-auto space-y-2">
          {rows.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum empréstimo contribui para este KPI.</p>
          )}
          {rows.map(({ l, value, extra }) => (
            <div key={l.id} className="rounded-lg border border-border/60 p-3 bg-card/40">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <div className="font-semibold flex items-center gap-2">
                    {l.borrower_name}
                    {l.funding_source === "card" && <Badge variant="outline" className="h-4 text-[9px] px-1.5"><CreditCard className="h-2.5 w-2.5 mr-0.5" />Cartão</Badge>}
                    <StatusBadge status={l.status} />
                  </div>
                  <div className="text-xs text-muted-foreground">Início {fmtDate(l.start_date)} · {extra}</div>
                </div>
                <div className="text-right">
                  <div className={`font-bold tabular-nums ${meta?.tone}`}>
                    {isCount ? "1" : brl(value)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

