import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMilhasData } from "@/context/MilhasDataContext";
import { brlM, numM } from "@/lib/milhas-storage";
import { BankIcon } from "@/components/BankIcon";
import { brandColor } from "@/lib/banks";
import {
  Area, AreaChart, CartesianGrid, Legend,
  RadialBar, RadialBarChart, PolarAngleAxis,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { Coins, TrendingUp, ArrowRightLeft, Wallet, Plane, SlidersHorizontal, X, Trophy } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { SOURCE_LABEL, type EarningSource } from "@/lib/milhas-storage";
import { MilhasNotificationBell } from "@/components/MilhasNotificationBell";

const formatMonth = (key: string) => { const [y, m] = key.split("-"); return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }); };

export const Route = createFileRoute("/milhas/")({
  component: MilhasDashboard,
  head: () => ({ meta: [{ title: "Dashboard — CRM Milhas" }] }),
});

function StatCard({ icon: Icon, label, value, hint }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; hint?: string }) {
  return (
    <div className="bg-card border border-border p-6 relative overflow-hidden rounded-xl">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs tracking-[0.15em] uppercase text-muted-foreground mb-2">{label}</p>
          <p className="font-[var(--font-display)] text-3xl text-foreground">{value}</p>
          {hint && <p className="text-xs text-muted-foreground mt-2">{hint}</p>}
        </div>
        <div className="w-10 h-10 rounded-full bg-gold/10 flex items-center justify-center">
          <Icon className="w-5 h-5 text-gold" />
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gold" />
    </div>
  );
}

