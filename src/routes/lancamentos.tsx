import { createFileRoute } from "@tanstack/react-router";
import { DatePicker, MonthPicker } from "@/components/date-picker";
import { ProtectedShell } from "@/components/ProtectedShell";
import { useTransactions, useCategories, useInvalidate, usePeople, useAccounts } from "@/lib/queries";
import { brl, fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useState, useEffect, useMemo, useRef } from "react";
import { Plus, Trash2, Check, Clock, Pencil, SplitSquareHorizontal, ListOrdered, Users } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SmartInput } from "@/components/smart-input";
import { PersonSelect } from "@/components/person-select";
import { useAdjustments, groupAdjustments } from "@/lib/adjustments";
import { Badge } from "@/components/ui/badge";
import { transactionSchema, firstZodError } from "@/lib/schemas";
import { motion } from "framer-motion";
import { CountUp } from "@/components/CountUp";
import { BankIcon } from "@/components/BankIcon";


export const Route = createFileRoute("/lancamentos")({
  component: () => <ProtectedShell><LancamentosPage /></ProtectedShell>,
  head: () => ({ meta: [{ title: "Lançamentos — Gestão Família" }] }),
});

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

const accountLabel = (account: any) => {
  const bank = account?.bank || "Banco não informado";
  const name = account?.account_name ? ` · ${account.account_name}` : "";
  return `${bank}${name}`;
};

function AccountSelectValue({ account }: { account: any }) {
  if (!account) return <span className="text-muted-foreground">Selecione uma conta</span>;

  return (
    <span className="flex min-w-0 items-center gap-2 text-left">
      <BankIcon bank={account.bank} size={22} square />
      <span className="min-w-0 flex-1 truncate font-medium text-foreground">{accountLabel(account)}</span>
      <span className="shrink-0 tabular-nums text-success">{brl(account.balance ?? 0)}</span>
    </span>
  );
}

function AccountSelectItem({ account }: { account: any }) {
  return (
    <SelectItem key={account.id} value={account.id} className="py-2">
      <span className="flex w-full min-w-0 items-center gap-3 pr-2">
        <BankIcon bank={account.bank} size={28} square />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-foreground">{accountLabel(account)}</span>
          <span className="block text-xs text-muted-foreground">Saldo da conta</span>
        </span>
        <span className="shrink-0 tabular-nums font-semibold text-success">{brl(account.balance ?? 0)}</span>
      </span>
    </SelectItem>
  );
}

