import { createFileRoute } from "@tanstack/react-router";
import { DatePicker, MonthPicker } from "@/components/date-picker";
import { ProtectedShell } from "@/components/ProtectedShell";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { brl } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Minus, Pencil, Trash2, Landmark, TrendingUp, Calendar, ChevronDown, ChevronUp, Wallet } from "lucide-react";
import { BANKS } from "@/lib/banks";

import { useState, useMemo } from "react";
import { toast } from "sonner";
import { useInvalidate, useTransactions, useInstallments } from "@/lib/queries";
import { useAdjustments, groupAdjustments, effectiveShares } from "@/lib/adjustments";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { isFamilia } from "@/lib/people";
import { BankIcon } from "@/components/BankIcon";
import { motion } from "framer-motion";
import { CountUp } from "@/components/CountUp";
import { KpiTile } from "@/components/KpiTile";
import { PageHeader } from "@/components/PageHeader";

function parseLocalDate(s: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || "");
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  return new Date(s);
}

const roundMoney = (value: number) => Math.round(value * 100) / 100;
void roundMoney;


export const Route = createFileRoute("/conta")({
  component: () => <ProtectedShell><ContaPage /></ProtectedShell>,
  head: () => ({ meta: [{ title: "Contas — Gestão Família" }] }),
});

