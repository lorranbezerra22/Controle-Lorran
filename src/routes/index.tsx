import { createFileRoute } from "@tanstack/react-router";
import { ProtectedShell } from "@/components/ProtectedShell";
import { useTransactions, useInstallments, useCards, useInvalidate, usePeople, useCategories, useAccounts } from "@/lib/queries";
import { brl, fmtDate, monthLabel } from "@/lib/format";
import { TrendingUp, TrendingDown, Wallet, CreditCard, ChevronDown, ChevronRight, Eye, EyeOff, Users, Activity, Sparkles } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell } from "recharts";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { personSplitAll, personColor, isFamilia } from "@/lib/people";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdjustments, groupAdjustments, effectiveShares, costPersonInst } from "@/lib/adjustments";
import { CountUp } from "@/components/CountUp";
import { Sparkline } from "@/components/Sparkline";
import { Skeleton } from "@/components/ui/skeleton";
import { motion } from "framer-motion";
import { BankIcon } from "@/components/BankIcon";
import { PageHeader } from "@/components/PageHeader";
import { NotificationBell } from "@/components/NotificationBell";
import { LayoutDashboard } from "lucide-react";


export const Route = createFileRoute("/")({
  component: () => <ProtectedShell><Dashboard /></ProtectedShell>,
  head: () => ({ meta: [{ title: "Dashboard — Gestão Família" }] }),
});

function useLsBool(key: string, initial: boolean) {
  const storageKey = `dash:${key}`;
  const [v, setV] = useState<boolean>(() => {
    if (typeof window === "undefined") return initial;
    const raw = window.localStorage.getItem(storageKey);
    return raw === null ? initial : raw === "1";
  });
  const set = (n: boolean) => {
    setV(n);
    if (typeof window !== "undefined") window.localStorage.setItem(storageKey, n ? "1" : "0");
  };
  return [v, set] as const;
}

