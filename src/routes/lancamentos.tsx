import { createFileRoute } from "@tanstack/react-router";
import { ProtectedShell } from "@/components/ProtectedShell";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useTransactions, useCategories, useAccounts, useInvalidate } from "@/lib/queries";
import { brl, fmtDate, monthLabel } from "@/lib/format";
import { ListOrdered, Plus, Check, Clock, Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SmartInput } from "@/components/smart-input";
import { PersonSelect } from "@/components/person-select";
import { transactionSchema, firstZodError } from "@/lib/schemas";
import { DatePicker, MonthPicker } from "@/components/date-picker";
import { motion } from "framer-motion";
import { CountUp } from "@/components/CountUp";

export const Route = createFileRoute("/lancamentos")({
  component: () => <ProtectedShell><LancamentosPage /></ProtectedShell>,
  head: () => ({ meta: [{ title: "Lançamentos — Gestão Família" }] }),
});

const todayIso = () => new Date().toISOString().slice(0, 10);

function LancamentosPage() {
  const { data: tx = [] } = useTransactions();
  const { data: cats = [] } = useCategories();
  const { data: accounts = [] } = useAccounts();
  const invalidate = useInvalidate();

  const now = new Date();
  const [m, setM] = useState(now.getMonth());
  const [y, setY] = useState(now.getFullYear());
  const [kind, setKind] = useState<"all" | "income" | "expense">("all");
  const [status, setStatus] = useState<"all" | "paid" | "pending">("all");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);

  const filtered = useMemo(() => {
    return tx.filter((t: any) => {
      const d = new Date(t.due_at + "T00:00:00");
      if (d.getMonth() !== m || d.getFullYear() !== y) return false;
      if (kind !== "all" && t.kind !== kind) return false;
      if (status !== "all" && t.status !== status) return false;
      return true;
    }).sort((a: any, b: any) => a.due_at > b.due_at ? -1 : 1);
  }, [tx, m, y, kind, status]);

  const totalIn = filtered.filter((t: any) => t.kind === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
  const totalOut = filtered.filter((t: any) => t.kind === "expense" && !t.card_installment_id).reduce((s: number, t: any) => s + Number(t.amount), 0);

  const togglePaid = async (t: any) => {
    const { error } = await supabase.from("transactions").update({ status: t.status === "paid" ? "pending" : "paid" }).eq("id", t.id);
    if (error) return toast.error(error.message);
    invalidate("transactions");
  };

  const doDelete = async (t: any) => {
    const { error } = await supabase.from("transactions").delete().eq("id", t.id);
    if (error) return toast.error(error.message);
    invalidate("transactions");
    setDeleting(null);
    toast.success("Removido");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ListOrdered}
        eyebrow="Movimentos"
        title="Lançamentos"
        subtitle={`${monthLabel(m)} · ${y}`}
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-full"><Plus className="w-4 h-4 mr-1" /> Novo</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Novo lançamento</DialogTitle></DialogHeader>
              <TransactionForm cats={cats} accounts={accounts} onDone={() => { setOpen(false); invalidate("transactions"); }} />
            </DialogContent>
          </Dialog>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MonthPicker monthIndex={m} year={y} onChange={(mm, yy) => { setM(mm); setY(yy); }} />
        <Select value={kind} onValueChange={(v) => setKind(v as any)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            <SelectItem value="income">Receitas</SelectItem>
            <SelectItem value="expense">Despesas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as any)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos status</SelectItem>
            <SelectItem value="paid">Pagos</SelectItem>
            <SelectItem value="pending">Em aberto</SelectItem>
          </SelectContent>
        </Select>
        <div className="tech-panel px-4 py-2 flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Saldo do mês</div>
            <div className={`text-lg font-bold tabular-nums ${totalIn - totalOut >= 0 ? "text-success" : "text-destructive"}`}>
              <CountUp value={totalIn - totalOut} format={brl} />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="tech-panel p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-widest">Receitas</div>
          <div className="text-xl font-bold text-success tabular-nums"><CountUp value={totalIn} format={brl} /></div>
        </div>
        <div className="tech-panel p-4">
          <div className="text-xs text-muted-foreground uppercase tracking-widest">Despesas</div>
          <div className="text-xl font-bold text-destructive tabular-nums"><CountUp value={totalOut} format={brl} /></div>
        </div>
      </div>

      <div className="tech-panel overflow-hidden">
        <div className="divide-y divide-border">
          {filtered.length === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">Nenhum lançamento neste período.</div>
          )}
          {filtered.map((t: any) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-3 p-3 hover:bg-muted/40 transition-colors"
            >
              <button
                onClick={() => togglePaid(t)}
                className={`w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors ${
                  t.status === "paid"
                    ? "bg-success/20 border-success text-success"
                    : "border-warning/40 text-warning hover:bg-warning/10"
                }`}
                title={t.status === "paid" ? "Marcar como pendente" : "Marcar como pago"}
              >
                {t.status === "paid" ? <Check className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{t.description}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {fmtDate(t.due_at)} · {t.person || "—"} · {t.categories?.icon ?? ""} {t.categories?.name ?? "Sem categoria"}
                </div>
              </div>
              <div className={`text-sm font-semibold tabular-nums ${t.kind === "income" ? "text-success" : "text-destructive"}`}>
                {t.kind === "income" ? "+" : "-"} {brl(t.amount)}
              </div>
              <button onClick={() => setEditing(t)} className="p-2 text-muted-foreground hover:text-foreground"><Pencil className="w-4 h-4" /></button>
              <button onClick={() => setDeleting(t)} className="p-2 text-muted-foreground hover:text-destructive"><Trash2 className="w-4 h-4" /></button>
            </motion.div>
          ))}
        </div>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar lançamento</DialogTitle></DialogHeader>
          {editing && <TransactionForm cats={cats} accounts={accounts} initial={editing} onDone={() => { setEditing(null); invalidate("transactions"); }} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Remover lançamento?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">"{deleting?.description}" — {brl(deleting?.amount ?? 0)}</p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleting(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => doDelete(deleting)}>Remover</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TransactionForm({ cats, accounts, initial, onDone }: any) {
  const [description, setDescription] = useState(initial?.description ?? "");
  const [amount, setAmount] = useState<string>(initial ? String(initial.amount) : "");
  const [kind, setKind] = useState<"income" | "expense">(initial?.kind ?? "expense");
  const [dueAt, setDueAt] = useState<string>(initial?.due_at ?? todayIso());
  const [person, setPerson] = useState(initial?.person ?? "Lorran");
  const [categoryId, setCategoryId] = useState<string>(initial?.category_id ?? "");
  const [accountId, setAccountId] = useState<string>(initial?.account_id ?? "");
  const [notes, setNotes] = useState<string>(initial?.notes ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = transactionSchema.safeParse({ description, amount, kind, due_at: dueAt, person, notes });
    if (!parsed.success) return toast.error(firstZodError(parsed.error));
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sessão expirou");
      const payload: any = {
        user_id: u.user.id,
        description: parsed.data.description,
        amount: parsed.data.amount,
        kind: parsed.data.kind,
        due_at: parsed.data.due_at,
        posted_at: parsed.data.due_at,
        person: parsed.data.person,
        category_id: categoryId || null,
        account_id: accountId || null,
        notes: notes || null,
        status: initial?.status ?? "pending",
      };
      if (initial) {
        const { error } = await supabase.from("transactions").update(payload).eq("id", initial.id);
        if (error) throw error;
        toast.success("Lançamento atualizado");
      } else {
        const { error } = await supabase.from("transactions").insert(payload);
        if (error) throw error;
        toast.success("Lançamento criado");
      }
      onDone();
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1">
        <Label>Descrição</Label>
        <SmartInput value={description} onChange={setDescription} placeholder="Ex.: Aluguel" required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Valor</Label>
          <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label>Tipo</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="expense">Despesa</SelectItem>
              <SelectItem value="income">Receita</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Data</Label>
          <DatePicker value={dueAt} onChange={setDueAt} />
        </div>
        <div className="space-y-1">
          <Label>Pessoa</Label>
          <PersonSelect value={person} onChange={setPerson} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Categoria</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger><SelectValue placeholder="Sem categoria" /></SelectTrigger>
            <SelectContent>
              {cats.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.icon ?? ""} {c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Conta</Label>
          <Select value={accountId} onValueChange={setAccountId}>
            <SelectTrigger><SelectValue placeholder="Sem conta" /></SelectTrigger>
            <SelectContent>
              {accounts.map((a: any) => <SelectItem key={a.id} value={a.id}>{a.bank ?? ""} · {a.account_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-1">
        <Label>Anotações</Label>
        <SmartInput value={notes} onChange={setNotes} />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={busy}>{busy ? "Salvando…" : initial ? "Atualizar" : "Criar"}</Button>
      </div>
    </form>
  );
}
