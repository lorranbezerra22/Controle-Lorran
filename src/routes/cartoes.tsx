import { createFileRoute } from "@tanstack/react-router";
import { ProtectedShell } from "@/components/ProtectedShell";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useCards, useInstallments, useCategories, useInvalidate } from "@/lib/queries";
import { brl, fmtDate, monthLabel } from "@/lib/format";
import { CreditCard, Plus, Check, Clock, Trash2, Pencil } from "lucide-react";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SmartInput } from "@/components/smart-input";
import { PersonSelect } from "@/components/person-select";
import { BANKS } from "@/lib/banks";
import { BankIcon } from "@/components/BankIcon";
import { cardPurchaseSchema, firstZodError } from "@/lib/schemas";
import { CountUp } from "@/components/CountUp";
import { MonthPicker, DatePicker } from "@/components/date-picker";

export const Route = createFileRoute("/cartoes")({
  component: () => <ProtectedShell><CartoesPage /></ProtectedShell>,
  head: () => ({ meta: [{ title: "Cartões — Gestão Família" }] }),
});

function CartoesPage() {
  const { data: cards = [] } = useCards();
  const { data: inst = [] } = useInstallments();
  const { data: cats = [] } = useCategories();
  const invalidate = useInvalidate();

  const now = new Date();
  const [m, setM] = useState(now.getMonth());
  const [y, setY] = useState(now.getFullYear());
  const [cardFilter, setCardFilter] = useState<string>("all");
  const [newCardOpen, setNewCardOpen] = useState(false);
  const [newPurchaseOpen, setNewPurchaseOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<any>(null);
  const [deletingCard, setDeletingCard] = useState<any>(null);

  const monthInst = useMemo(() => inst.filter((i: any) => {
    const d = new Date(i.due_at + "T00:00:00");
    if (d.getMonth() !== m || d.getFullYear() !== y) return false;
    if (cardFilter !== "all" && i.card_id !== cardFilter) return false;
    return true;
  }).sort((a: any, b: any) => (b.card_purchases?.purchase_date ?? "") > (a.card_purchases?.purchase_date ?? "") ? 1 : -1), [inst, m, y, cardFilter]);

  const totals = useMemo(() => {
    const map: Record<string, { fatura: number; restante: number }> = {};
    monthInst.forEach((i: any) => {
      const t = (map[i.card_id] = map[i.card_id] ?? { fatura: 0, restante: 0 });
      t.fatura += Number(i.amount);
      if (i.status !== "paid") t.restante += Math.max(0, Number(i.amount) - Number(i.paid_amount || 0));
    });
    return map;
  }, [monthInst]);

  const faturaTotal = Object.values(totals).reduce((s, t) => s + t.fatura, 0);
  const restanteTotal = Object.values(totals).reduce((s, t) => s + t.restante, 0);

  const togglePaid = async (i: any) => {
    const nextStatus = i.status === "paid" ? "pending" : "paid";
    const { error } = await supabase.from("card_installments").update({
      status: nextStatus,
      paid_amount: nextStatus === "paid" ? Number(i.amount) : 0,
    }).eq("id", i.id);
    if (error) return toast.error(error.message);
    invalidate("installments");
  };

  const removeCard = async (c: any) => {
    const { error } = await supabase.from("cards").delete().eq("id", c.id);
    if (error) return toast.error(error.message);
    invalidate("cards"); invalidate("installments");
    setDeletingCard(null);
    toast.success("Cartão removido");
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={CreditCard}
        eyebrow="Cartões"
        title="Faturas & Compras"
        subtitle={`${monthLabel(m)} · ${y}`}
        actions={
          <>
            <Dialog open={newPurchaseOpen} onOpenChange={setNewPurchaseOpen}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="rounded-full"><Plus className="w-4 h-4 mr-1" /> Compra</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Nova compra no cartão</DialogTitle></DialogHeader>
                <PurchaseForm cards={cards} cats={cats} onDone={() => { setNewPurchaseOpen(false); invalidate("installments"); invalidate("cards"); }} />
              </DialogContent>
            </Dialog>
            <Dialog open={newCardOpen} onOpenChange={setNewCardOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="rounded-full"><Plus className="w-4 h-4 mr-1" /> Cartão</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Novo cartão</DialogTitle></DialogHeader>
                <CardForm onDone={() => { setNewCardOpen(false); invalidate("cards"); }} />
              </DialogContent>
            </Dialog>
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MonthPicker value={`${y}-${String(m+1).padStart(2,"0")}`} onChange={(v) => { const [yy,mm]=v.split("-").map(Number); setM(mm-1); setY(yy); }} />
        <Select value={cardFilter} onValueChange={setCardFilter}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os cartões</SelectItem>
            {cards.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="tech-panel px-4 py-2">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Fatura</div>
          <div className="text-lg font-bold text-primary tabular-nums"><CountUp value={faturaTotal} format={brl} /></div>
        </div>
        <div className="tech-panel px-4 py-2">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">A pagar</div>
          <div className="text-lg font-bold text-warning tabular-nums"><CountUp value={restanteTotal} format={brl} /></div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {cards.map((c: any) => {
          const t = totals[c.id] ?? { fatura: 0, restante: 0 };
          return (
            <div key={c.id} className="tech-panel p-4 flex flex-col">
              <div className="flex items-center gap-3 mb-3">
                <BankIcon bank={c.bank || c.name} size={36} square />
                <div className="min-w-0 flex-1">
                  <div className="font-semibold truncate">{c.name}</div>
                  <div className="text-xs text-muted-foreground">Fecha dia {c.closing_day} · Vence dia {c.due_day}</div>
                </div>
                <button onClick={() => setEditingCard(c)} className="p-1.5 text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
                <button onClick={() => setDeletingCard(c)} className="p-1.5 text-muted-foreground hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Fatura</span>
                <span className="font-semibold tabular-nums">{brl(t.fatura)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">A pagar</span>
                <span className="font-semibold text-warning tabular-nums">{brl(t.restante)}</span>
              </div>
              {c.credit_limit > 0 && (
                <div className="mt-3 h-1.5 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${Math.min(100, (t.fatura / c.credit_limit) * 100)}%`, background: "var(--gradient-primary)" }}
                  />
                </div>
              )}
            </div>
          );
        })}
        {cards.length === 0 && <div className="tech-panel p-8 text-center text-sm text-muted-foreground md:col-span-2 lg:col-span-3">Nenhum cartão cadastrado ainda.</div>}
      </div>

      <div className="tech-panel overflow-hidden">
        <div className="px-4 py-2 border-b border-border text-xs uppercase tracking-widest text-muted-foreground">
          Parcelas do mês ({monthInst.length})
        </div>
        <div className="divide-y divide-border max-h-[600px] overflow-y-auto">
          {monthInst.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma parcela neste mês.</div>}
          {monthInst.map((i: any) => (
            <div key={i.id} className="flex items-center gap-3 p-3 hover:bg-muted/40">
              <button
                onClick={() => togglePaid(i)}
                className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                  i.status === "paid" ? "bg-success/20 border-success text-success" : "border-warning/40 text-warning"
                }`}
              >
                {i.status === "paid" ? <Check className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
              </button>
              <BankIcon bank={i.cards?.name} size={28} square />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{i.card_purchases?.description ?? "Compra"}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {fmtDate(i.due_at)} · Parcela {i.installment_number}/{i.card_purchases?.installments_count} · {i.card_purchases?.person ?? "—"}
                </div>
              </div>
              <div className="text-sm font-semibold tabular-nums text-destructive">{brl(i.amount)}</div>
            </div>
          ))}
        </div>
      </div>

      <Dialog open={!!editingCard} onOpenChange={(o) => !o && setEditingCard(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar cartão</DialogTitle></DialogHeader>
          {editingCard && <CardForm initial={editingCard} onDone={() => { setEditingCard(null); invalidate("cards"); }} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!deletingCard} onOpenChange={(o) => !o && setDeletingCard(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Remover cartão?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Isso remove também todas as compras e parcelas associadas a "{deletingCard?.name}".</p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeletingCard(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => removeCard(deletingCard)}>Remover</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CardForm({ initial, onDone }: any) {
  const [name, setName] = useState(initial?.name ?? "");
  const [bank, setBank] = useState(initial?.bank ?? "");
  const [closingDay, setClosingDay] = useState<string>(initial ? String(initial.closing_day) : "1");
  const [dueDay, setDueDay] = useState<string>(initial ? String(initial.due_day) : "10");
  const [creditLimit, setCreditLimit] = useState<string>(initial ? String(initial.credit_limit) : "0");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Nome obrigatório");
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sessão expirou");
      const payload = {
        user_id: u.user.id,
        name: name.trim(),
        bank: bank || null,
        closing_day: Number(closingDay),
        due_day: Number(dueDay),
        credit_limit: Number(creditLimit) || 0,
      };
      if (initial) {
        const { error } = await supabase.from("cards").update(payload).eq("id", initial.id);
        if (error) throw error;
        toast.success("Cartão atualizado");
      } else {
        const { error } = await supabase.from("cards").insert(payload);
        if (error) throw error;
        toast.success("Cartão criado");
      }
      onDone();
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao salvar");
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1">
        <Label>Nome</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Ex.: Nubank Ultravioleta" />
      </div>
      <div className="space-y-1">
        <Label>Banco</Label>
        <Select value={bank} onValueChange={setBank}>
          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            {BANKS.filter((b) => b.id !== "outro").map((b) => (
              <SelectItem key={b.id} value={b.name}>
                <span className="flex items-center gap-2"><BankIcon bank={b.name} size={18} square /> {b.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <Label>Fecha</Label>
          <Input type="number" min="1" max="31" value={closingDay} onChange={(e) => setClosingDay(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Vence</Label>
          <Input type="number" min="1" max="31" value={dueDay} onChange={(e) => setDueDay(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Limite</Label>
          <Input type="number" step="0.01" value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} />
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>{busy ? "Salvando…" : initial ? "Atualizar" : "Criar"}</Button>
      </div>
    </form>
  );
}

function PurchaseForm({ cards, cats, onDone }: any) {
  const [cardId, setCardId] = useState<string>(cards[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [totalAmount, setTotalAmount] = useState<string>("");
  const [installments, setInstallments] = useState<string>("1");
  const [purchaseDate, setPurchaseDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [person, setPerson] = useState("Lorran");
  const [categoryId, setCategoryId] = useState<string>("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = cardPurchaseSchema.safeParse({ description, total_amount: totalAmount, installments_count: installments, purchase_date: purchaseDate, person });
    if (!parsed.success) return toast.error(firstZodError(parsed.error));
    if (!cardId) return toast.error("Selecione um cartão");
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Sessão expirou");
      const { data: cp, error: e1 } = await supabase.from("card_purchases").insert({
        user_id: u.user.id,
        card_id: cardId,
        category_id: categoryId || null,
        description: parsed.data.description,
        total_amount: parsed.data.total_amount,
        installments_count: parsed.data.installments_count,
        purchase_date: parsed.data.purchase_date,
        person: parsed.data.person,
      }).select().single();
      if (e1) throw e1;
      const per = +(parsed.data.total_amount / parsed.data.installments_count).toFixed(2);
      const base = new Date(parsed.data.purchase_date + "T00:00:00");
      const rows = [];
      for (let n = 1; n <= parsed.data.installments_count; n++) {
        const d = new Date(base);
        d.setMonth(d.getMonth() + n);
        rows.push({
          user_id: u.user.id,
          card_id: cardId,
          purchase_id: cp.id,
          installment_number: n,
          amount: per,
          due_at: d.toISOString().slice(0, 10),
          status: "pending",
        });
      }
      const { error: e2 } = await supabase.from("card_installments").insert(rows);
      if (e2) throw e2;
      toast.success("Compra registrada");
      onDone();
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao salvar");
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1">
        <Label>Cartão</Label>
        <Select value={cardId} onValueChange={setCardId}>
          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            {cards.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Descrição</Label>
        <SmartInput value={description} onChange={setDescription} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Valor total</Label>
          <Input type="number" step="0.01" value={totalAmount} onChange={(e) => setTotalAmount(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label>Parcelas</Label>
          <Input type="number" min="1" max="48" value={installments} onChange={(e) => setInstallments(e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>Data</Label>
          <DatePicker value={purchaseDate} onChange={setPurchaseDate} />
        </div>
        <div className="space-y-1">
          <Label>Pessoa</Label>
          <PersonSelect value={person} onChange={setPerson} />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Categoria</Label>
        <Select value={categoryId} onValueChange={setCategoryId}>
          <SelectTrigger><SelectValue placeholder="Sem categoria" /></SelectTrigger>
          <SelectContent>
            {cats.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.icon ?? ""} {c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>{busy ? "Salvando…" : "Registrar compra"}</Button>
      </div>
    </form>
  );
}
