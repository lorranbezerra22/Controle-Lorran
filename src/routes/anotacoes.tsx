import { createFileRoute } from "@tanstack/react-router";
import { ProtectedShell } from "@/components/ProtectedShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Pin, PinOff, Save, StickyNote, FileText, Table as TableIcon, Rows, Columns } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { fmtDate } from "@/lib/format";
import { correctText } from "@/components/smart-input";
import { PageHeader } from "@/components/PageHeader";
import Spreadsheet, { Matrix, CellBase } from "react-spreadsheet";

export const Route = createFileRoute("/anotacoes")({
  component: () => <ProtectedShell><AnotacoesPage /></ProtectedShell>,
  head: () => ({ meta: [{ title: "Anotações — Gestão" }] }),
});

type NoteType = "text" | "sheet";
type Note = {
  id: string;
  title: string;
  content: string;
  pinned: boolean;
  updated_at: string;
  created_at: string;
  type: NoteType;
  sheet_data: Matrix<CellBase> | null;
};

function AnotacoesPage() {
  const qc = useQueryClient();
  const { data: notes = [], isLoading } = useQuery<Note[]>({
    queryKey: ["notes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notas")
        .select("*")
        .order("pinned", { ascending: false })
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Note[];
    },
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["notes"] });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = notes.find((n) => n.id === selectedId) ?? null;

  useEffect(() => {
    if (!selectedId && notes.length > 0) setSelectedId(notes[0].id);
  }, [notes, selectedId]);

  const create = async (type: NoteType) => {
    const { data: { user } } = await supabase.auth.getUser();
    const initialSheet: Matrix<CellBase> = type === "sheet"
      ? Array.from({ length: 12 }, () => Array.from({ length: 6 }, () => ({ value: "" })))
      : [];
    const { data, error } = await supabase
      .from("notas")
      .insert({
        user_id: user!.id,
        title: type === "sheet" ? "Nova planilha" : "Nova anotação",
        content: "",
        type,
        sheet_data: type === "sheet" ? initialSheet : null,
      } as any)
      .select()
      .single();
    if (error) return toast.error(error.message);
    setSelectedId(data.id);
    invalidate();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir esta anotação?")) return;
    const { error } = await supabase.from("notas").delete().eq("id", id);
    if (error) return toast.error(error.message);
    if (selectedId === id) setSelectedId(null);
    invalidate();
  };

  const togglePin = async (n: Note) => {
    const { error } = await supabase.from("notas").update({ pinned: !n.pinned }).eq("id", n.id);
    if (error) return toast.error(error.message);
    invalidate();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={StickyNote}
        eyebrow="Workspace"
        title="Anotações"
        subtitle="Bloco de notas e planilhas integradas"
        actions={
          <>
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => create("text")}>
              <FileText className="w-4 h-4 mr-1" /> Nova nota
            </Button>
            <Button size="sm" className="rounded-full shadow-md" onClick={() => create("sheet")}>
              <TableIcon className="w-4 h-4 mr-1" /> Nova planilha
            </Button>
          </>
        }
      />

      <div className="grid md:grid-cols-[280px_1fr] gap-4">
        <aside
          className="tech-panel overflow-hidden"
          style={{ boxShadow: "var(--shadow-elegant)" }}
        >
          {isLoading ? (
            <div className="p-6 text-sm text-muted-foreground text-center">Carregando…</div>
          ) : notes.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">Nenhuma anotação. Crie a primeira.</div>
          ) : (
            <ul className="divide-y divide-border max-h-[70vh] overflow-y-auto">
              {notes.map((n) => {
                const isSheet = n.type === "sheet";
                return (
                  <li key={n.id}>
                    <button
                      onClick={() => setSelectedId(n.id)}
                      className={`w-full text-left p-3 hover:bg-muted/40 transition-colors ${selectedId === n.id ? "bg-primary/10 border-l-2 border-primary" : ""}`}
                    >
                      <div className="flex items-start gap-2">
                        {n.pinned && <Pin className="w-3 h-3 mt-1 text-primary shrink-0" />}
                        <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 ${isSheet ? "bg-emerald-500/15 text-emerald-600" : "bg-primary/15 text-primary"}`}>
                          {isSheet ? <TableIcon className="w-3.5 h-3.5" /> : <FileText className="w-3.5 h-3.5" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{n.title || "Sem título"}</div>
                          <div className="text-xs text-muted-foreground truncate mt-0.5">
                            {isSheet ? "Planilha" : (n.content || "—")}
                          </div>
                          <div className="text-[10px] text-muted-foreground mt-1">{fmtDate(n.updated_at)}</div>
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        <section
          className="tech-panel p-4"
          style={{ boxShadow: "var(--shadow-elegant)" }}
        >
          {selected ? (
            selected.type === "sheet" ? (
              <SheetEditor note={selected} onSaved={invalidate} onPin={() => togglePin(selected)} onDelete={() => remove(selected.id)} />
            ) : (
              <NoteEditor note={selected} onSaved={invalidate} onPin={() => togglePin(selected)} onDelete={() => remove(selected.id)} />
            )
          ) : (
            <div className="text-sm text-muted-foreground text-center py-16">
              Selecione uma anotação ou crie uma nova.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function NoteEditor({ note, onSaved, onPin, onDelete }: { note: Note; onSaved: () => void; onPin: () => void; onDelete: () => void }) {
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setTitle(note.title);
    setContent(note.content);
    setDirty(false);
  }, [note.id]);

  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(async () => {
      setSaving(true);
      const { error } = await supabase
        .from("notas")
        .update({ title, content, updated_at: new Date().toISOString() })
        .eq("id", note.id);
      setSaving(false);
      if (error) toast.error(error.message);
      else { setDirty(false); onSaved(); }
    }, 700);
    return () => clearTimeout(t);
  }, [title, content, dirty, note.id, onSaved]);

  return (
    <div className="space-y-3">
      <EditorToolbar title={title} onTitleChange={(v) => { setTitle(v); setDirty(true); }} pinned={note.pinned} onPin={onPin} onDelete={onDelete} />
      <Textarea
        value={content}
        onChange={(e) => { setContent(e.target.value); setDirty(true); }}
        onDoubleClick={async (e) => {
          const ta = e.currentTarget;
          const start = ta.selectionStart;
          const end = ta.selectionEnd;
          if (start === end) return;
          const word = ta.value.slice(start, end);
          if (!word.trim() || word.length > 60) return;
          const corrected = await correctText(word);
          if (corrected && corrected !== word) {
            const newVal = ta.value.slice(0, start) + corrected + ta.value.slice(end);
            setContent(newVal);
            setDirty(true);
            toast.success(`"${word}" → "${corrected}"`);
          }
        }}
        placeholder="Escreva aqui… (duplo-clique numa palavra para corrigir)"
        className="min-h-[60vh] resize-y"
        spellCheck
        lang="pt-BR"
      />
      <SaveIndicator saving={saving} dirty={dirty} updatedAt={note.updated_at} />
    </div>
  );
}

function SheetEditor({ note, onSaved, onPin, onDelete }: { note: Note; onSaved: () => void; onPin: () => void; onDelete: () => void }) {
  const initial = useMemo<Matrix<CellBase>>(() => {
    if (Array.isArray(note.sheet_data) && note.sheet_data.length > 0) return note.sheet_data as Matrix<CellBase>;
    return Array.from({ length: 12 }, () => Array.from({ length: 6 }, () => ({ value: "" })));
  }, [note.id]);

  const [title, setTitle] = useState(note.title);
  const [data, setData] = useState<Matrix<CellBase>>(initial);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    setTitle(note.title);
    setData(initial);
    setDirty(false);
  }, [note.id]);

  useEffect(() => {
    if (!dirty) return;
    const t = setTimeout(async () => {
      setSaving(true);
      const { error } = await supabase
        .from("notas")
        .update({ title, sheet_data: data, updated_at: new Date().toISOString() } as any)
        .eq("id", note.id);
      setSaving(false);
      if (error) toast.error(error.message);
      else { setDirty(false); onSaved(); }
    }, 700);
    return () => clearTimeout(t);
  }, [title, data, dirty, note.id, onSaved]);

  const addRow = () => {
    const cols = data[0]?.length || 6;
    setData([...data, Array.from({ length: cols }, () => ({ value: "" }))]);
    setDirty(true);
  };
  const addCol = () => {
    setData(data.map((row) => [...row, { value: "" }]));
    setDirty(true);
  };
  const exportCsv = () => {
    const csv = data
      .map((row) => row.map((c) => `"${String(c?.value ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title || "planilha"}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-3">
      <EditorToolbar title={title} onTitleChange={(v) => { setTitle(v); setDirty(true); }} pinned={note.pinned} onPin={onPin} onDelete={onDelete} />
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="rounded-full" onClick={addRow}><Rows className="w-3.5 h-3.5 mr-1" /> Linha</Button>
        <Button variant="outline" size="sm" className="rounded-full" onClick={addCol}><Columns className="w-3.5 h-3.5 mr-1" /> Coluna</Button>
        <Button variant="ghost" size="sm" className="rounded-full ml-auto" onClick={exportCsv}>Exportar CSV</Button>
      </div>
      <div className="rounded-lg border border-border overflow-auto bg-background p-2 max-h-[65vh]">
        <Spreadsheet
          data={data}
          onChange={(d) => { setData(d); setDirty(true); }}
          darkMode={typeof document !== "undefined" && document.documentElement.classList.contains("dark")}
        />
      </div>
      <SaveIndicator saving={saving} dirty={dirty} updatedAt={note.updated_at} />
    </div>
  );
}

function EditorToolbar({ title, onTitleChange, pinned, onPin, onDelete }: { title: string; onTitleChange: (v: string) => void; pinned: boolean; onPin: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <Input
        value={title}
        onChange={(e) => onTitleChange(e.target.value)}
        placeholder="Título"
        className="text-lg font-semibold border-0 px-0 focus-visible:ring-0 shadow-none"
      />
      <button onClick={onPin} title={pinned ? "Desafixar" : "Fixar"} className="w-8 h-8 rounded-md flex items-center justify-center bg-muted text-muted-foreground hover:bg-primary/20 hover:text-primary transition-colors">
        {pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
      </button>
      <button onClick={onDelete} className="w-8 h-8 rounded-md flex items-center justify-center bg-muted text-muted-foreground hover:bg-destructive/20 hover:text-destructive transition-colors">
        <Trash2 className="w-4 h-4" />
      </button>
    </div>
  );
}

function SaveIndicator({ saving, dirty, updatedAt }: { saving: boolean; dirty: boolean; updatedAt: string }) {
  return (
    <div className="text-xs text-muted-foreground flex items-center gap-2 justify-end">
      {saving ? (
        <><Save className="w-3 h-3 animate-pulse" /> Salvando…</>
      ) : dirty ? (
        <span>Alterações não salvas</span>
      ) : (
        <span>Salvo • {fmtDate(updatedAt)}</span>
      )}
    </div>
  );
}
