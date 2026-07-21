import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMilhasData } from "@/context/MilhasDataContext";
import { brlM, numM, Program, CATEGORY_LABEL, ProgramCategory } from "@/lib/milhas-storage";
import { Trash2, Edit2, X, Check } from "lucide-react";
import { BankIcon } from "@/components/BankIcon";
import { brandColor } from "@/lib/banks";

export const Route = createFileRoute("/milhas/programas")({
  component: ProgramsPage,
  head: () => ({ meta: [{ title: "Programas — CRM Milhas" }] }),
});


export function ProgramsPage() {
  const { programs, updateProgram, deleteProgram } = useMilhasData();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<Program>>({});

  const saveEdit = () => {
    if (editingId) { updateProgram(editingId, editForm); setEditingId(null); setEditForm({}); }
  };

  const renderCard = (p: Program) => {
    const isEditing = editingId === p.id;
    const color = brandColor(p.name, p.color);
    return (
      <div key={p.id} className="bg-card border border-border p-6 relative group rounded-xl overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full" style={{ background: color }} />
        {isEditing ? (
          <div className="space-y-3">
            <input value={editForm.name ?? ""} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="w-full border border-border px-2 py-1 text-sm rounded-md bg-background" />
            <div className="grid grid-cols-1 gap-2">
              <div>
                <label className="text-[10px] uppercase text-muted-foreground">Saldo</label>
                <input type="number" value={editForm.balance ?? 0} onChange={(e) => setEditForm({ ...editForm, balance: Number(e.target.value) })} className="w-full border border-border px-2 py-1 text-sm rounded-md bg-background" />
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={saveEdit} className="flex-1 bg-gold text-navy py-1.5 text-xs font-semibold flex items-center justify-center gap-1 rounded-md"><Check className="w-3 h-3" /> Salvar</button>
              <button onClick={() => setEditingId(null)} className="px-3 py-1.5 border border-border text-xs rounded-md"><X className="w-3 h-3" /></button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3 min-w-0">
                <BankIcon bank={p.name} size={34} square />
                <div className="min-w-0">
                  <h3 className="font-[var(--font-display)] text-xl truncate">{p.name}</h3>
                <p className="text-xs uppercase tracking-wider text-muted-foreground mt-0.5">{p.category}</p>
                </div>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => { setEditingId(p.id); setEditForm(p); }} className="p-1.5 text-muted-foreground hover:text-gold"><Edit2 className="w-3.5 h-3.5" /></button>
                <button onClick={() => { if (confirm(`Excluir ${p.name}?`)) deleteProgram(p.id); }} className="p-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
            <div className="space-y-3 pt-4 border-t border-border">
              <div className="flex justify-between items-baseline"><span className="text-xs text-muted-foreground">Saldo</span><span className="font-[var(--font-display)] text-2xl tabular-nums">{numM(p.balance)}</span></div>
              <div className="flex justify-between items-baseline pt-3 border-t border-border"><span className="text-xs uppercase tracking-wider text-gold">Patrimônio</span><span className="font-[var(--font-display)] text-xl text-gold tabular-nums">{brlM((p.balance / 1000) * p.valuePerThousand)}</span></div>
            </div>
          </>
        )}
      </div>
    );
  };

  const groups: { key: ProgramCategory; list: Program[] }[] = [
    { key: "fidelidade", list: programs.filter((p) => p.category === "fidelidade") },
    { key: "milhagem", list: programs.filter((p) => p.category === "milhagem") },
  ];

  return (
    <div className="space-y-8">
      {groups.map((g) => g.list.length > 0 && (
        <section key={g.key} className="space-y-3">
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground">{CATEGORY_LABEL[g.key]}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {g.list.map(renderCard)}
          </div>
        </section>
      ))}

      {programs.length === 0 && (
        <div className="bg-card border border-border p-16 text-center rounded-xl">
          <p className="text-muted-foreground text-sm">Nenhum programa. Cadastre em <Link to="/milhas/config" className="text-gold underline">Configurações</Link>.</p>
        </div>
      )}
    </div>
  );
}

