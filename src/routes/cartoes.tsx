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
import { Plus, CreditCard, Check, Trash2, Pencil, Banknote, Receipt, Undo2, AlertTriangle, Users, Equal, SlidersHorizontal, X, Trash } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { SmartInput } from "@/components/smart-input";
import { PersonSelect } from "@/components/person-select";
import { BANKS, findBank } from "@/lib/banks";
import { BankIcon } from "@/components/BankIcon";
import { cardPurchaseSchema, firstZodError } from "@/lib/schemas";
import { motion } from "framer-motion";
import { CountUp } from "@/components/CountUp";
import { installmentValueForPeople } from "@/lib/adjustments";
import { PageHeader } from "@/components/PageHeader";
import { RecurringCardBox } from "@/components/RecurringCardBox";
import { Progress } from "@/components/ui/progress";
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
  accountId: string | null;
  accountTayaneId?: string | null;
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

  // "Apenas confirmar recebimento" não deve criar crédito em nenhuma conta.
  // O valor ainda é registrado na fatura, mas sem lançamento financeiro.
  if (
    isEstorno &&
    accountsOverride?.accountId === "none" &&
    accountsOverride?.accountTayaneId === "none"
  ) {
    return [];
  }

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
          accountId: target ? target.id : null,
          accountTayaneId: null, // Garantir que não haja split automático
          amount: absAmount,
          person: paidByOverride,
          descriptionSuffix: ` (Cota individual de ${paidByOverride} em despesa Família)`
        }];
      }
    }

    // Fluxo padrão 50/50: debita de ambas as contas
    if (lorranAcc && tayaneAcc) {
      return [{
        accountId: lorranAcc ? lorranAcc.id : null,
        accountTayaneId: tayaneAcc ? tayaneAcc.id : null,
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
        accountId: anyLorran ? anyLorran.id : null,
        accountTayaneId: anyTayane ? anyTayane.id : null,
        amount: absAmount,
        person: "Familia",
        descriptionSuffix: " (Família 50/50 - Fallback)",
      }];
    }
    const only = lorranAcc || tayaneAcc;
    if (only || accountsOverride?.accountId === "none" || accountsOverride?.accountTayaneId === "none") {
      return [{
        accountId: lorranAcc ? lorranAcc.id : (accountsOverride?.accountId === "none" ? null : null),
        accountTayaneId: tayaneAcc ? tayaneAcc.id : (accountsOverride?.accountTayaneId === "none" ? null : null),
        amount: absAmount,
        person: "Familia",
        descriptionSuffix: ""
      }];
    }
    return [];
  }

  // Despesa individual (Lorran ou Tayane)
  const payer = paidByOverride ? normalizeName(paidByOverride) : p;
  const target = pickPaymentAccount(accounts, payer, [payer], accountsOverride?.accountId);
  if (target || accountsOverride?.accountId === "none") return [{ accountId: target ? target.id : null, amount: absAmount, person: payer, descriptionSuffix: "" }];
  return [];
};


export const Route = createFileRoute("/cartoes")({
  component: () => <ProtectedShell><CartoesPage /></ProtectedShell>,
  head: () => ({ meta: [{ title: "Cartões — Gestão Família" }] }),
});

const isRefundConfirmed = (installment: any) =>
  Number(installment?.amount || 0) < 0 &&
  Boolean((installment?.metadata as any)?.refund_confirmed);

const normalizeResponsibility = (installment: any) => {
  const total = Math.max(0, Number(installment?.amount || 0));
  const metadata = (installment?.metadata as any) || {};
  const saved = Array.isArray(metadata.responsibility_adjustment)
    ? metadata.responsibility_adjustment
    : null;

  if (normalizeName(installment?.cartao_compras?.person || "") !== "familia") {
    return [];
  }

  if (saved?.length) {
    return saved
      .map((item: any) => ({
        person: String(item.person || "").trim(),
        amount: Math.max(0, Number(item.amount || 0)),
      }))
      .filter((item: any) => item.person && item.amount > 0);
  }

  return [
    { person: "Lorran", amount: Number((total / 2).toFixed(2)) },
    { person: "Tayane", amount: Number((total - total / 2).toFixed(2)) },
  ];
};

const responsibilityForPerson = (installment: any, person: string) => {
  const target = normalizeName(person);
  return normalizeResponsibility(installment).find(
    (item: any) => normalizeName(item.person) === target,
  )?.amount ?? 0;
};

