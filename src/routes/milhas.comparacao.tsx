import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMilhasData } from "@/context/MilhasDataContext";
import { brlM, numM } from "@/lib/milhas-storage";
import { ArrowRight, TrendingUp, TrendingDown } from "lucide-react";
import { brandColor } from "@/lib/banks";

export const Route = createFileRoute("/milhas/comparacao")({
  component: ComparisonPage,
  head: () => ({ meta: [{ title: "Comparação — CRM Milhas" }] }),
});

function ComparisonPage() {
  const { programs } = useMilhasData();
  const fidelidade = programs.filter((p) => p.category === "fidelidade");
  const milhagem = programs.filter((p) => p.category === "milhagem");
  const [fromId, setFromId] = useState<string>(fidelidade[0]?.id ?? "");
  const [toId, setToId] = useState<string>(milhagem[0]?.id ?? "");
  const [points, setPoints] = useState<number>(10000);
  const [bonusPercent, setBonusPercent] = useState<number>(100);

  const result = useMemo(() => {
    const from = programs.find((p) => p.id === fromId);
    const to = programs.find((p) => p.id === toId);
    if (!from || !to) return null;
    const keepValue = (points / 1000) * from.valuePerThousand;
    const received = Math.round(points * (1 + bonusPercent / 100));
    const transferValue = (received / 1000) * to.valuePerThousand;
    const diff = transferValue - keepValue;
    const diffPct = keepValue > 0 ? (diff / keepValue) * 100 : 0;
    return { from, to, keepValue, received, transferValue, diff, diffPct, effectivePerThousand: points > 0 ? (transferValue / points) * 1000 : 0 };
  }, [programs, fromId, toId, points, bonusPercent]);

  const matrix = useMemo(() => fidelidade.map((f) => ({
    from: f,
    rows: milhagem.map((m) => {
      const keep = (points / 1000) * f.valuePerThousand;
      const received = Math.round(points * (1 + bonusPercent / 100));
      const transfer = (received / 1000) * m.valuePerThousand;
      return { to: m, keep, transfer, diff: transfer - keep, worth: transfer > keep };
    }),
  })), [fidelidade, milhagem, points, bonusPercent]);

  return (
    <div className="space-y-6">


      <div className="bg-card border border-gold p-6 space-y-5 rounded-xl">
        <h2 className="font-[var(--font-display)] text-lg">Simulador</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div><label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Fidelidade</label>
            <select value={fromId} onChange={(e) => setFromId(e.target.value)} className="w-full border border-border px-3 py-2 text-sm bg-background rounded-md">
              {fidelidade.length === 0 && <option value="">— cadastre —</option>}
              {fidelidade.map((p) => <option key={p.id} value={p.id}>{p.name} — {brlM(p.valuePerThousand)}/1k</option>)}
            </select>
          </div>
          <div><label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Milhagem</label>
            <select value={toId} onChange={(e) => setToId(e.target.value)} className="w-full border border-border px-3 py-2 text-sm bg-background rounded-md">
              {milhagem.length === 0 && <option value="">— cadastre —</option>}
              {milhagem.map((p) => <option key={p.id} value={p.id}>{p.name} — {brlM(p.valuePerThousand)}/1k</option>)}
            </select>
          </div>
          <div><label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Pontos</label><input type="number" value={points || ""} onChange={(e) => setPoints(Number(e.target.value))} className="w-full border border-border px-3 py-2 text-sm bg-background rounded-md" min={0} /></div>
          <div><label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Bônus (%)</label><input type="number" value={bonusPercent} onChange={(e) => setBonusPercent(Number(e.target.value))} className="w-full border border-border px-3 py-2 text-sm bg-background rounded-md" min={0} /></div>
        </div>

        {result && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
            <div className="border border-border p-4 rounded-md"><p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Manter na {result.from.name}</p><p className="font-[var(--font-display)] text-2xl">{brlM(result.keepValue)}</p><p className="text-xs text-muted-foreground mt-1">{numM(points)} pts</p></div>
            <div className="border border-border p-4 bg-muted/40 rounded-md"><p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">Transferir p/ {result.to.name} <ArrowRight className="w-3 h-3 text-gold" /></p><p className="font-[var(--font-display)] text-2xl text-gold">{brlM(result.transferValue)}</p><p className="text-xs text-muted-foreground mt-1">{numM(result.received)} pts (+{bonusPercent}%)</p><p className="text-[11px] text-muted-foreground mt-1">Efetivo: {brlM(result.effectivePerThousand)} /1k enviados</p></div>
            <div className={`border p-4 rounded-md ${result.diff >= 0 ? "border-gold bg-gold/5" : "border-destructive/40 bg-destructive/5"}`}>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2 flex items-center gap-2">Diferença {result.diff >= 0 ? <TrendingUp className="w-3 h-3 text-gold" /> : <TrendingDown className="w-3 h-3 text-destructive" />}</p>
              <p className={`font-[var(--font-display)] text-2xl ${result.diff >= 0 ? "text-gold" : "text-destructive"}`}>{result.diff >= 0 ? "+" : ""}{brlM(result.diff)}</p>
              <p className="text-xs text-muted-foreground mt-1">{result.diffPct >= 0 ? "+" : ""}{result.diffPct.toFixed(1)}% — {result.diff >= 0 ? "vale transferir" : "melhor manter"}</p>
            </div>
          </div>
        )}
      </div>

      {fidelidade.length > 0 && milhagem.length > 0 && (
        <div className="bg-card border border-border rounded-xl overflow-x-auto">
          <div className="px-6 py-4 border-b border-border">
            <h3 className="font-[var(--font-display)] text-lg">Matriz de comparação</h3>
            <p className="text-xs text-muted-foreground">{numM(points)} pts com bônus de +{bonusPercent}%</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/40"><tr>{["Fidelidade → Milhagem","Manter","Transferir","Ganho"].map((h,i) => <th key={i} className={`px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground ${i===0?"text-left":"text-right"}`}>{h}</th>)}</tr></thead>
            <tbody>
              {matrix.flatMap((g) => g.rows.map((r) => (
                <tr key={`${g.from.id}-${r.to.id}`} className="border-t border-border">
                  <td className="px-4 py-3"><div className="flex items-center gap-2"><span className="w-2 h-5" style={{ background: brandColor(g.from.name, g.from.color) }} /><span className="font-medium">{g.from.name}</span><ArrowRight className="w-3 h-3 text-muted-foreground" /><span className="w-2 h-5" style={{ background: brandColor(r.to.name, r.to.color) }} /><span className="font-medium">{r.to.name}</span></div></td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{brlM(r.keep)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{brlM(r.transfer)}</td>
                  <td className={`px-4 py-3 text-right tabular-nums font-semibold ${r.worth ? "text-gold" : "text-destructive"}`}>{r.diff >= 0 ? "+" : ""}{brlM(r.diff)}</td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      )}

      {(fidelidade.length === 0 || milhagem.length === 0) && (
        <div className="bg-card border border-border p-10 text-center text-sm text-muted-foreground rounded-xl">Cadastre ao menos 1 de <strong>fidelidade</strong> e 1 de <strong>milhagem</strong>.</div>
      )}
    </div>
  );
}
