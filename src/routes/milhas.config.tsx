import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMilhasData } from "@/context/MilhasDataContext";
import { CATEGORY_LABEL, ProgramCategory, brlM, numM } from "@/lib/milhas-storage";
import { Banknote, Plus, Wallet, Trash2 } from "lucide-react";
import { BankIcon } from "@/components/BankIcon";
import { brandColor } from "@/lib/banks";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/milhas/config")({
  component: SettingsPage,
  head: () => ({ meta: [{ title: "Configurações — CRM Milhas" }] }),
});

const emptyForm = { name: "", category: "fidelidade" as ProgramCategory, balance: 0, valuePerThousand: 30 };

function SettingsPage() {
  const { programs, addProgram, updateProgram, deleteProgram } = useMilhasData();
  const fidelidade = programs.filter((p) => p.category === "fidelidade");
  const milhagem = programs.filter((p) => p.category === "milhagem");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [savingId, setSavingId] = useState<string | null>(null);

  const walletTotals = useMemo(() => {
    const points = programs.reduce((sum, program) => sum + program.balance, 0);
    const value = programs.reduce((sum, program) => sum + (program.balance / 1000) * program.valuePerThousand, 0);
    return { points, value };
  }, [programs]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    try {
      await addProgram(form);
      setForm(emptyForm);
      setShowForm(false);
      toast.success("Programa adicionado à carteira.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível adicionar o programa.");
    }
  };

  const patchProgram = async (id: string, patch: Parameters<typeof updateProgram>[1]) => {
    setSavingId(id);
    try {
      await updateProgram(id, patch);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível atualizar a carteira.");
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="max-w-6xl space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1"><Wallet className="w-4 h-4 text-gold" /><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Carteira total</p></div>
          <p className="font-[var(--font-display)] text-2xl tabular-nums">{numM(walletTotals.points)} <span className="text-xs text-muted-foreground">pts</span></p>
        </div>
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1"><Banknote className="w-4 h-4 text-gold" /><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Valor estimado</p></div>
          <p className="font-[var(--font-display)] text-2xl text-gold tabular-nums">{brlM(walletTotals.value)}</p>
        </div>
      </div>

      <div className="tech-panel p-6">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h3 className="font-[var(--font-display)] text-lg">Carteira dos programas</h3>
            <p className="text-sm text-muted-foreground">Saldo (vinculado aos registros), valor por milheiro e patrimônio estimado.</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex shrink-0 items-center justify-center gap-2 bg-primary text-primary-foreground hover:bg-primary/90 rounded-full px-4 py-2 text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> Novo programa
          </button>
        </div>

        <div className="space-y-5">
          {[{ label: CATEGORY_LABEL.fidelidade, list: fidelidade }, { label: CATEGORY_LABEL.milhagem, list: milhagem }].map((g) => g.list.length > 0 && (
            <div key={g.label}>
              <p className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{g.label}</p>
              <div className="border border-border rounded-xl overflow-hidden divide-y divide-border">
                <div className="hidden md:grid grid-cols-[minmax(0,1fr)_120px_120px_140px_40px] gap-3 px-4 py-2 bg-muted/30 text-[10px] uppercase tracking-wider text-muted-foreground">
                  <span>Programa</span>
                  <span className="text-right">Pontos</span>
                  <span className="text-right">R$ / 1k</span>
                  <span className="text-right">Patrimônio</span>
                  <span />
                </div>
                {g.list.map((p) => (
                  <div key={p.id} className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_120px_120px_140px_40px] gap-3 px-4 py-3 items-center bg-card/40 hover:bg-card/70 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-1 h-8 rounded-sm shrink-0" style={{ background: brandColor(p.name, p.color) }} />
                      <BankIcon bank={p.name} size={26} square />
                      <p className="text-sm font-medium truncate">{p.name}</p>
                    </div>
                    <p className="text-sm tabular-nums text-right text-muted-foreground">{numM(p.balance)}</p>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={p.valuePerThousand}
                      onChange={(e) => patchProgram(p.id, { valuePerThousand: Number(e.target.value) })}
                      disabled={savingId === p.id}
                      className="w-full border border-border px-2 py-1.5 text-sm bg-background rounded-md tabular-nums text-right disabled:opacity-60"
                    />
                    <p className="text-sm font-semibold text-gold tabular-nums text-right">{brlM((p.balance / 1000) * p.valuePerThousand)}</p>
                    <button
                      onClick={() => { if (confirm(`Excluir ${p.name}?`)) deleteProgram(p.id); }}
                      className="p-1.5 text-muted-foreground hover:text-destructive rounded justify-self-end"
                      aria-label={`Excluir ${p.name}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {programs.length === 0 && (
            <button
              onClick={() => setShowForm(true)}
              className="w-full flex items-center justify-center gap-2 border-2 border-dashed border-border hover:border-gold hover:bg-gold/5 text-muted-foreground hover:text-foreground rounded-lg py-8 text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" /> Criar primeira carteira
            </button>
          )}
        </div>
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo programa</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Nome</label>
              <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Livelo" className="w-full border border-border px-3 py-2 text-sm bg-background rounded-md" required autoFocus />
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">Categoria</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ProgramCategory })} className="w-full border border-border px-3 py-2 text-sm bg-background rounded-md">
                <option value="fidelidade">Fidelidade</option>
                <option value="milhagem">Milhagem</option>
              </select>
            </div>
            <div>
              <label className="text-xs uppercase tracking-wider text-muted-foreground mb-1 block">R$ / 1.000 pts</label>
              <input type="number" step="0.01" value={form.valuePerThousand} onChange={(e) => setForm({ ...form, valuePerThousand: Number(e.target.value) })} className="w-full border border-border px-3 py-2 text-sm bg-background rounded-md" min={0} />
            </div>
            <DialogFooter className="md:col-span-2">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-muted-foreground">Cancelar</button>
              <button type="submit" className="bg-gold text-navy px-5 py-2 text-sm font-semibold hover:bg-gold-light rounded-md">Adicionar</button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
