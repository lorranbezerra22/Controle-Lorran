import { createFileRoute } from "@tanstack/react-router";
import { DatePicker, MonthPicker } from "@/components/date-picker";
import { ProtectedShell } from "@/components/ProtectedShell";
import { useCards, useInstallments, useCategories, useInvalidate, usePeople, useAccounts, useTransactions } from "@/lib/queries";
import { brl, fmtDate, monthLabel } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useMemo, useState, useEffect, useRef } from "react";

// Guard global contra duplo-submit em qualquer form desta aba
const __submitLock = { busy: false };
const __tryLock = () => { if (__submitLock.busy) return false; __submitLock.busy = true; return true; };
const __release = () => { __submitLock.busy = false; };
import { Plus, CreditCard, Check, Clock, Trash2, Pencil, Banknote, Receipt, Undo2, AlertTriangle, Users, Equal, SlidersHorizontal, X, Trash } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SmartInput } from "@/components/smart-input";
import { PersonSelect } from "@/components/person-select";
import { BANKS, findBank } from "@/lib/banks";
import { BankIcon } from "@/components/BankIcon";
import { cardPurchaseSchema, firstZodError } from "@/lib/schemas";
import { motion } from "framer-motion";
import { CountUp } from "@/components/CountUp";
import { PageHeader } from "@/components/PageHeader";


const todayLocalISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const normalizeName = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

const pickPaymentAccount = (accounts: any[], personName: string, bankFallbacks: string[] = [], overrideAccountId?: string | null) => {
  if (overrideAccountId === "none") return null;
  if (overrideAccountId) {
    const found = accounts.find(a => a.id === overrideAccountId);
    if (found) return found;
  }

  const target = normalizeName(personName);
  
  // Prioridade 1: Contas onde o account_name é EXATAMENTE o nome da pessoa
  const ownAccounts = accounts
    .filter((a: any) => normalizeName(a.account_name || "") === target)
    .sort((a: any, b: any) => Number(b.balance ?? 0) - Number(a.balance ?? 0));

  if (ownAccounts.length > 0) return ownAccounts[0];

  // Prioridade 2: Contas onde o account_name CONTÉM o nome da pessoa
  const partialMatch = accounts
    .filter((a: any) => normalizeName(a.account_name || "").includes(target))
    .sort((a: any, b: any) => Number(b.balance ?? 0) - Number(a.balance ?? 0));
    
  if (partialMatch.length > 0) return partialMatch[0];

  // Prioridade 3: Fallbacks de banco
  for (const bank of bankFallbacks) {
    const bankTarget = normalizeName(bank);
    const fallback = accounts.find((a: any) =>
      normalizeName(a.bank || "").includes(bankTarget) || normalizeName(a.bank_name || "").includes(bankTarget),
    );
    if (fallback) return fallback;
  }

  return undefined;
};

type PaymentSplit = {
  accountId: string;
  accountTayaneId?: string;
  amount: number;
  person: string;
  descriptionSuffix: string;
};

// Para "Família": retorna 1 registro com ambas as contas e person='Familia'.
// O trigger update_account_balance divide 50/50 automaticamente se account_id E account_tayane_id estiverem presentes.
// Se um pagador específico (paidByOverride) for informado, retornamos apenas a conta dele para débito 100%.
const buildPaymentSplits = (accounts: any[], person: string, amount: number, paidByOverride?: string | null, accountsOverride?: { accountId?: string | null, accountTayaneId?: string | null }): PaymentSplit[] => {
  const p = normalizeName(person);
  const isEstorno = amount < 0;
  const absAmount = Math.abs(amount);
  
  // Se for despesa de Família
  if (p === "familia") {
    const lorranAcc = pickPaymentAccount(accounts, "Lorran", ["revolut", "nubank"], accountsOverride?.accountId);
    const tayaneAcc = pickPaymentAccount(accounts, "Tayane", ["mercado pago", "mercado"], accountsOverride?.accountTayaneId);

    // Casos de Override para Família: se um pagador individual foi selecionado
    if (paidByOverride && (normalizeName(paidByOverride) === "lorran" || normalizeName(paidByOverride) === "tayane")) {
      const isLorran = normalizeName(paidByOverride) === "lorran";
      const target = isLorran ? lorranAcc : tayaneAcc;
      
      if (target) {
        return [{
          accountId: target.id,
          accountTayaneId: undefined, // Garantir que não haja split automático
          amount: absAmount,
          person: paidByOverride,
          descriptionSuffix: ` (Cota individual de ${paidByOverride} em despesa Família)`
        }];
      }
    }

    // Fluxo padrão 50/50: debita de ambas as contas
    if (lorranAcc && tayaneAcc) {
      return [{
        accountId: lorranAcc.id,
        accountTayaneId: tayaneAcc.id,
        amount: absAmount, 
        person: "Familia",
        descriptionSuffix: " (Família 50/50)",
      }];
    }
    
    // Fallback: Se não encontrou as duas contas ideais, tenta buscar qualquer uma de cada pessoa
    const anyLorran = accounts.find(a => normalizeName(a.account_name || "").includes("lorran"));
    const anyTayane = accounts.find(a => normalizeName(a.account_name || "").includes("tayane"));
    
    if (anyLorran && anyTayane) {
      return [{
        accountId: anyLorran.id,
        accountTayaneId: anyTayane.id,
        amount: absAmount,
        person: "Familia",
        descriptionSuffix: " (Família 50/50 - Fallback)",
      }];
    }
    const only = lorranAcc || tayaneAcc;
    if (only) return [{ accountId: only.id, amount: absAmount, person: "Familia", descriptionSuffix: "" }];
    return [];
  }

  // Despesa individual (Lorran ou Tayane)
  const payer = paidByOverride ? normalizeName(paidByOverride) : p;
  const target = pickPaymentAccount(accounts, payer, [payer], accountsOverride?.accountId);
  if (target) return [{ accountId: target.id, amount: absAmount, person: payer, descriptionSuffix: "" }];
  return [];
};


export const Route = createFileRoute("/cartoes")({
  component: () => <ProtectedShell><CartoesPage /></ProtectedShell>,
  head: () => ({ meta: [{ title: "Cartões — Gestão Família" }] }),
});

const getInstallmentPaymentState = (installment: any) => {
  const total = Number(installment.amount || 0);
  const rawPaid = Number(installment.paid_amount || 0);

  // Estorno / crédito (valor negativo): reduz a fatura em vez de somar.
  // O abatimento permanece mesmo após marcar como pago — pagar um estorno
  // não deve aumentar o restante a pagar.
  if (total < 0) {
    const isPaid = installment.status === "paid";
    return {
      total,
      paid: isPaid ? total : 0,
      remaining: total, // sempre negativo -> sempre abate do restante
      hasPaid: isPaid,
      hasPending: true, // sempre incluir nos totais de restante
    };
  }

  const paid = installment.status === "paid" && rawPaid <= 0 ? total : Math.min(total, Math.max(0, rawPaid));
  const remaining = installment.status === "paid" ? 0 : Math.max(0, Number((total - paid).toFixed(2)));

  // Se for Família, o total e o restante são divididos por 2 para exibição individual se houver filtros.
  // Porém, aqui retornamos o estado absoluto. A divisão acontece no useMemo(totals).

  return {
    total,
    paid,
    remaining,
    hasPaid: installment.status === "paid" || paid > 0,
    hasPending: remaining > 0.01,
  };
};

const getStatusFilteredAmount = (installment: any, statusFilter: "all" | "paid" | "pending") => {
  const payment = getInstallmentPaymentState(installment);
  if (statusFilter === "paid") return payment.paid;
  if (statusFilter === "pending") return payment.remaining;
  return payment.total;
};