function LancamentosPage() {
  const { data: tx = [] } = useTransactions();
  const { data: cats = [] } = useCategories();
  const { data: accounts = [] } = useAccounts();
  const { data: people = [] } = usePeople();
  const { data: adjustments = [] } = useAdjustments();
  const adjMap = useMemo(() => groupAdjustments(adjustments), [adjustments]);
  const invalidate = useInvalidate();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const [adjusting, setAdjusting] = useState<any>(null);
  const [paying, setPaying] = useState<any>(null);
  const [payBy, setPayBy] = useState<string>("");
  const [payAccount, setPayAccount] = useState<string>("");
  const [payAccountTayane, setPayAccountTayane] = useState<string>("");
  const [filter, setFilter] = useState<"all" | "income" | "expense">(() => {
    return typeof window !== "undefined" ? (window.localStorage.getItem("lanc:filter") as any) || "all" : "all";
  });
  const [statusFilter, setStatusFilter] = useState<"all" | "paid" | "pending">(() => {
    return typeof window !== "undefined" ? (window.localStorage.getItem("lanc:statusFilter") as any) || "all" : "all";
  });
  const [fixedFilter, setFixedFilter] = useState<"all" | "fixed" | "variable">(() => {
    return typeof window !== "undefined" ? (window.localStorage.getItem("lanc:fixedFilter") as any) || "all" : "all";
  });
  const [sourceFilter, setSourceFilter] = useState<"all" | "manual" | "card">(() => {
    return typeof window !== "undefined" ? (window.localStorage.getItem("lanc:sourceFilter") as any) || "all" : "all";
  });
  const [categoryFilter, setCategoryFilter] = useState<string>(() => {
    return typeof window !== "undefined" ? window.localStorage.getItem("lanc:categoryFilter") || "all" : "all";
  });
  const [personFilter, setPersonFilter] = useState<string>(() => {
    return typeof window !== "undefined" ? window.localStorage.getItem("lanc:personFilter") || "all" : "all";
  });
  const [personFilter2, setPersonFilter2] = useState<string>(() => {
    return typeof window !== "undefined" ? window.localStorage.getItem("lanc:personFilter2") || "all" : "all";
  });
  const [search, setSearch] = useState<string>(() => {
    return typeof window !== "undefined" ? window.localStorage.getItem("lanc:search") || "" : "";
  });
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const [selM, setSelM] = useState<number | "all">(() => {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem("lanc:selM") : null;
    return raw === "all" ? "all" : raw !== null ? Number(raw) : next.getMonth();
  });
  const [selY, setSelY] = useState<number | "all">(() => {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem("lanc:selY") : null;
    return raw === "all" ? "all" : raw !== null ? Number(raw) : next.getFullYear();
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("lanc:filter", filter);
      window.localStorage.setItem("lanc:statusFilter", statusFilter);
      window.localStorage.setItem("lanc:fixedFilter", fixedFilter);
      window.localStorage.setItem("lanc:sourceFilter", sourceFilter);
      window.localStorage.setItem("lanc:categoryFilter", categoryFilter);
      window.localStorage.setItem("lanc:personFilter", personFilter);
      window.localStorage.setItem("lanc:personFilter2", personFilter2);
      window.localStorage.setItem("lanc:selM", String(selM));
      window.localStorage.setItem("lanc:selY", String(selY));
      window.localStorage.setItem("lanc:search", search);
    }
  }, [filter, statusFilter, fixedFilter, sourceFilter, categoryFilter, personFilter, personFilter2, selM, selY, search]);

  // Gera recorrências para o mês/ano selecionado (despesas fixas) sob demanda
  useEffect(() => {
    if (selM === "all" || selY === "all") return;
    let cancelled = false;
    supabase.rpc("generate_recurrences", { target_year: Number(selY), target_month: Number(selM) + 1 })
      .then(({ data, error }) => {
        if (cancelled || error) return;
        if ((data ?? 0) > 0) invalidate("transactions");
      });
    return () => { cancelled = true; };
  }, [selM, selY]);

  const norm = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const matchPerson = (rawPerson?: string | null) => {
    const selected = Array.from(new Set([personFilter, personFilter2].filter((s) => s && s !== "all")));
    if (selected.length === 0) return true;
    if (selected.includes("none")) {
      if (!rawPerson) return true;
    }
    const p = norm(rawPerson || "");
    if (!p) return false;
    return selected.some((s) => {
      if (s === "none") return false;
      return p === norm(s);
    });
  };

  const personOptions = useMemo(() => {
    // Retorna apenas as pessoas cadastradas no sistema
    return people.map((p: any) => p.name).sort();
  }, [people]);

  const filtered = tx.filter((t: any) => {
    if (filter !== "all" && t.kind !== filter) return false;
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    if (fixedFilter === "fixed" && !t.is_fixed) return false;
    if (fixedFilter === "variable" && t.is_fixed) return false;
    if (sourceFilter === "card" && !t.card_installment_id) return false;
    if (sourceFilter === "manual" && t.card_installment_id) return false;
    if (categoryFilter !== "all" && t.category_id !== categoryFilter) return false;
    if (!matchPerson(t.person)) return false;
    if (search.trim() && !(t.description || "").toLowerCase().includes(search.toLowerCase())) return false;
    const d = new Date(t.due_at + "T00:00:00");
    if (selY !== "all" && d.getFullYear() !== selY) return false;
    if (selM !== "all" && d.getMonth() !== selM) return false;
    return true;
  });


  const incomeItems = filtered.filter((t: any) => t.kind === "income");
  const expenseItems = filtered.filter((t: any) => t.kind === "expense");
  const sum = (arr: any[]) => arr.reduce((s, t) => {
    // Não somar no total de despesas os lançamentos que são pagamentos de cartão, 
    // pois o custo original já foi computado na compra do cartão.
    if (t.kind === "expense" && t.card_installment_id) return s;
    return s + Number(t.amount);
  }, 0);
  const totalIn = sum(incomeItems);
  const totalInPaid = sum(incomeItems.filter((t) => t.status === "paid"));
  const totalOut = sum(expenseItems);
  const totalOutPaid = sum(expenseItems.filter((t) => t.status === "paid"));
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  const togglePaid = async (t: any) => {
    if (t.status === "paid") {
      // Revertendo pagamento: limpa paid_by e contas
      const { error } = await supabase.from("transactions").update({
        status: "pending",
        account_id: null,
        account_tayane_id: null,
        paid_by: null,
      }).eq("id", t.id);
      if (error) toast.error(error.message);
      else { invalidate("transactions"); invalidate("accounts"); toast.success("Lançamento pendente e saldo estornado"); }
      return;
    }
    // Abrir diálogo de pagamento com seleção de "Pago por" e conta
    const personNorm = norm(t.person || "");
    const isOwnPerson = personNorm === "lorran" || personNorm === "tayane" || personNorm === "familia";
    // Pega TODAS as contas da pessoa (por account_name), prioriza maior saldo.
    // Fallback por banco só se ninguém tiver account_name preenchido.
    const pickBest = (personName: string, bankFallbacks: string[]) => {
      const own = accounts
        .filter((a: any) => norm(a.account_name || "") === personName)
        .sort((a: any, b: any) => Number(b.balance ?? 0) - Number(a.balance ?? 0));
      if (own.length) return own[0].id;
      for (const b of bankFallbacks) {
        const hit = accounts.find((a: any) => (a.bank || "").toLowerCase().includes(b));
        if (hit) return hit.id;
      }
      return undefined;
    };
    const lorranAcc = pickBest("lorran", ["revolut", "nubank"]);
    const tayaneAcc = pickBest("tayane", ["mercado"]);
    const autoAccount = isOwnPerson ? lorranAcc : "";
    setPayBy(t.person || "");
    setPayAccount(t.account_id || autoAccount || lorranAcc || "");
    setPayAccountTayane(t.account_tayane_id || tayaneAcc || "");
    setPaying(t);
  };

  const confirmPay = async () => {
    if (!paying) return;
    const t = paying;
    const isFamilyExpense = t.kind === "expense" && norm(t.person || "") === "familia";
    const payByNorm = norm(payBy || "");
    // Despesa de Família sempre debita 50% da conta do Lorran e 50% da conta da Tayane.
    // O campo "Pago por" não deve transformar Família em débito 100% de uma pessoa.
    const useSplit = isFamilyExpense;
    const splitPayBy = payBy ? payBy.split(",") : [];
    const firstPayBy = splitPayBy[0] || "";
    const personIsDifferent = !isFamilyExpense && firstPayBy && norm(firstPayBy) !== norm(t.person || "");
    const { error } = await supabase.from("transactions").update({
      status: "paid",
      account_id: payAccount || null,
      account_tayane_id: useSplit ? (payAccountTayane || null) : null,
      paid_by: personIsDifferent ? firstPayBy : null,
    }).eq("id", t.id);
    if (error) toast.error(error.message);
    else {
      invalidate("transactions");
      invalidate("accounts");
      toast.success(
        !payAccount
          ? "Pago (sem débito em conta)"
          : useSplit
            ? "Pago: 50% debitado do Lorran e 50% da Tayane"
            : personIsDifferent
              ? `Pago por ${payBy} (dívida de ${t.person})`
              : "Lançamento pago e saldo atualizado",
      );

      setPaying(null);
    }
  };

  const askDelete = (t: any) => setDeleting(t);
  const doDeleteOne = async (t: any) => {
    const { error } = await supabase.from("transactions").delete().eq("id", t.id);
    if (error) toast.error(error.message); else { invalidate("transactions"); toast.success("Removido"); setDeleting(null); }
  };
  const doDeleteAll = async (t: any) => {
    let error: any = null;
    if (t.rule_id) {
      ({ error } = await supabase.from("transactions").delete().eq("rule_id", t.rule_id));
    } else {
      let q = supabase.from("transactions").delete()
        .eq("description", t.description).eq("kind", t.kind).eq("is_fixed", true);
      q = t.person ? q.eq("person", t.person) : q.is("person", null);
      ({ error } = await q);
    }
    if (error) toast.error(error.message);
    else { invalidate("transactions"); toast.success("Lançamentos relacionados removidos"); setDeleting(null); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={ListOrdered}
        eyebrow="Movimentos"
        title="Lançamentos"
        subtitle="Receitas e despesas"
        actions={
          <>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="rounded-full shadow-md"><Plus className="w-4 h-4 mr-1" /> Novo lançamento</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Novo lançamento</DialogTitle></DialogHeader>
                <TransactionForm cats={cats} accounts={accounts} onDone={() => { setOpen(false); invalidate("transactions"); }} />
              </DialogContent>
            </Dialog>
            <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
              <DialogContent>
                <DialogHeader><DialogTitle>Editar lançamento</DialogTitle></DialogHeader>
                {editing && <TransactionForm cats={cats} accounts={accounts} initial={editing} onDone={() => { setEditing(null); invalidate("transactions"); }} />}
              </DialogContent>
            </Dialog>
          </>
        }
      />


      <div className="flex gap-2 flex-wrap items-center">
        {[["all","Todos"],["income","Receitas"],["expense","Despesas"]].map(([k,l]) => (
          <button key={k} onClick={() => setFilter(k as any)} className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${filter===k ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>{l}</button>
        ))}
      </div>

      <div className="flex gap-4 flex-wrap items-end">
        <Field label="Status">
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
            <SelectTrigger className={`w-auto min-w-[140px] h-10 rounded-xl transition-all shadow-sm ${statusFilter !== "all" ? "border-gold/50 ring-2 ring-gold/20 bg-gold/5 font-medium" : "border-border text-muted-foreground"}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="paid">Pago</SelectItem>
              <SelectItem value="pending">Em aberto</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field label="Tipo">
          <Select value={fixedFilter} onValueChange={(v) => setFixedFilter(v as any)}>
            <SelectTrigger className={`w-auto min-w-[140px] h-10 rounded-xl transition-all shadow-sm ${fixedFilter !== "all" ? "border-gold/50 ring-2 ring-gold/20 bg-gold/5 font-medium" : "border-border text-muted-foreground"}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Fixos + Variáveis</SelectItem>
              <SelectItem value="fixed">Apenas fixos</SelectItem>
              <SelectItem value="variable">Apenas variáveis</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field label="Origem">
          <Select value={sourceFilter} onValueChange={(v) => setSourceFilter(v as any)}>
            <SelectTrigger className={`w-auto min-w-[140px] h-10 rounded-xl transition-all shadow-sm ${sourceFilter !== "all" ? "border-gold/50 ring-2 ring-gold/20 bg-gold/5 font-medium" : "border-border text-muted-foreground"}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as origens</SelectItem>
              <SelectItem value="manual">Lançamentos manuais</SelectItem>
              <SelectItem value="card">Pagamentos de cartão</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <Field label="Categoria">
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className={`w-auto min-w-[160px] h-10 rounded-xl transition-all shadow-sm ${categoryFilter !== "all" ? "border-gold/50 ring-2 ring-gold/20 bg-gold/5 font-medium" : "border-border text-muted-foreground"}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas categorias</SelectItem>
              {cats.map((c: any) => (
                <SelectItem key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ""}{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Busca">
          <Input 
            className="w-auto min-w-[180px] h-10 rounded-xl transition-all shadow-sm border-border" 
            placeholder="Buscar..." 
            value={search} 
            onChange={(e) => setSearch(e.target.value)} 
          />
        </Field>

        <Field label="Pessoa">
          <Select value={personFilter} onValueChange={setPersonFilter}>
            <SelectTrigger className={`w-auto min-w-[140px] h-10 rounded-xl transition-all shadow-sm ${personFilter !== "all" ? "border-gold/50 ring-2 ring-gold/20 bg-gold/5 font-medium" : "border-border text-muted-foreground"}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as pessoas</SelectItem>
              {personOptions.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="+ Pessoa">
          <Select value={personFilter2} onValueChange={setPersonFilter2}>
            <SelectTrigger className={`w-auto min-w-[140px] h-10 rounded-xl transition-all shadow-sm ${personFilter2 !== "all" ? "border-gold/50 ring-2 ring-gold/20 bg-gold/5 font-medium" : "border-border text-muted-foreground"}`}>
              <SelectValue placeholder="Adicionar" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Adicionar pessoa</SelectItem>
              {personOptions.map((p) => (
                <SelectItem key={p} value={p}>{p}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Mês">
          <Select value={String(selM)} onValueChange={(v) => setSelM(v === "all" ? "all" : Number(v))}>
            <SelectTrigger className={`w-auto min-w-[120px] h-10 rounded-xl transition-all shadow-sm ${selM !== "all" ? "border-gold/50 ring-2 ring-gold/20 bg-gold/5 font-medium" : "border-border text-muted-foreground"}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os meses</SelectItem>
              {MESES.map((m, i) => (
                <SelectItem key={i} value={String(i)}>{m}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Ano">
          <Select value={String(selY)} onValueChange={(v) => setSelY(v === "all" ? "all" : Number(v))}>
            <SelectTrigger className={`w-auto min-w-[120px] h-10 rounded-xl transition-all shadow-sm ${selY !== "all" ? "border-gold/50 ring-2 ring-gold/20 bg-gold/5 font-medium" : "border-border text-muted-foreground"}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os anos</SelectItem>
              {years.map((y) => (
                <SelectItem key={y} value={String(y)}>{y}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0, ease: [0.22, 1, 0.36, 1] }}
          whileHover={{ y: -3, transition: { duration: 0.2 } }}
          className="tech-panel p-5"
          style={{ boxShadow: "var(--shadow-elegant)" }}
        >
          <div className="text-xs uppercase text-muted-foreground tracking-wide">Receitas</div>
          <div className="text-2xl font-bold text-success mt-1"><CountUp value={totalIn} format={brl} /></div>
          <div className="text-xs text-muted-foreground mt-2">Recebido: <span className="text-success">{brl(totalInPaid)}</span> • A receber: <span className="text-warning">{brl(totalIn - totalInPaid)}</span></div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
          whileHover={{ y: -3, transition: { duration: 0.2 } }}
          className="tech-panel p-5"
          style={{ boxShadow: "var(--shadow-elegant)" }}
        >
          <div className="text-xs uppercase text-muted-foreground tracking-wide">Despesas Lançamentos</div>
          <div className="text-2xl font-bold text-destructive mt-1"><CountUp value={totalOut} format={brl} /></div>
          <div className="text-xs text-muted-foreground mt-2">Pago: <span className="text-success">{brl(totalOutPaid)}</span> • Restante: <span className="text-destructive">{brl(totalOut - totalOutPaid)}</span></div>
        </motion.div>
      </div>

      <div className="tech-panel overflow-hidden" style={{ boxShadow: "var(--shadow-elegant)" }}>
        <div className="px-4 py-2.5 border-b border-border bg-muted/30 flex items-center justify-between flex-wrap gap-2 text-sm">
          <span className="text-muted-foreground">{filtered.length} lançamento{filtered.length === 1 ? "" : "s"}</span>
          <span className="text-muted-foreground">
            Receitas: <strong className="text-success">{brl(totalIn)}</strong>
            <span className="mx-2 text-border">•</span>
            Despesas: <strong className="text-destructive">{brl(totalOut)}</strong>
            <span className="mx-2 text-border">•</span>
            Saldo: <strong className={totalIn - totalOut >= 0 ? "text-success" : "text-destructive"}>{brl(totalIn - totalOut)}</strong>
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">Data Compra</th>
                <th className="text-left p-3 hidden sm:table-cell">Vencimento</th>
                <th className="text-left p-3">Descrição</th>
                <th className="text-left p-3 hidden md:table-cell">Categoria</th>
                <th className="text-left p-3 hidden md:table-cell">Pessoa</th>
                <th className="text-right p-3">Valor</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Nenhum lançamento. Adicione o primeiro.</td></tr>
              )}
              {filtered.map((t: any) => {
                const adj = adjMap.get(t.id);
                return (
                <tr key={t.id} className="border-t border-border hover:bg-muted/30">
                  <td className="p-3 whitespace-nowrap text-muted-foreground font-medium">{t.posted_at ? fmtDate(t.posted_at) : (t.due_at ? fmtDate(t.due_at) : "—")}</td>
                  <td className="p-3 whitespace-nowrap text-muted-foreground hidden sm:table-cell">{fmtDate(t.due_at)}</td>
                  <td className="p-3 font-medium">
                    <div className="flex items-center gap-2">
                      <span className="truncate">{t.description}</span>
                    </div>
                    {t.is_fixed && <span className="ml-2 text-xs text-muted-foreground">• fixa</span>}
                    {adj && adj.length > 0 && (
                      <Badge variant="outline" className="ml-2 text-[10px] py-0 px-1.5 border-primary/40 text-primary" title={adj.map((a) => `${a.person}: ${brl(Number(a.amount))}`).join(" · ")}>
                        Ajustado
                      </Badge>
                    )}
                  </td>
                  <td className="p-3 hidden md:table-cell text-muted-foreground">
                    <div className="flex items-center gap-2">
                      {t.categories?.icon && <span className="shrink-0">{t.categories.icon}</span>}
                      <span>{t.categories?.name ?? "—"}</span>
                    </div>
                  </td>
                  <td className="p-3 hidden md:table-cell text-muted-foreground">
                    {t.person ?? "—"}
                    {t.paid_by && norm(t.paid_by) !== norm(t.person || "") && (
                      <Badge variant="outline" className="ml-2 text-[10px] py-0 px-1.5 border-success/40 text-success" title={`Dívida de ${t.person}, paga por ${t.paid_by}`}>
                        Pago por {t.paid_by}
                      </Badge>
                    )}
                  </td>
                  <td className={`p-3 text-right font-semibold ${t.kind === "income" ? "text-success" : "text-destructive"}`}>
                    {t.kind === "income" ? "+" : "-"} {brl(t.amount)}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1 justify-end">
                      {t.kind === "expense" && (
                        <button onClick={() => setAdjusting(t)} title="Ajustar responsabilidade" className={`w-7 h-7 rounded-md flex items-center justify-center ${adj && adj.length > 0 ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground hover:bg-primary/20 hover:text-primary"}`}>
                          <SplitSquareHorizontal className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button onClick={() => setEditing(t)} title="Editar" className="w-7 h-7 rounded-md flex items-center justify-center bg-muted text-muted-foreground hover:bg-primary/20 hover:text-primary">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => togglePaid(t)} title={t.status === "paid" ? "Pago" : "Marcar como pago"} className={`w-7 h-7 rounded-md flex items-center justify-center ${t.status === "paid" ? "bg-success/20 text-success" : "bg-muted text-muted-foreground hover:bg-warning/20 hover:text-warning"}`}>
                        {t.status === "paid" ? <Check className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => askDelete(t)} className="w-7 h-7 rounded-md flex items-center justify-center bg-muted text-muted-foreground hover:bg-destructive/20 hover:text-destructive">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir lançamento</DialogTitle></DialogHeader>
          {deleting && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {(deleting.is_fixed || deleting.rule_id)
                  ? <>Este lançamento faz parte de um grupo (<strong className="text-foreground">{deleting.description}</strong>). Pode excluir somente esta ocorrência ou todas as relacionadas.</>
                  : <>Confirma excluir o lançamento <strong className="text-foreground">{deleting.description}</strong>?</>}
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button variant="outline" className="flex-1" onClick={() => doDeleteOne(deleting)}>
                  Excluir apenas este
                </Button>
                {(deleting.is_fixed || deleting.rule_id) && (
                  <Button variant="destructive" className="flex-1" onClick={() => doDeleteAll(deleting)}>
                    Excluir todos os relacionados
                  </Button>
                )}
              </div>
              <Button variant="ghost" size="sm" className="w-full" onClick={() => setDeleting(null)}>Cancelar</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!adjusting} onOpenChange={(o) => !o && setAdjusting(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Ajuste de Lançamento</DialogTitle></DialogHeader>
          {adjusting && (
            <AdjustmentForm
              tx={adjusting}
              existing={adjMap.get(adjusting.id) ?? []}
              onDone={() => { setAdjusting(null); invalidate("transaction_adjustments"); }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!paying} onOpenChange={(o) => !o && setPaying(null)}>
        <DialogContent className="max-w-md p-0 overflow-hidden border-border/60 bg-gradient-to-b from-card to-background shadow-2xl">
          {paying && (
            <div>
              <div className="px-6 pt-6 pb-4 border-b border-border/50 bg-gradient-to-br from-primary/10 via-transparent to-transparent">
                <DialogHeader className="space-y-1">
                  <DialogTitle className="text-lg font-semibold tracking-tight">Confirmar pagamento</DialogTitle>
                  <p className="text-xs text-muted-foreground">Revise os detalhes antes de liquidar</p>
                </DialogHeader>
              </div>

              <div className="px-6 py-5 space-y-5">
                <div className="rounded-xl border border-border/60 p-4 bg-muted/30">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">Lançamento</div>
                  <div className="font-medium text-sm">{paying.description}</div>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-border/40">
                    <span className="text-xs text-muted-foreground">Dívida de <strong className="text-foreground">{paying.person || "—"}</strong></span>
                    <span className="text-base font-semibold tabular-nums">{brl(paying.amount)}</span>
                  </div>
                </div>

                {!(paying.kind === "expense" && norm(paying.person || "") === "familia") && (
                  <div className="grid gap-2">
                    <Label className="text-xs font-medium">Pago por</Label>
                    <PersonSelect 
                      multiSelect 
                      value="" 
                      selectedValues={payBy ? payBy.split(",") : []} 
                      onChange={(v) => setPayBy(v)} 
                      includeFamilia={false}
                      extras={paying.person ? [paying.person] : []} 
                    />
                  </div>
                )}

                <div className="grid gap-2">
                  <Label className="text-xs font-medium">
                    {paying.kind === "expense" && norm(paying.person || "") === "familia" ? "Conta do Lorran (50%)" : "Conta debitada"}
                  </Label>
                  <Select value={payAccount ? payAccount : "__none__"} onValueChange={(v) => setPayAccount(v === "__none__" ? "" : v)}>
                    <SelectTrigger className="w-full h-11 rounded-xl shadow-sm border-border bg-background/50 hover:border-primary/50 transition-all">
                      <SelectValue placeholder="Selecione a conta" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__" className="py-2.5">Sem conta (só registrar, não debita saldo)</SelectItem>
                      {accounts.map((a: any) => (
                        <SelectItem key={a.id} value={a.id} className="py-2.5">
                          <div className="flex items-center gap-2">
                            <BankIcon bank={a.bank} size={18} square />
                            <span>{a.bank}{a.account_name ? ` · ${a.account_name}` : ""} — <strong className="text-success">{brl(a.balance ?? 0)}</strong></span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                </div>

                {paying.kind === "expense" && norm(paying.person || "") === "familia" && (
                  <div className="grid gap-2">
                    <Label className="text-xs font-medium">Conta da Tayane (50%)</Label>
                    <Select value={payAccountTayane || undefined} onValueChange={setPayAccountTayane}>
                      <SelectTrigger className="w-full h-11 rounded-xl shadow-sm border-border bg-background/50 hover:border-primary/50 transition-all">
                        <SelectValue placeholder="Selecione a conta" />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((a: any) => (
                          <SelectItem key={a.id} value={a.id} className="py-2.5">
                            <div className="flex items-center gap-2">
                              <BankIcon bank={a.bank} size={18} square />
                              <span>{a.bank}{a.account_name ? ` · ${a.account_name}` : ""} — <strong className="text-success">{brl(a.balance ?? 0)}</strong></span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t border-border/50 bg-muted/20 flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setPaying(null)}>Cancelar</Button>
                <Button className="flex-1 bg-gradient-to-r from-primary to-primary/80 shadow-lg shadow-primary/20" onClick={confirmPay}>Confirmar</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>


    </div>
  );
}

function TransactionForm({ cats, accounts = [], onDone, initial }: any) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({
    description: initial?.description ?? "",
    amount: initial?.amount?.toString() ?? "",
    kind: initial?.kind ?? "expense",
    due_at: initial?.due_at ?? today,
    posted_at: initial?.posted_at ?? today,
    category_id: initial?.category_id ?? "",
    person: initial?.person ?? "",
    is_fixed: initial?.is_fixed ?? false,
    status: initial?.status ?? "pending",
    installments: "1",
    accountId: initial?.account_id ?? "", 
    accountTayaneId: initial?.account_tayane_id ?? "", 
  });
  const { data: people = [] } = usePeople();
  const [splitMode, setSplitMode] = useState(false);
  const [splitPeople, setSplitPeople] = useState<string[]>([]);
  const [splitCustom, setSplitCustom] = useState(false);
  const [splitAmounts, setSplitAmounts] = useState<Record<string, string>>({});
  const togglePerson = (name: string) => setSplitPeople((prev) => prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]);
  const invalidate = useInvalidate();
  const [saving, setSaving] = useState(false);
  const submittingRef = useRef(false);
  const isEdit = !!initial;
  const selectedAccount = accounts.find((a: any) => a.id === form.accountId);
  const selectedTayaneAccount = accounts.find((a: any) => a.id === form.accountTayaneId);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return; // guard contra duplo-submit
    const parsed = transactionSchema.safeParse({
      description: form.description,
      amount: form.amount,
      kind: form.kind,
      due_at: form.due_at,
      person: form.person || "—",
    });
    if (!parsed.success) {
      toast.error(firstZodError(parsed.error));
      return;
    }
    submittingRef.current = true;
    setSaving(true);
    try {
      const category_id = form.category_id || null;

      // SAFETY: só preencher account_id/account_tayane_id automaticamente em NOVOS lançamentos.
      // Em edições, preservar exatamente o que o usuário escolheu (ou o valor original),
      // sem trocar a conta silenciosamente — isso evita que o gatilho de saldo credite/debite
      // contas silenciosamente ao editar campos não financeiros (ex.: categoria).
      const normStr = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      const lorranFallback = accounts.find((a: any) => normStr(a.account_name || "") === "lorran")?.id
        || accounts.find((a: any) => (a.bank || "").toLowerCase().includes("revolut"))?.id
        || accounts.find((a: any) => (a.bank || "").toLowerCase().includes("nubank"))?.id
        || accounts[0]?.id || null;
      const mercadoFallback = accounts.find((a: any) => normStr(a.account_name || "") === "tayane")?.id
        || accounts.find((a: any) => (a.bank || "").toLowerCase().includes("mercado"))?.id || null;
      const resolvedAccountId = form.status === "paid"
        ? (form.accountId || initial?.account_id || (isEdit ? null : lorranFallback))
        : null;
      const isFamilyExpense = form.status === "paid" && form.person === "Família" && form.kind === "expense";
      const resolvedTayaneId = isFamilyExpense
        ? (form.accountTayaneId || initial?.account_tayane_id || (isEdit ? null : mercadoFallback))
        : null;

      const payload = {
        description: form.description,
        amount: Number(form.amount),
        kind: form.kind,
        due_at: form.due_at,
        posted_at: form.posted_at,
        category_id,
        person: form.person || null,
        is_fixed: form.is_fixed,
        status: form.status,
        account_id: resolvedAccountId,
        account_tayane_id: resolvedTayaneId,
      } as any;

      if (isEdit) {
        const { error } = await supabase.from("transactions").update(payload).eq("id", initial.id);
        if (error) throw error;
        // Propaga alterações para os lançamentos fixos relacionados (mantendo o offset mensal)
        if (initial.is_fixed) {
          let q = supabase.from("transactions").select("id, due_at").eq("status", "pending");
          if (initial.rule_id) q = q.eq("rule_id", initial.rule_id);
          else {
            q = q.eq("description", initial.description).eq("kind", initial.kind).eq("is_fixed", true);
            q = initial.person ? q.eq("person", initial.person) : q.is("person", null);
          }
          const { data: siblings } = await q;
          const oldBase = new Date(initial.due_at + "T00:00:00");
          const newBase = new Date(form.due_at + "T00:00:00");
          const monthDelta = (newBase.getFullYear() - oldBase.getFullYear()) * 12 + (newBase.getMonth() - oldBase.getMonth());
          const newDay = newBase.getDate();
          for (const s of siblings ?? []) {
            if (s.id === initial.id) continue;
            const sd = new Date(s.due_at + "T00:00:00");
            const shifted = new Date(sd.getFullYear(), sd.getMonth() + monthDelta, newDay);
            const iso = shifted.toISOString().slice(0, 10);
            await supabase.from("transactions").update({
              description: payload.description,
              amount: payload.amount,
              category_id: payload.category_id,
              person: payload.person,
              due_at: iso,
              posted_at: iso,
            }).eq("id", s.id);
          }
          toast.success("Lançamentos pendentes atualizados");
        } else {
          toast.success("Atualizado");
        }
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const installments = Math.max(1, Math.min(60, Number(form.installments) || 1));
        if (form.is_fixed) {
          // Replica para 12 meses (mês atual + 11 seguintes)
          const base = new Date(form.due_at + "T00:00:00");
          const rows = Array.from({ length: 12 }, (_, k) => {
            const d = new Date(base.getFullYear(), base.getMonth() + k, base.getDate());
            const iso = d.toISOString().slice(0, 10);
            return { ...payload, due_at: iso, posted_at: iso, status: "pending", user_id: user!.id };
          });
          const { error } = await supabase.from("transactions").insert(rows);
          if (error) throw error;
          toast.success(`Lançamento fixo criado para 12 meses`);
        } else if (installments > 1) {
          const base = new Date(form.due_at + "T00:00:00");
          const ruleId = crypto.randomUUID();
          const total = Number(form.amount);
          const per = Math.round((total / installments) * 100) / 100;
          const lastAdj = Math.round((total - per * (installments - 1)) * 100) / 100;
          const rows = Array.from({ length: installments }, (_, k) => {
            const d = new Date(base.getFullYear(), base.getMonth() + k, base.getDate());
            const iso = d.toISOString().slice(0, 10);
            return {
              ...payload,
              amount: k === installments - 1 ? lastAdj : per,
              description: `${payload.description} (${k + 1}/${installments})`,
              due_at: iso,
              posted_at: iso,
              status: "pending",
              is_fixed: true,
              rule_id: ruleId,
              user_id: user!.id,
            };
          });
          const { error } = await supabase.from("transactions").insert(rows);
          if (error) throw error;
          toast.success(`Parcelado em ${installments}x`);
        } else if (splitMode && splitPeople.length >= 2) {
          const total = Number(form.amount);
          let perAmounts: number[];
          if (splitCustom) {
            perAmounts = splitPeople.map((p) => Number(splitAmounts[p] || 0));
            const sumCustom = perAmounts.reduce((s, v) => s + v, 0);
            if (Math.abs(sumCustom - total) > 0.01) throw new Error(`A soma dos valores (${brl(sumCustom)}) precisa ser igual ao total (${brl(total)}).`);
          } else {
            const per = Math.round((total / splitPeople.length) * 100) / 100;
            perAmounts = splitPeople.map((_, idx) => idx === splitPeople.length - 1 ? +(total - per * (splitPeople.length - 1)).toFixed(2) : per);
          }
          const rows = splitPeople.map((p, idx) => ({
            ...payload,
            person: p,
            amount: perAmounts[idx],
            description: `${payload.description} (${p})`,
            user_id: user!.id,
          }));
          const { error } = await supabase.from("transactions").insert(rows);
          if (error) throw error;
          toast.success(`Dividido entre ${splitPeople.length} pessoas`);
        } else {
          const { error } = await supabase.from("transactions").insert({ ...payload, user_id: user!.id });
          if (error) throw error;
          invalidate("accounts");
        }
      }
      onDone();
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); submittingRef.current = false; }
  };

  const filteredCats = cats.filter((c: any) => c.kind === form.kind);

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Tipo</Label>
          <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v, category_id: "" })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="expense">Despesa</SelectItem>
              <SelectItem value="income">Receita</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pendente</SelectItem>
              <SelectItem value="paid">Pago</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      {form.status === "paid" && (
        <div className="space-y-3 p-3 rounded-lg bg-muted/30 border border-border/50">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">{form.kind === "expense" && form.person === "Família" ? "Conta do Lorran (50%)" : "Qual conta bancária?"}</Label>
            <Select value={form.accountId} onValueChange={(v) => setForm({ ...form, accountId: v })}>
              <SelectTrigger className="h-12 bg-background [&>span]:line-clamp-none">
                <AccountSelectValue account={selectedAccount} />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a: any) => (
                  <AccountSelectItem key={a.id} account={a} />
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground">
              {form.person === "Família" ? "Se não selecionar, usará a conta do Lorran por padrão." : "Se não selecionar, usará a conta do Lorran por padrão."}
            </p>
          </div>

          {form.kind === "expense" && form.person === "Família" && (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Conta da Tayane (50%)</Label>
              <Select value={form.accountTayaneId} onValueChange={(v) => setForm({ ...form, accountTayaneId: v })}>
                <SelectTrigger className="h-12 bg-background [&>span]:line-clamp-none">
                  <AccountSelectValue account={selectedTayaneAccount} />
                </SelectTrigger>
                <SelectContent>
                {accounts.map((a: any) => (
                  <AccountSelectItem key={a.id} account={a} />
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">Se não selecionar, usará o Mercado Pago por padrão.</p>
            </div>
          )}
        </div>
      )}
      <div className="space-y-1.5">
        <Label>Descrição</Label>
        <SmartInput value={form.description} onChange={(v) => setForm({ ...form, description: v })} required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label>Valor</Label>
          <Input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} required />
        </div>
        <div className="space-y-1.5">
          <Label>Vencimento</Label>
          <DatePicker value={form.due_at} onChange={(v) => setForm({ ...form, due_at: v })} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label>Categoria</Label>
        <Select value={form.category_id} onValueChange={(v) => setForm({ ...form, category_id: v })}>
          <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
          <SelectContent>
            {filteredCats.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ""}{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {!splitMode && (
          <div className="space-y-1.5">
            <Label>Pessoa</Label>
            <PersonSelect value={form.person} onChange={(v) => setForm({ ...form, person: v })} />
          </div>
        )}
        {!isEdit && !form.is_fixed && (
          <div className="space-y-1.5">
            <Label>Parcelas</Label>
            <Input type="number" min="1" max="60" value={form.installments} onChange={(e) => setForm({ ...form, installments: e.target.value })} />
          </div>
        )}
        <div className="space-y-1.5 flex items-center justify-between p-3 rounded-xl border border-border/50 bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold/10 text-gold shadow-sm ring-1 ring-gold/20">
              <Clock className="h-4 w-4" />
            </div>
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">Despesa fixa</span>
              <span className="text-[10px] text-muted-foreground">Repetir mensalmente</span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setForm({ ...form, is_fixed: !form.is_fixed })}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 ${form.is_fixed ? "bg-primary" : "bg-muted"}`}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${form.is_fixed ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>
      </div>
      {!isEdit && (
        <>
          <div className="space-y-1.5 flex items-center justify-between p-3 rounded-xl border border-border/50 bg-muted/20">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold/10 text-gold shadow-sm ring-1 ring-gold/20">
                <Users className="h-4 w-4" />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium">Dividir entre pessoas</span>
                <span className="text-[10px] text-muted-foreground">Rachar a compra em partes</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSplitMode(!splitMode)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 ${splitMode ? "bg-primary" : "bg-muted"}`}
            >
              <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${splitMode ? "translate-x-6" : "translate-x-1"}`} />
            </button>
          </div>

          {splitMode && (
            <div className="space-y-2 rounded-xl border border-border bg-gradient-to-br from-muted/30 to-transparent p-2.5">
              <Label className="text-xs">Selecione as pessoas</Label>
              <PersonSelect 
                multiSelect 
                value=""
                selectedValues={splitPeople} 
                onChange={(v) => setSplitPeople(v ? v.split(",") : [])}
                includeFamilia={false}
              />
              {splitPeople.length >= 2 && (
                <div className="flex items-center justify-between mt-1 px-1">
                  <span className="text-xs text-muted-foreground">Definir valor específico por pessoa</span>
                  <button
                    type="button"
                    onClick={() => setSplitCustom(!splitCustom)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary/20 ${splitCustom ? "bg-primary" : "bg-muted"}`}
                  >
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${splitCustom ? "translate-x-5" : "translate-x-1"}`} />
                  </button>
                </div>

              )}
              {splitCustom && splitPeople.length >= 2 && (
                <div className="space-y-1.5">
                  {splitPeople.map((p) => (
                    <div key={p} className="flex items-center gap-2">
                      <span className="text-xs w-24 truncate">{p}</span>
                      <Input type="number" step="0.01" placeholder="0,00" className="h-8 text-sm" value={splitAmounts[p] ?? ""} onChange={(e) => setSplitAmounts((prev) => ({ ...prev, [p]: e.target.value }))} />
                    </div>
                  ))}
                  <div className="text-[10px] text-muted-foreground">Soma: {brl(splitPeople.reduce((s, p) => s + Number(splitAmounts[p] || 0), 0))} / Total: {brl(Number(form.amount) || 0)}</div>
                </div>
              )}
              {splitPeople.length >= 2 && !splitCustom && Number(form.amount) > 0 && (
                <div className="text-xs text-muted-foreground">≈ {brl(Number(form.amount) / splitPeople.length)} por pessoa</div>
              )}
            </div>
          )}
        </>
      )}
      <Button type="submit" disabled={saving || (splitMode && splitPeople.length < 2)} className="w-full">{saving ? "Salvando…" : isEdit ? "Salvar alterações" : "Salvar lançamento"}</Button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 min-w-[140px] flex-1 sm:flex-none">
      <label className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70 ml-1">
        {label}
      </label>
      {children}
    </div>
  );
}

type AdjRow = { person: string; value: string };

function AdjustmentForm({ tx, existing, onDone }: { tx: any; existing: any[]; onDone: () => void }) {
  const invalidate = useInvalidate();
  const { data: people = [] } = usePeople();
  const total = Number(tx.amount) || 0;
  const [mode, setMode] = useState<"percent" | "amount">("amount");
  const [rows, setRows] = useState<AdjRow[]>(() => {
    if (existing.length > 0) {
      return existing.map((a) => ({ person: a.person, value: Number(a.amount).toFixed(2) }));
    }
    return [{ person: tx.person || "", value: total.toFixed(2) }];
  });
  const [saving, setSaving] = useState(false);

  // Converte valores ao alternar modo (pula a montagem inicial)
  const [didMount, setDidMount] = useState(false);
  useEffect(() => {
    if (!didMount) { setDidMount(true); return; }
    setRows((prev) => prev.map((r) => {
      const n = Number(r.value) || 0;
      if (mode === "percent") {
        // valores estavam em R$, converter para %
        const pct = total > 0 ? (n / total) * 100 : 0;
        return { ...r, value: pct.toFixed(2) };
      }
      // valores estavam em %, converter para R$
      const amt = total * (n / 100);
      return { ...r, value: amt.toFixed(2) };
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Re-detect when toggling: track previous mode via ref-style trick
  // Simplified: when user toggles we just convert assuming current values are in the *previous* unit.
  // To avoid double conversion on first render, gate with a flag.

  const sum = rows.reduce((s, r) => s + (Number(r.value) || 0), 0);
  const expected = mode === "percent" ? 100 : total;
  const valid = Math.abs(sum - expected) < 0.01 && rows.every((r) => r.person.trim());

  const setRow = (i: number, patch: Partial<AdjRow>) => setRows((r) => r.map((x, idx) => idx === i ? { ...x, ...patch } : x));
  const addRow = () => setRows((r) => [...r, { person: "", value: "0" }]);
  const removeRow = (i: number) => setRows((r) => r.filter((_, idx) => idx !== i));
  const splitEqual = () => {
    if (rows.length === 0) return;
    const per = mode === "percent" ? 100 / rows.length : total / rows.length;
    const perRounded = Math.round(per * 100) / 100;
    const lastAdj = mode === "percent"
      ? 100 - perRounded * (rows.length - 1)
      : total - perRounded * (rows.length - 1);
    setRows((r) => r.map((x, idx) => ({ ...x, value: (idx === r.length - 1 ? lastAdj : perRounded).toFixed(2) })));
  };

  const save = async () => {
    if (!valid) {
      toast.error(mode === "percent" ? "A soma precisa ser 100%" : `A soma precisa ser ${brl(total)}`);
      return;
    }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("não autenticado");
      // 1. Apagar ajustes antigos
      await supabase.from("transaction_adjustments").delete().eq("transaction_id", tx.id);
      
      // 2. Preparar novos ajustes
      const insertRows = rows.map((r) => {
        const amt = mode === "percent" ? +(total * (Number(r.value) / 100)).toFixed(2) : Number(r.value);
        return { user_id: user.id, transaction_id: tx.id, person: r.person.trim(), amount: amt };
      });
      
      // 3. Salvar novos ajustes
      const { error } = await supabase.from("transaction_adjustments").insert(insertRows);
      if (error) throw error;

      // 4. Se a transação já estava paga, precisamos atualizar o saldo das contas
      // Se antes Lorran devia 80 (e pagou 80) e agora deve 40 (ajuste), 
      // a diferença precisa voltar para a conta dele (estorno parcial ou total dependendo da lógica).
      if (tx.status === "paid") {
        invalidate("accounts");
      }

      toast.success("Ajuste salvo");
      onDone();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const removeAll = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("transaction_adjustments").delete().eq("transaction_id", tx.id);
      if (error) throw error;
      // 4. Se a transação já estava paga, precisamos atualizar o saldo das contas
      if (tx.status === "paid") {
        invalidate("accounts");
      }

      toast.success("Ajuste removido");
      onDone();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-muted/40 border border-border p-3 text-sm space-y-1">
        <div className="font-medium">{tx.description}</div>
        <div className="text-muted-foreground text-xs">
          Valor total: <strong className="text-foreground">{brl(total)}</strong>
          <span className="mx-2">·</span>
          Pagador original: <strong className="text-foreground">{tx.person ?? "—"}</strong>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-1 text-xs">
          <button type="button" onClick={() => setMode("amount")} className={`px-2.5 py-1 rounded-md border ${mode === "amount" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>R$</button>
          <button type="button" onClick={() => setMode("percent")} className={`px-2.5 py-1 rounded-md border ${mode === "percent" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"}`}>%</button>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={splitEqual}>Dividir igualmente</Button>
      </div>

      <div className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="flex-1">
              <PersonSelect value={r.person} onChange={(v) => setRow(i, { person: v })} extras={people.map((p: any) => p.name)} />
            </div>
            <Input
              type="number"
              step="0.01"
              value={r.value}
              onChange={(e) => setRow(i, { value: e.target.value })}
              className="w-28"
            />
            <span className="text-xs text-muted-foreground w-6">{mode === "percent" ? "%" : "R$"}</span>
            <button type="button" onClick={() => removeRow(i)} className="w-7 h-7 rounded-md flex items-center justify-center bg-muted text-muted-foreground hover:bg-destructive/20 hover:text-destructive" disabled={rows.length <= 1}>
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addRow} className="w-full">
          <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar pessoa
        </Button>
      </div>

      <div className={`text-xs ${valid ? "text-muted-foreground" : "text-destructive"}`}>
        Soma: {mode === "percent" ? `${sum.toFixed(2)}%` : brl(sum)} / Esperado: {mode === "percent" ? "100%" : brl(total)}
      </div>

      <div className="flex gap-2">
        {existing.length > 0 && (
          <Button type="button" variant="outline" className="flex-1" onClick={removeAll} disabled={saving}>
            Remover ajuste
          </Button>
        )}
        <Button type="button" className="flex-1" onClick={save} disabled={saving || !valid}>
          {saving ? "Salvando…" : "Salvar ajuste"}
        </Button>
      </div>
    </div>
  );
}
