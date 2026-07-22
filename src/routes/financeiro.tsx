import { createFileRoute } from "@tanstack/react-router";
import { ProtectedShell } from "@/components/ProtectedShell";
import { useTransactions, useCategories, usePeople, useAccounts, useInstallments, useCards } from "@/lib/queries";
import { brl, fmtDate } from "@/lib/format";
import { useMemo, useState, useEffect } from "react";
import { TrendingUp, TrendingDown, Wallet, Calendar, Users, ArrowUpRight, Search, Scale, Undo2, CreditCard, ChevronDown, ChevronRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { personColor } from "@/lib/people";
import { motion } from "framer-motion";
import { CountUp } from "@/components/CountUp";
import { KpiTile } from "@/components/KpiTile";
import { PageHeader } from "@/components/PageHeader";

export const Route = createFileRoute("/financeiro")({
  component: () => <ProtectedShell><FinanceiroPage /></ProtectedShell>,
  head: () => ({ meta: [{ title: "Financeiro — Gestão Família" }] }),
});

const MESES = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];

type KindFilter = "all" | "income" | "expense";

function colorFromString(s: string): string {
  let h = 0;
  for (let i = 0; i < (s || "").length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `oklch(0.7 0.18 ${h % 360})`;
}

function FinanceiroPage() {
  const { data: tx = [] } = useTransactions();
  const { data: cats = [] } = useCategories();
  const { data: people = [] } = usePeople();
  const { data: accounts = [] } = useAccounts();
  const { data: installments = [] } = useInstallments();
  const { data: cards = [] } = useCards();

  const now = new Date();
  // Defaults = primeira opção ("all"). Persistido por página para não resetar ao trocar de aba.
  const ls = (k: string, d: string) => (typeof window !== "undefined" ? window.localStorage.getItem(k) ?? d : d);
  const [selM, setSelM] = useState<number | "all">(() => {
    const raw = ls("fin:selM", "all");
    return raw === "all" ? "all" : Number(raw);
  });
  const [selY, setSelY] = useState<number | "all">(() => {
    const raw = ls("fin:selY", "all");
    return raw === "all" ? "all" : Number(raw);
  });
  const [kindFilter, setKindFilter] = useState<KindFilter>(() => (ls("fin:kind", "all") as KindFilter));
  const [personFilter, setPersonFilter] = useState<string>(() => ls("fin:person", "all"));
  const [statusFilter, setStatusFilter] = useState<"all" | "paid" | "pending">(() => ls("fin:status", "all") as any);
  const [search, setSearch] = useState<string>(() => ls("fin:search", ""));
  const [openCat, setOpenCat] = useState<{ kind: "income" | "expense"; categoryId: string | null; name: string; icon: string } | null>(null);
  const [openKpi, setOpenKpi] = useState<null | "receitas" | "despesas" | "balanco" | "paid" | "pending">(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("fin:selM", String(selM));
    window.localStorage.setItem("fin:selY", String(selY));
    window.localStorage.setItem("fin:kind", kindFilter);
    window.localStorage.setItem("fin:person", personFilter);
    window.localStorage.setItem("fin:status", statusFilter);
    window.localStorage.setItem("fin:search", search);
  }, [selM, selY, kindFilter, personFilter, statusFilter, search]);

  const catMap = useMemo(() => Object.fromEntries(cats.map((c: any) => [c.id, c])), [cats]);
  const accMap = useMemo(() => Object.fromEntries(accounts.map((a: any) => [a.id, a])), [accounts]);

  // Mescla lançamentos (transactions) + parcelas de cartão (card_installments).
  // Cada parcela vira uma "despesa" virtual com origem no cartão, evitando depender
  // de lançamentos manuais de fatura. Excluímos transactions com card_installment_id
  // (pagamentos de fatura) para não duplicar.
  const cardMap = useMemo(() => Object.fromEntries(cards.map((c: any) => [c.id, c])), [cards]);
  const merged = useMemo(() => {
    // Para despesas, "person" representa quem efetivamente arcou com o custo
    // (paid_by sobrescreve person quando alguém pagou por outra pessoa).
    const fromTx = tx.filter((t: any) => !t.card_installment_id).map((t: any) => ({
      ...t,
      person: t.kind === "expense" && t.paid_by ? t.paid_by : t.person,
      _debtPerson: t.person,
    }));
    const fromCards = installments.map((i: any) => {
      const p = i.card_purchases || {};
      const card = cardMap[i.card_id] || i.cards || {};
      const costOwner = i.paid_by || p.person || "—";
      return {
        id: `inst::${i.id}`,
        kind: "expense",
        amount: Number(i.amount),
        due_at: i.due_at,
        posted_at: p.purchase_date || i.due_at,
        status: i.status === "paid" ? "paid" : "pending",
        person: costOwner,
        _debtPerson: p.person || "—",
        category_id: p.category_id || null,
        categories: p.categories || null,
        description: `${p.description || "Compra cartão"}${p.installments_count > 1 ? ` (${i.installment_number}/${p.installments_count})` : ""}`,
        notes: card.name ? `Cartão ${card.name}` : "Cartão",
        account_id: null,
        _isCard: true,
        _originalItem: i, // Preserva o objeto original com card_purchases, etc.
      };
    });
    return [...fromTx, ...fromCards];
  }, [tx, installments, cardMap]);

  // Divide despesas "Família" em 50% Lorran + 50% Tayane (mantendo person="Família").
  const baseTx = useMemo(
    () =>
      merged.flatMap((t: any) => {
        if (t.kind === "expense" && t.person === "Família") {
          const half = Number(t.amount) / 2;
          return [
            { ...t, id: `${t.id}::L`, person: "Família", _owner: "Lorran", amount: half, _familiaSplit: true, _origId: t.id, _originalItem: t._originalItem },
            { ...t, id: `${t.id}::T`, person: "Família", _owner: "Tayane", amount: half, _familiaSplit: true, _origId: t.id, _originalItem: t._originalItem },
          ];
        }
        return [t];
      }),
    [merged],
  );

  // Lista filtrada (despesa + receita conforme filtro)
  // Quando filtrar por "Família", mostramos os lançamentos originais com valor cheio.
  // Nos demais casos usamos baseTx (com split 50/50 de Família p/ Lorran e Tayane).
  const lista = useMemo(() => {
    const source = personFilter === "Família" ? merged : baseTx;
    return source
      .filter((t: any) => kindFilter === "all" || t.kind === kindFilter)
      .filter((t: any) => {
        if (selM === "all" && selY === "all") return true;
        const d = new Date(t.due_at + "T00:00:00");
        if (selM !== "all" && d.getMonth() !== selM) return false;
        if (selY !== "all" && d.getFullYear() !== selY) return false;
        return true;
      })
      .filter((t: any) => personFilter === "all" || (t._owner || t.person) === personFilter)
      .filter((t: any) => statusFilter === "all" || t.status === statusFilter)
      .filter((t: any) =>
        !search.trim() || (t.description || "").toLowerCase().includes(search.toLowerCase()),
      );
  }, [merged, baseTx, kindFilter, selM, selY, personFilter, statusFilter, search]);


  const receitas = lista.filter((t: any) => t.kind === "income");
  const despesas = lista.filter((t: any) => t.kind === "expense");

  const totalReceita = receitas.reduce((s: number, t: any) => s + Number(t.amount), 0);
  const totalDespesa = despesas.reduce((s: number, t: any) => s + Number(t.amount), 0);
  const balanco = totalReceita - totalDespesa;
  const totalPago = lista.filter((t: any) => t.status === "paid").reduce((s: number, t: any) => s + Number(t.amount), 0);
  const totalPendente = lista.reduce((s: number, t: any) => s + Number(t.amount), 0) - totalPago;

  // Por categoria — separado receita / despesa
  const buildByCat = (arr: any[], kind: "income" | "expense") => {
    const m: Record<string, any> = {};
    for (const t of arr) {
      const c = (t.category_id ? catMap[t.category_id] : null) || { name: "Sem categoria", icon: "💰" };
      const k = t.category_id || "none";
      if (!m[k]) {
        m[k] = { 
          id: t.category_id || null, 
          name: c.name, 
          icon: c.icon || "💰", 
          value: 0, 
          count: 0,
          manual: 0,
          card: 0,
          manualItems: [],
          cardItems: [],
          kind
        };
      }
      const val = Number(t.amount);
      m[k].value += val;
      m[k].count += 1;
      
      if (t._isCard) {
        m[k].card += val;
        m[k].cardItems.push({ 
          inst: t._originalItem || t, // Mantemos o item original com suas relações
          share: val 
        });
      } else {
        m[k].manual += val;
        m[k].manualItems.push({ tx: t, share: val });
      }
    }
    return Object.values(m).sort((a: any, b: any) => b.value - a.value);
  };
  const catReceitas = useMemo(() => buildByCat(receitas, "income"), [receitas, catMap]);
  const catDespesas = useMemo(() => buildByCat(despesas, "expense"), [despesas, catMap]);

  // Por pessoa (com receita / despesa / saldo)
  const byPerson = useMemo(() => {
    const m: Record<string, { receita: number; despesa: number }> = {};
    for (const t of lista) {
      const p = t._owner || t.person || "—";
      if (!m[p]) m[p] = { receita: 0, despesa: 0 };
      if (t.kind === "income") m[p].receita += Number(t.amount);
      else m[p].despesa += Number(t.amount);
    }
    return Object.entries(m)
      .map(([person, v]) => ({ person, ...v, saldo: v.receita - v.despesa }))
      .sort((a, b) => (b.receita + b.despesa) - (a.receita + a.despesa));
  }, [lista]);

  // Evolução mensal: receita vs despesa vs balanço
  const yearData = useMemo(() => {
    const year = selY === "all" ? now.getFullYear() : selY;
    const arr = MESES.map((m) => ({ mes: m, receita: 0, despesa: 0, balanco: 0 }));
    baseTx.forEach((t: any) => {
      const d = new Date(t.due_at + "T00:00:00");
      if (d.getFullYear() !== year) return;
      if (personFilter !== "all" && (t._owner || t.person) !== personFilter) return;
      const idx = d.getMonth();
      if (t.kind === "income") arr[idx].receita += Number(t.amount);
      else if (t.kind === "expense") arr[idx].despesa += Number(t.amount);
    });
    arr.forEach((r) => { r.balanco = r.receita - r.despesa; });
    return arr;
  }, [baseTx, selY, personFilter]);

  const years = useMemo(() => {
    const s = new Set<number>();
    baseTx.forEach((t: any) => s.add(new Date(t.due_at + "T00:00:00").getFullYear()));
    s.add(now.getFullYear());
    return Array.from(s).sort((a, b) => b - a);
  }, [baseTx]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
      {/* Header */}
      <PageHeader
        icon={Scale}
        eyebrow="Análise"
        title="Financeiro"
        subtitle="Controle detalhado de receitas e despesas"
      />


      {/* Filters */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {(() => {
          const active = "border-primary ring-2 ring-primary/30 bg-primary/5";
          const nowM = new Date().getMonth();
          const nowY = new Date().getFullYear();
          return (
            <>
              <Select value={kindFilter} onValueChange={(v) => setKindFilter(v as KindFilter)}>
                <SelectTrigger className={kindFilter !== "all" ? active : ""}><SelectValue placeholder="Tipo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Receita + Despesa</SelectItem>
                  <SelectItem value="income">Apenas Receita</SelectItem>
                  <SelectItem value="expense">Apenas Despesa</SelectItem>
                </SelectContent>
              </Select>
              <Select value={String(selM)} onValueChange={(v) => setSelM(v === "all" ? "all" : Number(v))}>
                <SelectTrigger className={selM !== "all" ? active : ""}><SelectValue placeholder="Mês" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos meses</SelectItem>
                  {MESES.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={String(selY)} onValueChange={(v) => setSelY(v === "all" ? "all" : Number(v))}>
                <SelectTrigger className={selY !== "all" ? active : ""}><SelectValue placeholder="Ano" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos anos</SelectItem>
                  {years.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={personFilter} onValueChange={setPersonFilter}>
                <SelectTrigger className={personFilter !== "all" ? active : ""}><SelectValue placeholder="Pessoa" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas pessoas</SelectItem>
                  {people.map((p: any) => <SelectItem key={p.id} value={p.name}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger className={statusFilter !== "all" ? active : ""}><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos status</SelectItem>
                  <SelectItem value="paid">Pago / Recebido</SelectItem>
                  <SelectItem value="pending">Pendente</SelectItem>
                </SelectContent>
              </Select>
            </>
          );
        })()}
        <div className="relative col-span-2 sm:col-span-3 lg:col-span-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-9" placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard index={0} icon={<TrendingUp className="w-4 h-4" />} label="Receitas" value={totalReceita} sub={`${receitas.length} entrada(s)`} accent="success" onClick={() => setOpenKpi("receitas")} />
        <KpiCard index={1} icon={<TrendingDown className="w-4 h-4" />} label="Despesas" value={totalDespesa} sub={`${despesas.length} saída(s)`} accent="danger" onClick={() => setOpenKpi("despesas")} />
        <KpiCard index={2} icon={<Scale className="w-4 h-4" />} label="Balanço" value={balanco} accent={balanco >= 0 ? "success" : "danger"} onClick={() => setOpenKpi("balanco")} />
        <KpiCard index={3} icon={<Wallet className="w-4 h-4" />} label="Liquidado" value={totalPago} accent="primary" onClick={() => setOpenKpi("paid")} />
        <KpiCard index={4} icon={<Calendar className="w-4 h-4" />} label="Pendente" value={totalPendente} accent="warning" onClick={() => setOpenKpi("pending")} />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="tech-panel p-5 transition-shadow hover:shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Evolução {selY !== "all" ? selY : now.getFullYear()}</h3>
            <Badge variant="outline" className="text-xs">{personFilter === "all" ? "Todas pessoas" : personFilter}</Badge>
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={yearData}>
              <defs>
                <linearGradient id="finRec" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--success)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="var(--success)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="finDes" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--destructive)" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="var(--destructive)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="mes" stroke="var(--muted-foreground)" fontSize={11} />
              <YAxis stroke="var(--muted-foreground)" fontSize={11} tickFormatter={(v) => `R$${Math.round(v)}`} />
              <Tooltip
                contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--foreground)" }}
                formatter={(v: any) => brl(Number(v))}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Area type="monotone" name="Receita" dataKey="receita" stroke="var(--success)" strokeWidth={2.5} fill="url(#finRec)" />
              <Area type="monotone" name="Despesa" dataKey="despesa" stroke="var(--destructive)" strokeWidth={2.5} fill="url(#finDes)" />
              <Area type="monotone" name="Balanço" dataKey="balanco" stroke="var(--primary)" strokeWidth={2} fill="none" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="tech-panel p-5 transition-shadow hover:shadow-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Por pessoa</h3>
            <Badge variant="outline" className="text-xs">{byPerson.length} pessoa(s)</Badge>
          </div>
          {byPerson.length === 0 ? (
            <div className="text-sm text-muted-foreground h-[240px] grid place-items-center">Sem dados no período</div>
          ) : (
            <div className="space-y-3 max-h-[240px] overflow-auto pr-1">
              {byPerson.map((p) => {
                const color = personColor(p.person) || colorFromString(p.person);
                const initials = (p.person || "—").split(" ").map((s) => s[0]).slice(0, 2).join("").toUpperCase();
                return (
                  <div key={p.person} className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-sm" style={{ background: color }}>
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <span className="font-medium text-sm truncate">{p.person}</span>
                        <span className={`text-sm font-semibold tabular-nums ${p.saldo >= 0 ? "text-success" : "text-destructive"}`}>{brl(p.saldo)}</span>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground tabular-nums">
                        <span className="text-success">↑ {brl(p.receita)}</span>
                        <span className="text-destructive">↓ {brl(p.despesa)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Por categoria — duas colunas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <CategoryCard
          title="Receitas por categoria"
          icon="💰"
          data={catReceitas}
          total={totalReceita}
          tone="success"
          onSelect={(c) => setOpenCat({ kind: "income", categoryId: c.id, name: c.name, icon: c.icon })}
        />
        <CategoryCard
          title="Despesas por categoria"
          icon="💸"
          data={catDespesas}
          total={totalDespesa}
          tone="danger"
          onSelect={(c) => setOpenCat({ kind: "expense", categoryId: c.id, name: c.name, icon: c.icon })}
        />
      </div>

      {/* Drill-down dialog (Padronizado com o Dashboard) */}
      <Dialog open={!!openCat} onOpenChange={(o) => !o && setOpenCat(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader className="flex flex-row items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-2xl shrink-0 border border-primary/20">
              {openCat?.icon}
            </div>
            <div>
              <DialogTitle className="text-xl flex items-center gap-2">
                {openCat?.name}
                <Badge variant={openCat?.kind === "income" ? "secondary" : "destructive"} className="ml-1 uppercase tracking-tighter text-[10px]">
                  {openCat?.kind === "income" ? "Receitas" : "Despesas"}
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs">Detalhamento da categoria no período selecionado</DialogDescription>
            </div>
          </DialogHeader>

          {openCat && <CategoryDetail cat={openCat} cardsById={new Map(cards.map(c => [c.id, c]))} />}
        </DialogContent>
      </Dialog>

      {/* Drill-down unificado por KPI (Receitas, Despesas, Balanço, Liquidado, Pendente) */}
      <Dialog open={openKpi !== null} onOpenChange={(o) => !o && setOpenKpi(null)}>
        <DialogContent className="max-w-3xl">
          {(() => {
            const cfg = {
              receitas: { title: "Histórico de receitas", icon: <TrendingUp className="w-5 h-5 text-success" />, filter: (t: any) => t.kind === "income" },
              despesas: { title: "Histórico de despesas", icon: <TrendingDown className="w-5 h-5 text-destructive" />, filter: (t: any) => t.kind === "expense" },
              balanco:  { title: "Histórico do balanço", icon: <Scale className="w-5 h-5 text-primary" />, filter: (_t: any) => true },
              paid:     { title: "Histórico de liquidados", icon: <Wallet className="w-5 h-5 text-primary" />, filter: (t: any) => t.status === "paid" },
              pending:  { title: "Histórico de pendentes", icon: <Calendar className="w-5 h-5 text-warning" />, filter: (t: any) => t.status !== "paid" },
            } as const;
            const c = openKpi ? cfg[openKpi] : null;
            const items = c
              ? lista.filter(c.filter).slice().sort((a: any, b: any) => (a.due_at < b.due_at ? 1 : -1))
              : [];
            const rec = items.filter((t: any) => t.kind === "income").reduce((s: number, t: any) => s + Number(t.amount), 0);
            const des = items.filter((t: any) => t.kind === "expense").reduce((s: number, t: any) => s + Number(t.amount), 0);
            const tot = openKpi === "balanco" ? rec - des : rec + des;
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 flex-wrap">
                    {c?.icon} {c?.title}
                  </DialogTitle>
                </DialogHeader>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg border bg-muted/30 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</div>
                    <div className={`text-lg font-bold tabular-nums ${openKpi === "balanco" ? (tot >= 0 ? "text-success" : "text-destructive") : ""}`}>{brl(tot)}</div>
                  </div>
                  <div className="rounded-lg border bg-success/5 border-success/20 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-success">Receita</div>
                    <div className="text-lg font-bold tabular-nums text-success">{brl(rec)}</div>
                  </div>
                  <div className="rounded-lg border bg-destructive/5 border-destructive/20 p-3">
                    <div className="text-[10px] uppercase tracking-wider text-destructive">Despesa</div>
                    <div className="text-lg font-bold tabular-nums text-destructive">{brl(des)}</div>
                  </div>
                </div>
                <div className="text-sm text-muted-foreground">{items.length} registro(s)</div>
                <div className="max-h-[55vh] overflow-auto rounded-lg border">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50 text-muted-foreground sticky top-0">
                      <tr className="text-left">
                        <th className="px-3 py-2 font-medium">Data</th>
                        <th className="px-3 py-2 font-medium">Tipo</th>
                        <th className="px-3 py-2 font-medium">Descrição</th>
                        <th className="px-3 py-2 font-medium">Pessoa</th>
                        <th className="px-3 py-2 font-medium">Status</th>
                        <th className="px-3 py-2 font-medium text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.length === 0 && (
                        <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Nenhum registro.</td></tr>
                      )}
                      {items.map((t: any) => {
                        const isIncome = t.kind === "income";
                        return (
                          <tr key={t.id} className="border-t">
                            <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{fmtDate(t.due_at)}</td>
                            <td className="px-3 py-2">{isIncome ? "Receita" : "Despesa"}</td>
                            <td className="px-3 py-2">{t.description || "—"}{t.notes ? <div className="text-xs text-muted-foreground">{t.notes}</div> : null}</td>
                            <td className="px-3 py-2">{t.person || "—"}</td>
                            <td className="px-3 py-2">{t.status === "paid" ? (isIncome ? "Recebido" : "Pago") : "Pendente"}</td>
                            <td className={`px-3 py-2 text-right font-semibold tabular-nums ${isIncome ? "text-success" : "text-destructive"}`}>
                              {isIncome ? "+" : "−"} {brl(Number(t.amount))}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>


      {/* Lista detalhada */}

      <div className="tech-panel overflow-hidden">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="font-semibold flex items-center gap-2"><Users className="w-4 h-4" /> Lançamentos detalhados</h3>
          <Badge variant="secondary">{lista.length} registro(s)</Badge>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr className="text-left">
                <th className="px-4 py-3 font-medium">Data</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 font-medium">Descrição</th>
                <th className="px-4 py-3 font-medium">Categoria</th>
                <th className="px-4 py-3 font-medium">Pessoa</th>
                <th className="px-4 py-3 font-medium">Conta</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {lista.length === 0 && (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">Nenhum lançamento encontrado com esses filtros.</td></tr>
              )}
              {lista.map((t: any) => {
                const cat = catMap[t.category_id];
                const acc = accMap[t.account_id];
                const isIncome = t.kind === "income";
                const isRefund = !isIncome && Number(t.amount) < 0;
                return (
                  <tr key={t.id} className={`border-t hover:bg-muted/30 transition-colors ${isRefund ? "bg-warning/5" : ""}`}>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{fmtDate(t.due_at)}</td>
                    <td className="px-4 py-3">
                      {isIncome ? (
                        <Badge className="bg-success/15 text-success border-success/30 hover:bg-success/20"><ArrowUpRight className="w-3 h-3 mr-1" />Receita</Badge>
                      ) : isRefund ? (
                        <Badge className="bg-warning/15 text-warning border-warning/30 hover:bg-warning/20"><Undo2 className="w-3 h-3 mr-1" />Estorno</Badge>
                      ) : (
                        <Badge className="bg-destructive/15 text-destructive border-destructive/30 hover:bg-destructive/20"><TrendingDown className="w-3 h-3 mr-1" />Despesa</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3 font-medium">{t.description || "—"}{t.notes ? <div className="text-xs text-muted-foreground">{t.notes}</div> : null}</td>
                    <td className="px-4 py-3">{cat ? <span className="inline-flex items-center gap-1"><span>{cat.icon}</span>{cat.name}</span> : "—"}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full" style={{ background: personColor(t.person) || colorFromString(t.person || "") }} />
                        {t.person || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{acc ? acc.name || acc.bank : "—"}</td>
                    <td className="px-4 py-3">
                      {t.status === "paid" ? (
                        <Badge className="bg-success/15 text-success border-success/30 hover:bg-success/20">{isIncome ? "Recebido" : "Pago"}</Badge>
                      ) : (
                        <Badge variant="outline" className="text-warning border-warning/40">Pendente</Badge>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-right font-semibold tabular-nums ${isIncome ? "text-success" : isRefund ? "text-warning" : "text-destructive"}`}>
                      {isIncome ? "+" : isRefund ? "" : "−"} {brl(Number(t.amount))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {lista.length > 0 && (
              <tfoot>
                <tr className="border-t bg-muted/30 font-semibold">
                  <td colSpan={7} className="px-4 py-3 text-right">Balanço</td>
                  <td className={`px-4 py-3 text-right tabular-nums ${balanco >= 0 ? "text-success" : "text-destructive"}`}>{brl(balanco)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
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
          <div className="text-sm font-semibold tabular-nums text-foreground">{brl(cat.card || 0)}</div>
        </div>
        <div className="rounded-xl border border-border/60 bg-background/40 backdrop-blur px-3 py-2">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground flex items-center gap-1"><Wallet className="w-3 h-3" /> Manual</div>
          <div className="text-sm font-semibold tabular-nums text-foreground">{brl(cat.manual || 0)}</div>
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
          <span className="tabular-nums font-semibold">{brl(cat.card || 0)}</span>
        </button>
        {showCard && (
          cardItems.length === 0 ? (
            <div className="text-xs text-muted-foreground p-4 text-center border-t border-border/60">Nenhuma compra no cartão para esta categoria.</div>
          ) : (
            <div className="overflow-x-auto border-t border-border/60">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/20 text-muted-foreground">
                  <tr>
                    <th className="p-2 font-medium">Data</th>
                    <th className="p-2 font-medium">Descrição</th>
                    <th className="p-2 font-medium">Cartão</th>
                    <th className="p-2 font-medium">Parcela</th>
                    <th className="p-2 font-medium">Pessoa</th>
                    <th className="p-2 text-right font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {cardItems.map(({ inst, share }: any) => {
                    const cp = inst.card_purchases || {};
                    const card = inst.cards || cardsById.get(inst.card_id) || {};
                    return (
                      <tr key={inst.id} className="border-t border-border/60 hover:bg-muted/20">
                        <td className="p-2 whitespace-nowrap text-muted-foreground">{fmtDate(inst.due_at)}</td>
                        <td className="p-2">
                          <div className="font-medium truncate max-w-[150px]">{cp.description ?? "—"}</div>
                          {cp.purchase_date && <div className="text-[10px] text-muted-foreground">Compra: {fmtDate(cp.purchase_date)}</div>}
                        </td>
                        <td className="p-2 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full" style={{ background: card.color || "#6366f1" }} />
                            {card.name ?? "—"}
                          </span>
                        </td>
                        <td className="p-2 whitespace-nowrap text-muted-foreground">{inst.installment_number}/{cp.installments_count ?? "?"}</td>
                        <td className="p-2 whitespace-nowrap">{cp.person || inst.person || "—"}</td>
                        <td className="p-2 text-right tabular-nums font-medium">{brl(share)}</td>
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
          <span className="tabular-nums font-semibold">{brl(cat.manual || 0)}</span>
        </button>
        {showManual && (
          manualItems.length === 0 ? (
            <div className="text-xs text-muted-foreground p-4 text-center border-t border-border/60">Nenhum lançamento manual para esta categoria.</div>
          ) : (
            <div className="overflow-x-auto border-t border-border/60">
              <table className="w-full text-xs text-left">
                <thead className="bg-muted/20 text-muted-foreground">
                  <tr>
                    <th className="p-2 font-medium">Data</th>
                    <th className="p-2 font-medium">Descrição</th>
                    <th className="p-2 font-medium">Pessoa</th>
                    <th className="p-2 font-medium">Status</th>
                    <th className="p-2 font-medium">Observações</th>
                    <th className="p-2 text-right font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {manualItems.map(({ tx, share }: any) => (
                    <tr key={tx.id} className="border-t border-border/60 hover:bg-muted/20">
                      <td className="p-2 whitespace-nowrap text-muted-foreground">{fmtDate(tx.due_at)}</td>
                      <td className="p-2 font-medium truncate max-w-[150px]">{tx.description}</td>
                      <td className="p-2 whitespace-nowrap">{tx.person ?? "—"}</td>
                      <td className="p-2 whitespace-nowrap">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${tx.status === "paid" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                          {tx.status === "paid" ? "Pago" : "Pendente"}
                        </span>
                      </td>
                      <td className="p-2 max-w-[150px] truncate text-muted-foreground" title={tx.notes ?? ""}>{tx.notes ?? "—"}</td>
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

type CatItem = { 
  id: string | null; 
  name: string; 
  icon: string; 
  value: number; 
  count: number; 
  manual: number; 
  card: number; 
  manualItems: any[]; 
  cardItems: any[]; 
  kind: "income" | "expense" 
};

function CategoryCard({ title, icon, data, total, tone, onSelect }: { title: string; icon: string; data: CatItem[]; total: number; tone: "success" | "danger"; onSelect?: (c: CatItem) => void }) {
  const barColor = tone === "success" ? "var(--success)" : "var(--destructive)";
  return (
    <div className="tech-panel p-5">
      <h3 className="font-semibold mb-4 flex items-center gap-2"><span className="text-lg">{icon}</span> {title}</h3>
      {data.length === 0 ? (
        <div className="text-sm text-muted-foreground py-6 text-center">Nenhum dado no período.</div>
      ) : (
        <div className="space-y-2 max-h-[280px] overflow-auto pr-1">
          {data.map((c) => {
            const pct = total > 0 ? (c.value / total) * 100 : 0;
            return (
              <button
                type="button"
                key={c.name}
                onClick={() => onSelect?.(c)}
                className="w-full text-left group rounded-md p-1 -m-1 hover:bg-muted/40 transition-colors cursor-pointer"
              >
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-base">{c.icon}</span>
                    <span className="font-medium truncate">{c.name}</span>
                    <span className="text-xs text-muted-foreground shrink-0">({c.count})</span>
                  </span>
                  <span className="font-semibold tabular-nums shrink-0">{brl(c.value)} <span className="text-xs text-muted-foreground">· {pct.toFixed(1)}%</span></span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-500 group-hover:opacity-80" style={{ width: `${pct}%`, background: barColor }} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, sub, accent, index = 0, onClick }: { icon: React.ReactNode; label: string; value: number; sub?: string; accent?: "primary" | "success" | "warning" | "danger"; index?: number; onClick?: () => void }) {
  const tone =
    accent === "primary" ? "text-primary" :
    accent === "success" ? "text-success" :
    accent === "warning" ? "text-warning" :
    accent === "danger" ? "text-destructive" :
    "text-foreground";
  return <KpiTile icon={icon} label={label} value={value} sub={sub} tone={tone} index={index} onClick={onClick} />;
}