const getInstallmentPaymentState = (installment: any) => {
  const total = Number(installment.amount || 0);
  const rawPaid = Number(installment.paid_amount || 0);
  const isPaid = installment.status === "paid";
  const isRefund = total < 0;

  // Estorno já foi aplicado no valor original da fatura. Confirmá-lo
  // não é um pagamento e não deve alimentar "pago", "restante" ou saldo.
  // O valor negativo continua sendo exibido apenas no total da fatura.
  if (isRefund) {
    return {
      total,
      paid: 0,
      remaining: 0,
      hasPaid: isRefundConfirmed(installment),
      hasPending: !isRefundConfirmed(installment),
    };
  }

  const paid = isPaid && rawPaid <= 0
    ? total
    : Math.min(total, Math.max(0, rawPaid));
  const remaining = isPaid ? 0 : Number((total - paid).toFixed(2));

  return {
    total,
    paid,
    remaining,
    hasPaid: isPaid || paid > 0,
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
  const [responsibilityInstallment, setResponsibilityInstallment] = useState<any>(null);

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
    // Pessoas que aparecem nas compras desse mês/ano
    const relevant = inst.filter((i: any) => {
      const d = new Date(i.due_at + "T00:00:00");
      return d.getFullYear() === year && d.getMonth() === monthN - 1;
    });
    const names = new Set(relevant.map((i: any) => i.cartao_compras?.person).filter(Boolean));
    return Array.from(names).sort((a: any, b: any) => String(a).localeCompare(String(b), "pt-BR"));
  }, [inst, year, monthN]);

  const cardOptions = useMemo(() => {
    const relevant = inst.filter((i: any) => {
      const d = new Date(i.due_at + "T00:00:00");
      return d.getFullYear() === year && d.getMonth() === monthN - 1;
    });
    const cardIds = new Set(relevant.map((i: any) => i.card_id));
    return cards.filter(c => cardIds.has(c.id)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [inst, year, monthN, cards]);

  const brandOptions = useMemo(() => {
    const relevant = inst.filter((i: any) => {
      const d = new Date(i.due_at + "T00:00:00");
      return d.getFullYear() === year && d.getMonth() === monthN - 1;
    });
    const brands = new Set(relevant.map((i: any) => i.cartao_compras?.brand).filter(Boolean));
    return Array.from(brands).sort((a: any, b: any) => String(a).localeCompare(String(b), "pt-BR"));
  }, [inst, year, monthN]);

  const categoryOptions = useMemo(() => {
    const relevant = inst.filter((i: any) => {
      const d = new Date(i.due_at + "T00:00:00");
      return d.getFullYear() === year && d.getMonth() === monthN - 1;
    });
    const catIds = new Set(relevant.map((i: any) => i.cartao_compras?.category_id));
    return cats.filter(c => catIds.has(c.id)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [inst, year, monthN, cats]);


  const totals = useMemo(() => {
    const map: Record<string, { fatura: number; restante: number; brandTotals: Record<string, { fatura: number; restante: number }> }> = {};
    const isFamilia = (s: string) => (s || "").toLowerCase().trim() === "familia";

    monthInst.forEach((i: any) => {
      const effectiveCardId = i.card_id;
      const m = (map[effectiveCardId] = map[effectiveCardId] ?? { fatura: 0, restante: 0, brandTotals: {} });
      const payment = getInstallmentPaymentState(i);

      // O lançamento negativo já reduz a fatura, mas só reduz o
      // restante depois que o recebimento do estorno for confirmado.
      const refundOnly = payment.total < 0;

      const person = (i.cartao_compras?.person || "").toLowerCase().trim();
      const filter = personFilter !== "all" ? personFilter.toLowerCase().trim() : "all";
      const filter2 = personFilter2 !== "all" ? personFilter2.toLowerCase().trim() : "all";

      const isFam = person === "familia";

      const matchesFilter = filter === "all" || person === filter || (isFam && filter === "lorran") || person === filter2 || (isFam && filter2 === "lorran") || (isFam && (filter === "tayane" || filter2 === "tayane"));

      if (matchesFilter) {
        let valueForTotal = payment.total;
        let valueForRestante = refundOnly ? 0 : payment.remaining;

        if (isFam && (filter !== "all" || filter2 !== "all")) {
          const parts = i.participacoes || [];
          const paidByLorran = parts.filter((p: any) => normalizeName(p.person) === "lorran").reduce((s: number, p: any) => s + Number(p.amount), 0);
          const paidByTayane = parts.filter((p: any) => normalizeName(p.person) === "tayane").reduce((s: number, p: any) => s + Number(p.amount), 0);

          const selectedPerson =
            filter === "lorran" || filter2 === "lorran"
              ? "Lorran"
              : filter === "tayane" || filter2 === "tayane"
                ? "Tayane"
                : "";

          const quota = selectedPerson
            ? responsibilityForPerson(i, selectedPerson)
            : payment.total / 2;

          if (refundOnly) {
            // Mantém o estorno no total líquido da fatura, mas nunca no restante.
            valueForRestante = 0;
          } else if (filter === "lorran" || filter2 === "lorran") {
            const myPaid = paidByLorran;
            const myRemaining = i.status === "paid" ? 0 : quota - myPaid;
            valueForTotal = quota;
            valueForRestante = myRemaining;
          } else if (filter === "tayane" || filter2 === "tayane") {
            const myPaid = paidByTayane;
            const myRemaining = i.status === "paid" ? 0 : quota - myPaid;
            valueForTotal = quota;
            valueForRestante = myRemaining;
          }
        }

        m.fatura += valueForTotal;

        const cardMetadata = i.cartoes?.metadata as {
          brand?: string;
          brands?: Array<{ brand?: string; last_digits?: string }>;
        } | undefined;

        const formatBrand = (brand?: string, lastDigits?: string) => {
          if (!brand) return "";
          const formatted = brand.charAt(0).toUpperCase() + brand.slice(1).toLowerCase();
          return lastDigits ? `${formatted} ${lastDigits}` : formatted;
        };

        const configuredBrands = (cardMetadata?.brands ?? [])
          .map((brand) => formatBrand(brand.brand, brand.last_digits))
          .filter(Boolean);

        const fallbackBrand =
          formatBrand(cardMetadata?.brand, i.cartoes?.last_digits) ||
          (configuredBrands.length > 0 ? configuredBrands.join(" / ") : "Cartão");

        const b = i.cartao_compras?.brand || fallbackBrand;
        m.brandTotals[b] = m.brandTotals[b] ?? { fatura: 0, restante: 0 };
        m.brandTotals[b].fatura += valueForTotal;

        // Estornos nunca entram no restante. O valor negativo já foi lançado
        // na fatura e na categoria quando o estorno foi registrado.
        if (payment.total < 0) {
          valueForRestante = 0;
        }

        m.restante += Math.max(0, valueForRestante);
        m.brandTotals[b].restante += Math.max(0, valueForRestante);
      }
    });

    // Um estorno confirmado funciona como crédito contra o restante da
    // fatura. Ele não é um pagamento e não altera paid_amount, contas ou
    // participações; apenas libera o valor que já foi abatido na fatura.
    monthInst.forEach((i: any) => {
      const refundAmount = Number(i.amount || 0);
      // O estorno negativo já reduz o restante assim que é lançado.
      // A confirmação apenas registra o recebimento e não deve aplicar
      // o mesmo abatimento uma segunda vez.
      if (refundAmount >= 0) return;

      const person = (i.cartao_compras?.person || "").toLowerCase().trim();
      const filter = personFilter !== "all" ? personFilter.toLowerCase().trim() : "all";
      const filter2 = personFilter2 !== "all" ? personFilter2.toLowerCase().trim() : "all";
      const isFam = person === "familia";

      const matchesFilter =
        filter === "all" ||
        person === filter ||
        (isFam && (filter === "lorran" || filter === "tayane")) ||
        person === filter2 ||
        (isFam && (filter2 === "lorran" || filter2 === "tayane"));

      if (!matchesFilter) return;

      const factor =
        isFam && filter !== "all" && filter2 !== "all"
          ? 0.5
          : isFam && (filter === "lorran" || filter === "tayane" || filter2 === "lorran" || filter2 === "tayane")
            ? 0.5
            : 1;

      const credit = Math.abs(refundAmount) * factor;
      const target = map[i.card_id];
      if (!target) return;

      target.restante = Math.max(0, target.restante - credit);

      const metadata = i.cartoes?.metadata as {
        brand?: string;
        brands?: Array<{ brand?: string; last_digits?: string }>;
      } | undefined;
      const brand = i.cartao_compras?.brand || metadata?.brand || "Cartão";
      const brandTotal = target.brandTotals[brand];
      if (brandTotal) {
        brandTotal.restante = Math.max(0, brandTotal.restante - credit);
      }
    });

    return map;
  }, [monthInst, personFilter, personFilter2, statusFilter]);



  const getPaymentSplits = (person: string, amount: number, paidByOverride?: string | null) => buildPaymentSplits(accounts, person, amount, paidByOverride);

  const togglePaid = async (i: any, notes?: string, paidByOverride?: string | null, accountsOverride?: { accountId?: string | null, accountTayaneId?: string | null }, creditToAccount = true) => {
    const isEstorno = Number(i.amount) < 0;
    const isPaying = isEstorno
      ? !isRefundConfirmed(i)
      : i.status !== "paid";
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const originalPerson = i.cartao_compras?.person || "";
      const useOverride = !!(paidByOverride && paidByOverride.trim() && normalizeName(paidByOverride) !== normalizeName(originalPerson));
      const costPerson = useOverride ? paidByOverride!.trim() : originalPerson;

      if (isPaying) {
        const amount = Number(i.amount);
        const installmentTotal = Math.abs(amount);

        // Usa também os lançamentos vinculados para corrigir parcelas antigas
        // cujo paid_amount ficou desatualizado após um pagamento parcial.
        const linkedPaidAmount = allTransactions
          .filter((transaction: any) => transaction.card_installment_id === i.id)
          .reduce((sum: number, transaction: any) => sum + Number(transaction.amount || 0), 0);
        const currentPaidAmount = isEstorno
          ? 0
          : Math.min(
              installmentTotal,
              Math.max(Number(i.paid_amount || 0), linkedPaidAmount),
            );
        const amountToRegister = isEstorno
          ? installmentTotal
          : Math.max(0, installmentTotal - currentPaidAmount);

        // 1. Criar lançamento financeiro (débito para despesa, CRÉDITO para estorno)
        // O estorno (amount negativo) gera uma transação 'income' para repor o saldo na conta
        // Quando o usuário escolhe “Confirmar sem crédito em conta”, o estorno
        // deve apenas ser confirmado na fatura. Nenhuma transação financeira
        // pode ser criada, mesmo que existam contas selecionadas no estado do
        // formulário.
        const skipAccountCredit =
          isEstorno &&
          (
            creditToAccount === false ||
            (
              accountsOverride?.accountId === "none" &&
              accountsOverride?.accountTayaneId === "none"
            )
          );

        // Garante que "sem crédito em conta" também remova eventual crédito
        // criado anteriormente para esta mesma parcela.
        if (skipAccountCredit) {
          const { error: creditCleanupError } = await supabase
            .from("transacoes")
            .delete()
            .eq("card_installment_id", i.id);
          if (creditCleanupError) throw creditCleanupError;
        }

        const splits = skipAccountCredit
          ? []
          : buildPaymentSplits(
              accounts,
              originalPerson,
              isEstorno ? -amountToRegister : amountToRegister,
              paidByOverride,
              accountsOverride,
            );

        // Se houver splits (contas selecionadas), cria as transações
        if (splits.length > 0) {
          for (const split of splits) {
            const finalAccountId = split.accountId;
            const finalAccountTayaneId = split.accountTayaneId;

          if (split.accountId === null && split.accountTayaneId === null) {
            // Se for "Sem conta" em ambos os campos, não cria transação mas continua o processo
            console.log("Ignorando criação de transação: Sem conta selecionada");
            continue;
          }

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

        // Estornos já foram lançados na fatura como valores negativos.
        // Confirmar o recebimento é somente um marcador operacional:
        // não altera fatura, categoria, contas ou participações.
        if (isEstorno) {
          const { error: refundParticipationError } = await supabase
            .from("participacoes_parcelas")
            .delete()
            .eq("installment_id", i.id);

          if (refundParticipationError) throw refundParticipationError;
        } else {
          const { error: partError } = await supabase.from("participacoes_parcelas").upsert({
            user_id: user.id,
            installment_id: i.id,
            person: costPerson,
            amount: Math.abs(amount),
            status: "paid",
            paid_at: new Date().toISOString()
          } as any, { onConflict: "installment_id,person" });

          if (partError) throw partError;
        }

        const installmentUpdate = isEstorno
          ? {
              // O estorno já foi considerado no lançamento negativo.
              // A confirmação não deve alterar status, fatura, categoria ou pago.
              status: "pending",
              paid_amount: 0,
              paid_by: null,
              metadata: {
                ...((i.metadata as any) || {}),
                refund_confirmed: true,
                refund_confirmed_at: new Date().toISOString(),
              },
            }
          : {
              status: "paid",
              paid_amount: Math.min(
                installmentTotal,
                currentPaidAmount + amountToRegister,
              ),
              paid_by: paidByOverride || null,
            };

        const { error } = await supabase
          .from("cartao_parcelas")
          .update(installmentUpdate as any)
          .eq("id", i.id);

        if (error) throw error;
        toast.success(
          isEstorno
            ? (skipAccountCredit
              ? "Estorno confirmado sem alterar o saldo das contas."
              : "Estorno confirmado e creditado nas contas.")
            : "Parcela marcada como paga.",
        );
      } else {
        // Cancelar pagamento: primeiro remove os lançamentos financeiros
        // e as participações. Só depois redefine a parcela.
        const { error: transactionDeleteError } = await supabase
          .from("transacoes")
          .delete()
          .eq("card_installment_id", i.id);

        if (transactionDeleteError) throw transactionDeleteError;

        const { error: participationDeleteError } = await supabase
          .from("participacoes_parcelas")
          .delete()
          .eq("installment_id", i.id);

        if (participationDeleteError) throw participationDeleteError;

        const { error: resetError } = await supabase
          .from("cartao_parcelas")
          .update({
            status: "pending",
            paid_amount: 0,
            paid_by: null,
            metadata: {
              ...((i.metadata as any) || {}),
              partial_payments: [],
              refund_confirmed: false,
              refund_confirmed_at: null,
            },
          } as any)
          .eq("id", i.id);

        if (resetError) throw resetError;

        toast.success(
          isEstorno
            ? "Confirmação removida. O crédito do reembolso foi desfeito."
            : "Pagamento removido",
        );
      }
      invalidate("installments");
      invalidate("accounts");
      invalidate("transactions");
    } catch (err: any) {
      toast.error(err.message);
    }
  };
  const cancelInstallmentPayment = async (installment: any) => {
    if (!installment?.id || !__tryLock()) return;

    try {
      const { error: transactionError } = await supabase
        .from("transacoes")
        .delete()
        .eq("card_installment_id", installment.id);

      if (transactionError) throw transactionError;

      const { error: participationError } = await supabase
        .from("participacoes_parcelas")
        .delete()
        .eq("installment_id", installment.id);

      if (participationError) throw participationError;

      const { error: installmentError } = await supabase
        .from("cartao_parcelas")
        .update({
          status: "pending",
          paid_amount: 0,
          paid_by: null,
          notes: null,
          metadata: {
            ...((installment.metadata as any) || {}),
            partial_payments: [],
            refund_confirmed: false,
            refund_confirmed_at: null,
          },
        } as any)
        .eq("id", installment.id);

      if (installmentError) throw installmentError;

      invalidate("installments");
      invalidate("accounts");
      invalidate("transactions");

      toast.success(
        Number(installment.amount || 0) < 0
          ? "Confirmação do estorno removida."
          : "Pagamento cancelado e saldo restaurado.",
      );
    } catch (err: any) {
      toast.error(err.message || "Não foi possível cancelar a operação.");
    } finally {
      __release();
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

  const removePaymentDirectly = async (installment: any, transaction: any) => {
    if (!transaction?.id || transaction.isVirtual) {
      toast.error("Não foi possível identificar o lançamento.");
      return;
    }

    if (!confirm(`Remover o pagamento de ${brl(Number(transaction.amount || 0))}?`)) {
      return;
    }

    if (!__tryLock()) return;

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const transactionAmount = Number(transaction.amount || 0);
      const newPaidAmount = Math.max(
        0,
        Number(
          (Number(installment.paid_amount || 0) - transactionAmount).toFixed(2),
        ),
      );

      const remainingTransactions = allTransactions
        .filter(
          (item: any) =>
            item.card_installment_id === installment.id &&
            item.id !== transaction.id,
        )
        .sort(
          (a: any, b: any) =>
            new Date(b.posted_at || b.created_at).getTime() -
            new Date(a.posted_at || a.created_at).getTime(),
        );

      const { error: deleteError } = await supabase
        .from("transacoes")
        .delete()
        .eq("id", transaction.id);

      if (deleteError) throw deleteError;

      const { error: installmentError } = await supabase
        .from("cartao_parcelas")
        .update({
          paid_amount: newPaidAmount,
          status:
            newPaidAmount >= Number(installment.amount || 0) - 0.01
              ? "paid"
              : "pending",
          notes: remainingTransactions[0]?.notes || null,
        } as any)
        .eq("id", installment.id);

      if (installmentError) throw installmentError;

      const person =
        transaction.person || installment.cartao_compras?.person || "Familia";

      const { data: participation, error: participationError } = await supabase
        .from("participacoes_parcelas")
        .select("id, amount")
        .eq("installment_id", installment.id)
        .eq("person", person)
        .maybeSingle();

      if (participationError) throw participationError;

      const nextParticipationAmount = Number(
        (Number(participation?.amount || 0) - transactionAmount).toFixed(2),
      );

      if (nextParticipationAmount <= 0.01) {
        if (participation?.id) {
          const { error } = await supabase
            .from("participacoes_parcelas")
            .delete()
            .eq("id", participation.id);

          if (error) throw error;
        }
      } else {
        const { error } = await supabase
          .from("participacoes_parcelas")
          .update({
            amount: nextParticipationAmount,
            status:
              Math.abs(
                nextParticipationAmount - Number(installment.amount || 0),
              ) < 0.01
                ? "paid"
                : "pending",
            paid_at: new Date().toISOString(),
            user_id: user.id,
          } as any)
          .eq("id", participation!.id);

        if (error) throw error;
      }

      setShowProgressInfo(null);
      setRemovePaymentOpen(null);
      setEditingTransactionId(null);
      invalidate("installments");
      invalidate("accounts");
      invalidate("transactions");
      toast.success("Pagamento removido");
    } catch (err: any) {
      toast.error(err.message || "Não foi possível remover o pagamento.");
    } finally {
      __release();
    }
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
            <RecurringCardBox
              cards={cards}
              cats={cats}
              onCreated={() => {
                invalidate("installments");
              }}
            />

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
              <div className="pt-3 border-t border-border space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
                      Fatura {monthLabel(monthN - 1)}{personFilter !== "all" && ` • ${personFilter}`}
                    </div>
                    <div className="text-xl font-bold text-foreground tabular-nums mt-1.5">
                      <CountUp value={totals[c.id]?.fatura ?? 0} format={brl} />
                    </div>
                  </div>
                  {(() => {
                    const rest = totals[c.id]?.restante ?? 0;
                    const paid = rest === 0;
                    return (
                      <div className={`flex flex-col items-end px-2.5 py-1.5 rounded-lg border gap-0.5 ${paid ? "border-success/30 bg-success/10" : "border-destructive/25 bg-destructive/10"}`}>
                        <span className={`text-[10px] uppercase tracking-[0.18em] font-bold ${paid ? "text-success" : "text-destructive"}`}>
                          {paid ? "Liquidada" : "Restante"}
                        </span>
                        <span className={`text-sm font-bold tabular-nums ${paid ? "text-success" : "text-destructive"}`}>
                          {brl(rest)}
                        </span>
                      </div>
                    );
                  })()}
                </div>

                {totals[c.id]?.brandTotals && Object.keys(totals[c.id].brandTotals).length > 0 && (
                  <div className="grid grid-cols-2 gap-2 border-t border-border/50 pt-3">
                    {Object.entries(totals[c.id].brandTotals).map(([brand, data], bi) => (
                      <div key={bi} className="min-w-0 rounded-lg border border-border/60 bg-muted/20 p-2.5">
                        <span className="block truncate text-[9px] uppercase text-muted-foreground font-bold leading-none">
                          {brand}
                        </span>
                        <div className="mt-1.5 flex flex-col leading-tight">
                          <span className="text-[11px] font-bold">{brl(data.fatura)}</span>
                          {data.restante > 0.01 && (
                            <span className="text-[9px] text-destructive font-semibold mt-1">
                              Rest. {brl(data.restante)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
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
                  {cardOptions.map((c: any) => (
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
                  {categoryOptions.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.icon ? `${c.icon} ` : ""}{c.name}</SelectItem>)}
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
              disabled={monthInst.length === 0 || monthInst.every((i: any) => i.status === "paid" || Number(i.amount) < 0)}
              onClick={async () => {
                // Estornos (valores negativos) abatem a fatura automaticamente — nunca entram no pagamento em lote.
                const pending = monthInst.filter((i: any) => i.status !== "paid" && Number(i.amount) >= 0);
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
                        <div className="mt-1 w-24">
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
                          // Todas as parcelas usam o mesmo menu de ação.
                          // O histórico também exibe as opções de pagamento,
                          // ajuste de responsabilidade e cancelamento quando aplicável.
                          setShowProgressInfo(i);
                        }}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          if (isPartial || i.status === "paid") setEditPaidOpen(i);
                        }}
                        className={`w-7 h-7 rounded-md flex items-center justify-center transition-all ${(Number(i.amount) < 0 ? isRefundConfirmed(i) : i.status === "paid") ? "bg-success/20 text-success shadow-sm" : (Number(i.amount) < 0 ? "bg-warning/20 text-warning border border-warning/30 animate-pulse hover:bg-warning/30" : "bg-muted text-muted-foreground hover:bg-warning/20 hover:text-warning")}`}
                        title={Number(i.amount) < 0
                          ? (isRefundConfirmed(i) ? "Estorno confirmado (Clique para remover)" : "Estorno pendente (Clique para confirmar)")
                          : (i.status === "paid" ? "Remover/Editar pagamento" : (isPartial ? "Antecipar pagamento / Clique direito: ajuste manual" : "Antecipar pagamento"))}
                      >
                        {(Number(i.amount) < 0 ? isRefundConfirmed(i) : i.status === "paid") ? <Check className="w-3.5 h-3.5" /> : (Number(i.amount) < 0 ? <Undo2 className="w-3.5 h-3.5" /> : <Banknote className="w-3.5 h-3.5" />)}
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
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {partialPayOpen?._refundConfirmation
                ? "Confirmar recebimento do estorno"
                : "Pagamento"}
            </DialogTitle>
          </DialogHeader>
          {partialPayOpen && (
            <AnticipatePayForm
              installment={partialPayOpen}
              initialAmount={partialPayOpen?._anticipateAmount}
              onFullPay={async (notes, paidBy, accountsOverride, creditToAccount) => {
                await togglePaid(
                  partialPayOpen,
                  notes,
                  paidBy,
                  accountsOverride,
                  creditToAccount,
                );
                setPartialPayOpen(null);
                setShowProgressInfo(null);
              }}
              onDone={() => { setPartialPayOpen(null); invalidate("installments"); invalidate("accounts"); invalidate("transactions"); }}
              onAdjustResponsibility={() => {
                setPartialPayOpen(null);
                setResponsibilityInstallment(partialPayOpen);
              }}
              onBackToHistory={() => {
                setPartialPayOpen(null);
                setShowProgressInfo(partialPayOpen);
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!responsibilityInstallment}
        onOpenChange={(open) => !open && setResponsibilityInstallment(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ajuste de responsabilidade</DialogTitle>
          </DialogHeader>
          {responsibilityInstallment && (
            <CardResponsibilityForm
              installment={responsibilityInstallment}
              onDone={() => {
                setResponsibilityInstallment(null);
                invalidate("installments");
              }}
              onCancel={() => {
                setResponsibilityInstallment(null);
                setShowProgressInfo(responsibilityInstallment);
              }}
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
        <DialogContent className="max-w-xl overflow-hidden rounded-2xl border-border bg-background p-0 shadow-2xl">
          <DialogHeader className="border-b border-border bg-card px-6 py-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                  Cartão
                </p>
                <DialogTitle className="mt-1 text-xl">Histórico de pagamentos</DialogTitle>
              </div>
              <div className="rounded-xl bg-primary/10 px-3 py-2 text-right">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Parcela
                </p>
                <p className="text-sm font-semibold text-primary">
                  {showProgressInfo?.installment_number}/
                  {showProgressInfo?.cartao_compras?.installments_count || 1}
                </p>
              </div>
            </div>
          </DialogHeader>
          {showProgressInfo && (() => {
            const relatedTrans = allTransactions
              .filter((t: any) => t.card_installment_id === showProgressInfo.id)
              .sort((a: any, b: any) => new Date(b.posted_at || b.created_at).getTime() - new Date(a.posted_at || a.created_at).getTime());

            return (
              <div className="max-h-[min(720px,calc(100vh-150px))] space-y-5 overflow-y-auto px-6 py-5">
                {(() => {
                  const total = Number(showProgressInfo.amount || 0);
                  const isEstornoInfo = total < 0;
                  const estornoPaid = isRefundConfirmed(showProgressInfo);
                  const linkedPaid = relatedTrans.reduce(
                    (sum: number, transaction: any) =>
                      sum + Number(transaction.amount || 0),
                    0,
                  );
                  const paid = isEstornoInfo
                    ? (estornoPaid ? Math.abs(total) : 0)
                    : Math.min(
                        Math.abs(total),
                        Math.max(
                          Number(showProgressInfo.paid_amount || 0),
                          linkedPaid,
                        ),
                      );
                  const remaining = isEstornoInfo
                    ? 0
                    : Math.max(0, Number((Math.abs(total) - paid).toFixed(2)));
                  const progress = isEstornoInfo
                    ? (estornoPaid ? 100 : 0)
                    : (total > 0 ? Math.min(100, (paid / total) * 100) : 0);
                  const canPay = isEstornoInfo ? !estornoPaid : remaining > 0.01;

                  return (
                    <>
                      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm space-y-5">
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                            Lançamento
                          </div>
                          <div className="mt-1 text-lg font-bold text-foreground">
                            {showProgressInfo.cartao_compras?.description || "Pagamento do cartão"}
                          </div>
                          <div className="mt-1 text-sm text-muted-foreground">
                            {showProgressInfo.cartao_compras?.person || "Sem pessoa"}
                          </div>
                        </div>

                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div
                            className="h-full bg-success transition-all"
                            style={{ width: `${progress}%` }}
                          />
                        </div>

                        <div className="grid grid-cols-3 gap-3 border-t border-border/70 pt-4 text-xs">
                          <div>
                            <span className="block text-muted-foreground">Valor</span>
                            <strong>{brl(total)}</strong>
                          </div>
                          <div>
                            <span className="block text-muted-foreground">{isEstornoInfo ? "Confirmado" : "Já pago"}</span>
                            <strong className="text-success">{brl(paid)}</strong>
                          </div>
                          <div>
                            <span className="block text-muted-foreground">Falta</span>
                            <strong className={canPay ? "text-warning" : "text-success"}>
                              {brl(remaining)}
                            </strong>
                          </div>
                        </div>
                      </div>

                      {isEstornoInfo ? (
                        <div className="space-y-3 rounded-xl border border-warning/30 bg-warning/5 p-3">
                          {!isRefundConfirmed(showProgressInfo) ? (
                            <Button
                              className="w-full"
                              onClick={() => {
                                setShowProgressInfo(null);
                                setPartialPayOpen({
                                  ...showProgressInfo,
                                  _refundConfirmation: true,
                                });
                              }}
                            >
                              <Check className="mr-2 h-4 w-4" />
                              Confirmar recebimento
                            </Button>
                          ) : (
                            <div className="space-y-3">
                              <div className="flex items-center gap-2 text-xs font-medium text-success">
                                <Check className="h-4 w-4" />
                                Recebido e aplicado na fatura
                              </div>

                              <Button
                                type="button"
                                variant="outline"
                                className="w-full border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                onClick={async () => {
                                  if (
                                    !confirm(
                                      "Remover a confirmação deste reembolso? Se o valor foi creditado em uma conta, o crédito também será desfeito.",
                                    )
                                  ) {
                                    return;
                                  }

                                  await cancelInstallmentPayment(showProgressInfo);
                                  setShowProgressInfo(null);
                                }}
                              >
                                <Undo2 className="mr-2 h-4 w-4" />
                                Remover confirmação e desfazer crédito
                              </Button>


                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div className="grid gap-2 sm:grid-cols-2">
                            <Button
                              className="h-11 w-full rounded-xl text-sm font-semibold shadow-lg shadow-primary/10"
                              disabled={!canPay}
                              onClick={() => {
                                setShowProgressInfo(null);
                                setPartialPayOpen({
                                  ...showProgressInfo,
                                  _quickPay: true,
                                });
                              }}
                            >
                              <Banknote className="mr-2 h-4 w-4" />
                              Pagar total
                            </Button>

                            <Button
                              type="button"
                              variant="outline"
                              className="h-11 w-full rounded-xl text-sm font-semibold"
                              disabled={!canPay}
                              onClick={() => {
                                setShowProgressInfo(null);
                                setPartialPayOpen({
                                  ...showProgressInfo,
                                  _anticipateAmount: remaining,
                                });
                              }}
                            >
                              <Banknote className="mr-2 h-4 w-4" />
                              Pagar restante
                            </Button>
                          </div>

                          {normalizeName(showProgressInfo.cartao_compras?.person || "") === "familia" && (
                            <Button
                              type="button"
                              variant="outline"
                              className="h-11 w-full rounded-xl border-primary/30 text-sm font-semibold hover:border-primary hover:bg-primary/5"
                              onClick={() => {
                                setShowProgressInfo(null);
                                setResponsibilityInstallment(showProgressInfo);
                              }}
                            >
                              <Users className="mr-2 h-4 w-4" />
                              Ajuste de responsabilidade
                            </Button>
                          )}

                          {relatedTrans.length > 0 && (
                            <Button
                              type="button"
                              variant="outline"
                              className="h-10 w-full rounded-xl border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={async () => {
                                if (
                                  !confirm(
                                    "Cancelar este pagamento? Os lançamentos serão removidos e o valor restante será restaurado.",
                                  )
                                ) {
                                  return;
                                }

                                await cancelInstallmentPayment(showProgressInfo);
                                setShowProgressInfo(null);
                              }}
                            >
                              <Undo2 className="mr-2 h-4 w-4" />
                              Cancelar pagamento
                            </Button>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}

                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                      Lançamentos
                    </Label>
                    <span className="text-xs text-muted-foreground">
                      {relatedTrans.length} registro{relatedTrans.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="max-h-[260px] overflow-y-auto space-y-2 pr-1">
                    {relatedTrans.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border bg-muted/10 px-4 py-8 text-center">
                        <Receipt className="mx-auto mb-2 h-5 w-5 text-muted-foreground/60" />
                        <p className="text-sm text-muted-foreground">Nenhum lançamento registrado</p>
                      </div>
                    ) : (
                      relatedTrans.map((t: any) => (
                        <div key={t.id} className="group relative space-y-2 rounded-xl border border-border bg-card p-3">
                          <div className="flex justify-between items-start gap-3">
                            <div>
                              <span className="font-semibold text-success">{brl(t.amount)}</span>
                              <span className="ml-2 text-xs text-muted-foreground">
                                {t.person || showProgressInfo.cartao_compras?.person || "Sem pessoa"}
                              </span>
                            </div>
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
                                onClick={() => removePaymentDirectly(showProgressInfo, t)}
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

                <div className="flex justify-end border-t border-border pt-4">
                  <Button
                    variant="outline"
                    className="rounded-xl px-5"
                    onClick={() => setShowProgressInfo(null)}
                  >
                    Fechar
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}



function CardResponsibilityForm({
  installment,
  onDone,
  onCancel,
}: {
  installment: any;
  onDone: () => void;
  onCancel: () => void;
}) {
  // Família permanece 50/50 por padrão. O ajuste salvo em metadata só
  // substitui as cotas desta parcela; ele não altera a regra global.
  const total = Math.max(0, Number(installment.amount || 0));
  const initial = normalizeResponsibility(installment);
  const [rows, setRows] = useState(() =>
    initial.length > 0
      ? initial.map((item: any) => ({
          person: item.person,
          amount: String(item.amount.toFixed(2)),
        }))
      : [
          { person: "Lorran", amount: String((total / 2).toFixed(2)) },
          { person: "Tayane", amount: String((total / 2).toFixed(2)) },
        ],
  );
  const [saving, setSaving] = useState(false);

  const sum = rows.reduce((value, row) => value + Number(row.amount || 0), 0);
  const remaining = Math.max(0, Number((total - sum).toFixed(2)));
  const distributedPercent = total > 0
    ? Math.min(100, Math.max(0, (sum / total) * 100))
    : 0;
  const valid =
    rows.length > 0 &&
    rows.every((row) => row.person && Number(row.amount) >= 0) &&
    Math.abs(sum - total) < 0.01;

  const updateRow = (index: number, patch: Partial<{ person: string; amount: string }>) => {
    setRows((current) =>
      current.map((row, rowIndex) =>
        rowIndex === index ? { ...row, ...patch } : row,
      ),
    );
  };

  const splitEqually = () => {
    const half = Number((total / 2).toFixed(2));
    setRows([
      { person: "Lorran", amount: String(half.toFixed(2)) },
      { person: "Tayane", amount: String((total - half).toFixed(2)) },
    ]);
  };

  const save = async () => {
    if (!valid) {
      toast.error(`A soma precisa ser ${brl(total)}.`);
      return;
    }

    if (!__tryLock()) return;
    setSaving(true);

    try {
      const metadata = {
        ...((installment.metadata as any) || {}),
        responsibility_adjustment: rows
          .filter((row) => Number(row.amount) > 0)
          .map((row) => ({
            person: row.person,
            amount: Number(Number(row.amount).toFixed(2)),
          })),
      };

      const { error } = await supabase
        .from("cartao_parcelas")
        .update({ metadata } as any)
        .eq("id", installment.id);

      if (error) throw error;

      toast.success("Ajuste de responsabilidade salvo. Os valores de cada responsável foram atualizados.");
      onDone();
    } catch (err: any) {
      toast.error(err.message || "Não foi possível salvar o ajuste.");
    } finally {
      setSaving(false);
      __release();
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-muted/30 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">
              {installment.cartao_compras?.description || "Parcela do cartão"}
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              Valor total
            </div>
          </div>
          <strong className="shrink-0 text-lg tabular-nums text-foreground">
            {brl(total)}
          </strong>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-3.5 shadow-sm">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
              Divisão atual
            </div>
            <div className="mt-1 text-sm font-semibold tabular-nums">
              {brl(sum)} <span className="font-normal text-muted-foreground">de {brl(total)}</span>
            </div>
          </div>

          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {remaining > 0.01 ? "Sobra" : "Distribuído"}
            </div>
            <div className={`text-sm font-bold tabular-nums ${remaining > 0.01 ? "text-warning" : "text-success"}`}>
              {remaining > 0.01 ? brl(remaining) : brl(total)}
            </div>
          </div>
        </div>

        <Progress value={distributedPercent} className="h-2.5 bg-muted" />

        <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>R$ 0</span>
          <span className={valid ? "font-semibold text-success" : ""}>
            {Math.round(distributedPercent)}%
          </span>
          <span>{brl(total)}</span>
        </div>

        {remaining > 0.01 && (
          <div className="mt-3 rounded-lg border border-warning/25 bg-warning/5 px-3 py-2 text-xs text-warning">
            Ainda falta distribuir <strong className="tabular-nums">{brl(remaining)}</strong>.
          </div>
        )}

        {valid && (
          <div className="mt-3 flex items-center gap-2 text-xs font-medium text-success">
            <Check className="h-3.5 w-3.5" />
            Valor totalmente distribuído
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div className="flex gap-1 rounded-lg border border-border bg-muted/20 p-1">
          <Button type="button" size="sm" variant="secondary" className="h-7 px-3">
            R$
          </Button>
          <Button type="button" size="sm" variant="ghost" className="h-7 px-3" disabled>
            %
          </Button>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={splitEqually}>
          Dividir igualmente
        </Button>
      </div>

      <div className="space-y-2.5">
        {rows.map((row, index) => {
          const amount = Math.max(0, Number(row.amount || 0));
          const percentage = total > 0
            ? Math.min(100, Math.max(0, (amount / total) * 100))
            : 0;

          return (
            <div
              key={`${row.person}-${index}`}
              className="rounded-xl border border-border bg-muted/10 p-3"
            >
              <div className="flex items-center gap-2">
                <Select
                  value={row.person}
                  onValueChange={(person) => updateRow(index, { person })}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Lorran">Lorran</SelectItem>
                    <SelectItem value="Tayane">Tayane</SelectItem>
                  </SelectContent>
                </Select>

                <div className="relative">
                  <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    R$
                  </span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.amount}
                    onChange={(event) => updateRow(index, { amount: event.target.value })}
                    className="w-32 pl-8 text-right tabular-nums"
                  />
                </div>
              </div>

              <div className="mt-2.5 flex items-center gap-2">
                <Progress value={percentage} className="h-1.5 flex-1" />
                <span className="w-14 text-right text-[11px] font-semibold tabular-nums text-muted-foreground">
                  {Math.round(percentage)}%
                </span>
              </div>

              <div className="mt-1 flex justify-between text-[10px] text-muted-foreground">
                <span>{brl(amount)} atribuídos</span>
                <span>de {brl(total)}</span>
              </div>
            </div>
          );
        })}
      </div>

      <div className={`rounded-lg border px-3 py-2 text-xs ${
        valid
          ? "border-success/25 bg-success/5 text-success"
          : "border-border bg-muted/20 text-muted-foreground"
      }`}>
        <div className="flex items-center justify-between gap-3">
          <span>Numerador da divisão</span>
          <strong className="tabular-nums">
            {brl(sum)} / {brl(total)}
          </strong>
        </div>
      </div>

      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancel}>
          Voltar
        </Button>
        <Button type="button" className="flex-1" disabled={!valid || saving} onClick={save}>
          {saving ? "Salvando…" : "Salvar ajuste"}
        </Button>
      </div>
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
    cardType: initialData?.metadata?.cardType ?? "physical",
    brands: (initialData?.metadata?.brands || []).map((brand: any) => ({
      ...brand,
      type: brand.type ?? "physical",
    })),
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
        cardType: form.mode === "standard" ? form.cardType : null,
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
        <div className="grid grid-cols-3 gap-3 animate-in fade-in slide-in-from-top-1 duration-200">
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={form.cardType} onValueChange={(v) => setForm({ ...form, cardType: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="physical">Físico</SelectItem>
                <SelectItem value="online">Online</SelectItem>
              </SelectContent>
            </Select>
          </div>
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
              onClick={() => setForm({ ...form, brands: [...form.brands, { type: "physical", brand: "visa", last_digits: "" }] })}
            >
              <Plus className="w-3 h-3 mr-1" /> Add Bandeira
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-2">
        {form.brands.map((b: any, idx: number) => (
          <div key={idx} className="relative p-2 border border-border/50 rounded-lg bg-background/50 flex items-center gap-3 group/brand">
            <div className="w-28 space-y-1">
              <Label className="text-[9px] uppercase font-bold text-muted-foreground/70">Tipo</Label>
              <Select
                value={b.type ?? "physical"}
                onValueChange={(v) => {
                  const next = [...form.brands];
                  next[idx] = { ...next[idx], type: v };
                  setForm({ ...form, brands: next });
                }}
              >
                <SelectTrigger className="h-7 text-[10px] bg-background px-2"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="physical">Físico</SelectItem>
                  <SelectItem value="online">Online</SelectItem>
                </SelectContent>
              </Select>
            </div>

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

function RefundReceiptPanel({
  installment,
  onConfirm,
  onCancel,
}: {
  installment: any;
  onConfirm: (
    notes?: string,
    paidBy?: string | null,
    accountsOverride?: {
      accountId?: string | null;
      accountTayaneId?: string | null;
    },
    creditToAccount?: boolean,
  ) => void;
  onCancel: () => void;
}) {
  const amount = Math.abs(Number(installment.amount || 0));
  const description = installment.cartao_compras?.description || "Estorno";
  const person = installment.cartao_compras?.person || "Sem pessoa";
  const category = installment.cartao_compras?.categorias?.name || "Sem categoria";

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="relative overflow-hidden border-b border-border bg-gradient-to-br from-success/10 via-card to-primary/5 px-5 py-5">
          <div className="absolute -right-8 -top-10 h-32 w-32 rounded-full bg-success/10 blur-2xl" />

          <div className="relative flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success/15 text-success">
              <Undo2 className="h-5 w-5" />
            </div>

            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-success">
                  Estorno recebido
                </span>
                <span className="rounded-full border border-success/25 bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
                  Abate a fatura
                </span>
              </div>

              <h3 className="truncate text-base font-semibold text-foreground">
                {description}
              </h3>

              <p className="mt-1 text-xs text-muted-foreground">
                {person} · parcela {installment.installment_number}/
                {installment.cartao_compras?.installments_count || 1}
              </p>
            </div>

            <div className="relative shrink-0 text-right">
              <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
                Valor
              </span>
              <strong className="mt-0.5 block text-xl tabular-nums text-success">
                {brl(amount)}
              </strong>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 divide-x divide-border">
          <div className="p-3.5">
            <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
              Categoria
            </span>
            <span className="mt-1 block truncate text-sm font-medium text-foreground">
              {category}
            </span>
          </div>

          <div className="p-3.5">
            <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
              Fatura
            </span>
            <span className="mt-1 block text-sm font-medium text-foreground">
              {fmtDate(installment.due_at)}
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-success/25 bg-success/5 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success/15 text-success">
            <Check className="h-4 w-4" />
          </div>

          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              Confirmar abatimento
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              O valor será considerado na fatura e na categoria, sem movimentar contas.
            </p>
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={onCancel}
        >
          Agora não
        </Button>

        <Button
          type="button"
          className="flex-1 bg-success text-success-foreground hover:bg-success/90"
          onClick={() =>
            onConfirm(
              undefined,
              null,
              {
                accountId: "none",
                accountTayaneId: "none",
              },
              false,
            )
          }
        >
          <Check className="mr-2 h-4 w-4" />
          Confirmar estorno
        </Button>
      </div>
    </div>
  );
}

function RefundConfirmationPanel({
  installment,
  accounts,
  onConfirm,
  onCancel,
}: {
  installment: any;
  accounts: any[];
  onConfirm: (
    notes?: string,
    paidBy?: string | null,
    accountsOverride?: {
      accountId?: string | null;
      accountTayaneId?: string | null;
    },
    creditToAccount?: boolean,
  ) => void;
  onCancel: () => void;
}) {
  const [mode, setMode] = useState<"choose" | "credit">("choose");
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [selectedAccountTayaneId, setSelectedAccountTayaneId] = useState("");

  const amount = Math.abs(Number(installment.amount || 0));
  const person = installment.cartao_compras?.person || "";
  const description = installment.cartao_compras?.description || "Estorno";
  const isFamilia = normalizeName(person) === "familia";

  const lorranAccounts = accounts.filter(
    (account: any) =>
      normalizeName(account.account_name || "") === "lorran" ||
      normalizeName(account.bank || "").includes("revolut") ||
      normalizeName(account.bank || "").includes("nubank"),
  );

  const tayaneAccounts = accounts.filter(
    (account: any) =>
      normalizeName(account.account_name || "") === "tayane" ||
      normalizeName(account.bank || "").includes("mercado"),
  );

  const accountOptions = isFamilia ? lorranAccounts : accounts;

  useEffect(() => {
    if (isFamilia) {
      setSelectedAccountId(lorranAccounts[0]?.id || "");
      setSelectedAccountTayaneId(tayaneAccounts[0]?.id || "");
    } else {
      setSelectedAccountId(accounts[0]?.id || "");
    }
  }, [accounts, isFamilia]);

  const confirmWithoutCredit = () => {
    onConfirm(undefined, null, {
      accountId: "none",
      accountTayaneId: "none",
    }, false);
  };

  const confirmCredit = () => {
    if (!selectedAccountId || (isFamilia && !selectedAccountTayaneId)) {
      toast.error("Selecione a conta do crédito.");
      return;
    }

    onConfirm(undefined, null, {
      accountId: selectedAccountId,
      accountTayaneId: isFamilia ? selectedAccountTayaneId : null,
    }, true);
  };

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex items-center gap-3 border-b border-border bg-muted/20 p-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning">
            <Undo2 className="h-5 w-5" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-foreground">
              {description}
            </p>
            <p className="text-xs text-muted-foreground">
              Parcela {installment.installment_number}/
              {installment.cartao_compras?.installments_count || 1}
              {" · "}
              {person || "Sem pessoa"}
            </p>
          </div>

          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Estorno
            </p>
            <p className="text-lg font-bold tabular-nums text-success">
              {brl(amount)}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 divide-x divide-border border-b border-border">
          <div className="p-3">
            <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
              Categoria
            </span>
            <span className="mt-1 block truncate text-sm font-medium">
              {installment.cartao_compras?.categorias?.name || "Estorno"}
            </span>
          </div>
          <div className="p-3">
            <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
              Fatura
            </span>
            <span className="mt-1 block text-sm font-medium">
              {fmtDate(installment.due_at)}
            </span>
          </div>
        </div>
      </div>

      {mode === "choose" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            className="group h-auto min-h-28 justify-start gap-3 rounded-2xl border-primary/40 bg-primary/5 p-4 text-left hover:border-primary hover:bg-primary/10"
            onClick={() => setMode("credit")}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <Banknote className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold text-foreground">
                Creditar nas contas
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                Adicionar {brl(amount)} ao saldo
              </span>
            </span>
          </Button>

          <Button
            type="button"
            variant="outline"
            className="group h-auto min-h-28 justify-start gap-3 rounded-2xl border-border bg-muted/20 p-4 text-left hover:border-success/50 hover:bg-success/10"
            onClick={confirmWithoutCredit}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-success/15 text-success">
              <Check className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block font-semibold text-foreground">
                Apenas confirmar
              </span>
              <span className="mt-1 block text-xs text-muted-foreground">
                Sem alterar o saldo das contas
              </span>
            </span>
          </Button>
        </div>
      ) : (
        <div className="space-y-3 rounded-2xl border border-primary/25 bg-primary/5 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-semibold">Conta do crédito</p>
              <p className="text-xs text-muted-foreground">{brl(amount)}</p>
            </div>
            <Banknote className="h-5 w-5 text-primary" />
          </div>

          {isFamilia ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs">Lorran · 50%</Label>
                <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Selecionar conta" />
                  </SelectTrigger>
                  <SelectContent>
                    {lorranAccounts.map((account: any) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.bank} · {account.account_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">Tayane · 50%</Label>
                <Select value={selectedAccountTayaneId} onValueChange={setSelectedAccountTayaneId}>
                  <SelectTrigger className="bg-background">
                    <SelectValue placeholder="Selecionar conta" />
                  </SelectTrigger>
                  <SelectContent>
                    {tayaneAccounts.map((account: any) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.bank} · {account.account_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs">Conta de destino</Label>
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger className="bg-background">
                  <SelectValue placeholder="Selecionar conta" />
                </SelectTrigger>
                <SelectContent>
                  {accountOptions.map((account: any) => (
                    <SelectItem key={account.id} value={account.id}>
                      {account.bank} · {account.account_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              className="flex-1"
              onClick={() => setMode("choose")}
            >
              Voltar
            </Button>
            <Button type="button" className="flex-1" onClick={confirmCredit}>
              <Check className="mr-2 h-4 w-4" />
              Confirmar crédito
            </Button>
          </div>
        </div>
      )}

      {mode === "choose" && (
        <Button
          type="button"
          variant="ghost"
          className="w-full text-muted-foreground"
          onClick={onCancel}
        >
          Cancelar
        </Button>
      )}
    </div>
  );
}

function AnticipatePayForm({
  installment,
  onFullPay,
  onDone,
  onAdjustResponsibility,
  onBackToHistory,
  initialAmount,
}: {
  installment: any;
  onFullPay: (
    notes?: string,
    paidBy?: string | null,
    accountsOverride?: {
      accountId?: string | null;
      accountTayaneId?: string | null;
    },
    creditToAccount?: boolean,
  ) => void;
  onDone: () => void;
  onAdjustResponsibility?: () => void;
  onBackToHistory?: () => void;
  initialAmount?: number;
}) {
  // Estornos (valor negativo) sempre abrem a tela de confirmação, nunca o modo antecipação
  const [payMode, setPayMode] = useState<"total" | "anticipate" | null>(
    (installment as any)._quickPay && Number(installment.amount || 0) >= 0
      ? "total"
      : initialAmount !== undefined && Number(installment.amount || 0) >= 0
        ? "anticipate"
        : null,
  );
  const installmentAmount = Number(installment.amount || 0);
  const isRefund = installmentAmount < 0;
  const currentRemaining = isRefund
    ? 0
    : Math.max(0, installmentAmount - Number(installment.paid_amount || 0));
  const defaultAmount = isRefund ? Math.abs(installmentAmount) : currentRemaining;

  const [payAmount, setPayAmount] = useState(
    initialAmount !== undefined
      ? String(Math.max(0, initialAmount).toFixed(2))
      : String(defaultAmount.toFixed(2)),
  );
  const [notes, setNotes] = useState("");
  const [paidBy, setPaidBy] = useState<string>(installment.cartao_compras?.person || "");
  const [allowAboveQuota, setAllowAboveQuota] = useState(false);
  const [saving, setSaving] = useState(false);
  const { data: accounts = [] } = useAccounts();
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
    const [selectedAccountTayaneId, setSelectedAccountTayaneId] = useState<string>("");
  const [refundChoice, setRefundChoice] = useState<"credit" | "no-credit" | null>(null);


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

  useEffect(() => {
    const syncedRemaining = Math.max(
      0,
      Number(installment.amount || 0) - Number(installment.paid_amount || 0),
    );

                setPayAmount(
      String(
        Math.max(
          0,
          initialAmount !== undefined
            ? initialAmount
            : installmentAmount < 0
              ? Math.abs(installmentAmount)
              : syncedRemaining,
        ).toFixed(2),
      ),
    );
  }, [initialAmount, installmentAmount, installment.paid_amount]);


  const originalPerson = installment.cartao_compras?.person || "";
  const isFamilia = normalizeName(originalPerson) === "familia";
  // Usa a cota ajustada desta parcela quando existir. Sem ajuste, a regra
  // padrão continua sendo 50% para cada pessoa da Família.
  const quota = responsibilityForPerson(installment, paidBy || originalPerson);

  const overrideActive = !!paidBy && paidBy.trim() && normalizeName(paidBy) !== normalizeName(originalPerson);

  const handlePay = async (e?: React.FormEvent, accountsOverride?: { accountId: string, accountTayaneId?: string }) => {
    if (e) e.preventDefault();
    const amountToPay = Number(payAmount);
    const originalAmount = Number(installment.amount);

    if (amountToPay <= 0) return toast.error("Valor inválido");

    const costPerson = overrideActive ? paidBy.trim() : originalPerson;

    // Buscar participação atual desta pessoa para esta parcela
    const currentPart = (installment.participacoes || []).find((p: any) => normalizeName(p.person) === normalizeName(costPerson));
    const alreadyPaid = Number(currentPart?.amount || 0);
    const totalRemaining = Math.max(
      0,
      Number(installment.amount || 0) - Number(installment.paid_amount || 0),
    );

    if (amountToPay > totalRemaining + 0.01) {
      return toast.error(`O valor máximo para este pagamento é ${brl(totalRemaining)}.`);
    }
    // Para Família, cada pessoa começa com uma cota de 50%.
    // Quando o pagador assume valores acima da própria cota, o limite
    // passa a ser o saldo global ainda pendente, sem descontar novamente
    // o que essa pessoa já pagou.
    const personRemaining = isFamilia
      ? allowAboveQuota
        ? totalRemaining
        : Math.max(0, quota - alreadyPaid)
      : totalRemaining;

    if (amountToPay > personRemaining + 0.01) {
      return toast.error(`Valor excede o saldo pendente disponível (${brl(personRemaining)})`);
    }

    if (isFamilia && overrideActive && allowAboveQuota && amountToPay > totalRemaining + 0.01) {
      return toast.error(`O valor máximo restante da parcela é ${brl(totalRemaining)}.`);
    }

    if (Math.abs(amountToPay - originalAmount) < 0.01 && !isFamilia) {
      onFullPay(notes, overrideActive ? paidBy : null, accountsOverride);
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
      const splits = buildPaymentSplits(accounts, originalPerson, amountToPay, overrideActive ? paidBy : null, accountsOverride);

      // Só cria transações se houver contas selecionadas
      if (splits.length > 0) {
        for (const split of splits) {
          const finalAccountId = split.accountId;
          const finalAccountTayaneId = split.accountTayaneId;

        if (split.accountId === null && split.accountTayaneId === null) {
          // Se for "Sem conta" em ambos os campos, não cria transação mas continua o processo
          console.log("Ignorando criação de transação: Sem conta selecionada");
          continue;
        }

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
      return (
        <RefundReceiptPanel
          installment={installment}
          onConfirm={onFullPay}
          onCancel={onDone}
        />
      );
    }

    if (isEstorno) {
      const lorranAccs = accounts.filter((a: any) => normalizeName(a.account_name || "") === "lorran" || normalizeName(a.bank || "").includes("revolut") || normalizeName(a.bank || "").includes("nubank"));
      const tayaneAccs = accounts.filter((a: any) => normalizeName(a.account_name || "") === "tayane" || normalizeName(a.bank || "").includes("mercado"));

      return (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex flex-col items-center border-b border-border bg-muted/30 px-5 py-5 text-center">
              <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Undo2 className="h-6 w-6" />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Valor do estorno</p>
                <h3 className="text-2xl font-bold tabular-nums text-foreground">
                  {brl(Math.abs(Number(installment.amount)))}
                </h3>
                <p className="max-w-sm text-xs leading-relaxed text-muted-foreground">
                  Confirme como o recebimento deste estorno deve ser registrado no sistema.
                </p>
              </div>
            </div>
            <div className="space-y-4 p-5">
              {refundChoice === "credit" ? (
                <>
            <div className="space-y-3 text-left">
              <div className="mb-3 flex items-start gap-3 rounded-xl border border-border bg-muted/20 p-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background text-primary shadow-sm">
                  <Banknote className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Destino do crédito</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    Selecione a conta abaixo caso queira creditar o valor após confirmar o estorno.
                  </p>
                </div>
              </div>
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
                </>
              ) : (
                <div className="space-y-3 border-t border-border pt-4">
              <div>
                <p className="text-sm font-semibold text-foreground">Como deseja registrar o estorno?</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Selecione uma das opções abaixo para concluir a confirmação.
                </p>
              </div>

              <button
                type="button"
                className="group flex w-full items-center gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4 text-left transition-all hover:border-primary/60 hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                onClick={() => setRefundChoice("credit")}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
                  <Banknote className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">Confirmar e creditar nas contas</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    Confirma o estorno e adiciona o valor à conta selecionada.
                  </p>
                </div>
                <div className="h-5 w-5 shrink-0 rounded-full border-2 border-primary bg-primary shadow-[inset_0_0_0_3px_var(--background)]" />
              </button>

              <button
                type="button"
                className="group flex w-full items-center gap-3 rounded-xl border border-border bg-background p-4 text-left transition-all hover:border-muted-foreground/40 hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                onClick={() => {
                  onFullPay(
                    notes,
                    null,
                    {
                      accountId: "none",
                      accountTayaneId: "none",
                    },
                    false,
                  );
                }}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Check className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">Confirmar sem crédito em conta</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    Confirma o estorno e apenas reduz o restante da fatura.
                  </p>
                </div>
                <div className="h-5 w-5 shrink-0 rounded-full border-2 border-muted-foreground/40 bg-background" />
              </button>
            </div>
              )}

              {refundChoice === "credit" && (
                <div className="space-y-3 border-t border-border pt-4">
                  <div>
                    <p className="text-sm font-semibold text-foreground">Revise as contas e confirme</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      O valor será creditado somente após a confirmação final.
                    </p>
                  </div>
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => onFullPay(notes, null, {
                      accountId: selectedAccountId,
                      accountTayaneId: selectedAccountTayaneId,
                    })}
                  >
                    <Banknote className="mr-2 h-4 w-4" />
                    Confirmar crédito de {brl(Math.abs(installmentAmount))}
                  </Button>
                  <Button type="button" variant="ghost" className="w-full text-xs" onClick={() => setRefundChoice(null)}>
                    Voltar às opções
                  </Button>
                </div>
              )}
          </div>
          </div>
          <Button variant="ghost" className="w-full text-xs" onClick={() => onDone()}>
            Ainda não recebi
          </Button>
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
              Pagar restante
            </Button>
            {isFamilia && onAdjustResponsibility && (
              <Button
                type="button"
                variant="outline"
                className="h-12 text-sm font-semibold rounded-xl border-primary/30 hover:border-primary hover:bg-primary/5"
                onClick={onAdjustResponsibility}
              >
                Ajuste de responsabilidade
              </Button>
            )}

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
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => onBackToHistory ? onBackToHistory() : setPayMode(null)}
          >
            Voltar
          </Button>
          <Button type="submit" className="flex-1" disabled={saving}>Confirmar Pagamento</Button>
        </div>
      </form>
    );
  }

  const totalRemaining = Math.max(0, Number(installment.amount) - Number(installment.paid_amount || 0));
  const currentPersonParticipation = (installment.participacoes || []).find(
    (participation: any) =>
      normalizeName(participation.person) === normalizeName(paidBy),
  );
  const currentPersonPaid = Number(currentPersonParticipation?.amount || 0);
  const canAssumeRemaining = isFamilia && overrideActive && allowAboveQuota
    ? totalRemaining
    : isFamilia
      ? Math.max(0, quota - currentPersonPaid)
      : totalRemaining;

return (
    <form onSubmit={(e) => handlePay(e, { accountId: selectedAccountId, accountTayaneId: selectedAccountTayaneId })} className="space-y-4">
      <div className="bg-muted/50 p-3 rounded-lg border border-border space-y-3">
        <div>
          <div className="text-xs text-muted-foreground uppercase">Antecipação Parcial</div>
          <div className="text-lg font-bold">{brl(Number(installment.amount || 0))}</div>
        </div>

        <div className="grid grid-cols-3 gap-2 border-t border-border/60 pt-3 text-xs">
          <div>
            <span className="block text-muted-foreground">Valor total</span>
            <strong className="text-foreground">{brl(Number(installment.amount || 0))}</strong>
          </div>
          <div>
            <span className="block text-muted-foreground">Já antecipado</span>
            <strong className="text-success">{brl(Number(installment.paid_amount || 0))}</strong>
          </div>
          <div>
            <span className="block text-muted-foreground">Falta</span>
            <strong className={currentRemaining > 0.01 ? "text-warning" : "text-success"}>
              {brl(currentRemaining)}
            </strong>
          </div>
        </div>

        {isFamilia && (
          <div className="text-[10px] text-amber-500 font-medium flex items-center gap-1 mt-1">
            <AlertTriangle className="w-3 h-3" />
            Responsabilidade: {brl(responsibilityForPerson(installment, "Lorran"))} para Lorran e{" "}
            {brl(responsibilityForPerson(installment, "Tayane"))} para Tayane
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Quem está antecipando?</Label>
        <PersonSelect value={paidBy} onChange={setPaidBy} extras={originalPerson ? [originalPerson] : []} />
        {isFamilia && overrideActive && (
          <div className="space-y-2">
            <p className="text-[10px] text-amber-500">
              Aviso: Você está pagando como <strong>{paidBy}</strong>.
              {allowAboveQuota
                ? <> Você assumirá também a parte restante da Família, até <strong>{brl(canAssumeRemaining)}</strong>.</>
                : <> O limite padrão para esta antecipação individual é <strong>{brl(quota)}</strong>.</>}
            </p>
            <label className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/5 p-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={allowAboveQuota}
                onChange={(e) => setAllowAboveQuota(e.target.checked)}
                className="mt-0.5"
              />
              <span className="text-[11px] text-muted-foreground">
                <strong className="text-foreground">Permitir pagar acima dos 50%</strong>
                <span className="block mt-0.5">
                  Usar quando uma pessoa for assumir também parte ou todo o valor da outra.
                </span>
              </span>
            </label>
          </div>
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
        <Button
          type="button"
          variant="outline"
          className="flex-1"
          onClick={() => onBackToHistory ? onBackToHistory() : setPayMode(null)}
        >
          Voltar
        </Button>
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
        setSelectedTransactionId(t.id);

        // Respeita a ação escolhida no histórico.
        // Antes, o modo "remove" era sobrescrito por "edit" sempre
        // que uma transação era aberta diretamente pelo histórico.
        if (mode === "remove") {
          setIsRemoving(true);
          setIsEditing(false);
        } else {
          setIsEditing(true);
          setIsRemoving(false);
        }
      }
    } else if (relatedTrans.length === 1 && (mode === "auto" || !mode)) {
      // Se só tem um lançamento e estamos em modo auto, pré-seleciona ele
      const t = relatedTrans[0];
      setSelectedTransactionId(t.id);
      setEditAmount(String(t.amount));
      setEditNotes(t.notes || "");
      setIsEditing(false);
      setIsRemoving(false);
    }
  }, [transactionIdToEdit, mode, relatedTrans]);

  const handleAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedTransactionId) return toast.error("Selecione um lançamento");

    const transaction = relatedTrans.find(t => t.id === selectedTransactionId);
    if (!transaction) return;

    if (!__tryLock()) return;

    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      // Mantém a participação da pessoa pagante sincronizada com o histórico
      // de transações. Sem isso, remover um pagamento deixava a cota antiga
      // registrada e bloqueava uma nova antecipação.
      const syncParticipation = async (person: string | null | undefined, delta: number) => {
        const targetPerson = person || installment.cartao_compras?.person || "Familia";
        const { data: participation, error: participationError } = await supabase
          .from("participacoes_parcelas")
          .select("id, amount")
          .eq("installment_id", installment.id)
          .eq("person", targetPerson)
          .maybeSingle();

        if (participationError) throw participationError;

        const nextAmount = Number((Number(participation?.amount || 0) + delta).toFixed(2));

        if (nextAmount <= 0.01) {
          if (participation?.id) {
            const { error } = await supabase
              .from("participacoes_parcelas")
              .delete()
              .eq("id", participation.id);
            if (error) throw error;
          }
          return;
        }

        const payload = {
          user_id: user.id,
          installment_id: installment.id,
          person: targetPerson,
          amount: nextAmount,
          status: Math.abs(nextAmount - Number(installment.amount || 0)) < 0.01
            ? "paid"
            : "pending",
          paid_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from("participacoes_parcelas")
          .upsert(payload as any, { onConflict: "installment_id,person" });

        if (error) throw error;
      };

      if ((transaction as any).isVirtual) {
        if (isEditing) {
          const newAmt = Number(editAmount);
          const diff = newAmt - Number(transaction.amount);
          const newPaidAmount = Number((Number(installment.paid_amount || 0) + diff).toFixed(2));
          await supabase.from("cartao_parcelas").update({
            paid_amount: newPaidAmount,
            status: Math.abs(newPaidAmount - Number(installment.amount)) < 0.01 ? "paid" : "pending"
          }).eq("id", installment.id);
          await syncParticipation(installment.cartao_compras?.person, diff);
          toast.success("Valor pago atualizado");
        } else if (isRemoving) {
          await supabase.from("cartao_parcelas").update({ paid_amount: 0, status: "pending", notes: null }).eq("id", installment.id);
          await supabase
            .from("participacoes_parcelas")
            .delete()
            .eq("installment_id", installment.id);
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
          await syncParticipation(transaction.person || installment.cartao_compras?.person, diff);
          toast.success("Pagamento atualizado");
        } else if (isRemoving) {
          const { error: deleteError } = await supabase
            .from("transacoes")
            .delete()
            .eq("id", transaction.id);

          if (deleteError) throw deleteError;

          const transactionAmount = Number(transaction.amount || 0);
          const newPaidAmount = Math.max(
            0,
            Number(
              (Number(installment.paid_amount || 0) - transactionAmount).toFixed(2),
            ),
          );
          const remainingTrans = relatedTrans.filter(
            (item) => item.id !== selectedTransactionId,
          );

          const { error: installmentError } = await supabase
            .from("cartao_parcelas")
            .update({
              paid_amount: newPaidAmount,
              status:
                newPaidAmount >= Number(installment.amount) - 0.01
                  ? "paid"
                  : "pending",
              notes: remainingTrans.length > 0 ? remainingTrans[0].notes : null,
            })
            .eq("id", installment.id);

          if (installmentError) throw installmentError;

          // Mesmo que o lançamento tenha sido editado para R$ 0,00,
          // ele precisa ser excluído normalmente do histórico.
          if (transactionAmount !== 0) {
            await syncParticipation(
              transaction.person || installment.cartao_compras?.person,
              -transactionAmount,
            );
          }

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

  const selectedTransaction = relatedTrans.find(
    (transaction: any) => transaction.id === selectedTransactionId,
  );

  return (
    <form onSubmit={handleAction} className="space-y-5">
      <div className="rounded-xl border border-border bg-muted/20 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Receipt className="h-4 w-4 shrink-0 text-primary" />
              <h3 className="font-semibold text-foreground">
                Histórico de pagamentos
              </h3>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Selecione um lançamento para ajustar o valor ou removê-lo
              definitivamente desta antecipação.
            </p>
          </div>

          {!transactionIdToEdit && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={() => {
                onDone();
                setTimeout(() => {
                  window.dispatchEvent(
                    new CustomEvent("open-partial-pay", { detail: installment }),
                  );
                }, 100);
              }}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Novo
            </Button>
          )}
        </div>

        {!transactionIdToEdit && (
          <div className="mt-4 space-y-2">
            <Label className="text-xs text-muted-foreground">
              Pagamento selecionado
            </Label>
            <Select
              value={selectedTransactionId}
              onValueChange={(value) => {
                setSelectedTransactionId(value);
                const transaction = relatedTrans.find(
                  (item: any) => item.id === value,
                );

                if (transaction) {
                  setEditAmount(String(transaction.amount));
                  setEditNotes(transaction.notes || "");
                }
              }}
            >
              <SelectTrigger className="h-11">
                <SelectValue placeholder="Escolha um lançamento" />
              </SelectTrigger>
              <SelectContent>
                {relatedTrans.map((transaction: any) => (
                  <SelectItem key={transaction.id} value={transaction.id}>
                    {brl(transaction.amount)} ·{" "}
                    {fmtDate(transaction.posted_at || transaction.created_at)}
                    {" · "}
                    {transaction.notes || "Sem observação"}
                  </SelectItem>
                ))}
                {relatedTrans.length === 0 && (
                  <div className="p-3 text-center text-xs italic text-muted-foreground">
                    Nenhum lançamento encontrado. Use “Novo” para registrar um
                    pagamento.
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {selectedTransactionId && selectedTransaction && (
        <>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="block text-xs text-muted-foreground">
                  Valor atual
                </span>
                <strong className="mt-1 block text-lg text-success">
                  {brl(selectedTransaction.amount)}
                </strong>
              </div>
              <div>
                <span className="block text-xs text-muted-foreground">
                  Data do lançamento
                </span>
                <strong className="mt-1 block">
                  {fmtDate(
                    selectedTransaction.posted_at ||
                      selectedTransaction.created_at,
                  )}
                </strong>
              </div>
            </div>

            <div className="mt-3 border-t border-border/60 pt-3 text-xs text-muted-foreground">
              <span>Pagador: </span>
              <strong className="text-foreground">
                {selectedTransaction.person ||
                  installment.cartao_compras?.person ||
                  "Não informado"}
              </strong>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">
              O que deseja fazer?
            </Label>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setIsRemoving(true);
                }}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                  isRemoving
                    ? "border-destructive/50 bg-destructive/10 text-destructive"
                    : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/40"
                }`}
              >
                <Trash2 className="h-4 w-4 shrink-0" />
                <span>
                  <strong className="block text-sm">Remover</strong>
                  <span className="block text-[11px] opacity-80">
                    Excluir este pagamento
                  </span>
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsRemoving(false);
                  setIsEditing(true);
                }}
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition-colors ${
                  isEditing
                    ? "border-primary/50 bg-primary/10 text-primary"
                    : "border-border bg-muted/20 text-muted-foreground hover:bg-muted/40"
                }`}
              >
                <Pencil className="h-4 w-4 shrink-0" />
                <span>
                  <strong className="block text-sm">Editar</strong>
                  <span className="block text-[11px] opacity-80">
                    Ajustar valor ou observação
                  </span>
                </span>
              </button>
            </div>
          </div>
        </>
      )}

      {isRemoving && selectedTransactionId && (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="text-muted-foreground">
            O pagamento será excluído do histórico e o valor pago da parcela
            será recalculado automaticamente.
          </p>
        </div>
      )}

      {isEditing && selectedTransactionId && (
        <div className="space-y-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Pencil className="h-4 w-4" />
            Editar informações do pagamento
          </div>

          <div className="space-y-1.5">
            <Label>Novo valor</Label>
            <Input
              type="number"
              step="0.01"
              value={editAmount}
              onChange={(event) => setEditAmount(event.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label>Observação</Label>
            <Input
              value={editNotes}
              onChange={(event) => setEditNotes(event.target.value)}
              placeholder="Ex.: Pagamento da parcela do mês"
            />
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <Button
          type="submit"
          variant={isRemoving ? "destructive" : "default"}
          className="w-full"
          disabled={
            saving ||
            !selectedTransactionId ||
            (!isEditing && !isRemoving)
          }
        >
          {saving
            ? "Processando..."
            : isRemoving
              ? "Excluir pagamento"
              : "Salvar alterações"}
        </Button>
      </div>
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

      // Ao ajustar manualmente o valor pago, removemos também as
      // participações antigas. Caso contrário, o histórico de cotas
      // continuava informando que o pagamento existia mesmo depois
      // de as transações terem sido apagadas.
      const { error: transactionError } = await supabase
        .from("transacoes")
        .delete()
        .eq("card_installment_id", installment.id);

      if (transactionError) throw transactionError;

      const { error: participationError } = await supabase
        .from("participacoes_parcelas")
        .delete()
        .eq("installment_id", installment.id);

      if (participationError) throw participationError;

      // Atualizar a parcela
      const { error: instErr } = await supabase
        .from("cartao_parcelas")
        .update({
          paid_amount: val,
          status: Math.abs(val - total) < 0.01 ? "paid" : "pending",
          notes: null,
        })
        .eq("id", installment.id);

      if (instErr) throw instErr;

      invalidate("installments");
      invalidate("accounts");
      invalidate("transactions");

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