function ContaPage() {
  const invalidate = useInvalidate();
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));

  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contas").select("*").order("bank");
      if (error) throw error;
      return data;
    },
  });

  const { data: tx = [] } = useTransactions();
  const { data: inst = [] } = useInstallments();
  const { data: adjustments = [] } = useAdjustments();
  const adjMap = useMemo(() => groupAdjustments(adjustments), [adjustments]);

  const { data: yields = [] } = useQuery({
    queryKey: ["account_yields"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("conta_rendimentos")
        .select("*, contas(bank, account_name)")
        .order("date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const norm = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

  // Cálculo dinâmico de saldo por pessoa para reconciliar com o Dashboard
  const dynamicBalances = useMemo(() => {
    const personFactor = (personFilter: string, targetPerson?: string | null): number => {
      const nrm = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      const sel = nrm(personFilter);
      const item = nrm(targetPerson || "");
      
      if (isFamilia(targetPerson)) {
        if (sel === "lorran" || sel === "tayane") return 0.5;
        if (sel === "familia") return 1;
        return 0;
      }
      return sel === item ? 1 : 0;
    };

    const calcFor = (person: string) => {
      const receitas = tx
        .filter((t: any) => t.kind === "income" && t.status === "paid" && !t.card_installment_id)
        .reduce((s: number, t: any) => s + effectiveShares(t, adjMap).reduce((acc, sh) => acc + sh.amount * personFactor(person, sh.person), 0), 0);
      
      const despesas = tx
        .filter((t: any) => t.kind === "expense" && t.status === "paid" && t.category_id !== "0494a63e-6737-4a3c-8778-67ce5f96a0a1" && !t.card_installment_id)
        .reduce((s: number, t: any) => s + effectiveShares(t, adjMap).reduce((acc, sh) => acc + sh.amount * personFactor(person, sh.person), 0), 0);
      
      const parcelas = inst
        .filter((i: any) => i.status === "paid" || Number(i.paid_amount || 0) > 0)
        .reduce((s: number, i: any) => s + Number(i.amount) * personFactor(person, i.cartao_compras?.person), 0);
      
      return receitas - despesas - parcelas;
    };

    return {
      lorran: calcFor("Lorran"),
      tayane: calcFor("Tayane"),
    };
  }, [tx, inst, adjMap]);
  
  const lorranAccounts = accounts.filter(acc => {
    const combined = norm(acc.bank || "") + " " + norm(acc.account_name || "");
    return combined.includes("revolut") || combined.includes("lorran");
  });
  const tayaneAccounts = accounts.filter(acc => {
    const combined = norm(acc.bank || "") + " " + norm(acc.account_name || "");
    return combined.includes("tayane");
  });
  const otherAccounts = accounts.filter(acc => !lorranAccounts.includes(acc) && !tayaneAccounts.includes(acc));

  // Usa o saldo real das contas cadastradas conforme solicitado
  const reconciledLorranAccounts = lorranAccounts;
  const reconciledTayaneAccounts = tayaneAccounts;

  const totalBalance = accounts.reduce((sum: number, acc: any) => sum + Number(acc.balance), 0);

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta conta?")) return;
    const { error } = await supabase.from("contas").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Conta removida");
      invalidate("accounts");
    }
  };

  const AccountSection = ({ title, list, icon: Icon }: any) => (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold flex items-center gap-2 px-1">
        <Icon className="w-5 h-5 text-primary" />
        {title}
      </h2>
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map((acc: any) => (
          <AccountCard 
            key={acc.id} 
            acc={acc} 
            yields={yields.filter((y: any) => y.account_id === acc.id)}
            onEdit={() => setEditing(acc)}
            onDelete={() => handleDelete(acc.id)}
            onRefresh={() => {
              invalidate("contas");
              invalidate("conta_rendimentos");
            }}
          />
        ))}
        {list.length === 0 && (
          <div className="col-span-full py-8 text-center border border-dashed border-border rounded-xl text-muted-foreground text-sm">
            Nenhuma conta nesta seção.
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      <PageHeader
        icon={Landmark}
        eyebrow="Patrimônio"
        title="Minhas Contas"
        subtitle="Saldos individuais e familiares"
        actions={
          <>
            <div className="text-right pr-2 border-r border-border/60">
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold">Saldo Total</div>
              <div className="text-2xl font-black text-primary"><CountUp value={totalBalance} format={brl} /></div>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="rounded-full shadow-md"><Plus className="w-4 h-4 mr-1" /> Nova conta</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Cadastrar conta</DialogTitle></DialogHeader>
                <AccountForm onDone={() => { setOpen(false); invalidate("accounts"); }} />
              </DialogContent>
            </Dialog>
          </>
        }
      />


      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiTile index={0} tone="text-primary" icon={<Landmark className="w-4 h-4" />} label="Saldo em Bancos" value={totalBalance} sub="Total somado de todas as contas" />

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
          whileHover={{ y: -4, transition: { duration: 0.2 } }}
          className="relative overflow-hidden rounded-2xl border border-border/60 p-5 group"
          style={{ background: "var(--gradient-card)", boxShadow: "var(--shadow-elegant)" }}
        >
          <div className="flex items-start justify-between relative">
            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Rendimento no Mês</span>
              </div>
              <div className="text-2xl font-bold tabular-nums text-success">
                <CountUp value={yields
                  .filter(y => {
                    const d = parseLocalDate(y.date);
                    const [year, month] = selectedMonth.split('-').map(Number);
                    return d.getMonth() === month - 1 && d.getFullYear() === year;
                  })
                  .reduce((s, y) => s + Number(y.amount), 0)} format={brl} />
              </div>
            </div>
            <div className="relative rounded-xl bg-background/60 backdrop-blur border border-border/50 text-success group-hover:scale-110 transition-transform" title="Selecionar mês">
              <MonthPicker value={selectedMonth} onChange={(v) => setSelectedMonth(v)} iconOnly />
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border/50 relative">
            {format(new Date(selectedMonth + "-01T12:00:00"), "MMMM 'de' yyyy", { locale: ptBR })}
          </div>
        </motion.div>

        <KpiTile index={2} tone="text-blue-600" icon={<TrendingUp className="w-4 h-4" />} label="Rendimentos Totais" value={yields.reduce((s, y) => s + Number(y.amount), 0)} sub="Total acumulado histórico" />
        <KpiTile index={3} tone="text-orange-600" icon={<Wallet className="w-4 h-4" />} label="Patrimônio Líquido" value={totalBalance} sub="Saldo total disponível agora" />
      </div>


      <div className="space-y-10">
        <AccountSection title="Contas Lorran" list={reconciledLorranAccounts} icon={Landmark} />
        <AccountSection title="Contas Tayane" list={reconciledTayaneAccounts} icon={Landmark} />
        {otherAccounts.length > 0 && (
          <AccountSection title="Outras Contas" list={otherAccounts} icon={Landmark} />
        )}

        <div className="space-y-4 pt-6 border-t border-border/50">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="text-xl font-bold flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-green-500" />
              Histórico Global de Rendimentos
            </h2>
            <div className="flex items-center gap-2 bg-muted/50 p-1 rounded-lg border border-border">
              <span className="text-[10px] uppercase font-bold px-2 text-muted-foreground">Filtrar mês:</span>
              <MonthPicker value={selectedMonth} onChange={(v) => setSelectedMonth(v)} />
              <Button 
                variant="ghost" 
                size="sm" 
                className="h-7 text-[10px] uppercase font-bold"
                onClick={() => setSelectedMonth(format(new Date(), "yyyy-MM"))}
              >
                Mês Atual
              </Button>
            </div>
          </div>
          
          <div className="grid gap-3">
            {yields.filter(y => {
              const d = parseLocalDate(y.date);
              const [year, month] = selectedMonth.split('-').map(Number);
              return d.getMonth() === month - 1 && d.getFullYear() === year;
            }).length > 0 ? (
              <div className="tech-panel overflow-hidden">
                <div className="overflow-auto max-h-[260px]">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-muted/50 text-[10px] uppercase tracking-widest font-bold text-muted-foreground sticky top-0 backdrop-blur z-10">
                      <tr>
                        <th className="px-4 py-3">Data</th>
                        <th className="px-4 py-3">Conta</th>
                        <th className="px-4 py-3 text-right">Valor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {yields
                        .filter(y => {
                          const d = parseLocalDate(y.date);
                          const [year, month] = selectedMonth.split('-').map(Number);
                          return d.getMonth() === month - 1 && d.getFullYear() === year;
                        })
                        .map((y: any) => (
                        <tr key={y.id} className="hover:bg-muted/20 transition-colors">
                          <td className="px-4 py-3 whitespace-nowrap">
                            {format(parseLocalDate(y.date), "dd/MM/yyyy", { locale: ptBR })}
                          </td>
                          <td className="px-4 py-3">
                            <div className="font-medium text-xs">{(y.accounts as any)?.bank}</div>
                            <div className="text-[10px] text-muted-foreground">{(y.accounts as any)?.account_name}</div>
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-green-600">
                            {brl(y.amount)}
                          </td>
                        </tr>
                      ))}
                      <tr className="bg-muted/30 font-bold">
                        <td colSpan={2} className="px-4 py-3 text-right uppercase text-[10px] tracking-widest">Total do Mês:</td>
                        <td className="px-4 py-3 text-right text-green-600">
                          {brl(yields
                            .filter(y => {
                              const d = parseLocalDate(y.date);
                              const [year, month] = selectedMonth.split('-').map(Number);
                              return d.getMonth() === month - 1 && d.getFullYear() === year;
                            })
                            .reduce((s, y) => s + Number(y.amount), 0)
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="py-12 text-center border border-dashed border-border rounded-2xl text-muted-foreground text-sm bg-muted/10">
                <Calendar className="w-8 h-8 mx-auto mb-2 opacity-20" />
                Nenhum rendimento registrado em {format(new Date(selectedMonth + "-01T12:00:00"), "MMMM 'de' yyyy", { locale: ptBR })}.
              </div>
            )}
            
            <div className="flex justify-center pt-2">
               <Button 
                variant="link" 
                size="sm" 
                className="text-muted-foreground text-[10px] uppercase tracking-widest"
                onClick={() => {
                  // Mostrar todos (poderia ser um modal ou expandir)
                  toast.info("O filtro acima permite navegar por qualquer mês do histórico.");
                }}
               >
                 Dica: Use o seletor acima para ver outros meses
               </Button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar conta</DialogTitle></DialogHeader>
          {editing && <AccountForm initial={editing} onDone={() => { setEditing(null); invalidate("accounts"); }} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AccountCard({ acc, yields, onEdit, onDelete, onRefresh }: any) {
  const [showYields, setShowYields] = useState(false);
  const [addingYield, setAddingYield] = useState(false);
  const [removingYield, setRemovingYield] = useState(false);
  const [editingYield, setEditingYield] = useState<any>(null);

  const handleDeleteYield = async (yieldItem: any) => {
    if (!confirm("Excluir este rendimento? O saldo será ajustado.")) return;
    try {
      const { error: err1 } = await supabase.from("conta_rendimentos").delete().eq("id", yieldItem.id);
      if (err1) throw err1;

      toast.success("Rendimento removido");
      onRefresh();
    } catch (error: any) {
      toast.error(error.message);
    }
  };




  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm hover:border-primary/40 hover:shadow-md transition-all group overflow-hidden">
      <div className="p-4">
        <div className="flex justify-between items-start gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <BankIcon bank={acc.bank} size={44} square className="rounded-xl shrink-0" />
            <div className="flex flex-col min-w-0">
              <div className="text-sm font-bold text-foreground truncate">{acc.bank}</div>
              <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-widest truncate">{acc.account_name}</div>
            </div>
          </div>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
              <Pencil className="w-3 h-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onDelete}>
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
        </div>
        <div className="text-2xl font-black mt-3 tracking-tight">{brl(acc.balance)}</div>

        
        <div className="mt-4 pt-4 border-t border-border/50">
          <Button 
            variant="ghost" 
            size="sm" 
            className="w-full justify-between h-8 text-xs font-medium text-muted-foreground"
            onClick={() => setShowYields(!showYields)}
          >
            <span className="flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-green-500" />
              Rendimentos ({yields.length})
            </span>
            {showYields ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </Button>

          {showYields && (
            <div className="mt-2 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
              <div className="flex justify-between items-center px-1">
                <span className="text-[10px] text-muted-foreground">Histórico recente</span>
                <div className="flex gap-1">
                  <Button variant="outline" size="icon" className="h-5 w-5 rounded-full" title="Remover valor (consome do mais recente)" onClick={() => setRemovingYield(true)}>
                    <Minus className="w-2.5 h-2.5" />
                  </Button>
                  <Button variant="outline" size="icon" className="h-5 w-5 rounded-full" title="Adicionar rendimento" onClick={() => setAddingYield(true)}>
                    <Plus className="w-2.5 h-2.5" />
                  </Button>
                </div>
              </div>

              
              <div className="space-y-1.5 max-h-[200px] overflow-y-auto pr-1 scroll-smooth">
                {yields.map((y: any) => (
                  <div key={y.id} className="flex items-center justify-between text-xs bg-muted/30 p-2 rounded-md group/item">
                    <div>
                      <div className="font-semibold text-green-600">+{brl(y.amount)}</div>
                      <div className="text-[9px] text-muted-foreground flex items-center gap-1">
                        <Calendar className="w-2 h-2" />
                        {format(parseLocalDate(y.date), "dd MMM", { locale: ptBR })}
                      </div>
                    </div>
                    <div className="flex gap-0.5 opacity-0 group-hover/item:opacity-100">
                      <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setEditingYield(y)}>
                        <Pencil className="w-2.5 h-2.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-5 w-5 text-destructive" onClick={() => handleDeleteYield(y)}>
                        <Trash2 className="w-2.5 h-2.5" />
                      </Button>
                    </div>
                  </div>
                ))}
                {yields.length === 0 && (
                  <div className="text-[10px] text-center py-4 text-muted-foreground">Sem rendimentos registrados</div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <Dialog open={addingYield} onOpenChange={setAddingYield}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader><DialogTitle>Adicionar Rendimento</DialogTitle></DialogHeader>
          <YieldForm accountId={acc.id} onDone={() => { setAddingYield(false); onRefresh(); }} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingYield} onOpenChange={(o) => !o && setEditingYield(null)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader><DialogTitle>Editar Rendimento</DialogTitle></DialogHeader>
          {editingYield && <YieldForm initial={editingYield} accountId={acc.id} onDone={() => { setEditingYield(null); onRefresh(); }} />}
        </DialogContent>
      </Dialog>

      <Dialog open={removingYield} onOpenChange={setRemovingYield}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader><DialogTitle>Remover valor de rendimento</DialogTitle></DialogHeader>
          <RemoveYieldForm yields={yields} onDone={() => { setRemovingYield(false); onRefresh(); }} />
        </DialogContent>
      </Dialog>
    </div>
  );
}


function YieldForm({ accountId, initial, onDone }: { accountId: string; initial?: any; onDone: () => void }) {
  const [amount, setAmount] = useState(initial?.amount ?? "");
  const [date, setDate] = useState(initial?.date ?? format(new Date(), "yyyy-MM-dd"));
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const inputAmount = Number(amount);
      if (!Number.isFinite(inputAmount) || inputAmount <= 0) throw new Error("Informe um valor positivo");

      const yieldId = initial?.id;
      const payload = {
        account_id: accountId,
        amount: inputAmount,
        date: date,
      };

      if (yieldId) {
        const { error } = await supabase.from("conta_rendimentos").update(payload).eq("id", yieldId);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("conta_rendimentos").insert(payload);
        if (error) throw error;
      }

      toast.success(initial ? "Rendimento atualizado" : "Rendimento registrado");
      onDone();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };


  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Valor do Rendimento</Label>
        <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder="0.00" autoFocus />
        <p className="text-[10px] text-muted-foreground">Cada registro entra separado no histórico e o total mensal é sincronizado automaticamente.</p>
      </div>
      <div className="space-y-1.5">
        <Label>Data</Label>
        <DatePicker value={date} onChange={(v) => setDate(v)} />
      </div>
      <Button type="submit" className="w-full" disabled={saving}>
        {saving ? "Salvando..." : initial ? "Salvar Alterações" : "Registrar Rendimento"}
      </Button>
    </form>
  );
}

function AccountForm({ initial, onDone }: { initial?: any; onDone: () => void }) {
  const [bank, setBank] = useState(initial?.bank ?? "");
  const [accountName, setAccountName] = useState(initial?.account_name ?? "");
  const [balance, setBalance] = useState(initial?.balance ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const payload = {
        user_id: user.id,
        bank: bank,
        account_name: accountName,
        balance: Number(balance),
      } as any;

      if (initial?.id) {
        const { error } = await supabase.from("contas").update(payload).eq("id", initial.id);
        if (error) throw error;
        toast.success("Conta atualizada");
      } else {
        const { error } = await supabase.from("contas").insert(payload);
        if (error) throw error;
        toast.success("Conta cadastrada");
      }
      onDone();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <Label>Banco</Label>
        <Select value={bank} onValueChange={setBank}>
          <SelectTrigger className="rounded-xl border-primary/20 shadow-sm focus:ring-primary/20">
            <SelectValue placeholder="Selecione o banco" />
          </SelectTrigger>
          <SelectContent className="max-h-[300px]">
            {BANKS.map((b) => (
              <SelectItem key={b.id} value={b.name} className="flex items-center gap-2">
                <div className="flex items-center gap-2">
                  <BankIcon bank={b.name} size={18} square className="rounded-sm" />
                  <span>{b.name}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label>Nome da Conta / Identificação</Label>
        <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} required placeholder="Ex: Corrente, Reserva Lorran, Tayane Principal..." />
      </div>
      {false && (
        <div className="space-y-1.5">
          <Label>Saldo Inicial</Label>
          <Input type="number" step="0.01" value={balance} onChange={(e) => setBalance(e.target.value)} required placeholder="0.00" />
          <p className="text-[10px] text-muted-foreground">O saldo deve ser ajustado exclusivamente via Lançamentos ou Cartões após o cadastro.</p>
        </div>
      )}
      <Button type="submit" className="w-full" disabled={saving}>
        {saving ? "Salvando..." : initial ? "Salvar Alterações" : "Cadastrar Conta"}
      </Button>
    </form>
  );
}


function RemoveYieldForm({ yields, onDone }: { yields: any[]; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  const totalAvailable = yields.reduce((s, y) => s + Number(y.amount), 0);

  // Ordena do mais recente para o mais antigo
  const sorted = [...yields].sort((a, b) => {
    const d = new Date(b.date).getTime() - new Date(a.date).getTime();
    if (d !== 0) return d;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const toRemove = Number(amount);
    if (!toRemove || toRemove <= 0) {
      toast.error("Informe um valor positivo");
      return;
    }
    if (toRemove > totalAvailable + 0.0001) {
      toast.error(`Valor maior que o total disponível (${brl(totalAvailable)})`);
      return;
    }

    setSaving(true);
    try {
      let remaining = Math.round(toRemove * 100) / 100;

      for (const y of sorted) {
        if (remaining <= 0.0001) break;
        const yAmount = Math.round(Number(y.amount) * 100) / 100;

        if (yAmount <= remaining + 0.0001) {
          const { error } = await supabase.from("conta_rendimentos").delete().eq("id", y.id);
          if (error) throw error;
          remaining = Math.round((remaining - yAmount) * 100) / 100;
        } else {
          const newAmount = Math.round((yAmount - remaining) * 100) / 100;
          const { error } = await supabase.from("conta_rendimentos").update({ amount: newAmount }).eq("id", y.id);
          if (error) throw error;
          remaining = 0;
        }
      }

      toast.success("Valor removido do histórico");



      onDone();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-md">
        Total disponível no histórico: <span className="font-semibold text-foreground">{brl(totalAvailable)}</span>
        <div className="mt-1 text-[10px]">O valor será consumido do rendimento mais recente para o mais antigo. Se não couber em um, sobra é descontada do próximo.</div>
      </div>
      <div className="space-y-1.5">
        <Label>Valor a remover</Label>
        <Input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required placeholder="0.00" autoFocus />
      </div>
      <Button type="submit" className="w-full" variant="destructive" disabled={saving}>
        {saving ? "Removendo..." : "Remover Valor"}
      </Button>
    </form>
  );
}

