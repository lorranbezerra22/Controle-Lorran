import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowUpRight, ChevronDown, Plane, Settings2, TrendingUp, Trophy, Wallet } from "lucide-react";
import { BankIcon } from "@/components/BankIcon";
import { KpiTile } from "@/components/KpiTile";
import { MilhasNotificationBell } from "@/components/MilhasNotificationBell";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useMilhasData } from "@/context/MilhasDataContext";
import { brandColor } from "@/lib/banks";
import { isPendingEarning } from "@/lib/milhas-clubes";
import { brlM, numM, SOURCE_LABEL, type EarningSource } from "@/lib/milhas-storage";

const PROGRAM_FILTER_KEY = "milhas.dash.programFilter";

const formatMonth = (key: string) => { const [y, m] = key.split("-"); return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }); };

export const Route = createFileRoute("/milhas/")({
  component: MilhasDashboard,
  head: () => ({ meta: [{ title: "Dashboard — CRM Milhas" }] }),
});

function MilhasDashboard() {
  const { programs, earnings, redemptions, loading } = useMilhasData();
  const [selectedProgram, setSelectedProgram] = useState(() =>
    typeof window === "undefined" ? "all" : window.sessionStorage.getItem(PROGRAM_FILTER_KEY) ?? "all",
  );
  const [detailsProgramId, setDetailsProgramId] = useState<string | null>(null);
  const programFilter = programs.some((program) => program.id === selectedProgram)
    ? selectedProgram
    : "all";
  const changeProgram = (id: string) => {
    setSelectedProgram(id);
    window.sessionStorage.setItem(PROGRAM_FILTER_KEY, id);
  };

  const confirmedEarnings = useMemo(() => earnings.filter((e) => !isPendingEarning(e.note)), [earnings]);
  const programStats = useMemo(() => {
    return programs.map((program) => {
      const list = confirmedEarnings.filter((e) => e.programId === program.id);
      const bySource: Partial<Record<EarningSource, { points: number; cost: number; count: number }>> = {};
      let totalCost = 0;
      let creditedPoints = 0;
      for (const entry of list) {
        const cost = entry.cost ?? 0;
        const source = (bySource[entry.source] ??= { points: 0, cost: 0, count: 0 });
        source.points += entry.points;
        source.cost += cost;
        source.count++;
        totalCost += cost;
        creditedPoints += entry.points;
      }
      return {
        program,
        totalPoints: program.balance,
        totalCost,
        bySource,
        creditedPoints,
        cashValue: (program.balance / 1000) * program.valuePerThousand,
        avgPer1k: creditedPoints > 0 ? (totalCost / creditedPoints) * 1000 : null,
      };
    });
  }, [confirmedEarnings, programs]);

  const visibleStats = programStats.filter(({ program }) => programFilter === "all" || program.id === programFilter);
  const filteredPrograms = visibleStats.map(({ program }) => program);
  const totalCash = visibleStats.reduce((sum, item) => sum + item.cashValue, 0);
  const totalMilesCost = visibleStats.reduce((sum, item) => sum + item.totalCost, 0);
  const netPatrimony = totalCash - totalMilesCost;
  const filteredRedemptions = redemptions.filter((r) => programFilter === "all" || r.programId === programFilter);
  const travelRedemptions = filteredRedemptions.filter((r) => r.type === "viagem");
  const totalEconomy = filteredRedemptions.reduce(
    (sum, r) => sum + ((r.cashEquivalent ?? 0) - ((r.milesCost ?? 0) + (r.taxes ?? 0))),
    0,
  );
  const totalTravelSpent = travelRedemptions.reduce(
    (sum, r) => sum + ((r.milesCost ?? 0) + (r.taxes ?? 0)),
    0,
  );

  const detailsProgram = programStats.find(({ program }) => program.id === detailsProgramId);
  const detailsEarnings = confirmedEarnings
    .filter((entry) => entry.programId === detailsProgramId)
    .sort((a, b) => b.month.localeCompare(a.month));

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
        const registradoEm = e.creditDate ? e.updatedAt : e.createdAt;
        const t = registradoEm ? new Date(registradoEm).getTime() : 0;
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
        const registradoEm = e.creditDate ? e.updatedAt : e.createdAt;
        const t = registradoEm ? new Date(registradoEm).getTime() : 0;
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
      <PageHeader
        icon={Wallet}
        title="Painel de Milhas"
        actions={
          <>
            <MilhasNotificationBell credits={recentCredits} />
            <Button variant="outline" asChild>
              <Link to="/milhas/config"><Settings2 className="size-4" /> Configurações</Link>
            </Button>
          </>
        }
      />

      <section
        aria-labelledby="milhas-venda"
        className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 rounded-2xl border border-primary/25 bg-gradient-to-r from-primary/10 via-card to-card px-5 py-4 sm:px-6"
      >
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <TrendingUp className="size-5" aria-hidden />
          </div>
          <div>
            <h2 id="milhas-venda" className="text-sm font-semibold sm:text-base">Possível venda bruta</h2>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {programFilter === "all" ? "Todos os programas" : filteredPrograms[0]?.name}
            </p>
          </div>
        </div>
        <p className="font-[var(--font-display)] text-2xl font-semibold tabular-nums text-primary sm:text-3xl">
          {loading && visibleStats.length === 0 ? "—" : brlM(totalCash)}
        </p>
      </section>

      <section aria-labelledby="milhas-programas" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="milhas-programas" className="font-[var(--font-display)] text-lg font-semibold">Programas</h2>
          {programs.length > 1 && (
            <div className="relative">
              <label htmlFor="milhas-filtro-programa" className="sr-only">Filtrar programa</label>
              <select
                id="milhas-filtro-programa"
                value={programFilter}
                onChange={(event) => changeProgram(event.target.value)}
                className="h-9 appearance-none rounded-xl border border-border bg-card pl-3 pr-9 text-sm focus-visible:outline-2 focus-visible:outline-ring"
              >
                <option value="all">Todos os programas</option>
                {programs.map((program) => <option key={program.id} value={program.id}>{program.name}</option>)}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            </div>
          )}
        </div>

        {visibleStats.length === 0 ? (
          <div className="rounded-2xl border border-border bg-card px-5 py-6 text-sm text-muted-foreground" role="status">
            {loading ? "Carregando programas…" : "Cadastre um programa em Configurações para começar."}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visibleStats.map((item) => (
              <article
                key={item.program.id}
                aria-labelledby={"programa-" + item.program.id}
                className="relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-border/75 bg-card shadow-[var(--shadow-card)] transition-colors hover:border-primary/40"
              >
                <div
                  aria-hidden
                  className="absolute inset-x-0 top-0 h-0.5"
                  style={{ backgroundColor: brandColor(item.program.name, item.program.color) }}
                />
                <div className="flex flex-1 flex-col gap-4 px-4 py-4 sm:px-5">
                  <div className="flex items-center gap-3">
                    <span aria-hidden className="inline-flex">
                      <BankIcon bank={item.program.name} size={34} square />
                    </span>
                    <h3 id={"programa-" + item.program.id} className="min-w-0 break-words font-semibold">{item.program.name}</h3>
                  </div>

                  <dl className="space-y-4">
                    <div>
                      <dt className="text-sm text-muted-foreground">Saldo atual</dt>
                      <dd className="mt-0.5 break-words font-[var(--font-display)] text-3xl font-semibold tracking-tight tabular-nums text-foreground">
                        {numM(item.totalPoints)} <span className="font-sans text-sm font-normal tracking-normal text-muted-foreground">pts</span>
                      </dd>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 border-t border-border/60 pt-3">
                      <div>
                        <dt className="text-xs text-muted-foreground">Custo registrado</dt>
                        <dd className="mt-1 break-words text-sm font-medium tabular-nums">{brlM(item.totalCost)}</dd>
                      </div>
                      <div>
                        <dt className="text-xs text-muted-foreground">CPM de aquisição</dt>
                        <dd className="mt-1 break-words text-sm font-medium tabular-nums">{item.avgPer1k === null ? "—" : brlM(item.avgPer1k)}</dd>
                      </div>
                    </div>
                  </dl>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 bg-muted/25 px-4 py-3 sm:px-5">
                  <div>
                    <p className="text-xs text-muted-foreground">Possível venda bruta</p>
                    <p className="mt-0.5 font-semibold tabular-nums text-primary">{brlM(item.cashValue)}</p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={"Ver detalhes de " + item.program.name}
                    onClick={() => setDetailsProgramId(item.program.id)}
                  >
                    Detalhes <ArrowUpRight className="size-3.5" aria-hidden />
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <details className="rounded-2xl border border-border bg-card px-4 py-3 sm:px-5">
        <summary className="cursor-pointer font-semibold">Resultados e viagens</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <KpiTile icon={<TrendingUp className="size-5" />} label="Patrimônio líquido" value={netPatrimony} sub="Venda bruta estimada menos custo registrado" />
          <KpiTile icon={<Plane className="size-5" />} label="Economia com milhas" value={totalEconomy} sub={"Custo em viagens: " + brlM(totalTravelSpent)} index={1} />
          <KpiTile icon={<Plane className="size-5" />} label="Viagens realizadas" value={travelRedemptions.length} format={numM} sub="Resgates em viagem" index={2} />
        </div>
      </details>
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
                  Origem dos créditos, custos e últimos lançamentos
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2">
                <div className="bg-muted/40 rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Saldo atual</p>
                  <p className="text-lg font-semibold tabular-nums">{numM(detailsProgram.totalPoints)}</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Custo registrado</p>
                  <p className="text-lg font-semibold tabular-nums">{brlM(detailsProgram.totalCost)}</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">CPM de aquisição</p>
                  <p className="text-lg font-semibold tabular-nums text-gold">{detailsProgram.avgPer1k === null ? "—" : brlM(detailsProgram.avgPer1k)}</p>
                </div>
                <div className="bg-muted/40 rounded-lg p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Possível venda bruta</p>
                  <p className="text-lg font-semibold tabular-nums">{brlM(detailsProgram.cashValue)}</p>
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Origem dos pontos</p>
                <div className="space-y-2">
                  {Object.entries(detailsProgram.bySource).map(([src, v]) => {
                    const pct = detailsProgram.creditedPoints > 0 ? (v.points / detailsProgram.creditedPoints) * 100 : 0;
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