function MilhasDashboard() {
  const { programs, earnings, transfers, redemptions } = useMilhasData();



  const availableYears = useMemo(() => {
    const set = new Set<number>();
    earnings.forEach((e) => set.add(Number(e.month.slice(0, 4))));
    set.add(new Date().getFullYear());
    return Array.from(set).sort((a, b) => b - a);
  }, [earnings]);

  const ss = (k: string, fb: string) => (typeof window === "undefined" ? fb : window.sessionStorage.getItem(k) ?? fb);
  const ssSet = (k: string, v: string) => { if (typeof window !== "undefined") window.sessionStorage.setItem(k, v); };

  const [year, _setYear] = useState<number>(() => {
    const saved = Number(ss("milhas.dash.year", ""));
    return Number.isFinite(saved) && saved > 0 ? saved : (availableYears[0] ?? new Date().getFullYear());
  });
  const setYear = (v: number) => { _setYear(v); ssSet("milhas.dash.year", String(v)); };
  const now = new Date();
  const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [monthFilter, _setMonthFilter] = useState<string>(() => ss("milhas.dash.monthFilter", currentMonthKey));
  const setMonthFilter = (v: string) => { _setMonthFilter(v); ssSet("milhas.dash.monthFilter", v); };
  const [programFilter, _setProgramFilter] = useState<string>(() => ss("milhas.dash.programFilter", "all"));
  const setProgramFilter = (v: string) => { _setProgramFilter(v); ssSet("milhas.dash.programFilter", v); };
  const [showFilters, setShowFilters] = useState<boolean>(false);

  const filteredEarnings = useMemo(
    () => earnings.filter((e) => programFilter === "all" || e.programId === programFilter),
    [earnings, programFilter]
  );

  const filteredPrograms = programs.filter((p) => programFilter === "all" || p.id === programFilter);
  const totalPoints = filteredPrograms.reduce((s, p) => s + p.balance, 0);
  const totalCash = filteredPrograms.reduce((s, p) => s + (p.balance / 1000) * p.valuePerThousand, 0);

  const monthPoints = filteredEarnings
    .filter((e) => (monthFilter === "all" ? e.month.startsWith(String(year)) : e.month === monthFilter))
    .reduce((s, e) => s + e.points, 0);
  const totalTransferValue = transfers.filter((t) => programFilter === "all" || t.fromProgramId === programFilter).reduce((s, t) => s + t.cashValue, 0);
  const viagensCount = redemptions.filter((r) => r.type === "viagem" && (programFilter === "all" || r.programId === programFilter)).length;

  // Custo total investido para gerar milhas (soma dos custos declarados nos ganhos)
  const totalMilesCost = filteredEarnings.reduce((s, e) => s + (e.cost ?? 0), 0);
  // Patrimônio líquido = valor em R$ do saldo atual - custo investido
  const netPatrimony = totalCash - totalMilesCost;
  // Economia acumulada com resgates (preço em dinheiro - custo real da emissão)
  const filteredRedemptions = redemptions.filter((r) => programFilter === "all" || r.programId === programFilter);
  const totalEconomy = filteredRedemptions.reduce(
    (s, r) => s + ((r.cashEquivalent ?? 0) - ((r.milesCost ?? 0) + (r.taxes ?? 0))),
    0
  );
  const totalTravelSpent = filteredRedemptions
    .filter((r) => r.type === "viagem")
    .reduce((s, r) => s + ((r.milesCost ?? 0) + (r.taxes ?? 0)), 0);

  const monthOptions = useMemo(() => {
    const monthsPt = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    return [
      { key: "all", label: `Ano todo (${year})` },
      ...monthsPt.map((label, idx) => ({
        key: `${year}-${String(idx + 1).padStart(2, "0")}`,
        label: `${label}/${String(year).slice(2)}`,
      })),
    ];
  }, [year]);



  const yearData = useMemo(() => {
    const monthsPt = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
    return monthsPt.map((label, idx) => {
      const key = `${year}-${String(idx + 1).padStart(2, "0")}`;
      const y = filteredEarnings.filter((e) => e.month === key);
      return {
        month: label,
        cartao: y.filter((e) => e.source === "cartao").reduce((s, e) => s + e.points, 0),
        bonificadas: y.filter((e) => e.source === "bonificadas").reduce((s, e) => s + e.points, 0),
        clube: y.filter((e) => e.source === "clube").reduce((s, e) => s + e.points, 0),
      };
    });
  }, [filteredEarnings, year]);

  const yearTotals = useMemo(() => {
    const cartao = yearData.reduce((s, m) => s + m.cartao, 0);
    const bonificadas = yearData.reduce((s, m) => s + m.bonificadas, 0);
    const clube = yearData.reduce((s, m) => s + m.clube, 0);
    return { cartao, bonificadas, clube, total: cartao + bonificadas + clube };
  }, [yearData]);

  const [detailsProgramId, setDetailsProgramId] = useState<string | null>(null);
  const programStats = useMemo(() => {
    return programs.map((p) => {
      const list = earnings.filter((e) => e.programId === p.id && !(e.note ?? "").includes("[PENDING]"));
      const totalPoints = p.balance;
      const totalCost = list.reduce((s, e) => s + (e.cost ?? 0), 0);
      const bySource: Record<string, { points: number; cost: number; count: number }> = {};
      list.forEach((e) => {
        bySource[e.source] = bySource[e.source] ?? { points: 0, cost: 0, count: 0 };
        bySource[e.source].points += e.points;
        bySource[e.source].cost += e.cost ?? 0;
        bySource[e.source].count += 1;
      });
      const cashValue = (totalPoints / 1000) * p.valuePerThousand;
      const creditedPoints = list.reduce((s, e) => s + e.points, 0);
      const avgPer1k = creditedPoints > 0 && totalCost > 0 ? (totalCost / creditedPoints) * 1000 : 0;
      return { program: p, totalPoints, totalCost, bySource, cashValue, avgPer1k, count: list.length };
    });
  }, [earnings, programs]);
  const detailsProgram = detailsProgramId ? programStats.find((s) => s.program.id === detailsProgramId) : null;
  const detailsEarnings = detailsProgramId ? earnings.filter((e) => e.programId === detailsProgramId && !(e.note ?? "").includes("[PENDING]")).sort((a, b) => b.month.localeCompare(a.month)) : [];

  // Clubes concluídos nos últimos 3 dias (aparecem no dia da conclusão + 3 dias)
  const completedClubs = useMemo(() => {
    const bySeries = new Map<string, typeof earnings>();
    for (const e of earnings) {
      if (e.source !== "clube") continue;
      const sid = (e.note ?? "").match(/\[SERIE:([^\]]+)\]/)?.[1];
      if (!sid) continue;
      if (!bySeries.has(sid)) bySeries.set(sid, []);
      bySeries.get(sid)!.push(e);
    }
    const now = Date.now();
    const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
    const out: { sid: string; programName: string; totalPoints: number; totalCost: number; installments: number; lastMonth: string; completedAt: number }[] = [];
    for (const [sid, list] of bySeries) {
      const hasPending = list.some((e) => (e.note ?? "").includes("[PENDING]"));
      if (hasPending) continue;
      let maxM = 0;
      for (const e of list) {
        const m = (e.note ?? "").match(/Parcela\s+(\d+)\s*\/\s*(\d+)/);
        if (m) maxM = Math.max(maxM, Number(m[2]));
      }
      const installments = Math.max(maxM, list.length);
      if (installments < 2) continue;
      if (list.length < installments) continue;
      const completedAt = list.reduce((max, e) => {
        const t = e.createdAt ? new Date(e.createdAt).getTime() : 0;
        return t > max ? t : max;
      }, 0);
      if (!completedAt || now - completedAt > THREE_DAYS) continue;
      const program = programs.find((p) => p.id === list[0].programId);
      const totalPoints = list.reduce((s, e) => s + e.points, 0);
      const totalCost = list.reduce((s, e) => s + (e.cost ?? 0), 0);
      const lastMonth = list.map((e) => e.month).sort().at(-1) ?? "";
      out.push({ sid, programName: program?.name ?? "Programa", totalPoints, totalCost, installments, lastMonth, completedAt });
    }
    return out.sort((a, b) => b.completedAt - a.completedAt);
  }, [earnings, programs]);

  // Parcelas de clube creditadas nas últimas 24h (some no dia seguinte)
  const recentCredits = useMemo(() => {
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;
    const completedSids = new Set(completedClubs.map((c) => c.sid));
    return earnings
      .filter((e) => e.source === "clube" && !(e.note ?? "").includes("[PENDING]"))
      .map((e) => {
        const sid = (e.note ?? "").match(/\[SERIE:([^\]]+)\]/)?.[1] ?? "";
        const parc = (e.note ?? "").match(/Parcela\s+(\d+)\s*\/\s*(\d+)/);
        const t = e.createdAt ? new Date(e.createdAt).getTime() : 0;
        return { e, sid, parc, t };
      })
      .filter((x) => x.t > 0 && now - x.t <= ONE_DAY && !completedSids.has(x.sid))
      .map((x) => {
        const program = programs.find((p) => p.id === x.e.programId);
        return {
          id: x.e.id,
          programName: program?.name ?? "Programa",
          points: x.e.points,
          parcelaLabel: x.parc ? `Parcela ${x.parc[1]}/${x.parc[2]}` : "Parcela creditada",
          t: x.t,
        };
      })
      .sort((a, b) => b.t - a.t);
  }, [earnings, programs, completedClubs]);



  return (
    <div className="space-y-6">
      {/* Header + filtros integrados */}
      <div className="relative bg-gradient-to-br from-card via-card to-card/40 border border-border rounded-2xl p-5 overflow-hidden">
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, var(--foreground) 1px, transparent 0)", backgroundSize: "22px 22px" }} />
        <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
              <span className="text-[10px] uppercase tracking-[0.22em] text-gold">Dashboard · CRM Milhas</span>
            </div>
            <h2 className="font-[var(--font-display)] text-2xl md:text-3xl leading-tight">
              Visão consolidada <span className="text-gold">{year}</span>
            </h2>
            <p className="text-xs text-muted-foreground mt-1">
              {programs.length} programas • {numM(totalPoints)} pts acumulados • {brlM(totalCash)} em patrimônio
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <MilhasNotificationBell credits={recentCredits} />
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`inline-flex items-center gap-2 text-xs uppercase tracking-wider rounded-lg px-3 py-2 border transition-colors ${showFilters ? "border-gold/60 bg-gold/10 text-gold" : "border-border text-muted-foreground hover:text-foreground hover:border-gold/40"}`}
            >
              {showFilters ? <X className="w-3.5 h-3.5" /> : <SlidersHorizontal className="w-3.5 h-3.5" />}
              {showFilters ? "Ocultar" : "Filtros"}
              {(programFilter !== "all" || monthFilter !== "all") && !showFilters && (
                <span className="ml-1 w-1.5 h-1.5 rounded-full bg-gold" />
              )}
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="relative mt-5 pt-5 border-t border-border/60 flex flex-wrap items-center gap-x-6 gap-y-3">
            {(() => {
              const activeCls = "border-gold/60 bg-gold/10 text-gold";
              const inactiveCls = "border-border text-muted-foreground hover:text-foreground hover:border-gold/40";
              const baseSel = "bg-card border rounded-lg px-3 py-1.5 text-sm transition-colors appearance-none focus:outline-none focus:ring-1 focus:ring-gold/40 [&>option]:bg-card [&>option]:text-foreground";
              const chipBase = "px-3 py-1.5 text-xs rounded-lg border transition-colors inline-flex items-center gap-1.5";
              return (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Ano</span>
                    <select value={year} onChange={(e) => setYear(Number(e.target.value))} className={`${baseSel} ${activeCls}`}>
                      {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Mês</span>
                    <select value={monthFilter} onChange={(e) => setMonthFilter(e.target.value)} className={`${baseSel} ${monthFilter !== "all" ? activeCls : "border-border text-foreground"}`}>
                      {monthOptions.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                    </select>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Programa</span>
                    <button onClick={() => setProgramFilter("all")} className={`${chipBase} ${programFilter === "all" ? activeCls : inactiveCls}`}>Todos</button>
                    {programs.map((p) => (
                      <button key={p.id} onClick={() => setProgramFilter(p.id)} className={`${chipBase} ${programFilter === p.id ? activeCls : inactiveCls}`}>
                        <BankIcon bank={p.name} size={14} square />{p.name}
                      </button>
                    ))}
                  </div>
                </>
              );
            })()}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Wallet} label="Patrimônio Bruto" value={brlM(totalCash)} hint="Saldo atual em R$" />
        <StatCard icon={Coins} label="Custo Investido" value={brlM(totalMilesCost)} hint="Custo p/ gerar milhas" />
        <StatCard icon={TrendingUp} label="Patrimônio Líquido" value={brlM(netPatrimony)} hint="Bruto − custo" />
        <StatCard icon={Plane} label="Economia c/ Milhas" value={brlM(totalEconomy)} hint={`${viagensCount} viagens • gasto ${brlM(totalTravelSpent)}`} />
        <StatCard icon={Coins} label="Pontos & Milhas" value={numM(totalPoints)} hint={`${programs.length} programas ativos`} />
        <StatCard icon={TrendingUp} label={monthFilter === "all" ? `Ano ${year}` : (monthOptions.find((m) => m.key === monthFilter)?.label ?? "")} value={numM(monthPoints)} hint="Pontos acumulados" />
        <StatCard icon={Plane} label="Viagens Realizadas" value={String(viagensCount)} hint="Resgates em viagem" />
      </div>


      {completedClubs.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="w-4 h-4 text-gold" />
            <h3 className="font-[var(--font-display)] text-lg">Clubes concluídos</h3>
            <span className="text-xs text-muted-foreground">{completedClubs.length} série{completedClubs.length === 1 ? "" : "s"} • últimos 3 dias</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {completedClubs.map((c) => (
              <div key={c.sid} className="relative border border-gold/40 bg-gradient-to-br from-gold/10 to-transparent rounded-xl p-4 overflow-hidden">
                <div className="absolute top-0 right-0 text-[10px] uppercase tracking-wider bg-gold text-navy px-2 py-0.5 rounded-bl-lg font-semibold">Concluído</div>
                <div className="flex items-center gap-2 mb-2">
                  <BankIcon bank={c.programName} size={22} square />
                  <p className="font-medium text-sm">{c.programName}</p>
                </div>
                <p className="text-xs text-muted-foreground">{c.installments}× parcelas • encerrado em {formatMonth(c.lastMonth)}</p>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-[var(--font-display)] tabular-nums">{numM(c.totalPoints)}</span>
                  <span className="text-xs text-muted-foreground">pts • custo {brlM(c.totalCost)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}






      {monthFilter === "all" ? (
        <div className="relative bg-gradient-to-br from-card via-card to-card/40 border border-border p-6 rounded-2xl overflow-hidden">
          <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, var(--foreground) 1px, transparent 0)", backgroundSize: "24px 24px" }} />
          <div className="relative flex items-start justify-between flex-wrap gap-3 mb-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
                <span className="text-[10px] uppercase tracking-[0.2em] text-gold">Live · Ano {year}</span>
              </div>
              <h3 className="font-[var(--font-display)] text-xl">Fluxo de acúmulo</h3>
              <p className="text-xs text-muted-foreground">Pontos gerados por mês, por origem</p>
            </div>
            <div className="flex gap-4 text-xs">
              <div><p className="uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: "#D4B876" }} />Cartão</p><p className="text-lg tabular-nums">{numM(yearTotals.cartao)}</p></div>
              <div><p className="uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: "#4FD1C5" }} />Bonificadas</p><p className="text-lg tabular-nums">{numM(yearTotals.bonificadas)}</p></div>
              <div><p className="uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><span className="w-2 h-2 rounded-full" style={{ background: "#A78BFA" }} />Clube</p><p className="text-lg tabular-nums">{numM(yearTotals.clube)}</p></div>
              <div className="pl-4 border-l border-border"><p className="uppercase tracking-wider text-gold">Total</p><p className="text-lg tabular-nums text-gold">{numM(yearTotals.total)}</p></div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={yearData} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gCartao" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#D4B876" stopOpacity={0.85} /><stop offset="100%" stopColor="#D4B876" stopOpacity={0.05} /></linearGradient>
                <linearGradient id="gBonif" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4FD1C5" stopOpacity={0.9} /><stop offset="100%" stopColor="#4FD1C5" stopOpacity={0.05} /></linearGradient>
                <linearGradient id="gClube" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#A78BFA" stopOpacity={0.85} /><stop offset="100%" stopColor="#A78BFA" stopOpacity={0.05} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 6" stroke="var(--foreground)" strokeOpacity={0.12} vertical={false} />
              <XAxis dataKey="month" stroke="var(--foreground)" tick={{ fill: "var(--muted-foreground)" }} fontSize={11} axisLine={false} tickLine={false} />
              <YAxis stroke="var(--foreground)" tick={{ fill: "var(--muted-foreground)" }} fontSize={11} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "#0F1B2E", border: "1px solid #C9A961", borderRadius: 12, color: "#F5F0E0", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }} itemStyle={{ color: "#F5F0E0" }} labelStyle={{ color: "#C9A961", fontWeight: 600 }} cursor={{ stroke: "#C9A961", strokeWidth: 1, strokeDasharray: "4 4" }} formatter={(v: number) => numM(v)} />
              <Legend wrapperStyle={{ color: "var(--foreground)", fontSize: 11, paddingTop: 8 }} iconType="circle" />
              <Area type="monotone" dataKey="cartao" name="Cartão" stroke="#D4B876" strokeWidth={2.2} fill="url(#gCartao)" activeDot={{ r: 4 }} />
              <Area type="monotone" dataKey="bonificadas" name="Bonificadas" stroke="#4FD1C5" strokeWidth={2.2} fill="url(#gBonif)" activeDot={{ r: 4 }} />
              <Area type="monotone" dataKey="clube" name="Clube" stroke="#A78BFA" strokeWidth={2.2} fill="url(#gClube)" activeDot={{ r: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      ) : (
        (() => {
          const m = yearData.find((d) => `${year}-${String(["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"].indexOf(d.month) + 1).padStart(2, "0")}` === monthFilter);
          const monthTotal = (m?.cartao ?? 0) + (m?.bonificadas ?? 0) + (m?.clube ?? 0);
          const radial = [
            { name: "Clube", value: m?.clube ?? 0, fill: "#A78BFA" },
            { name: "Bonificadas", value: m?.bonificadas ?? 0, fill: "#4FD1C5" },
            { name: "Cartão", value: m?.cartao ?? 0, fill: "#D4B876" },
          ];
          const max = Math.max(monthTotal, 1);
          const label = monthOptions.find((o) => o.key === monthFilter)?.label ?? monthFilter;
          return (
            <div className="relative bg-gradient-to-br from-card via-card to-card/40 border border-border p-6 rounded-2xl overflow-hidden">
              <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, var(--foreground) 1px, transparent 0)", backgroundSize: "24px 24px" }} />
              <div className="relative flex items-start justify-between flex-wrap gap-3 mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-gold animate-pulse" />
                    <span className="text-[10px] uppercase tracking-[0.2em] text-gold">Snapshot · {label}</span>
                  </div>
                  <h3 className="font-[var(--font-display)] text-xl">Composição do mês</h3>
                  <p className="text-xs text-muted-foreground">Distribuição de pontos por origem</p>
                </div>
              </div>
              <div className="relative grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                <ResponsiveContainer width="100%" height={260}>
                  <RadialBarChart innerRadius="35%" outerRadius="100%" data={radial} startAngle={90} endAngle={-270}>
                    <PolarAngleAxis type="number" domain={[0, max]} tick={false} />
                    <RadialBar background={{ fill: "var(--muted)", opacity: 0.3 }} dataKey="value" cornerRadius={12} />
                    <Tooltip contentStyle={{ background: "#0F1B2E", border: "1px solid #C9A961", borderRadius: 12, color: "#F5F0E0", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }} itemStyle={{ color: "#F5F0E0" }} labelStyle={{ color: "#C9A961", fontWeight: 600 }} formatter={(v: number, _n, p: { payload?: { name?: string } }) => [numM(v), p?.payload?.name ?? ""]} />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="space-y-3">
                  <div className="pb-3 border-b border-border">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Total do mês</p>
                    <p className="font-[var(--font-display)] text-3xl text-gold tabular-nums">{numM(monthTotal)}</p>
                  </div>
                  {radial.map((r) => {
                    const pct = monthTotal > 0 ? (r.value / monthTotal) * 100 : 0;
                    return (
                      <div key={r.name}>
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="flex items-center gap-2"><span className="w-2 h-2 rounded-full" style={{ background: r.fill }} />{r.name}</span>
                          <span className="tabular-nums text-muted-foreground">{numM(r.value)} · {pct.toFixed(0)}%</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: r.fill }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()
      )}


      {programStats.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-end justify-between flex-wrap gap-2">
            <div>
              <h3 className="font-[var(--font-display)] text-xl">Programas</h3>
              <p className="text-xs text-muted-foreground">Clique num card para ver a origem dos pontos e custos</p>
            </div>
            <span className="text-[10px] uppercase tracking-[0.2em] text-gold">{programStats.length} ativo{programStats.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {programStats.map((s) => (
              <button
                key={s.program.id}
                type="button"
                onClick={() => setDetailsProgramId(s.program.id)}
                className="text-left relative bg-gradient-to-br from-card via-card to-card/40 border border-border hover:border-gold/60 hover:shadow-[0_8px_32px_rgba(201,169,97,0.15)] transition-all p-5 rounded-2xl overflow-hidden group"
              >
                <div className="absolute top-0 left-0 w-1 h-full" style={{ background: brandColor(s.program.name, s.program.color) }} />
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, var(--foreground) 1px, transparent 0)", backgroundSize: "20px 20px" }} />
                <div className="relative pl-2">
                  <div className="flex items-center gap-3 mb-3">
                    <BankIcon bank={s.program.name} size={28} square />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{s.program.name}</p>
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{s.program.category}</p>
                    </div>
                  </div>
                  <p className="font-[var(--font-display)] text-2xl text-gold tabular-nums">
                    {numM(s.totalPoints)}<span className="text-xs text-muted-foreground ml-1">pts</span>
                  </p>
                  <div className="mt-3 pt-3 border-t border-border/60 grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <p className="uppercase tracking-wider text-muted-foreground">Investido</p>
                      <p className="tabular-nums text-foreground">{brlM(s.totalCost)}</p>
                    </div>
                    <div className="text-right">
                      <p className="uppercase tracking-wider text-muted-foreground">{s.avgPer1k > 0 ? "Preço médio /1k" : "Valor"}</p>
                      <p className="tabular-nums text-foreground">{s.avgPer1k > 0 ? brlM(s.avgPer1k) : brlM(s.cashValue)}</p>
                    </div>
                  </div>
                  <div className="mt-2 text-[10px] uppercase tracking-wider text-muted-foreground/70">{s.count} lançamento{s.count !== 1 ? "s" : ""} • saldo {numM(s.totalPoints)}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <Dialog open={!!detailsProgramId} onOpenChange={(o) => !o && setDetailsProgramId(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {detailsProgram && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <span className="w-2.5 h-6 rounded-sm" style={{ background: brandColor(detailsProgram.program.name, detailsProgram.program.color) }} />
                  {detailsProgram.program.name}
                </DialogTitle>
                <DialogDescription>
                  Detalhes de origem dos pontos e custos • {detailsProgram.program.category}
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2">
                <div className="bg-muted/40 rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total pts</p>
                  <p className="text-lg font-semibold tabular-nums">{numM(detailsProgram.totalPoints)}</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Custo total</p>
                  <p className="text-lg font-semibold tabular-nums">{brlM(detailsProgram.totalCost)}</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Preço /1k</p>
                  <p className="text-lg font-semibold tabular-nums text-gold">{detailsProgram.avgPer1k > 0 ? brlM(detailsProgram.avgPer1k) : "—"}</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Valor R$</p>
                  <p className="text-lg font-semibold tabular-nums">{brlM(detailsProgram.cashValue)}</p>
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Origem dos pontos</p>
                <div className="space-y-2">
                  {Object.entries(detailsProgram.bySource).map(([src, v]) => {
                    const pct = detailsProgram.totalPoints > 0 ? (v.points / detailsProgram.totalPoints) * 100 : 0;
                    return (
                      <div key={src} className="border border-border rounded-lg p-3">
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="font-medium">{SOURCE_LABEL[src as EarningSource] ?? src}</span>
                          <span className="text-muted-foreground text-xs">{v.count} lanç. • {pct.toFixed(0)}%</span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>{numM(v.points)} pts</span>
                          <span>Custo {brlM(v.cost)}{v.points > 0 && v.cost > 0 && ` • ${brlM((v.cost / v.points) * 1000)}/1k`}</span>
                        </div>
                        <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full" style={{ width: `${pct}%`, background: brandColor(detailsProgram.program.name, detailsProgram.program.color) }} />
                        </div>
                      </div>
                    );
                  })}
                  {Object.keys(detailsProgram.bySource).length === 0 && (
                    <p className="text-sm text-muted-foreground">Nenhum lançamento ainda para este programa.</p>
                  )}
                </div>
              </div>

              {detailsEarnings.length > 0 && (
                <div>
                  <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 mt-2">Últimos lançamentos</p>
                  <div className="border border-border rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40">
                        <tr className="text-left text-muted-foreground">
                          <th className="px-3 py-2">Mês</th>
                          <th className="px-3 py-2">Origem</th>
                          <th className="px-3 py-2 text-right">Pontos</th>
                          <th className="px-3 py-2 text-right">Custo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailsEarnings.slice(0, 12).map((e) => (
                          <tr key={e.id} className="border-t border-border">
                            <td className="px-3 py-2">{formatMonth(e.month)}</td>
                            <td className="px-3 py-2">{SOURCE_LABEL[e.source]}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{numM(e.points)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{e.cost != null ? brlM(e.cost) : "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>



    </div>
  );
}