function CartoesPage() {
  const { data: cards = [] } = useCards();
  const { data: inst = [] } = useInstallments();
  const { data: cats = [] } = useCategories();
  const { data: people = [] } = usePeople();
  const { data: accounts = [] } = useAccounts();
  const invalidate = useInvalidate();
  const { data: allTransactions = [] } = useTransactions();
  const [newCardOpen, setNewCardOpen] = useState(false);
  const [newPurchaseOpen, setNewPurchaseOpen] = useState(false);
  const [editingPurchase, setEditingPurchase] = useState<any>(null);
  const [partialPayOpen, setPartialPayOpen] = useState<any>(null);
  const [removePaymentOpen, setRemovePaymentOpen] = useState<any>(null);
  const [editingTransactionId, setEditingTransactionId] = useState<string | null>(null);
  const [editPaidOpen, setEditPaidOpen] = useState<any>(null);
  const [editingCard, setEditingCard] = useState<any>(null);
  const [deleting, setDeleting] = useState<any>(null);
  const [showProgressInfo, setShowProgressInfo] = useState<any>(null);
  
  const lsGet = (k: string, d: string) => {
    if (typeof window === "undefined") return d;
    return window.localStorage.getItem(`cartoes:${k}`) ?? d;
  };
  const lsSet = (k: string, v: string) => {
    if (typeof window !== "undefined") window.localStorage.setItem(`cartoes:${k}`, v);
  };
  const [personFilter, _setPersonFilter] = useState<string>(() => lsGet("personFilter", "all"));
  const [personFilter2, _setPersonFilter2] = useState<string>(() => lsGet("personFilter2", "all"));
  const [cardFilter, _setCardFilter] = useState<string>(() => lsGet("cardFilter", "all"));
  const [brandFilter, _setBrandFilter] = useState<string>(() => lsGet("brandFilter", "all"));
  const [categoryFilter, _setCategoryFilter] = useState<string>(() => lsGet("categoryFilter", "all"));
  const [statusFilter, _setStatusFilter] = useState<"all" | "paid" | "pending">(() => (lsGet("statusFilter", "all") as any));
  const [purchaseFrom, _setPurchaseFrom] = useState<string>(() => lsGet("purchaseFrom", ""));
  const [purchaseTo, _setPurchaseTo] = useState<string>(() => lsGet("purchaseTo", ""));
  const setPersonFilter = (v: string) => { _setPersonFilter(v); lsSet("personFilter", v); };
  const setPersonFilter2 = (v: string) => { _setPersonFilter2(v); lsSet("personFilter2", v); };

  const setCardFilter = (v: string) => { _setCardFilter(v); lsSet("cardFilter", v); };
  const setBrandFilter = (v: string) => { _setBrandFilter(v); lsSet("brandFilter", v); };
  const setCategoryFilter = (v: string) => { _setCategoryFilter(v); lsSet("categoryFilter", v); };
  const setStatusFilter = (v: "all" | "paid" | "pending") => { _setStatusFilter(v); lsSet("statusFilter", v); };
  const setPurchaseFrom = (v: string) => { _setPurchaseFrom(v); lsSet("purchaseFrom", v); };
  const setPurchaseTo = (v: string) => { _setPurchaseTo(v); lsSet("purchaseTo", v); };



  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const [monthN, _setMonthN] = useState<number>(() => {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem("cartoes:selM") : null;
    return raw !== null ? Number(raw) + 1 : next.getMonth() + 1;
  });
  const [year, _setYear] = useState<number>(() => {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem("cartoes:selY") : null;
    return raw !== null ? Number(raw) : next.getFullYear();
  });
  const setMonthN = (v: number) => {
    _setMonthN(v);
    if (typeof window !== "undefined") window.localStorage.setItem("cartoes:selM", String(v - 1));
  };
  const setYear = (v: number) => {
    _setYear(v);
    if (typeof window !== "undefined") window.localStorage.setItem("cartoes:selY", String(v));
  };
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  const norm = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  const matchPerson = (rawPerson: string) => {
    const selected = Array.from(new Set([personFilter, personFilter2].filter((s) => s && s !== "all")));
    if (selected.length === 0) return true;
    const p = norm(rawPerson || "");
    return selected.some((s) => p === norm(s));
  };

  const monthInst = useMemo(() => {
    const filtered = inst.filter((i: any) => {
      const d = new Date(i.due_at + "T00:00:00");
      if (d.getFullYear() !== year || d.getMonth() !== monthN - 1) return false;
      if (cardFilter !== "all" && i.card_id !== cardFilter) return false;
      if (brandFilter !== "all" && i.cartao_compras?.brand !== brandFilter) return false;
      if (categoryFilter !== "all" && i.cartao_compras?.category_id !== categoryFilter) return false;
      const payment = getInstallmentPaymentState(i);
      if (statusFilter === "paid" && !payment.hasPaid) return false;
      if (statusFilter === "pending" && !payment.hasPending) return false;
      if (!matchPerson(i.cartao_compras?.person ?? "")) return false;
      const pd = i.cartao_compras?.purchase_date as string | undefined;
      if (purchaseFrom && (!pd || pd < purchaseFrom)) return false;
      if (purchaseTo && (!pd || pd > purchaseTo)) return false;
      return true;
    });

    // Ordenar por data da compra (mais recente primeiro)
    return filtered.sort((a: any, b: any) => {
      const dateA = a.cartao_compras?.purchase_date || "";
      const dateB = b.cartao_compras?.purchase_date || "";
      if (dateA > dateB) return -1;
      if (dateA < dateB) return 1;
      return 0;
    });
  }, [inst, year, monthN, personFilter, personFilter2, cardFilter, brandFilter, categoryFilter, statusFilter, purchaseFrom, purchaseTo]);

  useEffect(() => {
    const handleOpen = (e: any) => {
      setPartialPayOpen(e.detail);
    };
    window.addEventListener('open-partial-pay', handleOpen as any);
    return () => window.removeEventListener('open-partial-pay', handleOpen as any);
  }, []);


  const personOptions = useMemo(() => {
    // Retorna apenas as pessoas cadastradas no sistema
    return people.map((p: any) => p.name).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [people]);

  const totals = useMemo(() => {
    const map: Record<string, { fatura: number; restante: number; brandTotals: Record<string, { fatura: number; restante: number }> }> = {};
    const isFamilia = (s: string) => (s || "").toLowerCase().trim() === "familia";

    monthInst.forEach((i: any) => {
      const card = cards.find((c: any) => c.id === i.card_id);
      const effectiveCardId = i.card_id;
      const m = (map[effectiveCardId] = map[effectiveCardId] ?? { fatura: 0, restante: 0, brandTotals: {} });
      const payment = getInstallmentPaymentState(i);
      const v = getStatusFilteredAmount(i, statusFilter);
      
      const person = (i.cartao_compras?.person || "").toLowerCase().trim();
      const filter = personFilter !== "all" ? personFilter.toLowerCase().trim() : "all";
      const filter2 = personFilter2 !== "all" ? personFilter2.toLowerCase().trim() : "all";

      const isFamilia = person === "familia";
      
      // Se tiver filtro ativo, só conta se a pessoa bater com algum dos filtros
      const matchesFilter = filter === "all" || person === filter || (isFamilia && filter === "lorran") || person === filter2 || (isFamilia && filter2 === "lorran");

      if (matchesFilter) {
        let valueForFilter = v;
        
        // Lógica de abatimento proporcional para Família
        if (isFamilia && (filter !== "all" || filter2 !== "all")) {
          // Se alguém já pagou uma parte, precisamos saber QUEM pagou
          const partials = i.metadata?.partial_payments || [];
          const paidByLorran = partials.filter((p: any) => normalizeName(p.person) === "lorran").reduce((s: number, p: any) => s + Number(p.amount), 0);
          const paidByTayane = partials.filter((p: any) => normalizeName(p.person) === "tayane").reduce((s: number, p: any) => s + Number(p.amount), 0);
          
          const totalOriginal = Number(i.amount) || 0;
          const quota = totalOriginal / 2;
          
          // Se o filtro é Lorran
          if (filter === "lorran" || filter2 === "lorran") {
            const myPaid = paidByLorran;
            const myRemaining = Math.max(0, quota - myPaid);
            valueForFilter = statusFilter === "paid" ? myPaid : (statusFilter === "pending" ? myRemaining : quota);
          } else if (filter === "tayane" || filter2 === "tayane") {
            const myPaid = paidByTayane;
            const myRemaining = Math.max(0, quota - myPaid);
            valueForFilter = statusFilter === "paid" ? myPaid : (statusFilter === "pending" ? myRemaining : quota);
          } else {
            // "Familia" ou "Todos" - mostra o consolidado (já está em 'v')
            valueForFilter = v;
          }
        }
        
        m.fatura += valueForFilter;
        
        const b = i.cartao_compras?.brand || "Default";
        m.brandTotals[b] = m.brandTotals[b] ?? { fatura: 0, restante: 0 };
        m.brandTotals[b].fatura += valueForFilter;

        if (statusFilter !== "paid" && payment.hasPending) {
          m.restante += valueForFilter; // Já calculado acima respeitando o filtro
          const b = i.cartao_compras?.brand || "Default";
          m.brandTotals[b] = m.brandTotals[b] ?? { fatura: 0, restante: 0 };
          m.brandTotals[b].restante += valueForFilter;
        }
      }
    });
    return map;
  }, [monthInst, personFilter, personFilter2, statusFilter]);



  const getPaymentSplits = (person: string, amount: number, paidByOverride?: string | null) => buildPaymentSplits(accounts, person, amount, paidByOverride);

  const togglePaid = async (i: any, notes?: string, paidByOverride?: string | null, accountsOverride?: { accountId: string, accountTayaneId?: string }) => {
    const isEstorno = Number(i.amount) < 0;
    const isPaying = i.status !== "paid";
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");
      
      const originalPerson = i.cartao_compras?.person || "";
      const useOverride = !!(paidByOverride && paidByOverride.trim() && normalizeName(paidByOverride) !== normalizeName(originalPerson));
      const costPerson = useOverride ? paidByOverride!.trim() : originalPerson;

      if (isPaying) {
        const amount = Number(i.amount);
        
        // 1. Criar lançamento financeiro (débito para despesa, CRÉDITO para estorno)
        // O estorno (amount negativo) gera uma transação 'income' para repor o saldo na conta
        const splits = buildPaymentSplits(accounts, originalPerson, amount, paidByOverride, accountsOverride);
        
        // Se houver splits (contas selecionadas), cria as transações
        if (splits.length > 0) {
          for (const split of splits) {
            const finalAccountId = split.accountTayaneId 
              ? (accountsOverride?.accountId || split.accountId)
              : (accountsOverride?.accountId || split.accountId);
            
            const finalAccountTayaneId = split.accountTayaneId
              ? (accountsOverride?.accountTayaneId || split.accountTayaneId)
              : null;

            const { error: txErr } = await supabase.from("transacoes").insert({
              user_id: user.id,
              description: `${i.cartao_compras?.description || "Pagamento Cartão"} - Parcela ${i.installment_number}${split.descriptionSuffix}${isEstorno ? " (Estorno/Reembolso)" : ""}`,
              amount: Math.abs(split.amount), 
              kind: isEstorno ? "income" : "expense", 
              status: "paid",
              due_at: todayLocalISO(),
              posted_at: todayLocalISO(),
              account_id: finalAccountId,
              account_tayane_id: finalAccountTayaneId, 
              person: split.person,
              card_installment_id: i.id,
              category_id: "2db053ad-a0e4-4beb-8f31-3be8328559b5",
            } as any);
            if (txErr) throw txErr;
          }
        }

        // 2. Registrar participação total na nova tabela
        const { error: partError } = await supabase.from("participacoes_parcelas").upsert({
          user_id: user.id,
          installment_id: i.id,
          person: costPerson,
          amount: amount,
          status: "paid",
          paid_at: new Date().toISOString()
        } as any, { onConflict: 'installment_id,person' });

        if (partError) throw partError;

        const { error } = await supabase.from("cartao_parcelas").update({
          status: "paid",
          paid_amount: amount,
          paid_by: paidByOverride || null,
        } as any).eq("id", i.id);

        if (error) throw error;
        toast.success(isEstorno ? "Estorno confirmado e saldo estornado para as contas." : "Parcela marcada como paga.");
      } else {
        // Cancelar Pagamento: Remove transações, participações e reseta parcela
        await supabase.from("transacoes").delete().eq("card_installment_id", i.id);
        
        await supabase.from("participacoes_parcelas").delete().eq("installment_id", i.id);
        
        await supabase.from("cartao_parcelas").update({ 
          status: "pending", 
          paid_amount: 0, 
          paid_by: null,
          metadata: { ...((i.metadata as any) || {}), partial_payments: [] }
        } as any).eq("id", i.id);
        
        toast.success("Pagamento removido");
      }
      invalidate("installments");
      invalidate("accounts");
    } catch (err: any) {
      toast.error(err.message);
    }
  };
  const removeAll = async (i: any) => {
    const { error } = await supabase.from("cartao_compras").delete().eq("id", i.purchase_id);
    if (error) toast.error(error.message); else { invalidate("installments"); toast.success("Compra removida"); setDeleting(null); }
  };
  const removeOne = async (i: any) => {
    const { error } = await supabase.from("cartao_parcelas").delete().eq("id", i.id);
    if (error) toast.error(error.message); else { invalidate("installments"); toast.success("Parcela removida"); setDeleting(null); }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        icon={CreditCard}
        eyebrow="Carteira"
        title="Cartões de crédito"
        subtitle="Limites, faturas e compras parceladas"
        actions={
          <>
            <Dialog open={newCardOpen} onOpenChange={setNewCardOpen}>
              <DialogTrigger asChild><Button variant="outline" size="sm" className="rounded-full"><Plus className="w-4 h-4 mr-1" /> Novo cartão</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Novo cartão</DialogTitle></DialogHeader>
                <CardForm onDone={() => { setNewCardOpen(false); invalidate("cards"); }} />
              </DialogContent>
            </Dialog>
            
            <Dialog open={newPurchaseOpen} onOpenChange={setNewPurchaseOpen}>
              <DialogTrigger asChild><Button size="sm" className="rounded-full shadow-md" disabled={cards.length === 0}><Plus className="w-4 h-4 mr-1" /> Nova compra</Button></DialogTrigger>
              <DialogContent className="max-h-[85vh] overflow-y-auto">
                <DialogHeader><DialogTitle>Nova compra no cartão</DialogTitle></DialogHeader>
                <details className="group rounded-lg border border-amber-500/30 bg-amber-500/10 text-xs text-amber-200">
                  <summary className="flex items-center justify-between gap-2 px-3 py-2 cursor-pointer list-none font-semibold select-none">
                    <span>💡 Dica: registrando estornos</span>
                    <svg className="w-4 h-4 transition-transform group-open:rotate-180" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                  </summary>
                  <div className="px-3 pb-3 space-y-1 border-t border-amber-500/20 pt-2">
                    <div>Recebeu um estorno que já abateu na fatura? Lance aqui com <b>valor negativo</b> (ex: −300), <b>mesma categoria</b> da compra original e <b>data do mês da fatura</b> em que o crédito apareceu.</div>
                    <div>Não precisa quitar parcelas futuras — o valor negativo já abate na categoria e no total da fatura automaticamente.</div>
                  </div>
                </details>
                <PurchaseForm cards={cards} cats={cats} onDone={() => { setNewPurchaseOpen(false); invalidate("installments"); }} />
              </DialogContent>
            </Dialog>
          </>
        }
      />



      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {cards.map((c: any, idx: number) => {
          const allRelevantIds = [c.id];
          const usado = inst.filter((i: any) => allRelevantIds.includes(i.card_id) && i.status === "pending").reduce((s: number, i: any) => s + Number(i.amount), 0);
          const pct = c.credit_limit > 0 ? Math.min(100, (usado / Number(c.credit_limit)) * 100) : 0;
          return (
            <motion.div 
              key={c.id} 
              initial={{ opacity: 0, y: 16 }} 
              animate={{ opacity: 1, y: 0 }} 
              transition={{ duration: 0.4, delay: idx * 0.06, ease: [0.22, 1, 0.36, 1] }} 
              whileHover={{ y: -3, transition: { duration: 0.2 } }} 
              className="rounded-xl p-5 border border-border cursor-pointer hover:border-primary/50 transition-colors group relative overflow-hidden" 
              style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-elegant)" }} 
              onClick={() => setEditingCard(c)}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <div className="font-semibold text-lg truncate">{c.name}</div>
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate uppercase tracking-wider font-semibold opacity-90 leading-tight">
                    {c.bank ? `${findBank(c.bank).name} • ` : ""}
                    {c.metadata?.brands?.length > 0 ? (
                      <span className="text-primary/70 font-bold">{c.metadata.brands.length} Bandeiras</span>
                    ) : (
                      <>
                        {c.metadata?.brand && <span className="capitalize">{c.metadata.brand} </span>}
                        {c.last_digits && `•••• ${c.last_digits}`}
                      </>
                    )}
                    <div className="mt-0.5 opacity-60">F. {c.closing_day} • V. {c.due_day}</div>
                  </div>

                </div>
                <div className="shrink-0">
                  <BankIcon bank={c.bank} size={48} square />
                </div>
              </div>
              <div className="text-xs text-muted-foreground flex justify-between mb-1">
                <span>Limite usado</span><span>{brl(usado)} de {brl(c.credit_limit)}</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden mb-3">
                <div className="h-full" style={{ width: `${pct}%`, background: pct > 80 ? "oklch(0.65 0.24 22)" : "var(--gradient-primary)" }} />
              </div>
              <div className="pt-3 border-t border-border space-y-2">
                <div className="flex items-end justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">Fatura {monthLabel(monthN-1)}{personFilter !== "all" && ` • ${personFilter}`}</div>
                    <div className="text-xl font-bold text-foreground tabular-nums mt-1.5">
                      <CountUp value={totals[c.id]?.fatura ?? 0} format={brl} />
                    </div>
                  </div>
                  {totals[c.id]?.brandTotals && Object.keys(totals[c.id].brandTotals).length > 1 && (
                    <div className="flex flex-col gap-3 pr-3 border-r border-border/50">
                      {Object.entries(totals[c.id].brandTotals).map(([brand, data], bi) => (
                        <div key={bi} className="flex flex-col gap-1.5">
                          <span className="text-[9px] uppercase text-muted-foreground font-bold leading-none">{brand}</span>
                          <div className="flex flex-col leading-tight">
                            <span className="text-[11px] font-bold">{brl(data.fatura)}</span>
                            {data.restante > 0.01 && (
                              <span className="text-[9px] text-destructive font-semibold mt-1">Rest. {brl(data.restante)}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {(() => {
                    const rest = totals[c.id]?.restante ?? 0;
                    const paid = rest === 0;
                    return (
                      <div className={`flex flex-col items-end px-2.5 py-1.5 rounded-lg border gap-0.5 ${paid ? "border-success/30 bg-success/10" : "border-destructive/25 bg-destructive/10"}`}>
                        <span className={`text-[10px] uppercase tracking-[0.18em] font-bold ${paid ? "text-success" : "text-destructive"}`}>{paid ? "Liquidada" : "Restante"}</span>
                        <span className={`text-sm font-bold tabular-nums ${paid ? "text-success" : "text-destructive"}`}>{brl(rest)}</span>
                      </div>
                    );
                  })()}
                </div>
              </div>



            </motion.div>
          );
        })}
        {cards.length > 0 && (() => {
          const limiteTotal = cards.reduce((s: number, c: any) => s + Number(c.credit_limit), 0);
          const usadoTotal = inst.filter((i: any) => i.status === "pending").reduce((s: number, i: any) => s + Number(i.amount), 0);
          const disponivel = limiteTotal - usadoTotal;
          const pct = limiteTotal > 0 ? Math.min(100, (usadoTotal / limiteTotal) * 100) : 0;
          return (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              whileHover={{ y: -3, transition: { duration: 0.2 } }}
              className="rounded-xl p-5 border border-dashed border-border"
              style={{ background: "var(--gradient-card)" }}
            >
              <div className="text-xs uppercase text-muted-foreground tracking-wide mb-2">Limite total</div>
              <div className="text-2xl font-bold"><CountUp value={disponivel} format={brl} /></div>
              <div className="text-xs text-muted-foreground mb-3">disponível de {brl(limiteTotal)}</div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full" style={{ width: `${pct}%`, background: pct > 80 ? "oklch(0.65 0.24 22)" : "var(--gradient-primary)" }} />
              </div>
              <div className="text-xs text-muted-foreground mt-2 flex justify-between"><span>Usado</span><span>{brl(usadoTotal)}</span></div>
            </motion.div>
          );
        })()}
        {cards.length === 0 && (
          <div className="col-span-full rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
            Nenhum cartão cadastrado ainda. Clique em "Novo cartão" para começar.
          </div>
        )}
      </div>

      <div className="tech-panel overflow-hidden" style={{ boxShadow: "var(--shadow-elegant)" }}>
        <div className="p-4 flex items-center justify-between flex-wrap gap-3 border-b border-border">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="font-semibold">Fatura por mês</h2>
            <span className="text-sm text-muted-foreground">Total: <strong className="text-foreground">{brl(monthInst.reduce((s: number, i: any) => s + getStatusFilteredAmount(i, statusFilter), 0))}</strong></span>
          </div>
          <div className="flex items-end gap-3 flex-wrap">
            {(() => { const activeCls = "border-primary ring-2 ring-primary/30 bg-primary/5"; const nowD = new Date(); const nextD = new Date(nowD.getFullYear(), nowD.getMonth() + 1, 1); const monthActive = true; const yearActive = true; return (
            <>
            <Field label="Pessoa">
              <Select value={personFilter} onValueChange={setPersonFilter}>
                <SelectTrigger className={`w-auto min-w-[140px] h-10 rounded-xl transition-all shadow-sm ${personFilter !== "all" ? "border-gold/50 ring-2 ring-gold/20 bg-gold/5 font-medium" : "border-border text-muted-foreground"}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as pessoas</SelectItem>
                  {personOptions.map((p: string) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="+ Pessoa">
              <Select value={personFilter2} onValueChange={setPersonFilter2}>
                <SelectTrigger className={`w-auto min-w-[120px] h-10 rounded-xl transition-all shadow-sm ${personFilter2 !== "all" ? "border-gold/50 ring-2 ring-gold/20 bg-gold/5 font-medium" : "border-border text-muted-foreground"}`}>
                  <SelectValue placeholder="Adicionar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Adicionar pessoa</SelectItem>
                  {personOptions.map((p: string) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Cartão">
              <Select value={cardFilter} onValueChange={setCardFilter}>
                <SelectTrigger className={`w-auto min-w-[140px] h-10 rounded-xl transition-all shadow-sm ${cardFilter !== "all" ? "border-gold/50 ring-2 ring-gold/20 bg-gold/5 font-medium" : "border-border text-muted-foreground"}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os cartões</SelectItem>
                  {cards.map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {cardFilter !== "all" && (() => {
              const card = cards.find((c: any) => c.id === cardFilter);
              const metadata = card?.metadata as { brands?: any[] } | undefined;
              const brands = metadata?.brands || [];
              if (brands.length <= 1) return null;
              return (
                <Field label="Bandeira">
                  <Select value={brandFilter} onValueChange={setBrandFilter}>
                    <SelectTrigger className={`w-auto min-w-[140px] h-10 rounded-xl transition-all shadow-sm ${brandFilter !== "all" ? "border-gold/50 ring-2 ring-gold/20 bg-gold/5 font-medium" : "border-border text-muted-foreground"}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas bandeiras</SelectItem>
                      {brands.map((b: any, bi: number) => {
                        const label = `${b.brand.charAt(0).toUpperCase()}${b.brand.slice(1)} ${b.last_digits}`;
                        return <SelectItem key={bi} value={label}>{label}</SelectItem>;
                      })}
                    </SelectContent>
                  </Select>
                </Field>
              );
            })()}
            <Field label="Categoria">
              <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                <SelectTrigger className={`w-auto min-w-[140px] ${categoryFilter !== "all" ? activeCls : ""}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas categorias</SelectItem>
                  {cats.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ""}{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Status">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger className={`w-auto min-w-[120px] ${statusFilter !== "all" ? activeCls : ""}`}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos status</SelectItem>
                  <SelectItem value="paid">Pagos</SelectItem>
                  <SelectItem value="pending">Em aberto</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            <Field label="Compra de">
              <DatePicker value={purchaseFrom} onChange={(v) => setPurchaseFrom(v)} />
            </Field>
            <Field label="Compra até">
              <DatePicker value={purchaseTo} onChange={(v) => setPurchaseTo(v)} />
            </Field>
            {(purchaseFrom || purchaseTo) && (
              <Button size="sm" variant="ghost" onClick={() => { setPurchaseFrom(""); setPurchaseTo(""); }}>Limpar datas</Button>
            )}
            <Field label="Mês">
              <Select value={String(monthN)} onValueChange={(v) => setMonthN(Number(v))}>
                <SelectTrigger className={`w-auto min-w-[120px] ${monthActive ? activeCls : ""}`}><SelectValue /></SelectTrigger>
                <SelectContent>{Array.from({ length: 12 }, (_, mi) => <SelectItem key={mi} value={String(mi + 1)}>{monthLabel(mi)}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            <Field label="Ano">
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className={`w-auto min-w-[100px] ${yearActive ? activeCls : ""}`}><SelectValue /></SelectTrigger>
                <SelectContent>{years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
              </Select>
            </Field>
            </>
            ); })()}
            <Button
              size="sm"
              variant="outline"
              disabled={monthInst.length === 0 || monthInst.every((i: any) => i.status === "paid")}
              onClick={async () => {
                const pending = monthInst.filter((i: any) => i.status !== "paid");
                if (pending.length === 0) return;
                
                if (!confirm(`Pagar todas as ${pending.length} parcelas deste mês? Isso irá abater o saldo total das suas contas.`)) return;
                
                let successCount = 0;
                for (const i of pending) {
                  try {
                    await togglePaid(i);
                    successCount++;
                  } catch (e) {
                    console.error(e);
                  }
                }
                
                if (successCount > 0) {
                  toast.success(`${successCount} parcelas pagas com sucesso.`);
                  invalidate("installments");
                }
              }}
            ><Check className="w-4 h-4 mr-1" /> Pagar fatura</Button>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">Vencimento</th>
                <th className="text-left p-3 hidden sm:table-cell">Data compra</th>
                <th className="text-left p-3">Cartão</th>
                <th className="text-left p-3">Descrição</th>
                <th className="text-left p-3 hidden sm:table-cell">Categoria</th>
                <th className="text-left p-3 hidden md:table-cell">Pessoa</th>
                <th className="text-left p-3 hidden md:table-cell">Parcela</th>
                <th className="text-right p-3">Valor</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {monthInst.length === 0 && (
                <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Sem parcelas neste mês.</td></tr>
              )}
              {monthInst.map((i: any) => {
                const total = Number(i.amount);
                const isPartial = i.paid_amount && Number(i.paid_amount) > 0;
                const paidValue = Number(i.paid_amount || 0);
                const displayedValue = getStatusFilteredAmount(i, statusFilter);
                const pct = total > 0 ? Math.min(100, (paidValue / total) * 100) : 0;
                
                return (
                <tr key={i.id} className="border-t border-border hover:bg-muted/30">
                  <td className="p-3 whitespace-nowrap text-muted-foreground">{fmtDate(i.due_at)}</td>
                  <td className="p-3 whitespace-nowrap text-muted-foreground hidden sm:table-cell">{i.cartao_compras?.purchase_date ? fmtDate(i.cartao_compras.purchase_date) : "—"}</td>
                  <td className="p-3">
                    <div className="flex flex-col gap-0.5">
                      <span className="inline-flex items-center gap-2">
                        <BankIcon bank={i.cartoes?.bank || i.cartoes?.name} size={18} square />
                        {i.cartoes?.name}
                      </span>
                      {i.cartao_compras?.brand && (
                        <span className="text-[10px] text-muted-foreground ml-6">
                          {i.cartao_compras.brand}
                        </span>
                      )}
                    </div>
                  </td>

                  <td className="p-3 font-medium">
                    <div className="flex flex-col">
                      <span>{i.cartao_compras?.description}</span>
                      {isPartial && i.status !== "paid" && (
                        <div 
                          className="mt-1 w-24 cursor-help"
                          onClick={(e) => {
                            e.stopPropagation();
                            setShowProgressInfo(i);
                          }}
                        >
                          <div className="flex justify-between text-[10px] mb-0.5 text-muted-foreground">
                            <span>{Math.round(pct)}% pago</span>
                          </div>
                          <div className="h-1 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-success transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="p-3 hidden sm:table-cell text-muted-foreground">
                    {i.cartao_compras?.categorias ? (
                      <span className="inline-flex items-center gap-1.5">
                        {i.cartao_compras.categorias.icon && <span>{i.cartao_compras.categorias.icon}</span>}
                        <span>{i.cartao_compras.categorias.name}</span>
                      </span>
                    ) : "—"}
                  </td>
                  <td className="p-3 hidden md:table-cell text-muted-foreground">{i.cartao_compras?.person ?? "—"}</td>
                  <td className="p-3 hidden md:table-cell text-muted-foreground">{i.installment_number}/{i.cartao_compras?.installments_count}</td>
                  <td className="p-3 text-right">
                    <div className="font-semibold">{brl(displayedValue)}</div>
                    {isPartial && i.status !== "paid" && (
                      <div className="text-[10px] text-muted-foreground">Falta {brl(total - paidValue)}</div>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => setEditingPurchase({ id: i.purchase_id, ...i.cartao_compras, card_id: i.card_id, _installment: i, cards })} title="Editar compra" className="w-7 h-7 rounded-md flex items-center justify-center bg-muted text-muted-foreground hover:bg-primary/20 hover:text-primary">
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button 
                        onClick={() => {
                          if (i.status === "paid" || isPartial || Number(i.amount) < 0) {
                            setRemovePaymentOpen(i);
                          } else {
                            setPartialPayOpen(i);
                          }
                        }} 
                        onContextMenu={(e) => {
                          e.preventDefault();
                          if (isPartial || i.status === "paid") setEditPaidOpen(i);
                        }}
                        className={`w-7 h-7 rounded-md flex items-center justify-center ${i.status === "paid" ? "bg-success/20 text-success" : (Number(i.amount) < 0 ? "bg-emerald-500/15 text-emerald-500" : "bg-muted text-muted-foreground hover:bg-warning/20 hover:text-warning")}`}
                        title={Number(i.amount) < 0 
                          ? (i.status === "paid" ? "Estorno confirmado (Clique para remover)" : "Estorno pendente (Clique para confirmar)")
                          : (i.status === "paid" ? "Remover/Editar pagamento" : (isPartial ? "Antecipar pagamento / Clique direito: ajuste manual" : "Antecipar pagamento"))}
                      >
                        {i.status === "paid" ? <Check className="w-3.5 h-3.5" /> : (Number(i.amount) < 0 ? <Undo2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />)}
                      </button>
                      <button onClick={() => setDeleting(i)} className="w-7 h-7 rounded-md flex items-center justify-center bg-muted text-muted-foreground hover:bg-destructive/20 hover:text-destructive">
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


      <Dialog open={!!editingCard} onOpenChange={(o) => !o && setEditingCard(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingCard?.id ? "Editar cartão" : "Novo cartão"}</DialogTitle></DialogHeader>
          {editingCard && <CardForm initialData={editingCard} onDone={() => { setEditingCard(null); invalidate("cards"); }} />}
        </DialogContent>
      </Dialog>




      <Dialog open={!!editingPurchase} onOpenChange={(o) => !o && setEditingPurchase(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar compra</DialogTitle></DialogHeader>
          {editingPurchase && (
            <EditPurchaseForm
              cats={cats}
              cards={cards}
              purchase={editingPurchase}
              onDone={() => { setEditingPurchase(null); invalidate("installments"); }}
            />

          )}
        </DialogContent>
      </Dialog>


      <Dialog open={!!partialPayOpen} onOpenChange={(o) => !o && setPartialPayOpen(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Antecipar Pagamento</DialogTitle>
          </DialogHeader>
          {partialPayOpen && (
            <AnticipatePayForm 
              installment={partialPayOpen} 
              onFullPay={(notes, paidBy, accountsOverride) => { togglePaid(partialPayOpen, notes, paidBy, accountsOverride); setPartialPayOpen(null); }}
              onDone={() => { setPartialPayOpen(null); invalidate("installments"); invalidate("accounts"); invalidate("transactions"); }} 
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!removePaymentOpen} onOpenChange={(o) => { if (!o) { setRemovePaymentOpen(null); setEditingTransactionId(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{(removePaymentOpen as any)?._mode === "edit" ? "Editar Pagamento" : "Remover pagamento"}</DialogTitle>
          </DialogHeader>
          {removePaymentOpen && (
            <RemovePaymentForm 
              installment={removePaymentOpen} 
              allTransactions={allTransactions}
              transactionIdToEdit={editingTransactionId || undefined}
              mode={(removePaymentOpen as any)?._mode}
              onDone={() => { setRemovePaymentOpen(null); setEditingTransactionId(null); invalidate("installments"); invalidate("accounts"); invalidate("transactions"); }} 
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editPaidOpen} onOpenChange={(o) => !o && setEditPaidOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar valor já pago</DialogTitle>
          </DialogHeader>
          {editPaidOpen && (
            <EditPaidForm 
              installment={editPaidOpen} 
              onDone={() => { setEditPaidOpen(null); invalidate("installments"); invalidate("accounts"); }} 
            />
          )}
        </DialogContent>
      </Dialog>


      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Excluir parcela</DialogTitle></DialogHeader>
          {deleting && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Esta compra possui <strong className="text-foreground">{deleting.cartao_compras?.installments_count ?? 1}</strong> parcela(s).
                Você está vendo a parcela <strong className="text-foreground">{deleting.installment_number}/{deleting.cartao_compras?.installments_count ?? 1}</strong>.
                O que deseja excluir?
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Button variant="outline" className="flex-1" onClick={() => removeOne(deleting)}>
                  Excluir apenas esta parcela
                </Button>
                <Button variant="destructive" className="flex-1" onClick={() => removeAll(deleting)}>
                  Excluir todas as parcelas
                </Button>
              </div>
              <Button variant="ghost" size="sm" className="w-full" onClick={() => setDeleting(null)}>Cancelar</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!showProgressInfo} onOpenChange={(o) => !o && setShowProgressInfo(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Histórico de Pagamentos</DialogTitle>
          </DialogHeader>
          {showProgressInfo && (() => {
            const relatedTrans = allTransactions
              .filter((t: any) => t.card_installment_id === showProgressInfo.id)
              .sort((a: any, b: any) => new Date(b.posted_at || b.created_at).getTime() - new Date(a.posted_at || a.created_at).getTime());

            return (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-muted/50 border border-border">
                    <div className="text-[10px] uppercase text-muted-foreground mb-1">Valor Total</div>
                    <div className="font-bold">{brl(Number(showProgressInfo.amount))}</div>
                  </div>
                  <div className="p-3 rounded-lg bg-success/10 border border-success/20">
                    <div className="text-[10px] uppercase text-success/70 mb-1">Total Pago</div>
                    <div className="font-bold text-success">{brl(Number(showProgressInfo.paid_amount || 0))}</div>
                  </div>
                </div>
                
                <div className="p-3 rounded-lg bg-warning/10 border border-warning/20">
                  <div className="text-[10px] uppercase text-warning/70 mb-1">Falta Pagar</div>
                  <div className="font-bold text-warning">{brl(Number(showProgressInfo.amount) - Number(showProgressInfo.paid_amount || 0))}</div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground uppercase">Linha do tempo</Label>
                  <div className="max-h-[300px] overflow-y-auto space-y-2 pr-1">
                    {relatedTrans.length === 0 ? (
                      <div className="text-sm text-muted-foreground italic p-4 text-center bg-muted/30 rounded-lg">
                        Nenhum registro de pagamento encontrado.
                      </div>
                    ) : (
                      relatedTrans.map((t: any) => (
                        <div key={t.id} className="p-3 rounded-lg border border-border bg-card space-y-1 relative group">
                          <div className="flex justify-between items-start">
                            <span className="font-semibold text-success">{brl(t.amount)}</span>
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] text-muted-foreground">{fmtDate(t.posted_at || t.created_at)}</span>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={() => {
                                  setShowProgressInfo(null);
                                  setEditingTransactionId(t.id);
                                  setRemovePaymentOpen({ ...showProgressInfo, _mode: "edit" });
                                }}
                              >
                                <Pencil className="w-3 h-3" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => {
                                  setShowProgressInfo(null);
                                  setEditingTransactionId(t.id);
                                  setRemovePaymentOpen({ ...showProgressInfo, _mode: "remove" });
                                }}
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </div>
                          {t.notes && (
                            <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded mt-1 italic">
                              "{t.notes}"
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
                
                <div className="flex justify-end pt-2">
                  <Button variant="outline" onClick={() => setShowProgressInfo(null)}>Fechar</Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}



function RefundHelper({ amount, rawAmount, selectedCategoryId, cats, person, purchaseDate, card, onPick }: { amount: number; rawAmount?: string; selectedCategoryId: string; cats: any[]; person?: string; purchaseDate?: string; card?: any; onPick: (id: string) => void }) {
  const { data: inst = [] } = useInstallments();
  const rawIsNegative = typeof rawAmount === "string" && rawAmount.trim().startsWith("-");
  const isRefund = amount < 0 || rawIsNegative;
  if (!isRefund) return null;
  const abs = Number.isFinite(amount) && amount < 0 ? Math.abs(amount) : 0;
  // Calcula a fatura desse cartão (mesma lógica do submit): compra >= fechamento vai pra próxima; se venc < fech, +1 mês.
  const ym = (() => {
    const base = purchaseDate && purchaseDate.length >= 10 ? new Date(purchaseDate + "T00:00:00") : new Date();
    let y = base.getFullYear();
    let m = base.getMonth();
    if (card) {
      const closing = Number(card.closing_day) || 1;
      const due = Number(card.due_day) || 10;
      if (base.getDate() >= closing) m += 1;
      if (due < closing) m += 1;
      const d = new Date(y, m, 1);
      y = d.getFullYear(); m = d.getMonth();
    }
    return `${y}-${String(m + 1).padStart(2, "0")}`;
  })();


  const sums = new Map<string, number>();
  for (const i of inst as any[]) {
    const d = String(i.due_at || "").slice(0, 7);
    if (d !== ym) continue;
    const cid = i.cartao_compras?.category_id;
    if (!cid) continue;
    const p = i.cartao_compras?.person;
    let val = Number(i.amount);
    if (person && person !== "—") {
      if (p === person) {
        // full amount
      } else if (p === "Família") {
        val = val / 2;
      } else {
        continue;
      }
    }
    sums.set(cid, (sums.get(cid) || 0) + val);
  }

  const buckets = cats
    .filter((c: any) => c.kind === "expense" && (sums.get(c.id) || 0) > 0)
    .map((c: any) => ({ id: c.id, name: c.name, icon: c.icon, saldo: sums.get(c.id) || 0 }))
    .sort((a: any, b: any) => b.saldo - a.saldo);
  const selSaldo = selectedCategoryId ? sums.get(selectedCategoryId) || 0 : 0;
  const selRemaining = selSaldo - abs;
  const insufficient = selectedCategoryId && abs > 0 && selRemaining < 0;
  const headerLabel = abs > 0 ? brl(amount) : "valor a definir";
  // Teto do reembolso = soma da categoria "Estorno" da fatura ANTERIOR (filtrada por pessoa).
  const prevYm = (() => {
    const [yy, mm] = ym.split("-").map(Number);
    const d = new Date(yy, mm - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();
  const estornoCatIds = new Set(
    cats.filter((c: any) => /estorno/i.test(c.name || "")).map((c: any) => c.id)
  );
  let refundCap = 0;
  for (const i of inst as any[]) {
    const d = String(i.due_at || "").slice(0, 7);
    if (d !== prevYm) continue;
    const cid = i.cartao_compras?.category_id;
    if (!cid || !estornoCatIds.has(cid)) continue;
    const p = i.cartao_compras?.person;
    let val = Math.abs(Number(i.amount));
    if (person && person !== "—") {
      if (p === person) {
        // full
      } else if (p === "Família") {
        val = val / 2;
      } else {
        continue;
      }
    }
    refundCap += val;
  }


  const capRemaining = refundCap - abs;
  const overCap = abs > 0 && abs > refundCap;
  return (
    <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 space-y-1.5 text-xs">
      <div className="flex items-center gap-1.5 font-medium text-warning">
        <Undo2 className="w-3.5 h-3.5" /> Estorno {headerLabel}{person && person !== "—" ? ` · ${person}` : ""} · {ym}
      </div>
      <div className={`flex items-center gap-1.5 ${overCap ? "text-destructive font-medium" : "text-muted-foreground"}`}>
        {overCap && <AlertTriangle className="w-3.5 h-3.5" />}
        Máx: <strong>{brl(refundCap)}</strong>
        {abs > 0 && (
          overCap
            ? <> · excedeu <strong>{brl(Math.abs(capRemaining))}</strong></>
            : <> · sobra <strong className="text-success">{brl(capRemaining)}</strong> de crédito</>
        )}
      </div>


      {selectedCategoryId ? (
        <div className={`flex items-center gap-1.5 ${insufficient ? "text-destructive" : "text-muted-foreground"}`}>
          {insufficient && <AlertTriangle className="w-3.5 h-3.5" />}
          <strong>{brl(selSaldo)}</strong>{abs > 0 ? <> → <strong>{brl(selRemaining)}</strong></> : null}
        </div>
      ) : (
        <div className="text-muted-foreground">Escolha a categoria:</div>
      )}


      {buckets.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {buckets.slice(0, 8).map((b: any) => {
            const rem = b.saldo - abs;
            const neg = abs > 0 && rem < 0;
            return (
              <button key={b.id} type="button" onClick={() => onPick(b.id)}
                className={`px-2 py-1 rounded-md border transition-colors ${selectedCategoryId === b.id ? "bg-primary/15 border-primary text-primary" : "bg-background border-border hover:bg-muted"}`}>
                {b.icon} {b.name} · <span className="tabular-nums">{brl(b.saldo)}</span>
                {abs > 0 && (
                  <span className={`tabular-nums ${neg ? "text-destructive" : "text-success"}`}> → {brl(rem)}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}


function PurchaseForm({ cards, cats, onDone }: any) {
  const today = todayLocalISO();
  const { data: people = [] } = usePeople();
  const [form, setForm] = useState({ card_id: cards[0]?.id ?? "", description: "", purchase_date: today, total_amount: "", installments_count: 1, category_id: "", person: "", brand: "" });
  const [splitMode, setSplitMode] = useState(false);
  const [splitPeople, setSplitPeople] = useState<string[]>([]);
  const [splitCustom, setSplitCustom] = useState(false);
  const [splitAmounts, setSplitAmounts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const togglePerson = (name: string) => {
    setSplitPeople((prev) => prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name]);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const isRefund = Number(form.total_amount) < 0;
    if (isRefund && !splitMode && (!form.person || form.person === "—")) {
      toast.error("Em estornos, selecione a pessoa que receberá o reembolso.");
      return;
    }
    const parsed = cardPurchaseSchema.safeParse({
      description: form.description,
      total_amount: form.total_amount,
      installments_count: form.installments_count,
      purchase_date: form.purchase_date,
      person: form.person || "—",
    });
    if (!parsed.success) { toast.error(firstZodError(parsed.error)); return; }

    if (!__tryLock()) return;
    setSaving(true);
    try {
      const card = cards.find((c: any) => c.id === form.card_id);
      if (!card) throw new Error("Selecione um cartão");
      const { data: { user } } = await supabase.auth.getUser();
      const total = Number(form.total_amount);
      const n = Number(form.installments_count);

      // Lista de (pessoa, valor) para criar 1 compra por pessoa
      let splits: Array<{ person: string | null; amount: number }>;
      if (splitMode && splitPeople.length >= 2) {
        if (splitCustom) {
          splits = splitPeople.map((p) => ({ person: p, amount: Number(splitAmounts[p] || 0) }));
          const sumCustom = splits.reduce((s, x) => s + x.amount, 0);
          if (Math.abs(sumCustom - total) > 0.01) throw new Error(`A soma dos valores (${brl(sumCustom)}) precisa ser igual ao total (${brl(total)}).`);
        } else {
          const per = Math.round((total / splitPeople.length) * 100) / 100;
          splits = splitPeople.map((p, idx) => ({
            person: p,
            amount: idx === splitPeople.length - 1 ? +(total - per * (splitPeople.length - 1)).toFixed(2) : per,
          }));
        }
      } else {
        splits = [{ person: form.person || null, amount: total }];
      }

      const purDate = new Date(form.purchase_date + "T00:00:00");
      const closing = card.closing_day;
      const due = card.due_day;
      let firstYear = purDate.getFullYear();
      let firstMonth = purDate.getMonth();
      if (purDate.getDate() >= closing) firstMonth += 1;
      if (due < closing) firstMonth += 1;

      

      for (const s of splits) {
        let finalPerson = s.person === "Família" ? "Familia" : s.person;
        
        // CORREÇÃO: Forçar 'Familia' para descrições específicas se estiver vindo como 'Tayane'
        const lowerDesc = (form.description || "").toLowerCase();
        const specificPhantoms = ['mercado guanabara', 'racao do cookie', 'viagem paris', 'almoco galeto', 'bacio di latte cinema'];
        if (specificPhantoms.some(d => lowerDesc.includes(d))) {
          finalPerson = "Familia";
        }

        const { data: purchase, error: pErr } = await supabase.from("cartao_compras").insert({
          user_id: user!.id, card_id: card.id,
          description: splits.length > 1 ? `${form.description} (${s.person})` : form.description,
          purchase_date: form.purchase_date, total_amount: s.amount, installments_count: n,
          category_id: form.category_id || null, person: finalPerson,
          brand: form.brand || null,
        }).select().single();
        if (pErr) throw pErr;


        const installmentValue = Math.round((s.amount / n) * 100) / 100;
        const installments = Array.from({ length: n }, (_, idx) => {
          const d = new Date(firstYear, firstMonth + idx, due);
          return {
            user_id: user!.id, purchase_id: purchase.id, card_id: card.id,
            installment_number: idx + 1,
            amount: idx === n - 1 ? +(s.amount - installmentValue * (n - 1)).toFixed(2) : installmentValue,
            due_at: d.toISOString().slice(0, 10),
            status: "pending",
          };
        });
        const { error: iErr } = await supabase.from("cartao_parcelas").insert(installments);
        if (iErr) throw iErr;
      }

      toast.success(splits.length > 1 ? `Compra dividida entre ${splits.length} pessoas` : "Compra adicionada");
      onDone();
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); __release(); }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <Label>Cartão</Label>
        <Select value={form.card_id} onValueChange={v => {
          const c = cards.find((x: any) => x.id === v);
          const firstBrand = c?.metadata?.brands?.[0];
          setForm({ 
            ...form, 
            card_id: v, 
            brand: firstBrand ? `${firstBrand.brand.charAt(0).toUpperCase()}${firstBrand.brand.slice(1)} ${firstBrand.last_digits}` : "" 
          });
        }}>
          <SelectTrigger><SelectValue placeholder="Selecione o cartão" /></SelectTrigger>
          <SelectContent>
            {cards.map((c: any) => (
              <SelectItem key={c.id} value={c.id}>
                <div className="flex items-center gap-2">
                  <BankIcon bank={c.bank} size={14} square />
                  <span>{c.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5"><Label>Descrição</Label><SmartInput value={form.description} onChange={(v) => setForm({ ...form, description: v })} required /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Data da compra</Label><DatePicker value={form.purchase_date} onChange={(v) => setForm({ ...form, purchase_date: v })} /></div>
        {!splitMode && (
          <div className="space-y-1.5"><Label>Pessoa</Label>
            <PersonSelect value={form.person} onChange={(v) => setForm({ ...form, person: v })} />
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Valor total</Label><Input type="number" step="0.01" value={form.total_amount} onChange={e => setForm({ ...form, total_amount: e.target.value })} required /></div>
        <div className="space-y-1.5"><Label>Parcelas</Label><Input type="number" min={1} max={36} value={form.installments_count} onChange={e => setForm({ ...form, installments_count: Number(e.target.value) })} required /></div>
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setSplitMode(!splitMode)}
          className={`flex-1 flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition-all ${splitMode ? "border-primary/50 bg-primary/5 shadow-sm" : "border-border bg-muted/20 hover:bg-muted/40"}`}
        >
          <span className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${splitMode ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
              <Users className="w-4 h-4" />
            </div>
            <span className="flex flex-col items-start text-left">
              <span className="font-medium text-xs">Dividir Pessoas</span>
              <span className="text-[10px] text-muted-foreground">{splitMode ? `${splitPeople.length} sel.` : "Rachar valor"}</span>
            </span>
          </span>
          <div className={`w-9 h-5 rounded-full p-0.5 transition-colors ${splitMode ? "bg-primary" : "bg-muted-foreground/30"}`}>
            <div className={`w-4 h-4 rounded-full bg-background shadow transition-transform ${splitMode ? "translate-x-4" : ""}`} />
          </div>
        </button>

      </div>
      {splitMode && (
        <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} className="space-y-2 rounded-xl border border-border bg-gradient-to-br from-muted/30 to-transparent p-2.5">
          <PersonSelect 
            multiSelect 
            value=""
            selectedValues={splitPeople} 
            onChange={(v) => setSplitPeople(v ? v.split(",") : [])}
            includeFamilia={true}
          />


          {splitPeople.length >= 2 && (
            <>
              <div className="flex items-center gap-2">
                <div className="grid grid-cols-2 gap-0.5 flex-1 rounded-md bg-muted/50 p-0.5">
                  <button type="button" onClick={() => setSplitCustom(false)} className={`flex items-center justify-center gap-1 rounded py-1 text-[11px] font-medium transition-all ${!splitCustom ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
                    <Equal className="w-3 h-3" /> Igual
                  </button>
                  <button type="button" onClick={() => setSplitCustom(true)} className={`flex items-center justify-center gap-1 rounded py-1 text-[11px] font-medium transition-all ${splitCustom ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
                    <SlidersHorizontal className="w-3 h-3" /> Custom
                  </button>
                </div>
                {!splitCustom && Number(form.total_amount) > 0 && (
                  <div className="text-[11px] text-muted-foreground whitespace-nowrap">
                    <span className="font-semibold text-primary">{brl(Number(form.total_amount) / splitPeople.length)}</span> / pessoa
                  </div>
                )}
              </div>

              {splitCustom && (() => {
                const total = Number(form.total_amount) || 0;
                const sum = splitPeople.reduce((s, p) => s + Number(splitAmounts[p] || 0), 0);
                const diff = +(total - sum).toFixed(2);
                const pct = total > 0 ? Math.min(100, (sum / total) * 100) : 0;
                const ok = Math.abs(diff) < 0.01 && total > 0;
                return (
                  <div className="space-y-1.5">
                    <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                      {splitPeople.map((p) => (
                        <div key={p} className="flex items-center gap-2">
                          <span className="text-xs flex-1 truncate">{p}</span>
                          <div className="relative">
                            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">R$</span>
                            <Input type="number" step="0.01" placeholder="0,00" className="h-7 text-xs w-24 pl-6 text-right" value={splitAmounts[p] ?? ""} onChange={(e) => setSplitAmounts((prev) => ({ ...prev, [p]: e.target.value }))} />
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="h-1 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full transition-all ${ok ? "bg-emerald-500" : sum > total ? "bg-red-500" : "bg-primary"}`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px]">
                      <span className="text-muted-foreground">{brl(sum)} / {brl(total)}</span>
                      <span className={ok ? "text-emerald-500 font-medium" : diff > 0 ? "text-amber-500" : "text-red-500"}>
                        {ok ? "✓ ok" : diff > 0 ? `Faltam ${brl(diff)}` : `Sobram ${brl(-diff)}`}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </>
          )}

          {splitPeople.length < 2 && (
            <div className="text-[10px] text-muted-foreground text-center">Selecione ao menos 2 pessoas</div>
          )}
        </motion.div>
      )}
      <div className="space-y-1.5">
        <Label>Categoria</Label>
        <Select value={form.category_id} onValueChange={v => setForm({ ...form, category_id: v })}>
          <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
          <SelectContent>{cats.filter((c: any) => c.kind === "expense").map((c: any) => <SelectItem key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ""}{c.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      {(() => {
        const card = cards.find((c: any) => c.id === form.card_id);
        const brands = card?.metadata?.brands || [];
        if (brands.length <= 1) return null;
        return (
          <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
            <Label>Bandeira da Compra</Label>
            <div className="flex flex-wrap gap-2">
              {brands.map((b: any, idx: number) => {
                const label = `${b.brand.charAt(0).toUpperCase()}${b.brand.slice(1)} ${b.last_digits}`;
                const active = form.brand === label;
                return (
                  <Button
                    key={idx}
                    type="button"
                    variant={active ? "default" : "outline"}
                    size="sm"
                    className="h-8 text-[10px] uppercase font-bold tracking-wider"
                    onClick={() => setForm({ ...form, brand: label })}
                  >
                    {label}
                  </Button>
                );
              })}
            </div>
          </div>
        );
      })()}
      <RefundHelper amount={Number(form.total_amount)} rawAmount={form.total_amount} selectedCategoryId={form.category_id} cats={cats} person={form.person} purchaseDate={form.purchase_date} card={cards.find((c: any) => c.id === form.card_id)} onPick={(id) => setForm({ ...form, category_id: id })} />
      <Button type="submit" disabled={saving || (splitMode && splitPeople.length < 2)} className="w-full">{saving ? "Salvando…" : "Salvar compra"}</Button>
    </form>
  );
}

function EditPurchaseForm({ purchase, cards, cats, onDone }: any) {
  const clicked = purchase._installment;
  const clickedNum = clicked?.installment_number ?? 1;
  const initialBrand = purchase.brand || "";
  const [form, setForm] = useState({
    description: purchase.description ?? "",
    person: purchase.person ?? "",
    category_id: purchase.category_id ?? "",
    due_at: clicked?.due_at ?? "",
    amount: clicked ? String(clicked.amount) : "",
    purchase_date: purchase.purchase_date ?? "",
    brand: initialBrand || "",
  });
  const [applyAll, setApplyAll] = useState(false);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!__tryLock()) return; setSaving(true);
    try {
      const newAmount = Number(form.amount);
      const { data: list } = await supabase.from("cartao_parcelas").select("id, installment_number, amount").eq("purchase_id", purchase.id).order("installment_number");

      let newTotal = Number(purchase.total_amount ?? 0);
      if (list) {
        if (applyAll) newTotal = newAmount * list.length;
        else newTotal = list.reduce((s, it) => s + (it.installment_number === clickedNum ? newAmount : Number(it.amount)), 0);
      }

      let finalPerson = form.person || null;
      
      // CORREÇÃO: Forçar 'Familia' para descrições específicas se estiver vindo como 'Tayane'
      const lowerDesc = (form.description || "").toLowerCase();
      const specificPhantoms = ['mercado guanabara', 'racao do cookie', 'viagem paris', 'almoco galeto', 'bacio di latte cinema'];
      if (specificPhantoms.some(d => lowerDesc.includes(d))) {
        finalPerson = "Familia";
      }

      await supabase.from("cartao_compras").update({
        description: form.description,
        person: finalPerson,
        category_id: form.category_id || null,
        total_amount: newTotal,
        purchase_date: form.purchase_date || null,
        brand: form.brand || null,
      }).eq("id", purchase.id);

      if (list && form.due_at) {
        if (applyAll) {
          const clickedDate = new Date(form.due_at + "T00:00:00");
          for (const it of list) {
            const offset = (it.installment_number ?? 1) - clickedNum;
            const d = new Date(clickedDate.getFullYear(), clickedDate.getMonth() + offset, clickedDate.getDate());
            await supabase.from("cartao_parcelas").update({
              amount: newAmount,
              due_at: d.toISOString().slice(0, 10),
            }).eq("id", it.id);
          }
        } else {
          const target = list.find((it) => it.installment_number === clickedNum);
          if (target) {
            await supabase.from("cartao_parcelas").update({ amount: newAmount, due_at: form.due_at }).eq("id", target.id);
          }
        }
      }

      if (typeof window !== "undefined") {
        try {
          const map = JSON.parse(window.localStorage.getItem("cartoes:purchaseBrands") || "{}");
          if (form.brand) map[purchase.id] = form.brand; else delete map[purchase.id];
          window.localStorage.setItem("cartoes:purchaseBrands", JSON.stringify(map));
          window.dispatchEvent(new Event("purchaseBrands:changed"));
        } catch {}
      }

      toast.success(applyAll ? "Compra atualizada (todas as parcelas)" : `Parcela ${clickedNum} atualizada`);
      onDone();
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); __release(); }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5"><Label>Descrição</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} required /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Data da compra</Label><DatePicker value={form.purchase_date} onChange={(v) => setForm({ ...form, purchase_date: v })} /></div>
        <div className="space-y-1.5"><Label>Pessoa</Label><PersonSelect value={form.person} onChange={(v) => setForm({ ...form, person: v })} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Vencimento da parcela {clickedNum}/{purchase.installments_count ?? 1}</Label><DatePicker value={form.due_at} onChange={(v) => setForm({ ...form, due_at: v })} /></div>
        <div className="space-y-1.5"><Label>Valor {applyAll ? "por parcela" : `da parcela ${clickedNum}`}</Label><Input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
      </div>
      <div className="space-y-1.5">
        <Label>Categoria</Label>
        <Select value={form.category_id || "none"} onValueChange={(v) => setForm({ ...form, category_id: v === "none" ? "" : v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Sem categoria</SelectItem>
            {cats.filter((c: any) => c.kind === "expense").map((c: any) => <SelectItem key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ""}{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
      {(() => {
        const card = cards.find((c: any) => c.id === purchase.card_id);
        const brands = card?.metadata?.brands || [];
        if (brands.length <= 1) return null;
        return (
          <div className="space-y-1.5 animate-in fade-in slide-in-from-top-1 duration-200">
            <Label>Bandeira da Compra</Label>
            <div className="flex flex-wrap gap-2">
              {brands.map((b: any, idx: number) => {
                const label = `${b.brand.charAt(0).toUpperCase()}${b.brand.slice(1)} ${b.last_digits}`;
                const active = form.brand === label;
                return (
                  <Button
                    key={idx}
                    type="button"
                    variant={active ? "default" : "outline"}
                    size="sm"
                    className="h-8 text-[10px] uppercase font-bold tracking-wider"
                    onClick={() => setForm({ ...form, brand: label })}
                  >
                    {label}
                  </Button>
                );
              })}
            </div>
          </div>
        );
      })()}

      <label className="flex items-start gap-2 rounded-md border border-border p-2.5 cursor-pointer hover:bg-muted/50">
        <input type="checkbox" checked={applyAll} onChange={e => setApplyAll(e.target.checked)} className="mt-0.5" />
        <div className="text-xs">
          <div className="font-medium text-foreground">Aplicar a todas as parcelas</div>
          <div className="text-muted-foreground">
            {applyAll ? "O valor e a data serão propagados para todas as parcelas." : `Somente a parcela ${clickedNum} será alterada.`}
          </div>
        </div>
      </label>
      <Button type="submit" disabled={saving} className="w-full">{saving ? "Salvando…" : "Salvar alterações"}</Button>
    </form>
  );
}

function CardForm({ onDone, initialData }: { onDone: () => void; initialData?: any }) {
  const { data: cards = [] } = useCards();
  const [form, setForm] = useState({
    name: initialData?.name ?? "",
    bank: initialData?.bank ?? "",
    closing_day: initialData?.closing_day ?? 1,
    due_day: initialData?.due_day ?? 10,
    credit_limit: String(initialData?.credit_limit ?? ""),
    last_digits: initialData?.last_digits ?? "",
    brand: initialData?.metadata?.brand ?? "visa",
    brands: initialData?.metadata?.brands || [],
    mode: (initialData?.metadata?.brands?.length > 0) ? "multi" : "standard",
  });
  const [saving, setSaving] = useState(false);
  

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!__tryLock()) return; setSaving(true);
    try {
      const bInfo = findBank(form.bank);
      const metadata = {
        ...(initialData?.metadata || {}),
        brand: form.mode === "standard" ? form.brand : null,
        brands: form.mode === "multi" ? form.brands : null
      };

      const payload = {
        name: form.name,
        bank: form.bank || null,
        closing_day: Number(form.closing_day),
        due_day: Number(form.due_day),
        credit_limit: Number(form.credit_limit) || 0,
        color: bInfo.color,
        last_digits: form.mode === "standard" ? (form.last_digits || null) : null,
        metadata,
        
      };

      if (initialData?.id) {

        const { error } = await supabase.from("cartoes").update(payload).eq("id", initialData.id);

        if (error) throw error;
        toast.success("Cartão atualizado");
      } else {
        const { data: { user } } = await supabase.auth.getUser();
        const { error } = await supabase.from("cartoes").insert({ ...payload, user_id: user!.id });
        if (error) throw error;
        toast.success("Cartão cadastrado");
      }
      onDone();
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); __release(); }
  };

  const remove = async () => {
    if (!initialData?.id) return;
    if (!confirm("Excluir cartão e todas as compras/parcelas vinculadas?")) return;
    const { error } = await supabase.from("cartoes").delete().eq("id", initialData.id);
    if (error) toast.error(error.message); else { toast.success("Cartão removido"); onDone(); }
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5"><Label>Nome</Label><SmartInput value={form.name} onChange={(v) => setForm({ ...form, name: v })} required /></div>
      <div className="space-y-1.5">
        <Label>Banco</Label>
        <Select 
          value={form.bank || undefined} 
          onValueChange={(v) => { 
            const b = findBank(v); 
            let newName = form.name;
            if (b.id === "santander" && !form.name) newName = "Santander";
            setForm({ ...form, bank: b.name, name: newName }); 
          }}
        >
          <SelectTrigger><SelectValue placeholder="Selecione o banco" /></SelectTrigger>
          <SelectContent>
            {BANKS.map((b) => (
              <SelectItem key={b.id} value={b.name}>
                <div className="flex items-center gap-2">
                  <BankIcon bank={b.name} size={18} square />
                  <span>{b.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Tipo de Gestão</Label>
        <Select value={form.mode} onValueChange={(v: any) => setForm({ ...form, mode: v })}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="standard">Bandeira Única</SelectItem>
            <SelectItem value="multi">Múltiplas Bandeiras (Combo)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {form.mode === "standard" ? (
        <div className="grid grid-cols-2 gap-3 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="space-y-1.5">
            <Label>Bandeira</Label>
            <Select value={form.brand} onValueChange={(v) => setForm({ ...form, brand: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="visa">Visa</SelectItem>
                <SelectItem value="mastercard">Mastercard</SelectItem>
                <SelectItem value="elo">Elo</SelectItem>
                <SelectItem value="amex">Amex</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Últimos 4 dígitos</Label>
            <Input maxLength={4} placeholder="Ex: 1234" value={form.last_digits} onChange={e => setForm({ ...form, last_digits: e.target.value })} />
          </div>
        </div>
      ) : (
        <div className="space-y-2.5 p-2.5 border rounded-lg bg-muted/20 border-border/40 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="flex items-center justify-between">
            <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Bandeiras do Combo</Label>
            <Button 
              type="button" 
              variant="outline" 
              size="sm" 
              className="h-6 text-[9px] font-bold border-primary/20 hover:bg-primary hover:text-white px-2"
              onClick={() => setForm({ ...form, brands: [...form.brands, { brand: "visa", last_digits: "" }] })}
            >
              <Plus className="w-3 h-3 mr-1" /> Add Bandeira
            </Button>
          </div>
          
          <div className="grid grid-cols-1 gap-2">
            {form.brands.map((b: any, idx: number) => (
              <div key={idx} className="relative p-2 border border-border/50 rounded-lg bg-background/50 flex items-center gap-3 group/brand">
                <div className="flex-1 space-y-1">
                  <Label className="text-[9px] uppercase font-bold text-muted-foreground/70">Bandeira</Label>
                  <Select 
                    value={b.brand} 
                    onValueChange={(v) => {
                      const next = [...form.brands];
                      next[idx].brand = v;
                      setForm({ ...form, brands: next });
                    }}
                  >
                    <SelectTrigger className="h-7 text-[10px] bg-background px-2"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="visa">Visa</SelectItem>
                      <SelectItem value="mastercard">Mastercard</SelectItem>
                      <SelectItem value="elo">Elo</SelectItem>
                      <SelectItem value="amex">Amex</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="w-20 space-y-1">
                  <Label className="text-[9px] uppercase font-bold text-muted-foreground/70">Dígitos</Label>
                  <Input 
                    className="h-7 text-[10px] bg-background px-2" 
                    maxLength={4}
                    placeholder="1234"
                    value={b.last_digits}
                    onChange={(e) => {
                      const next = [...form.brands];
                      next[idx].last_digits = e.target.value;
                      setForm({ ...form, brands: next });
                    }}
                  />
                </div>

                <Button 
                  type="button" 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7 text-muted-foreground hover:text-destructive self-end mb-0.5"
                  onClick={() => setForm({ ...form, brands: form.brands.filter((_: any, i: number) => i !== idx) })}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            ))}
          </div>
          {form.brands.length === 0 && (
            <div className="text-center py-4 text-[10px] text-muted-foreground border border-dashed rounded-md opacity-60">
              Nenhuma bandeira adicionada
            </div>
          )}
        </div>
      )}


      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Fechamento</Label><Input type="number" min={1} max={31} value={form.closing_day} onChange={e => setForm({ ...form, closing_day: Number(e.target.value) })} required /></div>
        <div className="space-y-1.5"><Label>Vencimento</Label><Input type="number" min={1} max={31} value={form.due_day} onChange={e => setForm({ ...form, due_day: Number(e.target.value) })} required /></div>
      </div>
      <div className="space-y-1.5"><Label>Limite total</Label><Input type="number" step="0.01" value={form.credit_limit} onChange={e => setForm({ ...form, credit_limit: e.target.value })} required /></div>

      <div className="flex gap-2">
        <Button type="submit" disabled={saving} className="flex-1">{saving ? "Salvando…" : initialData?.id ? "Salvar alterações" : "Salvar"}</Button>
        {initialData?.id && <Button type="button" variant="destructive" onClick={remove}>Excluir</Button>}
      </div>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground font-medium">{label}</span>
      {children}
    </div>
  );
}

function AnticipatePayForm({ installment, onFullPay, onDone }: { installment: any, onFullPay: (notes?: string, paidBy?: string | null, accountsOverride?: { accountId: string, accountTayaneId?: string }) => void, onDone: () => void }) {
  const [payMode, setPayMode] = useState<"total" | "anticipate" | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [paidBy, setPaidBy] = useState<string>(installment.cartao_compras?.person || "");
  const [saving, setSaving] = useState(false);
  const { data: accounts = [] } = useAccounts();
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [selectedAccountTayaneId, setSelectedAccountTayaneId] = useState<string>("");

  const lorranAccs = accounts.filter((a: any) => normalizeName(a.account_name || "") === "lorran" || normalizeName(a.bank || "").includes("revolut") || normalizeName(a.bank || "").includes("nubank"));
  const tayaneAccs = accounts.filter((a: any) => normalizeName(a.account_name || "") === "tayane" || normalizeName(a.bank || "").includes("mercado"));

  useEffect(() => {
    if (accounts.length > 0) {
      const lorran = lorranAccs[0];
      const tayane = tayaneAccs[0];
      if (lorran) setSelectedAccountId(lorran.id);
      if (tayane) setSelectedAccountTayaneId(tayane.id);
    }
  }, [accounts]);


  const originalPerson = installment.cartao_compras?.person || "";
  const isFamilia = normalizeName(originalPerson) === "familia";
  const quota = Number(installment.amount || 0) / 2;
  
  const overrideActive = !!paidBy && paidBy.trim() && normalizeName(paidBy) !== normalizeName(originalPerson);

  const handlePay = async (e?: React.FormEvent, accountsOverride?: { accountId: string, accountTayaneId?: string }) => {
    if (e) e.preventDefault();
    const amountToPay = Number(payAmount);
    const originalAmount = Number(installment.amount);

    if (amountToPay <= 0) return toast.error("Valor inválido");
    
    if (isFamilia && overrideActive) {
      if (amountToPay > quota + 0.01) {
        return toast.error(`Para antecipação individual de Família, o valor máximo é a sua parte (${brl(quota)})`);
      }
    }

    const costPerson = overrideActive ? paidBy.trim() : originalPerson;

    // Buscar participação atual desta pessoa para esta parcela
    const currentPart = (installment.participacoes || []).find((p: any) => normalizeName(p.person) === normalizeName(costPerson));
    const alreadyPaid = Number(currentPart?.amount || 0);
    const personRemaining = isFamilia ? Math.max(0, quota - alreadyPaid) : Math.max(0, Number(installment.amount) - Number(installment.paid_amount || 0));

    if (amountToPay > personRemaining + 0.01) {
      return toast.error(`Valor excede o saldo pendente de ${costPerson} (${brl(personRemaining)})`);
    }

    if (Math.abs(amountToPay - originalAmount) < 0.01 && !isFamilia) {
      onFullPay(notes, overrideActive ? paidBy : null);
      return;
    }

    if (!__tryLock()) return;
    setSaving(true);
    try {
      const newPersonPaid = Number((alreadyPaid + amountToPay).toFixed(2));
      const newPaidAmount = Number((Number(installment.paid_amount || 0) + amountToPay).toFixed(2));
      const isFull = Math.abs(newPaidAmount - originalAmount) < 0.01;
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      // 1. Criar transação de débito no banco
      const splits = buildPaymentSplits(accounts, originalPerson, amountToPay, overrideActive ? paidBy : null);
      
      // Só cria transações se houver contas selecionadas
      if (splits.length > 0) {
        for (const split of splits) {
          const finalAccountId = split.accountTayaneId 
            ? (accountsOverride?.accountId || split.accountId)
            : (accountsOverride?.accountId || split.accountId);
          
          const finalAccountTayaneId = split.accountTayaneId
            ? (accountsOverride?.accountTayaneId || split.accountTayaneId)
            : null;

          const { error: txErr } = await supabase.from("transacoes").insert({
            user_id: user.id,
            description: `${installment.cartao_compras?.description || "Antecipação Cartão"} - Parcela ${installment.installment_number}${split.descriptionSuffix}`,
            amount: split.amount,
            kind: "expense",
            status: "paid",
            due_at: todayLocalISO(),
            posted_at: todayLocalISO(),
            account_id: finalAccountId,
            account_tayane_id: finalAccountTayaneId,
            person: split.person,
            card_installment_id: installment.id,
            category_id: "2db053ad-a0e4-4beb-8f31-3be8328559b5", 
          } as any);
          if (txErr) throw txErr;
        }
      }

      // 2. Registrar a participação na nova tabela (Solução Definitiva)
      const { error: partError } = await supabase.from("participacoes_parcelas").upsert({
        user_id: user.id,
        installment_id: installment.id,
        person: costPerson,
        amount: newPersonPaid,
        status: (isFamilia ? Math.abs(newPersonPaid - quota) < 0.01 : isFull) ? "paid" : "pending",
        paid_at: new Date().toISOString()
      } as any, { onConflict: 'installment_id,person' });

      if (partError) throw partError;

      // 3. Atualizar a parcela (apenas status e valor total pago)
      const { error } = await supabase.from("cartao_parcelas").update({ 
        paid_amount: newPaidAmount,
        status: isFull ? "paid" : "pending",
        paid_by: isFull ? (overrideActive ? paidBy : (isFamilia ? null : originalPerson)) : (installment.paid_by || null),
      } as any).eq("id", installment.id);

      if (error) throw error;

      if (isFull) {
        toast.success("Parcela totalmente quitada.");
      } else {
        toast.success(`Cota de ${costPerson} atualizada: ${brl(newPersonPaid)} pagos.`);
      }

      onDone();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false); __release();
    }
  };

  if (!payMode) {
    const isEstorno = Number(installment.amount || 0) < 0;
    
    if (isEstorno) {
      const lorranAccs = accounts.filter((a: any) => normalizeName(a.account_name || "") === "lorran" || normalizeName(a.bank || "").includes("revolut") || normalizeName(a.bank || "").includes("nubank"));
      const tayaneAccs = accounts.filter((a: any) => normalizeName(a.account_name || "") === "tayane" || normalizeName(a.bank || "").includes("mercado"));

      return (
        <div className="space-y-4">
          <div className="bg-emerald-500/10 p-5 rounded-2xl border border-emerald-500/30 text-center space-y-4">
            <div className="w-12 h-12 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-2 text-emerald-500">
              <Undo2 className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-lg text-foreground">Confirmar Estorno</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                Deseja confirmar o recebimento deste estorno de <span className="font-bold text-emerald-500">{brl(Math.abs(Number(installment.amount)))}</span>?
              </p>
            </div>

            <div className="space-y-3 text-left">
              {isFamilia ? (
                <>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase font-bold text-emerald-600">Conta de Lorran (50%)</Label>
                    <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                      <SelectTrigger className="h-10 bg-background border-emerald-500/20">
                        <SelectValue placeholder="Selecione a conta" />
                      </SelectTrigger>
                      <SelectContent>
                        {lorranAccs.map((a: any) => (
                          <SelectItem key={a.id} value={a.id}>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{a.bank}</span>
                              <span className="text-[10px] text-muted-foreground">{brl(a.balance)}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[10px] uppercase font-bold text-emerald-600">Conta de Tayane (50%)</Label>
                    <Select value={selectedAccountTayaneId} onValueChange={setSelectedAccountTayaneId}>
                      <SelectTrigger className="h-10 bg-background border-emerald-500/20">
                        <SelectValue placeholder="Selecione a conta" />
                      </SelectTrigger>
                      <SelectContent>
                        {tayaneAccs.map((a: any) => (
                          <SelectItem key={a.id} value={a.id}>
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{a.bank}</span>
                              <span className="text-[10px] text-muted-foreground">{brl(a.balance)}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </>
              ) : (
                <div className="space-y-1.5">
                  <Label className="text-[10px] uppercase font-bold text-emerald-600">Conta de Destino</Label>
                  <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                    <SelectTrigger className="h-10 bg-background border-emerald-500/20">
                      <SelectValue placeholder="Selecione a conta" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none" className="text-amber-500 font-bold">
                        Sem conta para débito (Apenas visual)
                      </SelectItem>
                      {accounts.map((a: any) => (
                        <SelectItem key={a.id} value={a.id}>
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{a.bank} · {a.account_name}</span>
                            <span className="text-[10px] text-muted-foreground">{brl(a.balance)}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="p-3 bg-background/50 rounded-lg text-[11px] text-left border border-emerald-500/20 text-muted-foreground">
              <p className="font-semibold text-emerald-600 mb-1">Impacto financeiro:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>Abate o saldo da fatura do cartão.</li>
                <li>O valor será creditado nas contas selecionadas.</li>
              </ul>
            </div>
            
            <div className="grid grid-cols-1 gap-3 pt-2">
              <Button 
                className="h-12 text-sm font-bold rounded-xl shadow-lg bg-emerald-600 hover:bg-emerald-700 text-white transition-all transform hover:scale-[1.02]"
                onClick={() => {
                  if (!selectedAccountId) return toast.error("Selecione a conta de destino");
                  if (isFamilia && !selectedAccountTayaneId) return toast.error("Selecione a conta da Tayane");
                  onFullPay(notes, null, { accountId: selectedAccountId, accountTayaneId: selectedAccountTayaneId });
                }}
              >
                Confirmar e Estornar Saldo
              </Button>
            </div>
          </div>
          <Button variant="ghost" className="w-full text-xs" onClick={() => onDone()}>Cancelar</Button>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        <div className="bg-muted/50 p-4 rounded-xl border border-border text-center">
          <p className="text-sm text-muted-foreground mb-4">
            O que você deseja fazer com esta parcela de {brl(Number(installment.amount || 0))}?
          </p>
          <div className="grid grid-cols-1 gap-3">
            <Button 
              className="h-12 text-sm font-semibold rounded-xl shadow-md"
              onClick={() => setPayMode("total")}
            >
              Pagar Total
            </Button>
            <Button 
              variant="outline" 
              className="h-12 text-sm font-semibold rounded-xl"
              onClick={() => setPayMode("anticipate")}
            >
              Antecipar Pagamento
            </Button>
          </div>
        </div>
        <Button variant="ghost" className="w-full text-xs" onClick={() => onDone()}>Cancelar</Button>
      </div>
    );
  }


  if (payMode === "total") {
    return (
      <form onSubmit={(e) => { e.preventDefault(); onFullPay(notes, overrideActive ? paidBy : null, { accountId: selectedAccountId, accountTayaneId: selectedAccountTayaneId }); }} className="space-y-4">
        <div className="bg-muted/50 p-3 rounded-lg border border-border space-y-1">
          <div className="text-xs text-muted-foreground uppercase">Pagamento Total</div>
          <div className="text-lg font-bold">{brl(Number(installment.amount || 0))}</div>
        </div>
        
        <div className="space-y-3 p-3 rounded-lg bg-muted/30 border border-border/50">
          {isFamilia && !overrideActive ? (
            <>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Conta de Lorran (50%)</Label>
                <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                  <SelectTrigger className="h-10 bg-background">
                    <SelectValue placeholder="Selecione a conta" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" className="text-amber-500 font-bold">Sem conta</SelectItem>
                    {lorranAccs.map((a: any) => (
                      <SelectItem key={a.id} value={a.id}>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{a.bank}</span>
                          <span className="text-[10px] text-muted-foreground">{brl(a.balance)}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[10px] uppercase font-bold text-muted-foreground">Conta de Tayane (50%)</Label>
                <Select value={selectedAccountTayaneId} onValueChange={setSelectedAccountTayaneId}>
                  <SelectTrigger className="h-10 bg-background">
                    <SelectValue placeholder="Selecione a conta" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" className="text-amber-500 font-bold">Sem conta</SelectItem>
                    {tayaneAccs.map((a: any) => (
                      <SelectItem key={a.id} value={a.id}>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{a.bank}</span>
                          <span className="text-[10px] text-muted-foreground">{brl(a.balance)}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground">Conta para débito</Label>
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger className="h-10 bg-background">
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-amber-500 font-bold">Sem conta para débito</SelectItem>
                  {accounts.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{a.bank} · {a.account_name}</span>
                        <span className="text-[10px] text-muted-foreground">{brl(a.balance)}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label>Quem está pagando?</Label>
          <PersonSelect value={paidBy} onChange={setPaidBy} extras={originalPerson ? [originalPerson] : []} />
          <p className="text-[11px] text-muted-foreground">
            {overrideActive
              ? `Dívida de ${originalPerson} será debitada da conta de ${paidBy}.`
              : "Padrão: a própria pessoa da dívida paga."}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label>Observação</Label>
          <Input 
            value={notes} 
            onChange={e => setNotes(e.target.value)} 
            placeholder="Ex: Pagamento total da parcela"
          />
        </div>

        <div className="flex gap-2">
          <Button type="button" variant="outline" className="flex-1" onClick={() => setPayMode(null)}>Voltar</Button>
          <Button type="submit" className="flex-1" disabled={saving}>Confirmar Pagamento</Button>
        </div>
      </form>
    );
  }

  return (
    <form onSubmit={(e) => handlePay(e, { accountId: selectedAccountId, accountTayaneId: selectedAccountTayaneId })} className="space-y-4">
      <div className="bg-muted/50 p-3 rounded-lg border border-border space-y-1">
        <div className="text-xs text-muted-foreground uppercase">Antecipação Parcial</div>
        <div className="text-lg font-bold">{brl(Number(installment.amount || 0))}</div>
        {isFamilia && (
          <div className="text-[10px] text-amber-500 font-medium flex items-center gap-1 mt-1">
            <AlertTriangle className="w-3 h-3" />
            Dividido: {brl(quota)} para Lorran e {brl(quota)} para Tayane
          </div>
        )}
      </div>
      
      <div className="space-y-1.5">
        <Label>Quem está antecipando?</Label>
        <PersonSelect value={paidBy} onChange={setPaidBy} extras={originalPerson ? [originalPerson] : []} />
        {isFamilia && overrideActive && (
          <p className="text-[10px] text-amber-500">
            Aviso: Você está pagando como <strong>{paidBy}</strong>. 
            O limite para esta antecipação individual é <strong>{brl(quota)}</strong>.
          </p>
        )}
      </div>
      
      <div className="space-y-3 p-3 rounded-lg bg-muted/30 border border-border/50">
        {isFamilia && !overrideActive ? (
          <>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground">Conta de Lorran (50%)</Label>
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger className="h-10 bg-background">
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-amber-500 font-bold">Sem conta</SelectItem>
                  {lorranAccs.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{a.bank}</span>
                        <span className="text-[10px] text-muted-foreground">{brl(a.balance)}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-[10px] uppercase font-bold text-muted-foreground">Conta de Tayane (50%)</Label>
              <Select value={selectedAccountTayaneId} onValueChange={setSelectedAccountTayaneId}>
                <SelectTrigger className="h-10 bg-background">
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none" className="text-amber-500 font-bold">Sem conta</SelectItem>
                  {tayaneAccs.map((a: any) => (
                    <SelectItem key={a.id} value={a.id}>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{a.bank}</span>
                        <span className="text-[10px] text-muted-foreground">{brl(a.balance)}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </>
        ) : (
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase font-bold text-muted-foreground">Conta para débito</Label>
            <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
              <SelectTrigger className="h-10 bg-background">
                <SelectValue placeholder="Selecione a conta" />
              </SelectTrigger>
            <SelectContent>
              <SelectItem value="none" className="text-amber-500 font-bold">Sem conta para débito</SelectItem>
              {accounts.map((a: any) => (
                <SelectItem key={a.id} value={a.id}>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{a.bank} · {a.account_name}</span>
                    <span className="text-[10px] text-muted-foreground">{brl(a.balance)}</span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Valor para antecipar</Label>
        <div className="relative">
          <Banknote className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            type="number" 
            step="0.01" 
            value={payAmount} 
            onChange={e => setPayAmount(e.target.value)} 
            className="pl-9"
            placeholder="0,00"
            required
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label>Observação</Label>
        <Input 
          value={notes} 
          onChange={e => setNotes(e.target.value)} 
          placeholder="Ex: Antecipação parcial"
        />
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={() => setPayMode(null)}>Voltar</Button>
        <Button 
          type="submit" 
          className="flex-1" 
          disabled={saving || Number(payAmount) <= 0}
        >
          {saving ? "Processando..." : "Confirmar Antecipação"}
        </Button>
      </div>
      
      <p className="text-[10px] text-muted-foreground text-center">
        O saldo restante continuará pendente no mesmo mês.
      </p>
    </form>
  );
}


function RemovePaymentForm({ installment, allTransactions, onDone, transactionIdToEdit, mode = "auto" }: { installment: any, allTransactions: any[], onDone: () => void, transactionIdToEdit?: string, mode?: "auto" | "edit" | "remove" }) {
  const [selectedTransactionId, setSelectedTransactionId] = useState<string>(transactionIdToEdit || "");
  const [editAmount, setEditAmount] = useState<string>("");
  const [editNotes, setEditNotes] = useState<string>("");
  const [isEditing, setIsEditing] = useState(mode === "edit" || !!transactionIdToEdit);
  const [isRemoving, setIsRemoving] = useState(mode === "remove");
  const [saving, setSaving] = useState(false);
  const { data: accounts = [] } = useAccounts();

  // Filtrar transações relacionadas ou criar uma virtual se não houver mas houver valor pago
  const relatedTrans = useMemo(() => {
    // 1. Buscar transações vinculadas diretamente pelo ID da parcela
    const fromDb = allTransactions
      .filter((t: any) => t.card_installment_id === installment.id)
      .sort((a: any, b: any) => new Date(b.posted_at || b.created_at).getTime() - new Date(a.posted_at || a.created_at).getTime());
    
    // 2. Se não houver vínculos diretos, tentar buscar pelo texto da descrição no histórico antigo
    if (fromDb.length === 0) {
      const installmentMonth = new Date(installment.due_at).getMonth();
      const installmentYear = new Date(installment.due_at).getFullYear();
      const purchaseDesc = (installment.cartao_compras?.description || "").toLowerCase();
      
      const legacyTrans = allTransactions.filter((t: any) => {
        if (t.card_installment_id) return false; // Já tem vínculo novo
        const tDate = new Date(t.posted_at || t.created_at);
        const tMonth = tDate.getMonth();
        const tYear = tDate.getFullYear();
        const tDesc = (t.description || "").toLowerCase();
        
        // Critérios de busca legada: mesmo mês/ano e descrição similar ou que mencione cartões
        return tMonth === installmentMonth && 
               tYear === installmentYear && 
               (tDesc.includes(purchaseDesc) || tDesc.includes("pagamento") || tDesc.includes("cartão"));
      });

      if (legacyTrans.length > 0) return legacyTrans;
    }

    // 3. Se ainda não há nada mas há valor pago na parcela, criamos uma virtual para permitir ajuste
    if (fromDb.length === 0 && Number(installment.paid_amount) > 0) {
      return [{
        id: "virtual-payment",
        amount: Number(installment.paid_amount),
        notes: installment.notes || "Pagamento registrado (Ajuste manual)",
        created_at: new Date().toISOString(),
        isVirtual: true
      }];
    }
    return fromDb;
  }, [allTransactions, installment]);

  useEffect(() => {
    if (transactionIdToEdit) {
      const t = relatedTrans.find(x => x.id === transactionIdToEdit);
      if (t) {
        setEditAmount(String(t.amount));
        setEditNotes(t.notes || "");
        setIsEditing(true);
        setSelectedTransactionId(t.id);
      }
    } else if (relatedTrans.length === 1 && (mode === "auto" || !mode)) {
      // Se só tem um lançamento e estamos em modo auto, pré-seleciona ele
      const t = relatedTrans[0];
      setSelectedTransactionId(t.id);
      setEditAmount(String(t.amount));
      setEditNotes(t.notes || "");
    }
  }, [transactionIdToEdit, allTransactions, mode, relatedTrans]);

  const handleAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTransactionId) return toast.error("Selecione um lançamento");
    
    const transaction = relatedTrans.find(t => t.id === selectedTransactionId);
    if (!transaction) return;

    if (!__tryLock()) return;

    setSaving(true);
    try {
      if ((transaction as any).isVirtual) {
        if (isEditing) {
          const newAmt = Number(editAmount);
          const diff = newAmt - Number(transaction.amount);
          const newPaidAmount = Number((Number(installment.paid_amount || 0) + diff).toFixed(2));
          await supabase.from("cartao_parcelas").update({ 
            paid_amount: newPaidAmount,
            status: Math.abs(newPaidAmount - Number(installment.amount)) < 0.01 ? "paid" : "pending"
          }).eq("id", installment.id);
          toast.success("Valor pago atualizado");
        } else if (isRemoving) {
          await supabase.from("cartao_parcelas").update({ paid_amount: 0, status: "pending", notes: null }).eq("id", installment.id);
          toast.success("Pagamento removido");
        }
      } else {
        if (isEditing) {
          const newAmt = Number(editAmount);
          const diff = newAmt - Number(transaction.amount);
          await supabase.from("transacoes").update({ amount: newAmt, notes: editNotes || null }).eq("id", transaction.id);
          const newPaidAmount = Number((Number(installment.paid_amount || 0) + diff).toFixed(2));
          await supabase.from("cartao_parcelas").update({ 
            paid_amount: newPaidAmount,
            status: Math.abs(newPaidAmount - Number(installment.amount)) < 0.01 ? "paid" : "pending"
          }).eq("id", installment.id);
          toast.success("Pagamento atualizado");
        } else if (isRemoving) {
          await supabase.from("transacoes").delete().eq("id", transaction.id);
          const newPaidAmount = Math.max(0, Number((Number(installment.paid_amount || 0) - Number(transaction.amount)).toFixed(2)));
          const remainingTrans = relatedTrans.filter(t => t.id !== selectedTransactionId);
          await supabase.from("cartao_parcelas").update({ 
            paid_amount: newPaidAmount,
            status: "pending",
            notes: remainingTrans.length > 0 ? remainingTrans[0].notes : null
          }).eq("id", installment.id);
          toast.success("Pagamento removido");
        }
      }
      onDone();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false); __release();
    }
  };

  return (
    <form onSubmit={handleAction} className="space-y-4">
      <div className="flex justify-between items-center mb-2">
        <Label>Histórico de lançamentos</Label>
        {!transactionIdToEdit && (
          <Button 
            type="button" 
            variant="outline" 
            size="sm" 
            className="h-7 text-[10px]" 
            onClick={() => {
              onDone();
              setTimeout(() => {
                window.dispatchEvent(new CustomEvent('open-partial-pay', { detail: installment }));
              }, 100);
            }}
          >
            + Novo Pagamento
          </Button>
        )}
      </div>

      {!transactionIdToEdit && (
        <div className="space-y-1.5">
          <Select value={selectedTransactionId} onValueChange={(v) => {
            setSelectedTransactionId(v);
            const t = relatedTrans.find(x => x.id === v);
            if (t) {
              setEditAmount(String(t.amount));
              setEditNotes(t.notes || "");
            }
          }}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione o pagamento para editar/remover" />
            </SelectTrigger>
            <SelectContent>
              {relatedTrans.map((t: any) => (
                <SelectItem key={t.id} value={t.id}>
                  {brl(t.amount)} - {t.notes || "Sem observação"} - {fmtDate(t.posted_at || t.created_at)}
                </SelectItem>
              ))}
              {relatedTrans.length === 0 && (
                <div className="p-2 text-center text-xs text-muted-foreground italic">
                  Nenhum lançamento vinculado encontrado. Use "Novo Pagamento".
                </div>
              )}
            </SelectContent>
          </Select>
        </div>
      )}

      {selectedTransactionId && (
        <div className="flex items-center gap-4 py-2 border-y border-border/50">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input 
              type="radio" 
              name={`action-${installment.id}`} 
              checked={isRemoving} 
              onChange={() => { setIsRemoving(true); setIsEditing(false); }} 
            />
            Remover
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input 
              type="radio" 
              name={`action-${installment.id}`} 
              checked={isEditing} 
              onChange={() => { setIsEditing(true); setIsRemoving(false); }} 
            />
            Editar
          </label>
        </div>
      )}

      {isEditing && selectedTransactionId && (
        <div className="space-y-3 pt-2">
          <div className="space-y-1.5">
            <Label>Novo Valor</Label>
            <Input type="number" step="0.01" value={editAmount} onChange={e => setEditAmount(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Nova Observação</Label>
            <Input value={editNotes} onChange={e => setEditNotes(e.target.value)} />
          </div>
        </div>
      )}

      <Button type="submit" variant={isEditing ? "default" : "destructive"} className="w-full" disabled={saving || !selectedTransactionId || (!isEditing && !isRemoving)}>
        {saving ? "Processando..." : (isEditing ? "Salvar alterações" : "Confirmar remoção")}
      </Button>
    </form>
  );
}


function EditPaidForm({ installment, onDone }: { installment: any, onDone: () => void }) {
  const [newPaidAmount, setNewPaidAmount] = useState(String(installment.paid_amount || 0));
  const [saving, setSaving] = useState(false);
  const { data: accounts = [] } = useAccounts();

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = Number(newPaidAmount);
    const oldVal = Number(installment.paid_amount || 0);
    const total = Number(installment.amount);

    if (val < 0 || val > total) return toast.error("Valor inválido");
    
    if (!__tryLock()) return;
    
    setSaving(true);
    try {
      const diff = val - oldVal;
      
      // Ao ajustar o valor manualmente via botão direito, limpamos o histórico de transações específicas
      // para manter o controle manual conforme solicitado
      await supabase.from("transacoes").delete().eq("card_installment_id", installment.id);

      // Atualizar a parcela
      const { error: instErr } = await supabase.from("cartao_parcelas").update({ 
        paid_amount: val,
        status: Math.abs(val - total) < 0.01 ? "paid" : "pending",
        notes: null
      }).eq("id", installment.id);
      if (instErr) throw instErr;

      toast.success("Valor pago atualizado e saldo ajustado");
      onDone();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false); __release();
    }
  };

  return (
    <form onSubmit={handleUpdate} className="space-y-4">
      <div className="bg-muted/50 p-3 rounded-lg border border-border space-y-1">
        <div className="text-xs text-muted-foreground uppercase">Valor total da parcela</div>
        <div className="text-lg font-bold">{brl(Number(installment.amount))}</div>
      </div>
      
      <div className="space-y-1.5">
        <Label>Valor já pago (total acumulado)</Label>
        <div className="relative">
          <Receipt className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input 
            type="number" 
            step="0.01" 
            value={newPaidAmount} 
            onChange={e => setNewPaidAmount(e.target.value)} 
            className="pl-9"
            required
          />
        </div>
      </div>

      <Button type="submit" className="w-full" disabled={saving}>
        {saving ? "Salvando..." : "Atualizar valor pago"}
      </Button>
    </form>
  );
}



