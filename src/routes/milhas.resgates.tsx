import { createFileRoute } from "@tanstack/react-router";
import { DatePicker, MonthPicker } from "@/components/date-picker";
import { useMemo, useState } from "react";
import { useMilhasData } from "@/context/MilhasDataContext";
import { RedemptionType, REDEMPTION_LABEL, brlM, numM } from "@/lib/milhas-storage";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { Plus, Trash2, Plane, Banknote, Upload, ImageIcon, TrendingUp } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { brandColor } from "@/lib/banks";
import { toast } from "sonner";

export const Route = createFileRoute("/milhas/resgates")({
  component: ResgatesPage,
  head: () => ({ meta: [{ title: "Resgates — CRM Milhas" }] }),
});

const todayISO = () => new Date().toISOString().slice(0, 10);

export function ResgatesPage() {
  const { programs, redemptions, addRedemption, deleteRedemption } = useMilhasData();
  const { session } = useSession();
  const [showForm, setShowForm] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [form, setForm] = useState({
    programId: programs[0]?.id ?? "",
    points: 0,
    type: "viagem" as RedemptionType,
    cashValue: 0,
    cashEquivalent: 0,
    taxes: 0,
    screenshotUrl: "",
    destination: "",
    travelDate: todayISO(),
    date: todayISO(),
    note: "",
  });

  const selectedProgram = programs.find((p) => p.id === form.programId);
  const milesCost = selectedProgram ? (form.points / 1000) * selectedProgram.valuePerThousand : 0;
  const totalCost = milesCost + (form.taxes || 0);
  const economy = (form.cashEquivalent || 0) - totalCost;

  const handleUpload = async (file: File) => {
    if (!session?.user?.id) return;
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${session.user.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("milhas-prints").upload(path, file, { upsert: false });
      if (error) throw error;
      const { data } = await supabase.storage.from("milhas-prints").createSignedUrl(path, 60 * 60 * 24 * 365 * 5);
      const url = data?.signedUrl ?? path;
      setForm((f) => ({ ...f, screenshotUrl: url }));
      setPreview(url);
    } catch (err) {
      alert("Falha ao enviar imagem: " + (err as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.programId || form.points <= 0) return;
    if (!form.cashEquivalent || form.cashEquivalent <= 0) {
      toast.error("Informe o preço em dinheiro equivalente (base da comparação).");
      return;
    }
    try {
      await addRedemption({
        programId: form.programId,
        points: form.points,
        type: form.type,
        cashValue: form.type === "dinheiro" ? form.cashValue : undefined,
        cashEquivalent: form.cashEquivalent,
        taxes: form.taxes || undefined,
        milesCost,
        screenshotUrl: form.screenshotUrl || undefined,
        destination: form.type === "viagem" ? form.destination || undefined : undefined,
        travelDate: form.type === "viagem" ? form.travelDate : undefined,
        date: form.date,
        note: form.note || undefined,
      });
      setForm({ ...form, points: 0, cashValue: 0, cashEquivalent: 0, taxes: 0, screenshotUrl: "", destination: "", note: "" });
      setPreview(null);
      setShowForm(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível registrar o resgate.");
    }
  };

  const enriched = useMemo(
    () =>
      redemptions.map((r) => {
        const p = programs.find((pr) => pr.id === r.programId);
        const totalCostR = (r.milesCost ?? 0) + (r.taxes ?? 0);
        const econ = (r.cashEquivalent ?? 0) - totalCostR;
        return { ...r, programName: p?.name ?? "—", programColor: brandColor(p?.name, p?.color ?? "#999"), totalCostR, econ };
      }),
    [redemptions, programs]
  );

  const totals = useMemo(() => {
    const viagens = redemptions.filter((r) => r.type === "viagem").length;
    const pontosResgatados = redemptions.reduce((s, r) => s + r.points, 0);
    const dinheiro = redemptions.filter((r) => r.type === "dinheiro").reduce((s, r) => s + (r.cashValue ?? 0), 0);
    const economia = redemptions.reduce((s, r) => s + ((r.cashEquivalent ?? 0) - ((r.milesCost ?? 0) + (r.taxes ?? 0))), 0);
    return { viagens, pontosResgatados, dinheiro, economia };
  }, [redemptions]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-card border border-border p-5 rounded-xl">
          <div className="flex items-center gap-2 mb-1"><Plane className="w-4 h-4 text-gold" /><p className="text-xs uppercase tracking-wider text-muted-foreground">Viagens realizadas</p></div>
          <p className="font-[var(--font-display)] text-2xl">{totals.viagens}</p>
        </div>
        <div className="bg-card border border-border p-5 rounded-xl">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Pontos resgatados</p>
          <p className="font-[var(--font-display)] text-2xl tabular-nums">{numM(totals.pontosResgatados)}</p>
        </div>
        <div className="bg-card border border-border p-5 rounded-xl">
          <div className="flex items-center gap-2 mb-1"><Banknote className="w-4 h-4 text-gold" /><p className="text-xs uppercase tracking-wider text-muted-foreground">Convertido em dinheiro</p></div>
          <p className="font-[var(--font-display)] text-2xl text-gold tabular-nums">{brlM(totals.dinheiro)}</p>
        </div>
        <div className="bg-card border border-border p-5 rounded-xl">
          <div className="flex items-center gap-2 mb-1"><TrendingUp className="w-4 h-4 text-gold" /><p className="text-xs uppercase tracking-wider text-muted-foreground">Economia total</p></div>
          <p className={`font-[var(--font-display)] text-2xl tabular-nums ${totals.economia >= 0 ? "text-gold" : "text-destructive"}`}>{brlM(totals.economia)}</p>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <p className="text-sm text-muted-foreground max-w-xl">Registre resgates com o preço em dinheiro equivalente e um print da tela para calcular a economia real.</p>
        <button onClick={() => setShowForm(true)} disabled={programs.length === 0} className="inline-flex items-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 text-sm font-medium rounded-full shadow-md transition-colors disabled:opacity-40">
          <Plus className="w-4 h-4" /> Novo Resgate
        </button>
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo Resgate</DialogTitle>
            <DialogDescription>Registre pontos usados em viagem ou dinheiro.</DialogDescription>
          </DialogHeader>

      <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div className="md:col-span-2">
            <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Programa</label>
            <select value={form.programId} onChange={(e) => setForm({ ...form, programId: e.target.value })} className="w-full border border-border px-3 py-2 text-sm bg-background rounded-md" required>
              {programs.map((p) => <option key={p.id} value={p.id}>{p.name} ({numM(p.balance)} pts)</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Pontos</label>
            <input type="number" value={form.points || ""} onChange={(e) => setForm({ ...form, points: Number(e.target.value) })} className="w-full border border-border px-3 py-2 text-sm bg-background rounded-md" min={1} required />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Tipo</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as RedemptionType })} className="w-full border border-border px-3 py-2 text-sm bg-background rounded-md">
              <option value="viagem">Viagem</option>
              <option value="dinheiro">Dinheiro</option>
            </select>
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Data</label>
            <DatePicker value={form.date} onChange={(v) => setForm({ ...form, date: v })} />
          </div>

          <div className="md:col-span-2">
            <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Preço em dinheiro (comparação) *</label>
            <input type="number" step="0.01" value={form.cashEquivalent || ""} onChange={(e) => setForm({ ...form, cashEquivalent: Number(e.target.value) })} className="w-full border border-border px-3 py-2 text-sm bg-background rounded-md" min={0} required placeholder="Ex.: 1890.00" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Taxas (R$)</label>
            <input type="number" step="0.01" value={form.taxes || ""} onChange={(e) => setForm({ ...form, taxes: Number(e.target.value) })} className="w-full border border-border px-3 py-2 text-sm bg-background rounded-md" min={0} />
          </div>

          {form.type === "dinheiro" ? (
            <div className="md:col-span-3">
              <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Valor recebido (R$)</label>
              <input type="number" step="0.01" value={form.cashValue || ""} onChange={(e) => setForm({ ...form, cashValue: Number(e.target.value) })} className="w-full border border-border px-3 py-2 text-sm bg-background rounded-md" min={0} />
            </div>
          ) : (
            <>
              <div className="md:col-span-2">
                <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Destino</label>
                <input type="text" value={form.destination} onChange={(e) => setForm({ ...form, destination: e.target.value })} className="w-full border border-border px-3 py-2 text-sm bg-background rounded-md" placeholder="Ex.: GRU-FOR" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Data da viagem</label>
                <DatePicker value={form.travelDate} onChange={(v) => setForm({ ...form, travelDate: v })} />
              </div>
            </>
          )}

          <div className="md:col-span-6">
            <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Print da tela (opcional)</label>
            <div className="flex items-center gap-3 flex-wrap">
              <label className="inline-flex items-center gap-2 border border-border px-3 py-2 text-sm rounded-md cursor-pointer hover:bg-muted">
                <Upload className="w-4 h-4" /> {uploading ? "Enviando..." : "Enviar imagem"}
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); }} disabled={uploading} />
              </label>
              {preview && (
                <a href={preview} target="_blank" rel="noreferrer" className="text-xs text-gold underline flex items-center gap-1"><ImageIcon className="w-3 h-3" /> Ver print</a>
              )}
            </div>
          </div>

          <div className="md:col-span-6 grid grid-cols-2 md:grid-cols-4 gap-3 p-4 bg-muted/30 border border-border rounded-md">
            <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Custo das milhas</p><p className="text-sm font-semibold tabular-nums">{brlM(milesCost)}</p></div>
            <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Taxas</p><p className="text-sm font-semibold tabular-nums">{brlM(form.taxes || 0)}</p></div>
            <div><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Preço em dinheiro</p><p className="text-sm font-semibold tabular-nums">{brlM(form.cashEquivalent || 0)}</p></div>
            <div><p className="text-[10px] uppercase tracking-wider text-gold">Economia</p><p className={`text-sm font-semibold tabular-nums ${economy >= 0 ? "text-gold" : "text-destructive"}`}>{brlM(economy)}</p></div>
          </div>

          <div className="md:col-span-6">
            <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Observação</label>
            <input type="text" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} className="w-full border border-border px-3 py-2 text-sm bg-background rounded-md" />
          </div>
          <div className="md:col-span-6 flex justify-end gap-2">
            <button type="button" onClick={() => setShowForm(false)} className="px-5 py-2 text-sm text-muted-foreground">Cancelar</button>
            <button type="submit" className="bg-gold text-navy px-6 py-2 text-sm font-semibold rounded-md">Registrar</button>
          </div>
        </form>
        </DialogContent>
      </Dialog>

      <div className="bg-card border border-border overflow-x-auto rounded-xl">
        {enriched.length === 0 ? (
          <div className="p-16 text-center text-sm text-muted-foreground">Nenhum resgate registrado.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr className="text-left">
                {["Programa", "Data", "Tipo", "Pontos", "Custo Milhas", "Preço $", "Economia", "Print", "Obs", ""].map((h, i) => (
                  <th key={i} className="px-4 py-3 text-xs uppercase tracking-wider text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {enriched.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-3"><div className="flex items-center gap-2"><span className="w-2 h-6" style={{ background: r.programColor }} /><span className="font-medium">{r.programName}</span></div></td>
                  <td className="px-4 py-3 text-muted-foreground">{new Date(r.date).toLocaleDateString("pt-BR")}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 text-[11px] uppercase tracking-wider border rounded ${r.type === "viagem" ? "border-gold text-gold" : "border-border text-muted-foreground"}`}>
                      {REDEMPTION_LABEL[r.type]}
                    </span>
                    {r.type === "viagem" && r.destination && <div className="text-[11px] text-muted-foreground mt-1">{r.destination}</div>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{numM(r.points)}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{brlM(r.totalCostR)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{brlM(r.cashEquivalent ?? 0)}</td>
                  <td className={`px-4 py-3 text-right tabular-nums font-semibold ${r.econ >= 0 ? "text-gold" : "text-destructive"}`}>{brlM(r.econ)}</td>
                  <td className="px-4 py-3">
                    {r.screenshotUrl ? (
                      <a href={r.screenshotUrl} target="_blank" rel="noreferrer" className="text-gold hover:underline"><ImageIcon className="w-4 h-4" /></a>
                    ) : <span className="text-muted-foreground text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs max-w-[160px] truncate">{r.note || "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => { if (confirm("Excluir resgate? Os pontos voltam ao saldo.")) deleteRedemption(r.id); }} className="text-muted-foreground hover:text-destructive p-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
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
