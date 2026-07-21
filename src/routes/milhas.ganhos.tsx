import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMilhasData } from "@/context/MilhasDataContext";
import { EarningSource, SOURCE_LABEL, brlM, numM, uid } from "@/lib/milhas-storage";
import { Plus, Trash2, Pencil, Check, X, ArrowRight, ArrowLeft, CreditCard, Gift, Users, Repeat } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { DatePicker, MonthPicker } from "@/components/date-picker";
import { brandColor } from "@/lib/banks";
import { BankIcon } from "@/components/BankIcon";
import { toast } from "sonner";

export const Route = createFileRoute("/milhas/ganhos")({
  component: RegistrosPage,
  head: () => ({ meta: [{ title: "Ganhos & Transferências — CRM Milhas" }] }),
});

const monthKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const formatMonth = (key: string) => { const [y, m] = key.split("-"); return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" }); };
const BR_TZ = "America/Sao_Paulo";
const todayISO = () => {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: BR_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  return parts; // en-CA => yyyy-MM-dd
};
const fmtISO = (iso: string) => {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat("pt-BR", { timeZone: BR_TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)));
};
const SOURCES: EarningSource[] = ["cartao", "bonificadas"];

export function RegistrosPage() {
  const [tab, setTab] = useState<"ganhos" | "transferencias" | "clube">("ganhos");
  const tabs: { key: typeof tab; label: string }[] = [
    { key: "ganhos", label: "Ganhos" },
    { key: "transferencias", label: "Transferências bonificadas" },
    { key: "clube", label: "Clube" },
  ];

  // materialização de parcelas pendentes ocorre globalmente no MilhasDataProvider
  const { earnings } = useMilhasData();


  return (
    <div className="space-y-6">
      <div className="inline-flex gap-2 flex-wrap">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-5 py-2 text-sm border rounded-lg transition-colors ${tab === t.key ? "border-primary bg-primary/10 ring-1 ring-primary/40 font-medium text-foreground" : "bg-card border-border text-muted-foreground hover:bg-muted"}`}
          >{t.label}</button>
        ))}
      </div>

      {tab === "ganhos" && <GanhosTab />}
      {tab === "transferencias" && <TransferenciasTab />}
      {tab === "clube" && <ClubeTab />}
    </div>
  );
}

function GanhosTab() {
  const { programs, earnings, addEarning, updateEarning, deleteEarning } = useMilhasData();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [detailsProgramId, setDetailsProgramId] = useState<string | null>(null);
  const emptyForm = () => ({
    programId: programs[0]?.id ?? "", month: monthKey(), points: 0, source: "cartao" as EarningSource, cost: 0, parity: 1, bonusPercent: 0, note: "", toProgramId: "",
  });
  const openDialog = () => { setEditingId(null); setForm(emptyForm()); setStep(1); setShowForm(true); };
  const openEdit = (e: (typeof earnings)[number]) => {
    setEditingId(e.id);
    const isTransfer = e.source === "transferencia";
    let cleanNote = e.note ?? "";
    if (isTransfer) cleanNote = cleanNote.replace(/^Origem:\s*[^•]+(\s*•\s*)?/, "").trim();
    setForm({
      programId: isTransfer ? "" : e.programId,
      toProgramId: isTransfer ? e.programId : "",
      month: e.month,
      points: e.points,
      source: e.source,
      cost: e.cost ?? 0,
      parity: e.parity ?? 1,
      bonusPercent: e.bonusPercent ?? 0,
      note: cleanNote,
    });
    setStep(2);
    setShowForm(true);
  };
  const [filterProgram, setFilterProgram] = useState<string>(() => {
    if (typeof window === "undefined") return "all";
    return window.sessionStorage.getItem("milhas.ganhos.filterProgram") ?? "all";
  });
  const handleFilterProgram = (v: string) => {
    setFilterProgram(v);
    if (typeof window !== "undefined") window.sessionStorage.setItem("milhas.ganhos.filterProgram", v);
  };
  const [form, setForm] = useState(emptyForm);

  const noWheel = (e: React.WheelEvent<HTMLInputElement>) => (e.target as HTMLInputElement).blur();

  const PARITY_OPTIONS: { label: string; value: number }[] = [
    { label: "1:1", value: 1 },
    { label: "1:2 (1 origem = 2 destino)", value: 2 },
    { label: "1:3", value: 3 },
    { label: "2:1 (2 origem = 1 destino)", value: 0.5 },
    { label: "3:1", value: 1 / 3 },
  ];

  const milhagemPrograms = programs.filter((p) => p.category === "milhagem");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isTransfer = form.source === "transferencia";
    const isCartao = form.source === "cartao";
    if (form.points <= 0) return;
    if (isTransfer ? !form.toProgramId : !form.programId) return;
    let composedNote = form.note || "";
    if (isTransfer) {
      const fromName = programs.find((p) => p.id === form.programId)?.name;
      if (fromName) composedNote = `Origem: ${fromName}${composedNote ? " • " + composedNote : ""}`;
    }
    const payload = {
      programId: isTransfer ? form.toProgramId : form.programId,
      month: form.month, points: form.points, source: form.source,
      cost: isCartao ? 0 : (form.cost >= 0 ? form.cost : undefined),
      parity: isTransfer ? form.parity : undefined,
      bonusPercent: isTransfer ? form.bonusPercent : undefined,
      note: composedNote || undefined,
    };
    try {
      if (editingId) {
        await updateEarning(editingId, payload);
      } else {
        await addEarning(payload);
      }
      setEditingId(null);
      setForm(emptyForm());
      setShowForm(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar o lançamento.");
    }
  };

  // parcelas futuras de clube não entram nos ganhos até a data chegar
  const isPending = (n?: string) => !!n && n.includes("[PENDING]");

  // agrupa clube base + créditos de bônus para diluir o custo pelo total de pontos
  const clubGroupPoints = new Map<string, number>();
  const seriesTotals = new Map<string, { points: number; cost: number }>();
  for (const e of earnings) {
    if (e.source !== "clube") continue;
    if (isPending(e.note)) continue;
    const m = (e.note ?? "").match(/\[BONUS-CLUBE:([^\]]+)\]/);
    const baseId = m ? m[1] : e.id;
    clubGroupPoints.set(baseId, (clubGroupPoints.get(baseId) ?? 0) + e.points);
    const sid = e.note?.match(/\[SERIE:([^\]]+)\]/)?.[1];
    if (sid) {
      const acc = seriesTotals.get(sid) ?? { points: 0, cost: 0 };
      acc.points += e.points;
      acc.cost += e.cost ?? 0;
      seriesTotals.set(sid, acc);
    }
  }

  const enriched = earnings
    .filter((e) => !isPending(e.note))
    .filter((e) => filterProgram === "all" || e.programId === filterProgram)
    .map((e) => {
      const p = programs.find((pr) => pr.id === e.programId);
      const bonusMatch = e.source === "clube" ? (e.note ?? "").match(/\[BONUS-CLUBE:([^\]]+)\]/) : null;
      const baseId = bonusMatch ? bonusMatch[1] : e.id;
      let displayCost: number | null = e.cost ?? null;
      let avgPerThousand: number | null = e.cost != null && e.points > 0 ? (e.cost / e.points) * 1000 : null;
      if (e.source === "clube") {
        const sid = e.note?.match(/\[SERIE:([^\]]+)\]/)?.[1];
        const isExtra = (e.note ?? "").includes("[EXTRA]");
        const st = sid ? seriesTotals.get(sid) : null;
        if (st && st.cost > 0 && st.points > 0) {
          const rate = (st.cost / st.points) * 1000;
          avgPerThousand = rate;
          // Extras não têm custo próprio, mas fazem parte da operação: exibem a parcela rateada.
          if (isExtra) displayCost = null;
        } else {
          const baseEarning = bonusMatch ? earnings.find((x) => x.id === baseId) : e;
          const groupCost = baseEarning?.cost ?? 0;
          const groupPts = clubGroupPoints.get(baseId) ?? e.points;
          if (groupCost > 0 && groupPts > 0) {
            avgPerThousand = (groupCost / groupPts) * 1000;
          }
        }
      }
      const cleanNote = (e.note ?? "")
        .replace(/\s*\[BONUS-CLUBE:[^\]]+\]\s*/g, "")
        .replace(/\s*\[SERIE:[^\]]+\]\s*/g, "")
        .replace(/\s*•\s*•\s*/g, " • ")
        .replace(/^\s*•\s*/, "")
        .replace(/\s*•\s*$/, "")
        .trim();
      return {
        ...e,
        note: cleanNote,
        programName: p?.name ?? "—",
        programColor: brandColor(p?.name, p?.color ?? "#999"),
        cashValue: p ? (e.points / 1000) * p.valuePerThousand : 0,
        avgPerThousand,
        displayCost,
      };
    })
    .sort((a, b) => b.month.localeCompare(a.month));


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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-muted-foreground max-w-xl">Registre pontos por cartão, bonificadas ou clube. Informe o custo para ver o preço médio por 1.000.</p>
        <button onClick={openDialog} disabled={programs.length === 0} className="inline-flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 text-sm font-medium rounded-full shadow-md transition-colors disabled:opacity-40">
          <Plus className="w-4 h-4" /> Novo Lançamento
        </button>
      </div>


      {programStats.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Programas cadastrados — clique para detalhes</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {programStats.map((s) => (
              <button
                key={s.program.id}
                type="button"
                onClick={() => setDetailsProgramId(s.program.id)}
                className="text-left bg-card border border-border hover:border-primary/60 hover:bg-primary/5 transition-colors p-4 rounded-xl group"
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2.5 h-6 rounded-sm" style={{ background: brandColor(s.program.name, s.program.color) }} />
                  <BankIcon bank={s.program.name} size={22} square />
                  <span className="text-sm font-medium truncate">{s.program.name}</span>
                  <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">{s.program.category}</span>
                </div>
                <p className="font-[var(--font-display)] text-2xl text-gold tabular-nums">{numM(s.totalPoints)}<span className="text-xs text-muted-foreground"> pts</span></p>
                <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                  <span>Investido: <span className="text-foreground">{brlM(s.totalCost)}</span></span>
                  {s.avgPer1k > 0 && <span>{brlM(s.avgPer1k)}/1k</span>}
                </div>
                <div className="mt-2 text-[11px] text-muted-foreground">{s.count} lançamento{s.count !== 1 ? "s" : ""} • valor ≈ {brlM(s.cashValue)}</div>
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
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Preço médio /1k</p>
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
                          <th className="px-3 py-2">Obs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detailsEarnings.slice(0, 12).map((e) => (
                          <tr key={e.id} className="border-t border-border">
                            <td className="px-3 py-2">{formatMonth(e.month)}</td>
                            <td className="px-3 py-2">{SOURCE_LABEL[e.source]}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{numM(e.points)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{e.cost != null ? brlM(e.cost) : "—"}</td>
                            <td className="px-3 py-2 text-muted-foreground truncate max-w-[180px]">{(e.note ?? "").replace(/\s*\[BONUS-CLUBE:[^\]]+\]\s*/g, "").replace(/\s*\[SERIE:[^\]]+\]\s*/g, "").replace(/^\s*•\s*/, "").replace(/\s*•\s*$/, "").trim() || "—"}</td>
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

      <Dialog open={showForm} onOpenChange={(o) => { setShowForm(o); if (!o) { setEditingId(null); setForm(emptyForm()); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Lançamento" : "Novo Lançamento"}</DialogTitle>
            <DialogDescription>
              {step === 1 ? "Escolha a origem dos pontos para começar." : `Origem: ${SOURCE_LABEL[form.source]}`}
            </DialogDescription>
          </DialogHeader>

          {step === 1 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 py-2">
              {SOURCES.map((s) => {
                const Icon = s === "cartao" ? CreditCard : s === "bonificadas" ? Gift : s === "clube" ? Users : Repeat;
                const desc = s === "cartao" ? "Pontos por gasto em cartão de crédito" : s === "bonificadas" ? "Compras inteligentes: bônus de pontos ao comprar produtos" : s === "clube" ? "Assinatura mensal do clube" : "Transferência entre programas com paridade e bônus";
                const color = s === "cartao" ? "#D4B876" : s === "bonificadas" ? "#4FD1C5" : s === "clube" ? "#A78BFA" : "#EC7000";
                return (
                  <button key={s} type="button" onClick={() => { setForm({ ...form, source: s }); setStep(2); }} className="flex items-start gap-3 text-left border border-border hover:bg-muted/40 rounded-lg p-4 transition-colors" style={{ borderLeftWidth: 4, borderLeftColor: color }}>
                    <span className="flex items-center justify-center w-9 h-9 rounded-lg shrink-0" style={{ background: `${color}22`, color }}>
                      <Icon className="w-5 h-5" />
                    </span>
                    <div>
                      <p className="font-medium text-sm">{SOURCE_LABEL[s]}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {step === 2 && (
            <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <div className="md:col-span-3">
                <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">
                  {form.source === "transferencia" ? "Programa de origem (fidelidade)" : "Programa"}
                </label>
                <select value={form.programId} onChange={(e) => setForm({ ...form, programId: e.target.value })} className="w-full border border-border px-3 py-2 text-sm bg-background rounded-md" required>
                  {programs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="md:col-span-3"><label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Mês</label><MonthPicker value={form.month} onChange={(m) => setForm({ ...form, month: m })} /></div>

              {form.source === "transferencia" && (
                <>
                  <div className="md:col-span-3">
                    <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Programa destino (milhagem)</label>
                    <select value={form.toProgramId} onChange={(e) => setForm({ ...form, toProgramId: e.target.value })} className="w-full border border-border px-3 py-2 text-sm bg-background rounded-md" required>
                      <option value="">— Selecione —</option>
                      {milhagemPrograms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-3">
                    <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Paridade</label>
                    <select value={form.parity} onChange={(e) => setForm({ ...form, parity: Number(e.target.value) })} className="w-full border border-border px-3 py-2 text-sm bg-background rounded-md">
                      {PARITY_OPTIONS.map((o) => <option key={o.label} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Bônus %</label>
                    <input type="number" step="1" onWheel={noWheel} value={form.bonusPercent} onChange={(e) => setForm({ ...form, bonusPercent: Number(e.target.value) })} className="w-full border border-border px-3 py-2 text-sm bg-background rounded-md" min={0} />
                    {form.parity > 0 && form.bonusPercent >= 0 && form.points > 0 && (
                      <p className="text-[11px] text-gold mt-1">Origem: {numM(Math.round(form.points / form.parity / (1 + form.bonusPercent / 100)))} pts</p>
                    )}
                  </div>
                </>
              )}

              <div className={form.source === "transferencia" ? "md:col-span-2" : form.source === "cartao" ? "md:col-span-6" : "md:col-span-3"}><label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Pontos</label><input type="number" onWheel={noWheel} value={form.points || ""} onChange={(e) => setForm({ ...form, points: Number(e.target.value) })} className="w-full border border-border px-3 py-2 text-sm bg-background rounded-md" min={1} required /></div>
              {form.source !== "cartao" && (
                <div className={form.source === "transferencia" ? "md:col-span-2" : "md:col-span-3"}>
                  <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Custo R$ <span className="normal-case text-[10px] text-muted-foreground/70">(0 = orgânico)</span></label>
                  <input type="number" step="0.01" onWheel={noWheel} value={form.cost} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} className="w-full border border-border px-3 py-2 text-sm bg-background rounded-md" min={0} />
                  {form.cost > 0 && form.points > 0 && <p className="text-[11px] text-gold mt-1">{brlM((form.cost / form.points) * 1000)} /1k</p>}
                  {form.cost === 0 && form.points > 0 && <p className="text-[11px] text-gold mt-1">Orgânico — reduz o preço médio</p>}
                </div>
              )}

              <div className="md:col-span-6"><label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Observação</label><input type="text" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="w-full border border-border px-3 py-2 text-sm bg-background rounded-md" /></div>

              <DialogFooter className="md:col-span-6 gap-2 sm:gap-2">
                <button type="button" onClick={() => setStep(1)} className="inline-flex items-center gap-1 px-4 py-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="w-4 h-4" /> Voltar</button>
                <button type="submit" className="bg-gold text-navy px-6 py-2 text-sm font-semibold rounded-md">{editingId ? "Salvar" : "Registrar"}</button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>


      {programs.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">Filtrar:</span>
          <button onClick={() => handleFilterProgram("all")} className={`px-3 py-1.5 text-sm border rounded-lg transition-colors ${filterProgram === "all" ? "border-primary bg-primary/10 ring-1 ring-primary/40 font-medium" : "border-border text-muted-foreground hover:bg-muted"}`}>Todos</button>
          {programs.map((p) => <button key={p.id} onClick={() => handleFilterProgram(p.id)} className={`px-3 py-1.5 text-sm border rounded-lg transition-colors ${filterProgram === p.id ? "border-primary bg-primary/10 ring-1 ring-primary/40 font-medium" : "border-border text-muted-foreground hover:bg-muted"}`}>{p.name}</button>)}
        </div>
      )}

      <div className="bg-card border border-border overflow-x-auto rounded-xl">
        {enriched.length === 0 ? (
          <div className="p-16 text-center text-sm text-muted-foreground">Nenhum lançamento ainda.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                {["Programa","Mês","Origem","Pontos","Custo","Preço médio /1k","Valor R$","Obs",""].map((h,i) => <th key={i} className="px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {enriched.map((e) => (
                <tr key={e.id} className="border-t border-border">
                  <td className="px-4 py-3"><div className="flex items-center gap-2"><span className="w-2 h-6" style={{ background: e.programColor }} /><BankIcon bank={e.programName} size={18} square /><span className="font-medium">{e.programName}</span></div></td>
                  <td className="px-4 py-3 text-muted-foreground capitalize">{formatMonth(e.month)}</td>
                  <td className="px-4 py-3"><span className="px-2 py-0.5 text-[11px] uppercase tracking-wider border border-border text-muted-foreground rounded">{SOURCE_LABEL[e.source]}</span></td>
                  <td className="px-4 py-3 text-right tabular-nums">{numM(e.points)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{e.displayCost != null ? (e.displayCost === 0 ? <span className="text-gold">Orgânico</span> : brlM(e.displayCost)) : "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{e.avgPerThousand != null ? (e.avgPerThousand === 0 ? "R$ 0,00" : brlM(e.avgPerThousand)) : "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-gold font-semibold">{brlM(e.cashValue)}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs max-w-[200px] truncate">{e.note || "—"}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    <button onClick={() => openEdit(e)} className="text-muted-foreground hover:text-gold p-1" title="Editar"><Pencil className="w-4 h-4" /></button>
                    <button onClick={() => { if (confirm("Excluir?")) deleteEarning(e.id); }} className="text-muted-foreground hover:text-destructive p-1" title="Excluir"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function TransferenciasTab() {
  const { programs, transfers, addTransfer, deleteTransfer } = useMilhasData();
  const fidelidade = programs.filter((p) => p.category === "fidelidade");
  const milhagem = programs.filter((p) => p.category === "milhagem");

  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    fromProgramId: fidelidade[0]?.id ?? "",
    toProgramName: milhagem[0]?.name ?? "",
    pointsSent: 0,
    bonusPercent: 100,
    date: todayISO(),
    note: "",
  });
  const selectedFromProgramId = form.fromProgramId || fidelidade[0]?.id || "";
  const selectedToProgramName = form.toProgramName || milhagem[0]?.name || "";

  const preview = useMemo(() => {
    const to = milhagem.find((p) => p.name === selectedToProgramName);
    const received = Math.round(form.pointsSent * (1 + form.bonusPercent / 100));
    const cash = to ? (received / 1000) * to.valuePerThousand : 0;
    return { received, cash };
  }, [form.pointsSent, form.bonusPercent, selectedToProgramName, milhagem]);

  const canTransfer = fidelidade.length > 0 && milhagem.length > 0;

  const openTransferDialog = () => {
    setForm((current) => ({
      ...current,
      fromProgramId: current.fromProgramId || fidelidade[0]?.id || "",
      toProgramName: current.toProgramName || milhagem[0]?.name || "",
    }));
    setShowForm(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFromProgramId || !selectedToProgramName || form.pointsSent <= 0) return;
    try {
      await addTransfer({ ...form, fromProgramId: selectedFromProgramId, toProgramName: selectedToProgramName });
      setForm({ ...form, fromProgramId: selectedFromProgramId, toProgramName: selectedToProgramName, pointsSent: 0, note: "" });
      setShowForm(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível registrar a transferência.");
    }
  };

  const enriched = transfers.map((t) => { const from = programs.find((p) => p.id === t.fromProgramId); return { ...t, fromName: from?.name ?? "—", fromColor: brandColor(from?.name, from?.color ?? "#999") }; });
  const totalReceived = transfers.reduce((s, t) => s + t.pointsReceived, 0);
  const totalCash = transfers.reduce((s, t) => s + t.cashValue, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card border border-border p-5 rounded-xl"><p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Transferências</p><p className="font-[var(--font-display)] text-2xl">{transfers.length}</p></div>
        <div className="bg-card border border-border p-5 rounded-xl"><p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Pontos recebidos</p><p className="font-[var(--font-display)] text-2xl tabular-nums">{numM(totalReceived)}</p></div>
        <div className="bg-card border border-border p-5 rounded-xl"><p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Valor total gerado</p><p className="font-[var(--font-display)] text-2xl text-gold tabular-nums">{brlM(totalCash)}</p></div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-muted-foreground max-w-xl">Somente transferências de Fidelidade → Milhagem (ex.: Livelo → Latam Pass).</p>
        <button onClick={openTransferDialog} disabled={!canTransfer} className="inline-flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 text-sm font-medium rounded-full shadow-md transition-colors disabled:opacity-40">
          <Plus className="w-4 h-4" /> Nova Transferência
        </button>
      </div>

      {!canTransfer && (
        <div className="bg-card border border-border p-4 text-sm text-muted-foreground rounded-xl">
          Cadastre pelo menos 1 programa de <strong>fidelidade</strong> e 1 de <strong>milhagem</strong> em Configurações.
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nova Transferência</DialogTitle>
            <DialogDescription>Fidelidade → Milhagem com bônus.</DialogDescription>
          </DialogHeader>
          {canTransfer && (
            <form onSubmit={submit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div><label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">De (fidelidade)</label>
                  <select value={selectedFromProgramId} onChange={(e) => setForm({ ...form, fromProgramId: e.target.value })} className="w-full border border-border px-3 py-2 text-sm bg-background rounded-md" required>
                    {fidelidade.map((p) => <option key={p.id} value={p.id}>{p.name} ({numM(p.balance)} pts)</option>)}
                  </select>
                </div>
                <div><label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Para (milhagem)</label>
                  <select value={selectedToProgramName} onChange={(e) => setForm({ ...form, toProgramName: e.target.value })} className="w-full border border-border px-3 py-2 text-sm bg-background rounded-md" required>
                    {milhagem.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
                  </select>
                </div>
                <div><label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Enviados</label><input type="number" onWheel={(e)=>(e.target as HTMLInputElement).blur()} value={form.pointsSent || ""} onChange={(e) => setForm({ ...form, pointsSent: Number(e.target.value) })} className="w-full border border-border px-3 py-2 text-sm bg-background rounded-md" min={1} required /></div>
                <div><label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Bônus (%)</label><input type="number" onWheel={(e)=>(e.target as HTMLInputElement).blur()} value={form.bonusPercent} onChange={(e) => setForm({ ...form, bonusPercent: Number(e.target.value) })} className="w-full border border-border px-3 py-2 text-sm bg-background rounded-md" min={0} required /></div>
                <div><label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Data</label><DatePicker value={form.date} onChange={(d) => setForm({ ...form, date: d })} /></div>
                <div className="md:col-span-3"><label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Observação</label><input type="text" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="w-full border border-border px-3 py-2 text-sm bg-background rounded-md" /></div>
              </div>
              {form.pointsSent > 0 && (
                <div className="bg-muted/40 border-l-2 border-gold px-4 py-3 flex items-center gap-6 text-sm flex-wrap rounded-md">
                  <span className="text-muted-foreground">Preview:</span>
                  <span>Enviados: <strong className="tabular-nums">{numM(form.pointsSent)}</strong></span>
                  <ArrowRight className="w-4 h-4 text-gold" />
                  <span>Recebidos: <strong className="tabular-nums text-gold">{numM(preview.received)}</strong></span>
                  <span className="ml-auto">Valor: <strong className="tabular-nums text-gold">{brlM(preview.cash)}</strong></span>
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2 text-sm text-muted-foreground">Cancelar</button>
                <button type="submit" className="bg-gold text-navy px-6 py-2 text-sm font-semibold rounded-md">Registrar</button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <div className="bg-card border border-border rounded-xl overflow-x-auto">
        {enriched.length === 0 ? (
          <div className="p-16 text-center text-sm text-muted-foreground">Nenhuma transferência.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40"><tr className="text-left">{["Data","Origem","Destino","Enviados","Bônus","Recebidos","Valor R$",""].map((h,i) => <th key={i} className="px-6 py-3 text-xs uppercase tracking-wider text-muted-foreground">{h}</th>)}</tr></thead>
            <tbody>
              {enriched.map((t) => (
                <tr key={t.id} className="border-t border-border">
                  <td className="px-6 py-3 text-muted-foreground">{fmtISO(t.date)}</td>
                  <td className="px-6 py-3"><div className="flex items-center gap-2"><span className="w-2 h-6" style={{ background: t.fromColor }} /><span className="font-medium">{t.fromName}</span></div></td>
                  <td className="px-6 py-3">{t.toProgramName}</td>
                  <td className="px-6 py-3 text-right tabular-nums">{numM(t.pointsSent)}</td>
                  <td className="px-6 py-3 text-right tabular-nums text-gold">+{t.bonusPercent}%</td>
                  <td className="px-6 py-3 text-right tabular-nums font-semibold">{numM(t.pointsReceived)}</td>
                  <td className="px-6 py-3 text-right tabular-nums text-gold font-semibold">{brlM(t.cashValue)}</td>
                  <td className="px-6 py-3 text-right"><button onClick={() => { if (confirm("Excluir?")) deleteTransfer(t.id); }} className="text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

type ClubePlan = "mensal" | "anual" | "anual_parcelado";
const CLUBE_PLAN_LABEL: Record<ClubePlan, string> = {
  mensal: "Mensal",
  anual: "Anual (à vista)",
  anual_parcelado: "Anual parcelado",
};

const planMonths = (_plan: ClubePlan, installments: number) => Math.max(1, installments || 1);

const SERIE_TAG = (sid: string) => `[SERIE:${sid}]`;
const getSeriesId = (note: string | undefined) => note?.match(/\[SERIE:([^\]]+)\]/)?.[1] ?? null;
const addMonthsISO = (iso: string, i: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m - 1) + i, d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
};

function parseClubeNote(note: string | undefined): { plan: ClubePlan; promoName: string; installments: number; dueDate: string; pointsPerMonth: number; bonusExpected: number; bonusCredited: number; costPerInstallment: number; rest: string } {
  const out = { plan: "mensal" as ClubePlan, promoName: "", installments: 12, dueDate: "", pointsPerMonth: 0, bonusExpected: 0, bonusCredited: 0, costPerInstallment: 0, rest: "" };
  if (!note) return out;
  const parts = note.split(" • ");
  const remaining: string[] = [];
  for (const p of parts) {
    const mPlan = p.match(/^Clube:\s*(.+)$/);
    const mPromo = p.match(/^Promo:\s*(.+)$/);
    const mInst = p.match(/^(\d+)x$/);
    const mVence = p.match(/^Vence:\s*(\d{2})\/(\d{2})\/(\d{4})$/);
    const mPPM = p.match(/^([\d.]+)\s*pts\/mês$/);
    const mBonusExp = p.match(/^Bônus previsto:\s*([\d.]+)$/);
    const mBonusCred = p.match(/^Bônus creditado:\s*([\d.]+)$/);
    const mCostInst = p.match(/^Parcela:\s*R\$\s*([\d.,]+)$/);
    if (mPlan) {
      const entry = (Object.entries(CLUBE_PLAN_LABEL) as [ClubePlan, string][]).find(([, v]) => v === mPlan[1].trim());
      if (entry) out.plan = entry[0];
    } else if (mPromo) out.promoName = mPromo[1].trim();
    else if (mInst) out.installments = Number(mInst[1]);
    else if (mVence) out.dueDate = `${mVence[3]}-${mVence[2]}-${mVence[1]}`;
    else if (mPPM) out.pointsPerMonth = Number(mPPM[1].replace(/\./g, ""));
    else if (mBonusExp) out.bonusExpected = Number(mBonusExp[1].replace(/\./g, ""));
    else if (mBonusCred) out.bonusCredited = Number(mBonusCred[1].replace(/\./g, ""));
    else if (mCostInst) out.costPerInstallment = Number(mCostInst[1].replace(/\./g, "").replace(",", "."));
    else if (/^\[SERIE:[^\]]+\]$/.test(p)) { /* strip */ }
    else if (/^Parcela\s+\d+\/\d+$/.test(p)) { /* strip */ }
    else remaining.push(p);
  }
  out.rest = remaining.join(" • ");
  return out;
}

export function buildClubeNote(opts: { plan: ClubePlan; promoName: string; installments: number; dueDate: string; pointsPerMonth: number; bonusExpected: number; bonusCredited: number; extra: string }) {
  return [
    `Clube: ${CLUBE_PLAN_LABEL[opts.plan]}`,
    opts.promoName ? `Promo: ${opts.promoName}` : "",
    opts.plan === "anual_parcelado" ? `${opts.installments}x` : "",
    `${numM(opts.pointsPerMonth)} pts/mês`,
    opts.bonusExpected > 0 ? `Bônus previsto: ${numM(opts.bonusExpected)}` : "",
    opts.bonusCredited > 0 ? `Bônus creditado: ${numM(opts.bonusCredited)}` : "",
    opts.dueDate ? `Vence: ${fmtISO(opts.dueDate)}` : "",
    opts.extra,
  ].filter(Boolean).join(" • ");
}

export { parseClubeNote };

function ClubeTab() {
  const [detailsSid, setDetailsSid] = useState<string | null>(null);
  const { programs, earnings, addEarning, updateEarning, deleteEarning } = useMilhasData();
  const clubePrograms = programs;
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const emptyForm = () => ({
    programId: clubePrograms[0]?.id ?? "",
    plan: "mensal" as ClubePlan,
    dueDate: todayISO(),
    pointsPerMonth: 0,
    bonusPoints: 0,
    cost: 0,
    installments: 12,
    promoName: "",
    note: "",
    extras: [] as { month: string; points: number }[],
  });
  const [form, setForm] = useState(emptyForm);
  const extrasTotal = form.extras.reduce((s, x) => s + (x.points || 0), 0);

  const noWheel = (e: React.WheelEvent<HTMLInputElement>) => (e.target as HTMLInputElement).blur();

  const months = planMonths(form.plan, form.installments);
  const basePoints = form.pointsPerMonth * months;
  const costPerMonth = months > 0 ? form.cost / months : 0;

  const openNew = () => {
    setEditingId(null);
    setForm(emptyForm());
    setShowForm(true);
  };

  const openEdit = (id: string) => {
    const e = earnings.find((x) => x.id === id);
    if (!e) return;
    const sid = getSeriesId(e.note);
    // se for parte de uma série, usa a âncora (com bonusExpected)
    const anchor = sid
      ? earnings
          .filter((x) => getSeriesId(x.note) === sid)
          .sort((a, b) => a.month.localeCompare(b.month))[0] ?? e
      : e;
    const parsed = parseClubeNote(anchor.note);
    setEditingId(anchor.id);
    const m = planMonths(parsed.plan, parsed.installments);
    const ppm = parsed.pointsPerMonth || anchor.points;
    // custo total = soma da série (ou custo da entrada única)
    const totalCost = sid
      ? earnings.filter((x) => getSeriesId(x.note) === sid).reduce((s, x) => s + (x.cost ?? 0), 0)
      : (anchor.cost ?? 0);
    // extras: entradas da série marcadas com [EXTRA]
    const seriesEarnings = sid ? earnings.filter((x) => getSeriesId(x.note) === sid) : [];
    const extras = seriesEarnings
      .filter((x) => (x.note ?? "").includes("[EXTRA]"))
      .map((x) => ({ month: x.month, points: x.points }))
      .sort((a, b) => a.month.localeCompare(b.month));
    setForm({
      programId: anchor.programId,
      plan: parsed.plan,
      dueDate: parsed.dueDate || `${anchor.month}-01`,
      pointsPerMonth: ppm,
      bonusPoints: parsed.bonusExpected,
      cost: totalCost,
      installments: parsed.installments || m,
      promoName: parsed.promoName,
      note: parsed.rest,
      extras,
    });
    setShowForm(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.programId || form.pointsPerMonth <= 0) return;
    const months = planMonths(form.plan, form.installments);
    const prev = editingId ? parseClubeNote(earnings.find((x) => x.id === editingId)?.note) : null;
    const existingSid = editingId ? getSeriesId(earnings.find((x) => x.id === editingId)?.note) : null;

    const sid = existingSid || uid();
    const costPerMonth = months > 0 ? form.cost / months : form.cost;
    const today = todayISO();
    try {
      // ao editar, remove todas as parcelas antigas da série antes de recriar
      if (existingSid) {
        for (const item of earnings.filter((x) => getSeriesId(x.note) === existingSid)) {
          await deleteEarning(item.id);
        }
      } else if (editingId) {
        await deleteEarning(editingId);
      }

      for (let i = 0; i < months; i++) {
        const isoDate = addMonthsISO(form.dueDate, i);
        const month = isoDate.slice(0, 7);
        const isAnchor = i === 0;
        const isFuture = isoDate > today;
        const parts = [
          SERIE_TAG(sid),
          isFuture ? "[PENDING]" : "",
          isFuture ? `[DUE:${isoDate}]` : "",
          buildClubeNote({
            plan: form.plan,
            promoName: form.promoName,
            installments: form.installments,
            dueDate: isoDate,
            pointsPerMonth: form.pointsPerMonth,
            bonusExpected: isAnchor ? form.bonusPoints : 0,
            bonusCredited: isAnchor ? (prev?.bonusCredited ?? 0) : 0,
            extra: isAnchor ? form.note : `Parcela ${i + 1}/${months}`,
          }),
        ];
        await addEarning({
          programId: form.programId,
          month,
          points: form.pointsPerMonth,
          source: "clube" as const,
          cost: costPerMonth >= 0 ? costPerMonth : undefined,
          note: parts.filter(Boolean).join(" • "),
        });
      }

      // bônus extras: entradas avulsas em meses específicos, cost=0 (custo dilui via série)
      for (const ex of form.extras) {
        if (!ex.month || !ex.points || ex.points <= 0) continue;
        const dueDay = (form.dueDate || "").slice(8, 10) || "01";
        const isoDate = `${ex.month}-${dueDay}`;
        const isFuture = isoDate > today;
        const parts = [
          SERIE_TAG(sid),
          "[EXTRA]",
          isFuture ? "[PENDING]" : "",
          isFuture ? `[DUE:${isoDate}]` : "",
          `Bônus extra${form.promoName ? ` — ${form.promoName}` : ""}`,
        ];
        await addEarning({
          programId: form.programId,
          month: ex.month,
          points: ex.points,
          source: "clube" as const,
          cost: 0,
          note: parts.filter(Boolean).join(" • "),
        });
      }

      setForm(emptyForm());
      setEditingId(null);
      setShowForm(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível salvar o clube.");
    }
  };

  // agrupa parcelas por série no resumo do Clube (mostra uma linha por promoção)
  const clubeEarnings = (() => {
    const filtered = earnings.filter((e) => e.source === "clube" && !(e.note ?? "").includes("[BONUS-CLUBE:"));
    const seen = new Set<string>();
    const bySeries = new Map<string, { totalPoints: number; totalCost: number; count: number }>();
    for (const e of filtered) {
      const sid = getSeriesId(e.note);
      if (!sid) continue;
      const acc = bySeries.get(sid) ?? { totalPoints: 0, totalCost: 0, count: 0 };
      acc.totalPoints += e.points;
      acc.totalCost += e.cost ?? 0;
      acc.count += 1;
      bySeries.set(sid, acc);
    }
    return filtered
      .filter((e) => {
        const sid = getSeriesId(e.note);
        if (!sid) return true;
        if (seen.has(sid)) return false;
        seen.add(sid);
        return true;
      })
      .map((e) => {
        const p = programs.find((pr) => pr.id === e.programId);
        const sid = getSeriesId(e.note);
        const agg = sid ? bySeries.get(sid) : null;
        return {
          ...e,
          programName: p?.name ?? "—",
          programColor: brandColor(p?.name, p?.color ?? "#999"),
          seriesPoints: agg?.totalPoints ?? e.points,
          seriesCost: agg?.totalCost ?? e.cost ?? 0,
          seriesCount: agg?.count ?? 1,
          seriesId: sid,
        };
      })
      .sort((a, b) => b.month.localeCompare(a.month));
  })();



  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-muted-foreground max-w-xl">
          Registre cada promoção do clube. Na data de vencimento, os pontos entram automaticamente em Ganhos (mês do vencimento).
        </p>
        <button onClick={openNew} disabled={clubePrograms.length === 0} className="inline-flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 text-sm font-medium rounded-full shadow-md transition-colors disabled:opacity-40">
          <Plus className="w-4 h-4" /> Novo Clube
        </button>
      </div>

      {clubePrograms.length === 0 && (
        <div className="bg-card border border-border p-4 text-sm text-muted-foreground rounded-xl">
          Cadastre um programa em Configurações para usar o Clube.
        </div>
      )}

      <Dialog open={showForm} onOpenChange={(o) => { setShowForm(o); if (!o) setEditingId(null); }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Clube" : "Novo Clube"}</DialogTitle>
            <DialogDescription>Cadastre a promoção do clube. Os pontos entram em Ganhos no mês do vencimento.</DialogDescription>
          </DialogHeader>
          {clubePrograms.length > 0 && (
            <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-6 gap-4">
              <div className="md:col-span-3">
                <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Programa</label>
                <select value={form.programId} onChange={(e) => setForm({ ...form, programId: e.target.value })} className="w-full border border-border px-3 py-2 text-sm bg-background rounded-md" required>
                  {clubePrograms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="md:col-span-3">
                <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Plano</label>
                <select value={form.plan} onChange={(e) => setForm({ ...form, plan: e.target.value as ClubePlan })} className="w-full border border-border px-3 py-2 text-sm bg-background rounded-md">
                  {(Object.keys(CLUBE_PLAN_LABEL) as ClubePlan[]).map((k) => <option key={k} value={k}>{CLUBE_PLAN_LABEL[k]}</option>)}
                </select>
              </div>
              <div className="md:col-span-3">
                <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Nome da promoção</label>
                <input type="text" value={form.promoName} onChange={(e) => setForm({ ...form, promoName: e.target.value })} placeholder="Ex.: Clube Livelo 100%" className="w-full border border-border px-3 py-2 text-sm bg-background rounded-md" />
              </div>
              <div className="md:col-span-3">
                <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Data de vencimento</label>
                <DatePicker value={form.dueDate} onChange={(d) => setForm({ ...form, dueDate: d })} placeholder="Data de vencimento" />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Pontos por mês (fixo)</label>
                <input type="number" onWheel={noWheel} value={form.pointsPerMonth || ""} onChange={(e) => setForm({ ...form, pointsPerMonth: Number(e.target.value) })} className="w-full border border-border px-3 py-2 text-sm bg-background rounded-md" min={1} required />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Bônus previsto <span className="normal-case text-[10px] text-muted-foreground/70">(creditar depois)</span></label>
                <input type="number" onWheel={noWheel} value={form.bonusPoints || ""} onChange={(e) => setForm({ ...form, bonusPoints: Number(e.target.value) })} className="w-full border border-border px-3 py-2 text-sm bg-background rounded-md" min={0} placeholder="0" />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Custo total do clube R$</label>
                <input type="number" step="0.01" onWheel={noWheel} value={form.cost} onChange={(e) => setForm({ ...form, cost: Number(e.target.value) })} className="w-full border border-border px-3 py-2 text-sm bg-background rounded-md" min={0} />
                {form.cost > 0 && (basePoints + form.bonusPoints + extrasTotal) > 0 && <p className="text-[11px] text-gold mt-1">{brlM((form.cost / (basePoints + form.bonusPoints + extrasTotal)) * 1000)} /1k</p>}
              </div>
              {(form.plan === "anual_parcelado" || form.plan === "mensal") && (
                <div className="md:col-span-2">
                  <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Parcelas</label>
                  <input type="number" onWheel={noWheel} value={form.installments} onChange={(e) => setForm({ ...form, installments: Number(e.target.value) })} className="w-full border border-border px-3 py-2 text-sm bg-background rounded-md" min={1} max={24} />
                </div>
              )}

              <div className="md:col-span-6 border border-border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Bônus extras (pontuações avulsas)</p>
                    <p className="text-[11px] text-muted-foreground/80">Ex.: bônus de 250 pts em fev, mai, ago, nov. Compartilham o custo total do clube.</p>
                  </div>
                  <button type="button" onClick={() => setForm({ ...form, extras: [...form.extras, { month: monthKey(), points: 0 }] })} className="text-xs bg-primary/10 hover:bg-primary/20 text-foreground px-3 py-1.5 rounded-md border border-primary/40 inline-flex items-center gap-1">
                    <Plus className="w-3 h-3" /> Adicionar
                  </button>
                </div>
                {form.extras.length > 0 && (
                  <div className="space-y-2">
                    {form.extras.map((ex, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <div className="flex-1">
                          <MonthPicker value={ex.month} onChange={(m) => { const next = [...form.extras]; next[idx] = { ...next[idx], month: m }; setForm({ ...form, extras: next }); }} />
                        </div>
                        <input type="number" onWheel={noWheel} value={ex.points || ""} onChange={(e) => { const next = [...form.extras]; next[idx] = { ...next[idx], points: Number(e.target.value) }; setForm({ ...form, extras: next }); }} placeholder="Pontos" className="w-32 border border-border px-3 py-2 text-sm bg-background rounded-md" min={1} />
                        <button type="button" onClick={() => setForm({ ...form, extras: form.extras.filter((_, i) => i !== idx) })} className="text-muted-foreground hover:text-destructive p-2"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="md:col-span-6 bg-muted/40 rounded-lg p-3 text-xs space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Duração:</span><span className="tabular-nums">{months} {months === 1 ? "mês" : "meses"} ({form.installments}x)</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Pontos fixos ({numM(form.pointsPerMonth)}/mês × {months}):</span><span className="tabular-nums">{numM(basePoints)}</span></div>
                {form.bonusPoints > 0 && <div className="flex justify-between text-muted-foreground"><span>Bônus previsto:</span><span className="tabular-nums">+{numM(form.bonusPoints)}</span></div>}
                {extrasTotal > 0 && <div className="flex justify-between text-muted-foreground"><span>Bônus extras ({form.extras.filter((e) => e.points > 0).length}x):</span><span className="tabular-nums">+{numM(extrasTotal)}</span></div>}
                <div className="flex justify-between font-semibold border-t border-border pt-1"><span>Total de milhas a receber:</span><span className="tabular-nums text-gold">{numM(basePoints + form.bonusPoints + extrasTotal)}</span></div>
                {form.cost > 0 && <div className="flex justify-between text-muted-foreground"><span>Valor pago total:</span><span className="tabular-nums">{brlM(form.cost)}</span></div>}
                {form.cost > 0 && form.installments > 1 && <div className="flex justify-between text-muted-foreground"><span>Valor por parcela:</span><span className="tabular-nums">{brlM(form.cost / Math.max(1, form.installments))}</span></div>}
                {form.cost > 0 && (basePoints + form.bonusPoints + extrasTotal) > 0 && <div className="flex justify-between font-semibold"><span>Custo do milheiro:</span><span className="tabular-nums text-gold">{brlM((form.cost / (basePoints + form.bonusPoints + extrasTotal)) * 1000)} /1k</span></div>}
              </div>






              <div className="md:col-span-6">
                <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Observação</label>
                <input type="text" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="w-full border border-border px-3 py-2 text-sm bg-background rounded-md" />
              </div>
              <div className="md:col-span-6 flex justify-end gap-2">
                <button type="button" onClick={() => { setShowForm(false); setEditingId(null); }} className="px-5 py-2 text-sm text-muted-foreground">Cancelar</button>
                <button type="submit" className="bg-gold text-navy px-6 py-2 text-sm font-semibold rounded-md">{editingId ? "Salvar" : "Registrar"}</button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {clubeEarnings.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-16 text-center text-sm text-muted-foreground">Nenhuma promoção do clube ainda.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {clubeEarnings.map((e) => {
            const parsed = parseClubeNote(e.note);
            const sid = e.seriesId;
            const seriesAll = sid ? earnings.filter((x) => getSeriesId(x.note) === sid) : [e];
            const paid = seriesAll.filter((x) => !(x.note ?? "").includes("[PENDING]")).reduce((s, x) => s + x.points, 0);
            const pendingPts = seriesAll.filter((x) => (x.note ?? "").includes("[PENDING]")).reduce((s, x) => s + x.points, 0);
            const anchorIds = new Set(seriesAll.map((s) => s.id));
            const bonusCreditedFixed = earnings.reduce((s, x) => {
              const m = (x.note ?? "").match(/\[BONUS-CLUBE:([^\]]+)\]/);
              return m && anchorIds.has(m[1]) ? s + x.points : s;
            }, 0);
            const bonusRemaining = Math.max(0, parsed.bonusExpected - bonusCreditedFixed);
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => sid && setDetailsSid(sid)}
                className="text-left bg-card border border-border hover:border-primary/60 hover:bg-primary/5 transition-colors p-4 rounded-xl"
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="w-2.5 h-6 rounded-sm" style={{ background: e.programColor }} />
                  <BankIcon bank={e.programName} size={22} square />
                  <span className="text-sm font-medium truncate">{e.programName}</span>
                  {e.seriesCount > 1 && <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">{e.seriesCount}x</span>}
                </div>
                {parsed.promoName && <p className="text-xs text-muted-foreground mb-2 truncate">{parsed.promoName}</p>}
                <p className="font-[var(--font-display)] text-2xl text-gold tabular-nums">{numM(e.seriesPoints + parsed.bonusExpected)}<span className="text-xs text-muted-foreground"> pts</span></p>
                <div className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
                  <div className="flex justify-between"><span>Creditado:</span><span className="tabular-nums text-foreground">{numM(paid + bonusCreditedFixed)}</span></div>
                  {pendingPts > 0 && <div className="flex justify-between"><span>A creditar:</span><span className="tabular-nums">{numM(pendingPts)}</span></div>}
                  {bonusRemaining > 0 && <div className="flex justify-between"><span>Bônus pendente:</span><span className="tabular-nums text-gold">{numM(bonusRemaining)}</span></div>}
                  {e.seriesCost > 0 && <div className="flex justify-between border-t border-border pt-1 mt-1"><span>Custo:</span><span className="tabular-nums text-foreground">{brlM(e.seriesCost)}</span></div>}
                </div>
              </button>
            );
          })}
        </div>
      )}

      <ClubeDetailsDialog
        sid={detailsSid}
        onClose={() => setDetailsSid(null)}
        onEdit={(id) => { setDetailsSid(null); openEdit(id); }}
        onDeleteSeries={async (seriesId) => {
          if (!confirm("Excluir toda a promoção do clube (todas as parcelas)?")) return;
          try {
            for (const item of earnings.filter((x) => getSeriesId(x.note) === seriesId)) {
              await deleteEarning(item.id);
            }
            setDetailsSid(null);
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Não foi possível excluir a promoção.");
          }
        }}
      />
    </div>
  );
}

function ClubeDetailsDialog({ sid, onClose, onEdit, onDeleteSeries }: { sid: string | null; onClose: () => void; onEdit: (anchorId: string) => void; onDeleteSeries: (sid: string) => void }) {
  const { programs, earnings } = useMilhasData();
  if (!sid) return null;
  const seriesAll = earnings.filter((x) => getSeriesId(x.note) === sid).sort((a, b) => a.month.localeCompare(b.month));
  if (seriesAll.length === 0) return null;
  const anchor = seriesAll[0];
  const parsed = parseClubeNote(anchor.note);
  const program = programs.find((p) => p.id === anchor.programId);
  const anchorIds = new Set(seriesAll.map((s) => s.id));
  const bonusCredits = earnings.filter((x) => {
    const m = (x.note ?? "").match(/\[BONUS-CLUBE:([^\]]+)\]/);
    return m && anchorIds.has(m[1]);
  });
  const bonusCredited = bonusCredits.reduce((s, x) => s + x.points, 0);
  const bonusRemaining = Math.max(0, parsed.bonusExpected - bonusCredited);
  const totalBasePlanned = seriesAll.reduce((s, x) => s + x.points, 0);
  const basePaid = seriesAll.filter((x) => !(x.note ?? "").includes("[PENDING]")).reduce((s, x) => s + x.points, 0);
  const basePending = totalBasePlanned - basePaid;
  const totalCost = seriesAll.reduce((s, x) => s + (x.cost ?? 0), 0);
  const totalPlanned = totalBasePlanned + parsed.bonusExpected;

  return (
    <Dialog open={!!sid} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="w-2 h-6" style={{ background: brandColor(program?.name, program?.color ?? "#999") }} />
            {program?.name ?? "—"}
            {parsed.promoName && <span className="text-sm text-muted-foreground font-normal">• {parsed.promoName}</span>}
          </DialogTitle>
          <DialogDescription>
            {CLUBE_PLAN_LABEL[parsed.plan]} • {seriesAll.length}x • início {parsed.dueDate ? fmtISO(parsed.dueDate) : "—"}
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
          <div className="bg-muted/40 rounded-lg p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total previsto</p><p className="text-lg font-semibold tabular-nums">{numM(totalPlanned)}</p></div>
          <div className="bg-muted/40 rounded-lg p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Já creditado</p><p className="text-lg font-semibold tabular-nums text-gold">{numM(basePaid + bonusCredited)}</p></div>
          <div className="bg-muted/40 rounded-lg p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Falta creditar</p><p className="text-lg font-semibold tabular-nums">{numM(basePending + bonusRemaining)}</p></div>
          <div className="bg-muted/40 rounded-lg p-3"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Custo</p><p className="text-lg font-semibold tabular-nums">{brlM(totalCost)}</p></div>
        </div>

        {totalPlanned > 0 && totalCost > 0 && (
          <p className="text-xs text-muted-foreground">Custo do milheiro: <span className="text-gold font-semibold">{brlM((totalCost / totalPlanned) * 1000)} /1k</span></p>
        )}

        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Parcelas mensais</p>
          <div className="border border-border rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/40">
                <tr className="text-left text-muted-foreground">
                  <th className="px-3 py-2">Mês</th>
                  <th className="px-3 py-2 text-right">Pontos</th>
                  <th className="px-3 py-2 text-right">Custo</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {seriesAll.map((x) => {
                  const pending = (x.note ?? "").includes("[PENDING]");
                  const due = (x.note ?? "").match(/\[DUE:(\d{4}-\d{2}-\d{2})\]/)?.[1];
                  return (
                    <tr key={x.id} className="border-t border-border">
                      <td className="px-3 py-2 capitalize">{formatMonth(x.month)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{numM(x.points)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">{x.cost != null ? brlM(x.cost) : "—"}</td>
                      <td className="px-3 py-2">{pending ? <span className="text-muted-foreground">Aguardando {due ? fmtISO(due) : ""}</span> : <span className="text-gold">Creditado</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {parsed.bonusExpected > 0 && (
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Bônus</p>
            <div className="bg-muted/40 rounded-lg p-3 text-xs space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Previsto:</span><span className="tabular-nums">{numM(parsed.bonusExpected)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Creditado:</span><span className="tabular-nums">{numM(bonusCredited)}</span></div>
              <div className="flex justify-between font-semibold"><span>Falta:</span><span className="tabular-nums text-gold">{numM(bonusRemaining)}</span></div>
            </div>
            {bonusCredits.length > 0 && (
              <ul className="mt-2 text-[11px] text-muted-foreground space-y-0.5">
                {bonusCredits.map((c) => (
                  <li key={c.id} className="flex justify-between"><span>{formatMonth(c.month)}</span><span className="tabular-nums">+{numM(c.points)}</span></li>
                ))}
              </ul>
            )}
          </div>
        )}

        <DialogFooter className="flex justify-end gap-2">
          <button onClick={() => onDeleteSeries(sid)} className="px-4 py-2 text-sm text-destructive hover:bg-destructive/10 rounded-md">Excluir</button>
          <button onClick={() => onEdit(anchor.id)} className="bg-gold text-navy px-5 py-2 text-sm font-semibold rounded-md">Editar</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