// Cor determinística para uma string (usado nas barras com base no emoji da categoria)
function colorFromString(s: string): string {
  let h = 0;
  for (let i = 0; i < (s || "").length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `oklch(0.68 0.18 ${h % 360})`;
}

function Dashboard() {
  const txQ = useTransactions();
  const instQ = useInstallments();
  const { data: tx = [] } = txQ;
  const { data: inst = [] } = instQ;
  const { data: cards = [] } = useCards();
  const { data: people = [] } = usePeople();
  const { data: categories = [] } = useCategories();
  const { data: adjustments = [] } = useAdjustments();
  const { data: accounts = [] } = useAccounts();
  const isLoading = txQ.isLoading || instQ.isLoading;
  const adjMap = useMemo(() => groupAdjustments(adjustments), [adjustments]);

  const invalidate = useInvalidate();
  const ranOnce = useRef(false);

  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const [selM, setSelM] = useState<number | "all">(() => {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem("global:selM") : null;
    return raw === "all" ? "all" : raw !== null ? Number(raw) : next.getMonth();
  });
  const [selY, setSelY] = useState<number | "all">(() => {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem("global:selY") : null;
    return raw === "all" ? "all" : raw !== null ? Number(raw) : next.getFullYear();
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("global:selM", String(selM));
      window.localStorage.setItem("global:selY", String(selY));
    }
  }, [selM, selY]);
  const [personFilter, setPersonFilter] = useState<string>(() => {
    return typeof window !== "undefined" ? window.localStorage.getItem("global:personFilter") || "Lorran" : "Lorran";
  });
  const [personFilter2, setPersonFilter2] = useState<string>(() => {
    return typeof window !== "undefined" ? window.localStorage.getItem("global:personFilter2") || "all" : "all";
  });

  useEffect(() => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("global:personFilter", personFilter);
      window.localStorage.setItem("global:personFilter2", personFilter2);
    }
  }, [personFilter, personFilter2]);


  useEffect(() => {
    if (ranOnce.current) return;
    ranOnce.current = true;
    const key = `recur-gen-${now.getFullYear()}-${now.getMonth() + 1}`;
    if (typeof window !== "undefined" && window.localStorage.getItem(key)) return;
    supabase.rpc("generate_recurrences", { target_year: now.getFullYear(), target_month: now.getMonth() + 1 }).then(({ data, error }) => {
      if (!error) {
        window.localStorage.setItem(key, "1");
        if ((data ?? 0) > 0) invalidate("transactions");
      }
    });
  }, []);

  const defaultsApplied = useRef(false);
  useEffect(() => {
    if (defaultsApplied.current || people.length === 0) return;
    const hasStored = typeof window !== "undefined" && window.localStorage.getItem("global:personFilter");
    if (hasStored) {
      defaultsApplied.current = true;
      return;
    }
    const norm = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const find = (target: string) => people.find((p: any) => norm(p.name) === norm(target))?.name;
    const lor = find("Lorran"); if (lor) setPersonFilter(lor);
    defaultsApplied.current = true;
  }, [people]);

  const inPeriod = (s: string) => {
    const d = new Date(s + "T00:00:00");
    if (selY !== "all" && d.getFullYear() !== selY) return false;
    if (selM !== "all" && d.getMonth() !== selM) return false;
    return true;
  };

  // Fator de inclusão por pessoa.
  // Família: cada metade é "ocupada" por Lorran/Tayane quando selecionado.
  // O filtro Família sozinho conta 100%; combinado com Lorran/Tayane ele NÃO
  // adiciona a metade que já foi contada — evita dupla contagem.
  // - Lorran sozinho → 50% Família
  // - Família sozinha → 100%
  // - Lorran + Família → 50% (apenas a metade do Lorran; Família já está implícita)
  // - Lorran + Tayane → 100%
  // - Lorran + Tayane + Família → 100%
  const personFactor = (person?: string | null): number => {
    const norm = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    if (personFilter === "all") return 1;
    const selected = Array.from(new Set([personFilter, personFilter2].filter((s) => s && s !== "all")));
    if (selected.length === 0) return 1;
    const sel = selected.map(norm);
    const hasLor = sel.includes("lorran");
    const hasTay = sel.includes("tayane");
    const hasFam = sel.some((s) => s === "familia");
    
    const pNorm = norm(person || "");
    
    // Se a pessoa do lançamento é Família, calculamos a participação
    if (isFamilia(person)) {
      let f = 0;
      if (hasLor) f += 0.5;
      if (hasTay) f += 0.5;
      // Se selecionou "Família" explicitamente e não Lorran/Tayane, conta como 100%
      // Se selecionou Família + Lorran, o Lorran já cobre 50%, evitamos somar 100% + 50%
      if (hasFam && !hasLor && !hasTay) f += 1;
      return Math.min(1, f);
    }
    



    return sel.includes(pNorm) ? 1 : 0;
  };




  const monthTx = tx.filter((t: any) => inPeriod(t.due_at));
  const monthInst = inst.filter((i: any) => inPeriod(i.due_at));

  // Valor efetivo de uma transação considerando ajustes de responsabilidade.
  const txValue = (t: any) => {
    const shares = effectiveShares(t, adjMap);
    return shares.reduce((s, sh) => s + sh.amount * personFactor(sh.person), 0);
  };

  const sumTxBy = (kind: "income" | "expense", status?: "pending" | "paid") =>
    monthTx
      .filter((t: any) => t.kind === kind && (status ? t.status === status : true))
      .filter((t: any) => t.category_id !== "0494a63e-6737-4a3c-8778-67ce5f96a0a1" && !t.card_installment_id) // Excluir pagamentos de cartão para evitar dupla contagem com Faturas
      .reduce((s: number, t: any) => s + txValue(t), 0);

  // Tudo baseado nos filtros ativos (período + pessoas)
  const receitasTotais = sumTxBy("income");
  const receitasPend = personFilter === "all" ? 0 : sumTxBy("income", "pending");

  // Saldo da Conta = saldo real TOTAL (ignora filtro de data; respeita pessoas)
  // CALCULADO DINAMICAMENTE para bater com o histórico de transações pagas.
  const receitasPagasAll = tx
    .filter((t: any) => t.kind === "income" && t.status === "paid" && !t.card_installment_id)
    .reduce((s: number, t: any) => s + txValue(t), 0);
  const despesasPagasAll = tx
    .filter((t: any) => t.kind === "expense" && t.status === "paid" && t.category_id !== "0494a63e-6737-4a3c-8778-67ce5f96a0a1" && !t.card_installment_id)
    .reduce((s: number, t: any) => s + txValue(t), 0);
  const parcelasPagasAll = inst
    .filter((i: any) => i.status === "paid" || Number(i.paid_amount || 0) > 0)
    .reduce((s: number, i: any) => s + Number(i.amount) * personFactor(costPersonInst(i)), 0);
  
  const saldoCalculado = receitasPagasAll - despesasPagasAll - parcelasPagasAll;
  

  // O saldo real deve descontar tudo que saiu. Parcelas totalmente pagas já foram descontadas em parcelasPagasAll.
  // Pagamentos parciais de parcelas "pending" precisam ser somados ao que saiu.
  // Saldo das contas — agrupado por dono (mesma heurística da aba Contas)
  const accountsBalanceByPerson = useMemo(() => {
    const nrm = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
    let lorran = 0, tayane = 0, other = 0;
    for (const acc of accounts) {
      const combined = nrm(acc.bank || "") + " " + nrm(acc.account_name || "");
      const b = Number(acc.balance) || 0;
      if (combined.includes("tayane")) tayane += b;
      else if (combined.includes("revolut") || combined.includes("lorran")) lorran += b;
      else other += b;
    }
    return { lorran, tayane, other, total: lorran + tayane + other };
  }, [accounts]);

  // Soma o saldo apenas das contas das pessoas selecionadas no filtro
  const accountsBalanceForFilter = useMemo(() => {
    const nrm = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    // "Todas as pessoas" → não mostra saldo.
    if (personFilter === "all") return 0;
    const selected = [personFilter, personFilter2].map(nrm).filter(p => p && p !== "all");
    if (selected.length === 0) return 0;
    let sum = 0;
    if (selected.includes("lorran")) sum += accountsBalanceByPerson.lorran;
    if (selected.includes("tayane")) sum += accountsBalanceByPerson.tayane;
    if (selected.includes("familia")) sum += accountsBalanceByPerson.other;
    return sum;
  }, [accountsBalanceByPerson, personFilter, personFilter2]);

  const saldoConta = personFilter === "all" ? accountsBalanceByPerson.total : accountsBalanceForFilter;



  // Despesas (lançamentos) — respeita filtros
  const despesasTotais = sumTxBy("expense");
  const despesasRestante = sumTxBy("expense", "pending");

  // Cartões — respeita filtros
  const fatura = monthInst.reduce((s: number, i: any) => s + Number(i.amount) * personFactor(costPersonInst(i)), 0);
  const faturaRest = monthInst.filter((i: any) => i.status !== "paid").reduce((s: number, i: any) => s + (Number(i.amount) - Number(i.paid_amount || 0)) * personFactor(costPersonInst(i)), 0);

  // Balanço projetado = Saldo da Conta + A receber − (despesas restantes + fatura restante)
  const balanco = personFilter === "all" ? 0 : saldoConta + receitasPend - despesasRestante - faturaRest;

  // Cards fixos Lorran/Tayane/Família/Loja — usa shares efetivos (respeita ajustes).
  const personMonth = useMemo(() => {
    const items: Array<{ amount: number; person?: string | null }> = [];
    monthTx.filter((x: any) => x.kind === "expense" && !x.card_installment_id && x.category_id !== "0494a63e-6737-4a3c-8778-67ce5f96a0a1").forEach((x: any) => {
      for (const sh of effectiveShares(x, adjMap)) items.push({ amount: sh.amount, person: sh.person });
    });
    monthInst.forEach((i: any) => {
      const v = Number(i.amount);
      items.push({ amount: v, person: costPersonInst(i) });
    });
    return personSplitAll(items);
  }, [monthTx, monthInst, adjMap]);

  // Análise por Pessoa — segue apenas o filtro de datas (não o filtro de pessoas).
  // Totais por pessoa (lançamentos + cartão + restante) e uso por cartão.
  const peopleAnalytics = useMemo(() => {
    const tot: Record<string, { tx: number; card: number; restante: number }> = {};
    const ensure = (p: string) => (tot[p] = tot[p] ?? { tx: 0, card: 0, restante: 0 });
    const addTx = (rawPerson: string, amount: number, paid: boolean) => {
      const p = (rawPerson || "").trim();
      if (!p) return;
      ensure(p).tx += amount;
      if (!paid) ensure(p).restante += amount;
      if (isFamilia(p)) {
        ensure("Lorran").tx += amount / 2;
        ensure("Tayane").tx += amount / 2;
        if (!paid) { ensure("Lorran").restante += amount / 2; ensure("Tayane").restante += amount / 2; }
      }
    };
    const addCard = (rawPerson: string, amount: number, paid: boolean) => {
      const p = (rawPerson || "").trim();
      if (!p) return;
      ensure(p).card += amount;
      if (!paid) ensure(p).restante += amount;
      if (isFamilia(p)) {
        ensure("Lorran").card += amount / 2;
        ensure("Tayane").card += amount / 2;
        if (!paid) { ensure("Lorran").restante += amount / 2; ensure("Tayane").restante += amount / 2; }
      }
    };
    monthTx.forEach((t: any) => {
      if (t.kind !== "expense" || t.card_installment_id || t.category_id === "0494a63e-6737-4a3c-8778-67ce5f96a0a1") return;
      addTx(t.person || "", Number(t.amount), t.status === "paid");
    });
    monthInst.forEach((i: any) => {
      addCard(i.cartao_compras?.person || "", Number(i.amount), i.status === "paid");
    });
    const cardMap: Record<string, Record<string, number>> = {};
    monthInst.forEach((i: any) => {
      const cardName = i.cartoes?.name ?? "—";
      const p = (i.cartao_compras?.person || "").trim();
      if (!p) return;
      cardMap[cardName] = cardMap[cardName] ?? {};
      cardMap[cardName][p] = (cardMap[cardName][p] ?? 0) + Number(i.amount);
    });
    const totals = Object.entries(tot)
      .map(([name, v]) => ({ name, ...v, total: v.tx + v.card }))
      .filter((t) => t.total > 0)
      .sort((a, b) => b.total - a.total);
    const byCard = Object.entries(cardMap)
      .map(([cardName, row]) => {
        const entries = Object.entries(row).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
        const total = entries.reduce((s, [, v]) => s + v, 0);
        return { cardName, entries, total };
      })
      .filter((c) => c.total > 0)
      .sort((a, b) => b.total - a.total);
    return { totals, byCard };
  }, [monthTx, monthInst]);

  const colorForPerson = (name: string) => {
    const p = people.find((pp: any) => pp.name === name);
    return p?.color || personColor(name);
  };


  // Receitas vs Despesas — segue apenas o filtro de ANO (não de mês) e pessoas
  const yearData = useMemo(() => {
    if (selY === "all") {
      const yearsMap = new Map<number, { Receitas: number; Despesas: number; Balanço: number }>();
      const ensure = (y: number) => {
        if (!yearsMap.has(y)) yearsMap.set(y, { Receitas: 0, Despesas: 0, Balanço: 0 });
        return yearsMap.get(y)!;
      };
      tx.forEach((t: any) => {
        const d = new Date(t.due_at + "T00:00:00");
        const v = effectiveShares(t, adjMap).reduce((s, sh) => s + sh.amount * personFactor(sh.person), 0);
        if (!v) return;
        const row = ensure(d.getFullYear());
        if (t.kind === "income") row.Receitas += v;
        else if (!t.card_installment_id && t.category_id !== "0494a63e-6737-4a3c-8778-67ce5f96a0a1") row.Despesas += v;
        row.Balanço = row.Receitas - row.Despesas;
      });
      inst.forEach((i: any) => {
        const d = new Date(i.due_at + "T00:00:00");
        const f = personFactor(costPersonInst(i));
        if (!f) return;
        const row = ensure(d.getFullYear());
        row.Despesas += Number(i.amount) * f;
        row.Balanço = row.Receitas - row.Despesas;
      });
      return Array.from(yearsMap.entries()).sort((a, b) => a[0] - b[0]).map(([y, v]) => ({ mes: String(y), ...v }));
    }
    const arr = Array.from({ length: 12 }, (_, m) => ({ mes: monthLabel(m), Receitas: 0, Despesas: 0, Balanço: 0 }));
    tx.forEach((t: any) => {
      const d = new Date(t.due_at + "T00:00:00");
      if (d.getFullYear() !== selY) return;
      const v = effectiveShares(t, adjMap).reduce((s, sh) => s + sh.amount * personFactor(sh.person), 0);
      if (!v) return;
      if (t.kind === "income") arr[d.getMonth()].Receitas += v;
      else if (!t.card_installment_id && t.category_id !== "0494a63e-6737-4a3c-8778-67ce5f96a0a1") arr[d.getMonth()].Despesas += v;
      arr[d.getMonth()].Balanço = arr[d.getMonth()].Receitas - arr[d.getMonth()].Despesas;
    });
    inst.forEach((i: any) => {
      const d = new Date(i.due_at + "T00:00:00");
      if (d.getFullYear() !== selY) return;
      const f = personFactor(costPersonInst(i));
      if (!f) return;
      arr[d.getMonth()].Despesas += Number(i.amount) * f;
      arr[d.getMonth()].Balanço = arr[d.getMonth()].Receitas - arr[d.getMonth()].Despesas;
    });
    return arr;
  }, [tx, inst, selY, personFilter, personFilter2, adjMap]);

  const catData = useMemo(() => {
    const catMap = new Map<string, { name: string; icon: string | null }>();
    categories.forEach((c: any) => catMap.set(c.id, { name: c.name, icon: c.icon ?? null }));
    type CatAgg = {
      value: number;
      icon: string | null;
      manual: number;
      card: number;
      manualItems: Array<{ tx: any; share: number }>;
      cardItems: Array<{ inst: any; share: number }>;
    };
    const map = new Map<string, CatAgg>();
    const ensure = (key: string, icon: string | null): CatAgg => {
      const cur = map.get(key) ?? { value: 0, icon, manual: 0, card: 0, manualItems: [], cardItems: [] };
      if (!cur.icon && icon) cur.icon = icon;
      map.set(key, cur);
      return cur;
    };
    monthTx.filter((t: any) => t.kind === "expense" && !t.card_installment_id && t.category_id !== "0494a63e-6737-4a3c-8778-67ce5f96a0a1").forEach((t: any) => {
      const v = effectiveShares(t, adjMap).reduce((s, sh) => s + sh.amount * personFactor(sh.person), 0);
      if (!v) return;
      const name = t.categorias?.name ?? "Sem categoria";
      const icon = t.categorias?.icon ?? null;
      const agg = ensure(name, icon);
      agg.value += v;
      agg.manual += v;
      agg.manualItems.push({ tx: t, share: v });
    });
    monthInst.forEach((i: any) => {
      const f = personFactor(costPersonInst(i));
      if (!f) return;
      const cid = i.cartao_compras?.category_id;
      const meta = (cid && catMap.get(cid)) || { name: "Sem categoria", icon: null };
      const v = Number(i.amount) * f;
      const agg = ensure(meta.name, meta.icon);
      agg.value += v;
      agg.card += v;
      agg.cardItems.push({ inst: i, share: v });
    });
    return Array.from(map.entries()).map(([name, v]) => ({ name, ...v }));
  }, [monthTx, monthInst, categories, personFilter, personFilter2, adjMap]);

  const incomeCatData = useMemo(() => {
    type Agg = { value: number; icon: string | null; manual: number; card: number; manualItems: Array<{ tx: any; share: number }>; cardItems: Array<{ inst: any; share: number }> };
    const map = new Map<string, Agg>();
    monthTx.filter((t: any) => t.kind === "income" && !t.card_installment_id).forEach((t: any) => {
      const v = effectiveShares(t, adjMap).reduce((s, sh) => s + sh.amount * personFactor(sh.person), 0);
      if (!v) return;
      const name = t.categorias?.name ?? "Sem categoria";
      const icon = t.categorias?.icon ?? null;
      const cur: Agg = map.get(name) ?? { value: 0, icon, manual: 0, card: 0, manualItems: [], cardItems: [] };
      cur.value += v;
      cur.manual += v;
      cur.manualItems.push({ tx: t, share: v });
      if (!cur.icon && icon) cur.icon = icon;
      map.set(name, cur);
    });
    return Array.from(map.entries()).map(([name, v]) => ({ name, ...v }));
  }, [monthTx, personFilter, personFilter2, adjMap]);

  // ===== Comparativo mês anterior =====
  const prevPeriod = useMemo(() => {
    if (selM === "all" || selY === "all") return null;
    const m = selM === 0 ? 11 : (selM as number) - 1;
    const y = selM === 0 ? (selY as number) - 1 : (selY as number);
    return { m, y };
  }, [selM, selY]);

  const prevCatMaps = useMemo(() => {
    const expMap = new Map<string, number>();
    const incMap = new Map<string, number>();
    if (!prevPeriod) return { expMap, incMap };
    const catMap = new Map<string, { name: string; icon: string | null }>();
    categories.forEach((c: any) => catMap.set(c.id, { name: c.name, icon: c.icon ?? null }));
    const inPrev = (s: string) => {
      const d = new Date(s + "T00:00:00");
      return d.getFullYear() === prevPeriod.y && d.getMonth() === prevPeriod.m;
    };
    tx.filter((t: any) => inPrev(t.due_at)).forEach((t: any) => {
      const v = effectiveShares(t, adjMap).reduce((s, sh) => s + sh.amount * personFactor(sh.person), 0);
      if (!v) return;
      const name = t.categorias?.name ?? "Sem categoria";
      if (t.kind === "income" && !t.card_installment_id) {
        incMap.set(name, (incMap.get(name) ?? 0) + v);
      } else if (t.kind === "expense" && !t.card_installment_id && t.category_id !== "0494a63e-6737-4a3c-8778-67ce5f96a0a1") {
        expMap.set(name, (expMap.get(name) ?? 0) + v);
      }
    });
    inst.filter((i: any) => inPrev(i.due_at)).forEach((i: any) => {
      const f = personFactor(costPersonInst(i));
      if (!f) return;
      const cid = i.cartao_compras?.category_id;
      const meta = (cid && catMap.get(cid)) || { name: "Sem categoria", icon: null };
      const v = Number(i.amount) * f;
      expMap.set(meta.name, (expMap.get(meta.name) ?? 0) + v);
    });
    return { expMap, incMap };
  }, [prevPeriod, tx, inst, categories, personFilter, personFilter2, adjMap]);



  type CatItem = (typeof catData)[number];
  const [openCat, setOpenCat] = useState<null | CatItem>(null);
  const [openPeopleAn, setOpenPeopleAn] = useLsBool("peopleAn", true);
  const [peopleTab, setPeopleTab] = useState<"totais" | "cartoes">(() => {
    if (typeof window === "undefined") return "totais";
    return (window.localStorage.getItem("dash:peopleTab") as "totais" | "cartoes") || "totais";
  });
  useEffect(() => { if (typeof window !== "undefined") window.localStorage.setItem("dash:peopleTab", peopleTab); }, [peopleTab]);
  const [openLorran, setOpenLorran] = useLsBool("card:lorran", true);
  const [openFamilia, setOpenFamilia] = useLsBool("card:familia", true);
  const [openTayLoja, setOpenTayLoja] = useLsBool("card:tayloja", true);
  const cardsById = useMemo(() => {
    const m = new Map<string, any>();
    cards.forEach((c: any) => m.set(c.id, c));
    return m;
  }, [cards]);

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);
  const periodLabel = `${selM === "all" ? "Todos os meses" : monthLabel(selM)} · ${selY === "all" ? "Todos os anos" : selY}`;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={LayoutDashboard}
        eyebrow="Visão Geral"
        title="Visão Mensal"
        subtitle={`${periodLabel}${[personFilter, personFilter2].filter((p) => p && p !== "all").length > 0 ? ` · ${[personFilter, personFilter2].filter((p) => p && p !== "all").join(" + ")}` : ""}`}
        actions={
          <>
          <div className="flex gap-4 flex-wrap items-end">
            <Field label="Mês">
              <Select value={String(selM)} onValueChange={(v) => setSelM(v === "all" ? "all" : Number(v))}>
                <SelectTrigger className={`w-auto min-w-[140px] h-10 rounded-xl transition-all shadow-sm ${selM !== "all" ? "border-gold/50 ring-2 ring-gold/20 bg-gold/5 font-medium" : "border-border text-muted-foreground"}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os meses</SelectItem>
                  {Array.from({ length: 12 }, (_, m) => (
                    <SelectItem key={m} value={String(m)}>{monthLabel(m)}</SelectItem>
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

            <Field label="Pessoa">
              <Select value={personFilter} onValueChange={setPersonFilter}>
                <SelectTrigger className={`w-auto min-w-[140px] h-10 rounded-xl transition-all shadow-sm ${personFilter !== "all" ? "border-gold/50 ring-2 ring-gold/20 bg-gold/5 font-medium" : "border-border text-muted-foreground"}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as pessoas</SelectItem>
                  {people.map((p: any) => (
                    <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
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
                  {people.map((p: any) => (
                    <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <NotificationBell transactions={tx} installments={inst} cards={cards} />
          </>
        }
      />


      {(() => {
        // Sparkline series derived from yearData (12 months, current year). Fatura derived from inst.
        const baseY = typeof selY === "number" ? selY : now.getFullYear();
        const monthsArr = Array.from({ length: 12 }, () => ({ receita: 0, despesa: 0, fatura: 0 }));
        tx.forEach((t: any) => {
          const d = new Date(t.due_at + "T00:00:00");
          if (d.getFullYear() !== baseY) return;
          const v = effectiveShares(t, adjMap).reduce((s, sh) => s + sh.amount * personFactor(sh.person), 0);
          if (!v) return;
          if (t.kind === "income") monthsArr[d.getMonth()].receita += v;
          else if (!t.card_installment_id && t.category_id !== "0494a63e-6737-4a3c-8778-67ce5f96a0a1") monthsArr[d.getMonth()].despesa += v;
        });
        inst.forEach((i: any) => {
          const d = new Date(i.due_at + "T00:00:00");
          if (d.getFullYear() !== baseY) return;
          const f = personFactor(costPersonInst(i));
          if (!f) return;
          monthsArr[d.getMonth()].fatura += Number(i.amount) * f;
        });
        const sparkSaldo: number[] = [];
        let acc = 0;
        for (const m of monthsArr) { acc += m.receita - m.despesa - m.fatura; sparkSaldo.push(acc); }
        const sparkDespesa = monthsArr.map((m) => m.despesa);
        const sparkFatura = monthsArr.map((m) => m.fatura);
        const sparkBalanco = monthsArr.map((m) => m.receita - m.despesa - m.fatura);
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 auto-rows-min">
            {isLoading ? (
              <>
                <KPISkeleton />
                <KPISkeleton />
                <KPISkeleton />
                <KPISkeleton />
              </>
            ) : (
              <>
                <KPI index={0} label="Saldo da Conta" value={saldoConta} sub="A receber" subValue={receitasPend} icon={TrendingUp} color={saldoConta >= 0 ? "text-success" : "text-destructive"} spark={sparkSaldo} highlight />
                <KPI index={1} label="Balanço" value={balanco} sub="Receita − Despesa − Fatura" subValue={balanco} icon={Wallet} color={balanco >= 0 ? "text-success" : "text-destructive"} spark={sparkBalanco} />
                <KPI index={2} label="Despesas Lançamentos" value={despesasTotais} sub="Restante a pagar" subValue={despesasRestante} icon={TrendingDown} color="text-destructive" spark={sparkDespesa} />
                <KPI index={3} label="Fatura cartões" value={fatura} sub="Restante a pagar" subValue={faturaRest} icon={CreditCard} color="text-destructive" spark={sparkFatura} />
              </>
            )}
          </div>

        );
      })()}


      {(() => {
        const normKey = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
        const lookup = (target: string) => {
          const t = normKey(target);
          const k = Object.keys(personMonth).find((k) => normKey(k) === t);
          return k ? (personMonth as any)[k] ?? 0 : 0;
        };
        return (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 items-start">
            <PersonCard name="Lorran" value={lookup("Lorran")} monthInst={monthInst} monthTx={monthTx} adjMap={adjMap} expanded={openLorran} onToggle={() => setOpenLorran(!openLorran)} />
            <PersonCard name="Família" value={lookup("Familia")} monthInst={monthInst} monthTx={monthTx} adjMap={adjMap} expanded={openFamilia} onToggle={() => setOpenFamilia(!openFamilia)} />
            <CombinedPersonCard names={["Tayane", "Loja"]} values={[lookup("Tayane"), lookup("Loja")]} monthInst={monthInst} monthTx={monthTx} adjMap={adjMap} expanded={openTayLoja} onToggle={() => setOpenTayLoja(!openTayLoja)} />
          </div>
        );
      })()}

      <div className="relative rounded-2xl border border-border overflow-hidden bg-gradient-to-br from-card via-card to-card/40" style={{ boxShadow: "var(--shadow-elegant)" }}>
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, var(--foreground) 1px, transparent 0)", backgroundSize: "22px 22px" }} />
        <div className="relative px-5 py-4 border-b border-border/60 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-[11px] uppercase tracking-[0.2em] text-primary font-bold">Live</span>
            <h3 className="ml-2 text-sm font-semibold flex items-center gap-2"><CreditCard className="w-4 h-4 text-primary" /> Cartões de crédito</h3>
          </div>
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Fatura atual · Pago vs restante</span>
        </div>
        <div className="relative p-4">
          {cards.length === 0 ? (
            <div className="text-sm text-muted-foreground py-6 text-center">Cadastre seus cartões na aba Cartões.</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {cards.map((c: any) => {
                const cardMonthInst = monthInst.filter((i: any) => i.card_id === c.id);
                const fat = cardMonthInst.reduce((s: number, i: any) => s + Number(i.amount) * personFactor(costPersonInst(i)), 0);
                const restante = cardMonthInst
                  .filter((i: any) => i.status !== "paid")
                  .reduce((s: number, i: any) => s + (Number(i.amount) - Number(i.paid_amount || 0)) * personFactor(costPersonInst(i)), 0);
                const pago = Math.max(0, fat - restante);
                const pctPago = fat > 0 ? (pago / fat) * 100 : 0;
                const isPaid = restante === 0 && fat > 0;
                return (
                  <div key={c.id} className="group relative rounded-xl border border-border/60 bg-background/40 backdrop-blur p-3 hover:border-primary/40 transition-colors">
                    <div className="flex items-center gap-3 mb-3">
                      <BankIcon bank={c.bank || c.name} size={28} square />
                      <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                        <div className="text-sm font-medium truncate text-foreground">{c.name}</div>
                        <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{isPaid ? "Quitado" : `${pctPago.toFixed(0)}% pago`}</div>
                      </div>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${isPaid ? "border-success/40 text-success bg-success/10" : "border-primary/40 text-primary bg-primary/10"}`}>
                        {isPaid ? "OK" : "Aberto"}
                      </span>
                    </div>
                    <div className="relative h-2 rounded-full bg-muted overflow-hidden mb-3">
                      <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-success/80 to-success transition-all duration-700" style={{ width: `${Math.min(100, pctPago)}%` }} />
                      <div className="absolute inset-0 opacity-30 pointer-events-none" style={{ backgroundImage: "linear-gradient(90deg, transparent 0, transparent 6px, var(--background) 6px, var(--background) 7px)", backgroundSize: "7px 100%" }} />
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="rounded-lg bg-background/60 border border-border/50 px-2 py-1.5 flex flex-col gap-1">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Fatura</div>
                        <div className="font-semibold tabular-nums text-foreground">{brl(fat)}</div>
                      </div>
                      <div className="rounded-lg bg-background/60 border border-border/50 px-2 py-1.5 flex flex-col gap-1">
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Restante</div>
                        <div className={`font-semibold tabular-nums ${isPaid ? "text-success" : "text-destructive"}`}>{brl(restante)}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="relative lg:col-span-2 rounded-2xl border border-border overflow-hidden bg-gradient-to-br from-card via-card to-card/40" style={{ boxShadow: "var(--shadow-elegant)" }}>
          <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, var(--foreground) 1px, transparent 0)", backgroundSize: "22px 22px" }} />
          <div className="relative px-5 py-4 border-b border-border/60 flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                <span className="text-[10px] uppercase tracking-[0.2em] text-primary">Fluxo anual</span>
              </div>
              <h3 className="text-sm font-semibold flex items-center gap-2"><Activity className="w-4 h-4 text-primary" /> Receitas vs Despesas</h3>
            </div>
            {(() => {
              const tot = yearData.reduce((a, m) => ({ r: a.r + m.Receitas, d: a.d + m.Despesas }), { r: 0, d: 0 });
              const bal = tot.r - tot.d;
              return (
                <div className="flex gap-3 text-xs">
                  {personFilter !== "all" && (
                    <div className="rounded-lg border border-border/60 bg-background/50 px-2.5 py-1.5">
                      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Receitas</div>
                      <div className="tabular-nums font-semibold" style={{ color: "oklch(0.72 0.18 155)" }}>{brl(tot.r)}</div>
                    </div>
                  )}
                  <div className="rounded-lg border border-border/60 bg-background/50 px-2.5 py-1.5">
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Despesas</div>
                    <div className="tabular-nums font-semibold text-destructive">{brl(tot.d)}</div>
                  </div>
                  {personFilter !== "all" && (
                    <div className="rounded-lg border border-primary/40 bg-primary/10 px-2.5 py-1.5">
                      <div className="text-[9px] uppercase tracking-wider text-primary">Saldo</div>
                      <div className={`tabular-nums font-semibold ${bal >= 0 ? "text-success" : "text-destructive"}`}>{brl(bal)}</div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
          <div className="relative p-3">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={yearData} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gReceitas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.72 0.18 155)" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="oklch(0.72 0.18 155)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gDespesas" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="oklch(0.65 0.24 22)" stopOpacity={0.6} />
                    <stop offset="100%" stopColor="oklch(0.65 0.24 22)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 6" stroke="var(--foreground)" strokeOpacity={0.12} vertical={false} />
                <XAxis dataKey="mes" stroke="var(--foreground)" tick={{ fill: "var(--muted-foreground)" }} fontSize={11} axisLine={false} tickLine={false} />
                <YAxis stroke="var(--foreground)" tick={{ fill: "var(--muted-foreground)" }} fontSize={11} axisLine={false} tickLine={false} tickFormatter={(v) => `${(v/1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--popover-foreground)", boxShadow: "0 8px 32px rgba(0,0,0,0.4)" }} itemStyle={{ color: "var(--popover-foreground)" }} labelStyle={{ color: "var(--primary)", fontWeight: 600 }} cursor={{ stroke: "var(--primary)", strokeWidth: 1, strokeDasharray: "4 4" }} formatter={(v: any) => brl(v)} />
                {personFilter !== "all" && (
                  <Area type="monotone" dataKey="Receitas" stroke="oklch(0.72 0.18 155)" strokeWidth={2.5} fill="url(#gReceitas)" />
                )}
                <Area type="monotone" dataKey="Despesas" stroke="oklch(0.65 0.24 22)" strokeWidth={2.5} fill="url(#gDespesas)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="relative rounded-2xl border border-border overflow-hidden bg-gradient-to-br from-card via-card to-card/40" style={{ boxShadow: "var(--shadow-elegant)" }}>
          <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, var(--foreground) 1px, transparent 0)", backgroundSize: "22px 22px" }} />
          <div className="relative px-5 py-4 border-b border-border/60">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-[10px] uppercase tracking-[0.2em] text-primary">Breakdown</span>
            </div>
            <h3 className="text-sm font-semibold flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> Despesas por categoria</h3>
          </div>
          <div className="relative p-4">
            {catData.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-12">Sem dados neste período</div>
            ) : (() => {
              const sorted = [...catData].sort((a, b) => b.value - a.value);
              const total = sorted.reduce((s, c) => s + c.value, 0);
              return (
                <ul className="space-y-1.5 max-h-[280px] overflow-y-auto pr-1">
                  {sorted.map((c) => {
                    const pct = total > 0 ? (c.value / total) * 100 : 0;
                    const color = colorFromString(c.icon || c.name);
                    return (
                      <li key={c.name}>
                        <button type="button" onClick={() => setOpenCat(c)} className="w-full text-left rounded-lg px-2 py-1.5 hover:bg-muted/40 transition-colors border border-transparent hover:border-border/60">
                          <div className="flex items-center gap-2 text-sm">
                            <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border border-border/50" style={{ background: `color-mix(in oklab, ${color} 15%, transparent)` }}>{c.icon ?? "•"}</span>
                            <span className="flex-1 truncate text-foreground">{c.name}</span>
                            <DeltaBadge current={c.value} previous={prevCatMaps.expMap.get(c.name)} kind="expense" />
                            <span className="text-xs tabular-nums font-medium text-foreground">{brl(c.value)}</span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 pl-9">
                            <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
                            </div>
                            <span className="text-[10px] tabular-nums text-muted-foreground w-8 text-right">{pct.toFixed(0)}%</span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              );
            })()}

            <div className="mt-5 pt-4 border-t border-border/60">
              <div className="flex items-center gap-2 mb-3">
                <span className="w-1 h-1 rounded-full" style={{ background: "oklch(0.72 0.18 155)" }} />
                <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">Receitas por categoria</div>
              </div>
              {incomeCatData.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-6">Sem receitas neste período</div>
              ) : (() => {
                const sorted = [...incomeCatData].sort((a, b) => b.value - a.value);
                const total = sorted.reduce((s, c) => s + c.value, 0);
                const color = "oklch(0.72 0.18 155)";
                return (
                  <ul className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                    {sorted.map((c) => {
                      const pct = total > 0 ? (c.value / total) * 100 : 0;
                      return (
                        <li key={c.name}>
                          <button type="button" onClick={() => setOpenCat(c as any)} className="w-full text-left rounded-lg px-2 py-1.5 hover:bg-muted/40 transition-colors border border-transparent hover:border-border/60">
                            <div className="flex items-center gap-2 text-sm">
                              <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border border-border/50" style={{ background: `color-mix(in oklab, ${color} 15%, transparent)` }}>{c.icon ?? "•"}</span>
                              <span className="flex-1 truncate text-foreground">{c.name}</span>
                              <DeltaBadge current={c.value} previous={prevCatMaps.incMap.get(c.name)} kind="income" />
                              <span className="text-xs tabular-nums font-medium text-foreground">{brl(c.value)}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 pl-9">
                              <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: color }} />
                              </div>
                              <span className="text-[10px] tabular-nums text-muted-foreground w-8 text-right">{pct.toFixed(0)}%</span>
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                );
              })()}
            </div>
          </div>
        </div>
      </div>


      {/* Análise por Pessoa — visual profissional/tech */}
      <div className="relative rounded-2xl border border-border overflow-hidden bg-gradient-to-br from-card via-card to-card/40" style={{ boxShadow: "var(--shadow-elegant)" }}>
        <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, var(--foreground) 1px, transparent 0)", backgroundSize: "22px 22px" }} />
        <button onClick={() => setOpenPeopleAn(!openPeopleAn)} className="relative w-full px-5 py-4 text-sm font-semibold flex items-center gap-2 hover:bg-muted/20 transition-colors">
          {openPeopleAn ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <Users className="w-4 h-4 text-primary" />
          Análise por Pessoa
          <span className="ml-auto flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-muted-foreground font-normal">
            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            {periodLabel}
          </span>
        </button>
        {openPeopleAn && (
          peopleAnalytics.totals.length === 0 ? (
            <div className="relative text-sm text-muted-foreground text-center py-12">Sem dados no período</div>
          ) : (
            <div className="relative p-5 space-y-4">
              {/* Tabs */}
              <div className="inline-flex items-center gap-1 p-1 rounded-lg border border-border/60 bg-background/50">
                {([
                  { id: "totais", label: "Totais", icon: Activity },
                  { id: "cartoes", label: "Cartões", icon: CreditCard },
                ] as const).map((t) => {
                  const active = peopleTab === t.id;
                  const Icon = t.icon;
                  return (
                    <button
                      key={t.id}
                      onClick={() => setPeopleTab(t.id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        active ? "bg-primary/10 text-primary ring-1 ring-primary/30" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {peopleTab === "totais" ? (
                (() => {
                  const total = peopleAnalytics.totals.reduce((s, p) => s + p.total, 0);
                  const pieData = peopleAnalytics.totals.map((p) => ({ name: p.name, value: p.total, fill: colorForPerson(p.name) }));
                  return (
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-center">
                      <div className="md:col-span-2 relative">
                        <ResponsiveContainer width="100%" height={220}>
                          <PieChart>
                            <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={62} outerRadius={92} paddingAngle={2} stroke="var(--background)" strokeWidth={2}>
                              {pieData.map((d, i) => <Cell key={i} fill={d.fill} />)}
                            </Pie>
                            <Tooltip
                              contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12, color: "var(--foreground)" }}
                              itemStyle={{ color: "var(--foreground)" }}
                              labelStyle={{ color: "var(--foreground)" }}
                              formatter={(v: number, n: string) => [brl(v), n]}
                            />
                          </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                          <span className="text-[9px] uppercase tracking-[0.2em] text-muted-foreground">Total</span>
                          <span className="text-base font-bold tabular-nums">{brl(total)}</span>
                        </div>
                      </div>
                      <ul className="md:col-span-3 space-y-2.5">
                        {peopleAnalytics.totals.map((p) => {
                          const color = colorForPerson(p.name);
                          const pct = total > 0 ? (p.total / total) * 100 : 0;
                          return (
                            <li key={p.name} className="flex items-center gap-3">
                              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
                              <span className="w-24 text-sm font-medium truncate text-foreground">{p.name}</span>
                              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${color}, ${color}90)` }} />
                              </div>
                              <span className="w-10 text-right text-[11px] text-muted-foreground tabular-nums">{pct.toFixed(0)}%</span>
                              <span className="w-24 text-right text-sm font-semibold tabular-nums text-foreground">{brl(p.total)}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })()
              ) : (
                peopleAnalytics.byCard.length === 0 ? (
                  <div className="text-sm text-muted-foreground text-center py-10">Sem compras no cartão no período</div>
                ) : (
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {peopleAnalytics.byCard.map(({ cardName, entries, total }) => (
                      <li key={cardName} className="rounded-lg border border-border/50 bg-background/40 p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 text-sm font-semibold">
                            <span className="w-1 h-4 rounded-full bg-primary" />
                            {cardName}
                          </div>
                          <div className="text-sm font-bold tabular-nums">{brl(total)}</div>
                        </div>
                        <div className="flex h-2 rounded-full overflow-hidden bg-muted mb-2">
                          {entries.map(([p, v]) => {
                            const pct = total > 0 ? (Number(v) / total) * 100 : 0;
                            return (
                              <div
                                key={p}
                                className="h-full transition-all"
                                title={`${p}: ${brl(Number(v))} (${pct.toFixed(0)}%)`}
                                style={{ width: `${pct}%`, background: colorForPerson(p) }}
                              />
                            );
                          })}
                        </div>
                        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-[11px]">
                          {entries.map(([p, v]) => (
                            <li key={p} className="flex items-center gap-2 min-w-0">
                              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: colorForPerson(p) }} />
                              <span className="truncate text-muted-foreground flex-1">{p}</span>
                              <span className="tabular-nums font-medium text-foreground shrink-0">{brl(Number(v))}</span>
                            </li>
                          ))}
                        </ul>

                      </li>
                    ))}
                  </ul>
                )
              )}
            </div>

          )
        )}
      </div>


      <Dialog open={!!openCat} onOpenChange={(o) => !o && setOpenCat(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto p-0 border-border bg-gradient-to-br from-card via-card to-card/40">
          <div className="absolute inset-0 opacity-[0.04] pointer-events-none rounded-lg" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, var(--foreground) 1px, transparent 0)", backgroundSize: "22px 22px" }} />
          <div className="relative px-6 py-5 border-b border-border/60">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
              <span className="text-[10px] uppercase tracking-[0.2em] text-primary">Detalhamento · {periodLabel}</span>
            </div>
            <DialogHeader className="space-y-1">
              <DialogTitle className="flex items-center gap-3 text-lg">
                {openCat && (
                  <span className="w-9 h-9 rounded-lg flex items-center justify-center border border-border/50 text-base" style={{ background: `color-mix(in oklab, ${colorFromString(openCat.icon || openCat.name)} 15%, transparent)` }}>
                    {openCat.icon ?? "•"}
                  </span>
                )}
                <span>{openCat?.name}</span>
              </DialogTitle>
              <DialogDescription className="text-xs">Conforme os filtros ativos</DialogDescription>
            </DialogHeader>
          </div>
          <div className="relative px-6 py-4">
            {openCat && <CategoryDetail cat={openCat} cardsById={cardsById} />}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}

function CategoryDetail({ cat, cardsById }: { cat: any; cardsById: Map<string, any> }) {
  const [showCard, setShowCard] = useState(true);
  const [showManual, setShowManual] = useState(true);
  const cardItems = (cat.cardItems ?? []).slice().sort((a: any, b: any) => (b.inst.due_at || "").localeCompare(a.inst.due_at || ""));
  const manualItems = (cat.manualItems ?? []).slice().sort((a: any, b: any) => (b.tx.due_at || "").localeCompare(a.tx.due_at || ""));
  return (
    <div className="space-y-3 pt-1">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-border/60 bg-background/40 backdrop-blur px-3 py-2">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground flex items-center gap-1"><CreditCard className="w-3 h-3" /> Cartão</div>
          <div className="text-sm font-semibold tabular-nums text-foreground">{brl(cat.card)}</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-background/40 backdrop-blur px-3 py-2">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground flex items-center gap-1"><Wallet className="w-3 h-3" /> Manual</div>
          <div className="text-sm font-semibold tabular-nums text-foreground">{brl(cat.manual)}</div>
        </div>
        <div className="rounded-xl border border-primary/40 bg-primary/10 px-3 py-2">
          <div className="text-[9px] uppercase tracking-wider text-primary">Total</div>
          <div className="text-sm font-bold tabular-nums text-foreground">{brl(cat.value)}</div>
        </div>
      </div>

      <div className="rounded-xl border border-border/60 overflow-hidden bg-background/30">
        <button type="button" onClick={() => setShowCard(!showCard)} className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/40 text-sm font-medium transition-colors">
          <span className="flex items-center gap-2">
            {showCard ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <CreditCard className="w-4 h-4 text-primary" />
            Pago via cartão
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-border/50 bg-background/60 text-muted-foreground">{cardItems.length}</span>
          </span>
          <span className="tabular-nums font-semibold">{brl(cat.card)}</span>
        </button>
        {showCard && (
          cardItems.length === 0 ? (
            <div className="text-xs text-muted-foreground p-4 text-center border-t border-border/60">Nenhuma compra no cartão para esta categoria.</div>
          ) : (
            <div className="overflow-x-auto border-t border-border/60">
              <table className="w-full text-[11px]">
                <thead className="bg-muted/20 text-muted-foreground">
                  <tr>
                    <th className="text-left p-2 font-semibold">Data</th>
                    <th className="text-left p-2 font-semibold">Descrição</th>
                    <th className="text-left p-2 font-semibold">Cartão</th>
                    <th className="text-left p-2 font-semibold">Parcela</th>
                    <th className="text-left p-2 font-semibold">Pessoa</th>
                    <th className="text-right p-2 font-semibold">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {cardItems.map(({ inst, share }: any) => {
                    const cp = inst.cartao_compras || inst._originalItem?.cartao_compras || {};
                    const card = inst.cartoes || inst._originalItem?.cartoes || cardsById.get(inst.card_id) || {};
                    return (
                      <tr key={inst.id} className="border-t border-border/60 hover:bg-muted/20">
                        <td className="p-2 whitespace-nowrap">{fmtDate(inst.due_at)}</td>
                        <td className="p-2">
                          <div className="font-medium">{cp.description ?? "—"}</div>
                          {cp.purchase_date && <div className="text-[10px] text-muted-foreground">Compra: {fmtDate(cp.purchase_date)}</div>}
                        </td>
                        <td className="p-2 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <BankIcon bank={card.bank || card.name} size={14} square />
                            {card.name ?? "—"}
                          </span>
                        </td>
                        <td className="p-2 whitespace-nowrap text-muted-foreground">{inst.installment_number}/{cp.installments_count ?? "?"}</td>
                        <td className="p-2 whitespace-nowrap">{cp.person || inst.person || "—"}</td>
                        <td className="p-2 text-right tabular-nums font-medium">
                          <div className="flex flex-col items-end">
                            <span>{brl(share)}</span>
                            {cp.brand && (
                              <span className="text-[9px] text-muted-foreground">
                                {cp.brand}
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      <div className="rounded-xl border border-border/60 overflow-hidden bg-background/30">
        <button type="button" onClick={() => setShowManual(!showManual)} className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-muted/40 text-sm font-medium transition-colors">
          <span className="flex items-center gap-2">
            {showManual ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
            <Wallet className="w-4 h-4 text-primary" />
            Lançamentos manuais
            <span className="text-[10px] px-2 py-0.5 rounded-full border border-border/50 bg-background/60 text-muted-foreground">{manualItems.length}</span>
          </span>
          <span className="tabular-nums font-semibold">{brl(cat.manual)}</span>
        </button>
        {showManual && (
          manualItems.length === 0 ? (
            <div className="text-xs text-muted-foreground p-4 text-center border-t border-border/60">Nenhum lançamento manual para esta categoria.</div>
          ) : (
            <div className="overflow-x-auto border-t border-border/60">
              <table className="w-full text-[11px]">
                <thead className="bg-muted/20 text-muted-foreground">
                  <tr>
                    <th className="text-left p-2 font-semibold">Data</th>
                    <th className="text-left p-2 font-semibold">Descrição</th>
                    <th className="text-left p-2 font-semibold">Pessoa</th>
                    <th className="text-left p-2 font-semibold">Status</th>
                    <th className="text-left p-2 font-semibold">Observações</th>
                    <th className="text-right p-2 font-semibold">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {manualItems.map(({ tx, share }: any) => (
                    <tr key={tx.id} className="border-t border-border/60 hover:bg-muted/20">
                      <td className="p-2 whitespace-nowrap">{fmtDate(tx.due_at)}</td>
                      <td className="p-2 font-medium">{tx.description}</td>
                      <td className="p-2 whitespace-nowrap">{tx.person || tx._owner || "—"}</td>
                      <td className="p-2 whitespace-nowrap">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${tx.status === "paid" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                          {tx.status === "paid" ? "Pago" : "Pendente"}
                        </span>
                      </td>
                      <td className="p-2 max-w-[200px] truncate text-muted-foreground" title={tx.notes ?? ""}>{tx.notes ?? "—"}</td>
                      <td className="p-2 text-right tabular-nums font-medium">{brl(share)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
}


function computePaidRest(targetName: string, monthTx: any[], monthInst: any[], adjMap: any) {
  const norm = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
  const isTarget = (p?: string | null) => norm(p || "") === norm(targetName);
  const isNameFamilia = norm(targetName) === "familia";
  const splitsFamilia = norm(targetName) === "lorran" || norm(targetName) === "tayane";
  let rest = 0;
  let paidAmt = 0;

  monthTx.forEach(t => {
    if (t.kind !== "expense" || t.card_installment_id || t.category_id === "0494a63e-6737-4a3c-8778-67ce5f96a0a1") return;
    const shares = effectiveShares(t, adjMap);
    shares.forEach(sh => {
      const itemPerson = (sh.person || "").trim();
      const isItemFamilia = norm(itemPerson) === "familia";
      let myShare = 0;
      if (isNameFamilia) {
        if (isItemFamilia) myShare = sh.amount;
      } else {
        const isItemMe = isTarget(itemPerson);
        if (isItemMe) myShare = sh.amount;
        else if (isItemFamilia && splitsFamilia) myShare = sh.amount / 2;
      }
      if (myShare === 0) return;
      if (t.status === "paid") paidAmt += myShare;
      else rest += myShare;
    });
  });

  monthInst.forEach(i => {
    const v = Number(i.amount);
    const paid = Number(i.paid_amount || 0);
    const itemPerson = (i.cartao_compras?.person || "").trim();
    const isItemFamilia = norm(itemPerson) === "familia";
    let factor = 0;
    if (isNameFamilia) {
      if (isItemFamilia) factor = 1;
    } else {
      const isItemMe = isTarget(itemPerson);
      if (isItemMe) factor = 1;
      else if (isItemFamilia && splitsFamilia) factor = 0.5;
    }
    if (factor === 0) return;
    if (i.status === "paid") {
      paidAmt += v * factor;
    } else {
      paidAmt += paid * factor;
      rest += (v - paid) * factor;
    }
  });

  return { totalPago: paidAmt, totalRestante: rest };
}

function PersonCard({ name, value, monthInst, monthTx, adjMap, expanded = true, onToggle }: { name: string; value: number; monthInst: any[]; monthTx: any[]; adjMap: any; expanded?: boolean; onToggle?: () => void }) {
  const { totalPago, totalRestante } = useMemo(
    () => computePaidRest(name, monthTx, monthInst, adjMap),
    [monthInst, monthTx, name, adjMap]
  );

  const totalBase = totalPago + totalRestante;
  const pct = totalBase > 0 ? (totalPago / totalBase) * 100 : 0;
  const color = personColor(name);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      className="relative overflow-hidden rounded-xl border border-border/60 p-3 flex flex-col gap-2 group self-start"
      style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-elegant)" }}
    >
      <div className="flex items-center justify-between relative">
        <div className="flex items-center gap-2 min-w-0">
          <div className="rounded-lg p-1.5 bg-background/60 backdrop-blur border border-border/50" style={{ color }}>
            <TrendingDown className="w-3.5 h-3.5" />
          </div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium truncate">{name}</span>
        </div>
        {onToggle && (
          <button type="button" onClick={onToggle} className="text-muted-foreground hover:text-foreground transition-colors">
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      <div className="text-2xl font-bold tabular-nums leading-tight relative text-foreground">{brl(value)}</div>

      {expanded && (
        <div className="pt-2 border-t border-border/50 space-y-1.5 relative">

          <div className="flex items-center gap-2">
            <div className="h-1 flex-1 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-success transition-all duration-500"
                style={{ width: `${Math.min(100, pct)}%` }}
              />
            </div>
            <span className="text-[10px] font-semibold tabular-nums text-muted-foreground w-8 text-right">{pct.toFixed(0)}%</span>
          </div>
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-muted-foreground">Pago</span>
            <span className="font-semibold text-success tabular-nums">{brl(totalPago)}</span>
          </div>
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-muted-foreground">Restante</span>
            <span className={`font-semibold tabular-nums ${totalRestante <= 0 ? "text-success" : "text-destructive"}`}>{brl(totalRestante)}</span>
          </div>
        </div>
      )}
    </motion.div>
  );
}

function CombinedPersonCard({ names, values, monthInst, monthTx, adjMap, expanded = true, onToggle }: { names: string[]; values: number[]; monthInst: any[]; monthTx: any[]; adjMap: any; expanded?: boolean; onToggle?: () => void }) {
  const perPerson = useMemo(
    () => names.map((n, idx) => ({
      name: n,
      value: values[idx] ?? 0,
      ...computePaidRest(n, monthTx, monthInst, adjMap),
    })),
    [names, values, monthTx, monthInst, adjMap]
  );
  const totalValue = perPerson.reduce((s, p) => s + p.value, 0);
  const totalPago = perPerson.reduce((s, p) => s + p.totalPago, 0);
  const totalRestante = perPerson.reduce((s, p) => s + p.totalRestante, 0);
  const totalBase = totalPago + totalRestante;
  const pct = totalBase > 0 ? (totalPago / totalBase) * 100 : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -2, transition: { duration: 0.2 } }}
      className="relative overflow-hidden rounded-xl border border-border/60 p-3 flex flex-col gap-2 group self-start"
      style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-elegant)" }}
    >
      <div className="flex items-center justify-between relative">
        <div className="flex items-center gap-2 min-w-0">
          <div className="rounded-lg p-1.5 bg-background/60 backdrop-blur border border-border/50 text-muted-foreground">
            <TrendingDown className="w-3.5 h-3.5" />
          </div>
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-medium truncate">{names.join(" + ")}</span>
        </div>
        {onToggle && (
          <button type="button" onClick={onToggle} className="text-muted-foreground hover:text-foreground transition-colors">
            {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>

      <div className="text-xl font-bold tabular-nums leading-tight relative text-foreground">{brl(totalValue)}</div>

      {expanded && (
        <div className="pt-2 border-t border-border/50 space-y-1.5 relative">
          <div className="flex items-center gap-2">
            <div className="h-1 flex-1 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-success transition-all duration-500" style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
            <span className="text-[10px] font-semibold tabular-nums text-muted-foreground w-8 text-right">{pct.toFixed(0)}%</span>
          </div>
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-muted-foreground">Pago</span>
            <span className="font-semibold text-success tabular-nums">{brl(totalPago)}</span>
          </div>
          <div className="flex justify-between items-center text-[11px]">
            <span className="text-muted-foreground">Restante</span>
            <span className={`font-semibold tabular-nums ${totalRestante <= 0 ? "text-success" : "text-destructive"}`}>{brl(totalRestante)}</span>
          </div>
          <div className="pt-1.5 mt-1.5 border-t border-border/40 grid grid-cols-2 gap-1.5">
            {perPerson.map((p) => {
              const pbase = p.totalPago + p.totalRestante;
              const ppct = pbase > 0 ? (p.totalPago / pbase) * 100 : 0;
              return (
                <div key={p.name} className="rounded-md border border-border/40 p-1.5 flex flex-col gap-1 bg-background/30">
                  <span className="text-[9px] uppercase tracking-wider font-medium text-muted-foreground">{p.name}</span>
                  <div className="text-[12px] font-bold tabular-nums leading-tight text-foreground">{brl(p.value)}</div>
                  <div className="flex items-center gap-1">
                    <div className="h-0.5 flex-1 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-success transition-all duration-500" style={{ width: `${Math.min(100, ppct)}%` }} />
                    </div>
                    <span className="text-[8px] font-semibold tabular-nums text-muted-foreground w-6 text-right">{ppct.toFixed(0)}%</span>
                  </div>
                  <div className="flex justify-between text-[9px]">
                    <span className="text-muted-foreground">Pago</span>
                    <span className="font-semibold text-success tabular-nums">{brl(p.totalPago)}</span>
                  </div>
                  <div className="flex justify-between text-[9px]">
                    <span className="text-muted-foreground">Resta</span>
                    <span className={`font-semibold tabular-nums ${p.totalRestante <= 0 ? "text-success" : "text-destructive"}`}>{brl(p.totalRestante)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </motion.div>
  );
}



function KPI({ label, value, icon: Icon, color, sub, subValue, spark, className = "", index = 0, highlight = false }: any) {
  const strokeClass = color || "text-primary";
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      className={`relative overflow-hidden rounded-2xl border border-border/60 p-5 group ${className}`}
      style={{
        background: highlight
          ? "linear-gradient(135deg, color-mix(in oklab, var(--primary) 10%, var(--card)), var(--card))"
          : "var(--gradient-card)",
        boxShadow: "var(--shadow-elegant)",
      }}
    >
      <div className="flex items-start justify-between relative">
        <div className="space-y-1">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
          <div className={`text-2xl font-bold tabular-nums ${color}`}>
            <CountUp value={value} format={brl} />
          </div>
        </div>
        <div className={`rounded-xl p-2.5 bg-background/60 backdrop-blur border border-border/50 ${color} group-hover:scale-110 transition-transform`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>

      {Array.isArray(spark) && spark.length > 0 && (
        <div className={`mt-3 ${strokeClass} relative`}>
          <Sparkline data={spark} width={180} height={32} stroke="currentColor" fill="currentColor" className="w-full" />
        </div>
      )}

      {sub !== undefined && (
        <div className="flex justify-between items-center text-xs pt-3 mt-3 border-t border-border/50 relative">
          <span className="text-muted-foreground">{sub}</span>
          <span className={`font-semibold tabular-nums ${subValue === 0 ? "text-success" : color}`}>{brl(subValue ?? 0)}</span>
        </div>
      )}
    </motion.div>
  );
}


function KPISkeleton() {
  return (
    <div className="rounded-xl p-4 border border-border" style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-elegant)" }}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-4 w-4 rounded" />
      </div>
      <Skeleton className="h-7 w-32 mt-3" />
      <Skeleton className="h-7 w-full mt-3" />
      <div className="flex justify-between items-center pt-2 mt-2 border-t border-border">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-14" />
      </div>
    </div>
  );
}


function Field({ label, children, labelEnd }: { label: string; children: React.ReactNode; labelEnd?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground ml-1">{label}</label>
        {labelEnd}
      </div>
      {children}
    </div>
  );
}

function Card({ title, children, className = "" }: any) {
  return (
    <div className={`rounded-xl border border-border p-5 bg-card ${className}`} style={{ boxShadow: "var(--shadow-elegant)" }}>
      <h2 className="text-sm font-semibold mb-4">{title}</h2>
      {children}
    </div>
  );
}

function DeltaBadge({ current, previous, kind }: { current: number; previous: number | undefined; kind: "expense" | "income" }) {
  if (previous === undefined || previous === 0) {
    return <span className="w-16 text-right text-[10px] text-muted-foreground/60">—</span>;
  }
  const diff = current - previous;
  const pct = (diff / previous) * 100;
  if (Math.abs(pct) < 2) {
    return <span className="w-16 text-right text-[10px] text-muted-foreground" title={`vs mês anterior: ${pct.toFixed(0)}%`}>━ 0%</span>;
  }
  const up = pct > 0;
  // For expenses: up is bad (red), down is good (green). For income: inverse.
  const good = kind === "expense" ? !up : up;
  const color = good ? "oklch(0.65 0.18 155)" : "oklch(0.65 0.22 22)";
  const arrow = up ? "▲" : "▼";
  return (
    <span className="w-16 text-right text-[10px] font-semibold tabular-nums" style={{ color }} title={`Mês anterior: ${previous.toFixed(2)}`}>
      {arrow} {up ? "+" : ""}{pct.toFixed(0)}%
    </span>
  );
}
