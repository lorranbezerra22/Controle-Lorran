import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { RegistrosPage as GanhosTransfPage, parseClubeNote } from "./milhas.ganhos";
import { ResgatesPage } from "./milhas.resgates";
import { useMilhasData } from "@/context/MilhasDataContext";
import { numM } from "@/lib/milhas-storage";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Gift } from "lucide-react";

export const Route = createFileRoute("/milhas/registros")({
  component: RegistrosUnificado,
  head: () => ({ meta: [{ title: "Registros — CRM Milhas" }] }),
});

type Tab = "movimentos" | "resgates";

function RegistrosUnificado() {
  const [tab, setTab] = useState<Tab>("movimentos");

  const tabs: { key: Tab; label: string }[] = [
    { key: "movimentos", label: "Ganhos & Transferências" },
    { key: "resgates", label: "Resgates" },
  ];

  return (
    <div className="space-y-6">
      <BonusPendenteAlert />

      <div className="inline-flex gap-2 flex-wrap">
        {tabs.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-5 py-2 text-sm border rounded-lg transition-colors ${
                active
                  ? "border-primary bg-primary/10 ring-1 ring-primary/40 font-medium text-foreground"
                  : "bg-card border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "movimentos" && <GanhosTransfPage />}
      {tab === "resgates" && <ResgatesPage />}
    </div>
  );
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function BonusPendenteAlert() {
  const { earnings, programs, addEarning } = useMilhasData();
  const [creditingId, setCreditingId] = useState<string | null>(null);
  const [amount, setAmount] = useState(0);
  const [creditDate, setCreditDate] = useState(todayISO());

  const creditedByClub = new Map<string, number>();
  for (const e of earnings) {
    const m = (e.note ?? "").match(/\[BONUS-CLUBE:([^\]]+)\]/);
    if (m) creditedByClub.set(m[1], (creditedByClub.get(m[1]) ?? 0) + e.points);
  }

  const pending = earnings
    .filter((e) => e.source === "clube" && !(e.note ?? "").includes("[BONUS-CLUBE:") && !(e.note ?? "").includes("[PENDING]"))
    .map((e) => {
      const p = parseClubeNote(e.note);
      const credited = creditedByClub.get(e.id) ?? 0;
      const remaining = Math.max(0, p.bonusExpected - credited);
      const program = programs.find((pr) => pr.id === e.programId);
      return { e, parsed: p, credited, remaining, program };
    })
    .filter((x) => x.remaining > 0);

  if (pending.length === 0) return null;

  const current = creditingId ? pending.find((x) => x.e.id === creditingId) : null;

  const confirmCredit = async () => {
    if (!current || amount <= 0) return;
    const applied = Math.min(amount, current.remaining);
    const month = creditDate.slice(0, 7);
    await addEarning({
      programId: current.e.programId,
      month,
      points: applied,
      source: "clube",
      note: `[BONUS-CLUBE:${current.e.id}] Bônus clube${current.parsed.promoName ? ` — ${current.parsed.promoName}` : ""}`,
    });
    setCreditingId(null);
    setAmount(0);
  };

  return (
    <div className="rounded-xl border border-gold/40 bg-gold/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Gift className="w-4 h-4 text-gold" />
        <h3 className="text-sm font-semibold">Bônus de clube pendentes</h3>
      </div>
      <div className="space-y-2">
        {pending.map(({ e, parsed, credited, remaining, program }) => (
          <div key={e.id} className="flex flex-wrap items-center justify-between gap-3 bg-card border border-border rounded-lg px-3 py-2 text-sm">
            <div className="flex flex-col">
              <span className="font-medium">
                {program?.name ?? "—"}
                {parsed.promoName ? <span className="text-muted-foreground"> • {parsed.promoName}</span> : null}
              </span>
              <span className="text-xs text-muted-foreground">
                Previsto {numM(parsed.bonusExpected)} • Creditado {numM(credited)} • <span className="text-gold">Falta {numM(remaining)}</span>
              </span>
            </div>
            <button
              onClick={() => { setCreditingId(e.id); setAmount(0); setCreditDate(todayISO()); }}
              className="bg-gold text-navy px-3 py-1.5 text-xs font-semibold rounded-md"
            >
              Creditar bônus
            </button>
          </div>
        ))}
      </div>

      <Dialog open={!!creditingId} onOpenChange={(o) => !o && setCreditingId(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Creditar bônus do clube</DialogTitle>
            <DialogDescription>
              {current ? `${current.program?.name ?? ""} — falta ${numM(current.remaining)} pts.` : ""}
            </DialogDescription>
          </DialogHeader>
          {current && (
            <div className="space-y-3">
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Pontos creditados agora</label>
                <input
                  type="number"
                  value={amount || ""}
                  onChange={(ev) => setAmount(Number(ev.target.value))}
                  max={current.remaining}
                  min={1}
                  className="w-full border border-border px-3 py-2 text-sm bg-background rounded-md"
                  placeholder="0"
                  autoFocus
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Programa fixo: <span className="text-foreground">{current.program?.name ?? "—"}</span>
                </p>
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Data</label>
                <input
                  type="date"
                  value={creditDate}
                  onChange={(ev) => setCreditDate(ev.target.value)}
                  className="w-full border border-border px-3 py-2 text-sm bg-background rounded-md"
                />
              </div>
              {amount > 0 && (
                <div className="text-xs bg-muted/40 rounded-md p-2">
                  Vai sobrar <span className="text-gold font-semibold tabular-nums">{numM(Math.max(0, current.remaining - amount))}</span> pts pendentes.
                </div>
              )}
              <div className="flex justify-end gap-2">
                <button onClick={() => setCreditingId(null)} className="px-4 py-2 text-sm text-muted-foreground">Cancelar</button>
                <button onClick={confirmCredit} disabled={amount <= 0} className="bg-gold text-navy px-5 py-2 text-sm font-semibold rounded-md disabled:opacity-40">Creditar</button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
