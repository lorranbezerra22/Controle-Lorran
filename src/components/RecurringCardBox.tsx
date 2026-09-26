import { useEffect, useMemo, useState } from "react";
import { Plus, RefreshCw, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { brl, fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PersonSelect } from "@/components/person-select";
import { BankIcon } from "@/components/BankIcon";
import { toast } from "sonner";

type RecurringTemplate = {
  id: string;
  description: string;
  cardId: string;
  categoryId: string;
  person: string;
  amount: number;
  installments: number;
  purchaseDay: number;
  active: boolean;
  createdAt: string;
  confirmedMonths: string[];
};

type Props = {
  cards: any[];
  cats: any[];
  onCreated: () => void;
};

const STORAGE_KEY = "cartoes:recorrentes";

const localISO = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const monthISO = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const clampDay = (year: number, month: number, day: number) =>
  Math.min(day, new Date(year, month + 1, 0).getDate());

function nextMonthISO() {
  const date = new Date();
  return monthISO(new Date(date.getFullYear(), date.getMonth() + 1, 1));
}

function readTemplates(): RecurringTemplate[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeTemplates(templates: RecurringTemplate[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(templates));
}

export function RecurringCardBox({ cards, cats, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<RecurringTemplate[]>([]);
  const [targetMonth, setTargetMonth] = useState(nextMonthISO);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    description: "",
    cardId: cards[0]?.id ?? "",
    categoryId: "",
    person: "",
    amount: "",
    installments: 1,
    purchaseDay: new Date().getDate(),
  });

  useEffect(() => {
    setTemplates(readTemplates());
  }, [open]);

  useEffect(() => {
    if (!form.cardId && cards[0]?.id) {
      setForm((current) => ({ ...current, cardId: cards[0].id }));
    }
  }, [cards, form.cardId]);

  const activeTemplates = useMemo(
    () => templates.filter((template) => template.active),
    [templates],
  );

  const selectedCard = cards.find((card) => card.id === form.cardId);

  const addTemplate = (event: React.FormEvent) => {
    event.preventDefault();

    const amount = Number(form.amount);
    if (!form.description.trim()) return toast.error("Informe a descrição.");
    if (!form.cardId) return toast.error("Selecione um cartão.");
    if (!Number.isFinite(amount) || amount <= 0) return toast.error("Informe um valor válido.");
    if (form.installments < 1) return toast.error("Informe a quantidade de parcelas.");

    const next: RecurringTemplate = {
      id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
      description: form.description.trim(),
      cardId: form.cardId,
      categoryId: form.categoryId,
      person: form.person,
      amount,
      installments: Number(form.installments),
      purchaseDay: Number(form.purchaseDay),
      active: true,
      createdAt: new Date().toISOString(),
      confirmedMonths: [],
    };

    const updated = [...templates, next];
    writeTemplates(updated);
    setTemplates(updated);
    setForm((current) => ({
      ...current,
      description: "",
      amount: "",
      categoryId: "",
      person: "",
      installments: 1,
    }));
    toast.success("Lançamento recorrente salvo como rascunho.");
  };

  const removeTemplate = (id: string) => {
    const updated = templates.filter((template) => template.id !== id);
    writeTemplates(updated);
    setTemplates(updated);
  };

  const confirmTemplate = async (template: RecurringTemplate) => {
    if (template.confirmedMonths.includes(targetMonth)) {
      toast.error("Esse lançamento já foi confirmado para este mês.");
      return;
    }

    const card = cards.find((item) => item.id === template.cardId);
    if (!card) return toast.error("O cartão deste lançamento não está disponível.");

    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado.");

      const [year, month] = targetMonth.split("-").map(Number);
      const purchaseDate = `${targetMonth}-${String(clampDay(year, month - 1, template.purchaseDay)).padStart(2, "0")}`;

      let firstYear = year;
      let firstMonth = month - 1;
      const purchaseDay = Number(purchaseDate.slice(8, 10));
      const closing = Number(card.closing_day) || 1;
      const due = Number(card.due_day) || 10;

      if (purchaseDay >= closing) firstMonth += 1;
      if (due < closing) firstMonth += 1;

      const { data: purchase, error: purchaseError } = await supabase
        .from("cartao_compras")
        .insert({
          user_id: user.id,
          card_id: card.id,
          description: template.description,
          purchase_date: purchaseDate,
          total_amount: template.amount,
          installments_count: template.installments,
          category_id: template.categoryId || null,
          person: template.person || null,
        } as any)
        .select()
        .single();

      if (purchaseError) throw purchaseError;

      const installmentValue = Math.round((template.amount / template.installments) * 100) / 100;
      const installments = Array.from({ length: template.installments }, (_, index) => {
        const dueDate = new Date(
          firstYear,
          firstMonth + index,
          clampDay(firstYear, firstMonth + index, due),
        );

        return {
          user_id: user.id,
          purchase_id: purchase.id,
          card_id: card.id,
          installment_number: index + 1,
          amount:
            index === template.installments - 1
              ? +(template.amount - installmentValue * (template.installments - 1)).toFixed(2)
              : installmentValue,
          due_at: localISO(dueDate),
          status: "pending",
        };
      });

      const { error: installmentError } = await supabase
        .from("cartao_parcelas")
        .insert(installments as any);

      if (installmentError) throw installmentError;

      const updated = templates.map((item) =>
        item.id === template.id
          ? { ...item, confirmedMonths: [...item.confirmedMonths, targetMonth] }
          : item,
      );

      writeTemplates(updated);
      setTemplates(updated);
      onCreated();
      toast.success(`"${template.description}" lançado na fatura.`);
    } catch (error: any) {
      toast.error(error.message || "Não foi possível confirmar o lançamento.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-full">
          <RefreshCw className="w-4 h-4 mr-1" />
          Recorrentes
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[88vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Lançamentos recorrentes do cartão</DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
            Salve aqui os lançamentos mensais como rascunho. Quando a próxima fatura estiver disponível,
            escolha o mês e confirme cada item para criá-lo na fatura.
          </div>

          <form onSubmit={addTemplate} className="space-y-3 rounded-xl border border-border p-4">
            <div className="flex items-center gap-2 font-semibold">
              <Plus className="h-4 w-4 text-primary" />
              Novo lançamento recorrente
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Descrição</Label>
                <Input
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  placeholder="Ex.: Academia, Netflix, aluguel..."
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label>Cartão</Label>
                <Select value={form.cardId} onValueChange={(value) => setForm({ ...form, cardId: value })}>
                  <SelectTrigger><SelectValue placeholder="Selecione o cartão" /></SelectTrigger>
                  <SelectContent>
                    {cards.map((card) => (
                      <SelectItem key={card.id} value={card.id}>
                        <span className="inline-flex items-center gap-2">
                          <BankIcon bank={card.bank} size={14} square />
                          {card.name}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Valor mensal</Label>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={form.amount}
                  onChange={(event) => setForm({ ...form, amount: event.target.value })}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label>Parcelas</Label>
                <Input
                  type="number"
                  min={1}
                  max={36}
                  value={form.installments}
                  onChange={(event) => setForm({ ...form, installments: Number(event.target.value) })}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label>Dia da compra</Label>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={form.purchaseDay}
                  onChange={(event) => setForm({ ...form, purchaseDay: Number(event.target.value) })}
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label>Pessoa</Label>
                <PersonSelect value={form.person} onChange={(value) => setForm({ ...form, person: value })} />
              </div>

              <div className="space-y-1.5">
                <Label>Categoria</Label>
                <Select
                  value={form.categoryId || "none"}
                  onValueChange={(value) => setForm({ ...form, categoryId: value === "none" ? "" : value })}
                >
                  <SelectTrigger><SelectValue placeholder="Opcional" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem categoria</SelectItem>
                    {cats
                      .filter((category) => category.kind === "expense")
                      .map((category) => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.icon ? `${category.icon} ` : ""}{category.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button type="submit" disabled={!selectedCard}>
              <Plus className="h-4 w-4" />
              Salvar como rascunho
            </Button>
          </form>

          <div className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h3 className="font-semibold">Rascunhos pendentes</h3>
                <p className="text-xs text-muted-foreground">
                  Confirme os itens que devem entrar na fatura selecionada.
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Fatura de referência</Label>
                <Input
                  type="month"
                  value={targetMonth}
                  onChange={(event) => setTargetMonth(event.target.value)}
                  className="w-auto"
                />
              </div>
            </div>

            {activeTemplates.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Nenhum lançamento recorrente cadastrado.
              </div>
            ) : (
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {activeTemplates.map((template) => {
                  const card = cards.find((item) => item.id === template.cardId);
                  const confirmed = template.confirmedMonths.includes(targetMonth);

                  return (
                    <div key={template.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{template.description}</div>
                        <div className="text-xs text-muted-foreground">
                          {card?.name || "Cartão removido"} · {template.person || "Sem pessoa"} · dia {template.purchaseDay}
                        </div>
                        <div className="text-sm font-semibold">{brl(template.amount)}</div>
                        {confirmed && (
                          <div className="text-xs text-success">
                            Confirmado para {fmtDate(`${targetMonth}-01`).slice(3)}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant={confirmed ? "secondary" : "default"}
                          disabled={confirmed || saving || !card}
                          onClick={() => confirmTemplate(template)}
                        >
                          {confirmed ? "Lançado" : "Confirmar"}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          title="Excluir rascunho"
                          onClick={() => removeTemplate(template.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}