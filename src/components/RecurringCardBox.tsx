import { useEffect, useState } from "react";
import {
  Plus,
  RefreshCw,
  Trash2,
  Equal,
  SlidersHorizontal,
  Users,
  Pencil,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  changeRecurringLaunch,
  importRecurringTemplates,
  loadRecurringAccount,
  saveRecurringTemplates,
  type RecurringAccount,
  type RecurringTemplate,
} from "@/lib/recurring-templates";
import { brl, fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { PersonSelect } from "@/components/person-select";
import { BankIcon } from "@/components/BankIcon";
import { toast } from "sonner";

type Props = {
  cards: any[];
  cats: any[];
  onCreated: () => void;
};

const monthISO = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

function nextMonthISO() {
  const date = new Date();
  return monthISO(new Date(date.getFullYear(), date.getMonth() + 1, 1));
}

export function RecurringCardBox({ cards, cats, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState<RecurringAccount | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const templates = account?.templates ?? [];
  const [targetMonth, setTargetMonth] = useState(nextMonthISO);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formExpanded, setFormExpanded] = useState(false);
  const [draftsExpanded, setDraftsExpanded] = useState(true);
  const [form, setForm] = useState({
    description: "",
    cardId: cards[0]?.id ?? "",
    categoryId: "",
    person: "",
    splitMode: false,
    splitPeople: [] as string[],
    splitCustom: false,
    splitAmounts: {} as Record<string, string>,
    splitCategoryIds: {} as Record<string, string>,
    brand: "",
    amount: "",
    installments: 1,
    purchaseDay: new Date().getDate(),
  });

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const openList = async () => {
      setAccount(null);
      setLoadFailed(false);
      try {
        const saved = await loadRecurringAccount();
        const imported = await importRecurringTemplates(saved, cards);
        if (!cancelled) setAccount(imported);
      } catch {
        if (!cancelled) setLoadFailed(true);
      }
    };
    void openList();
    return () => {
      cancelled = true;
    };
  }, [open, cards]);

  useEffect(() => {
    if (!form.cardId && cards[0]?.id) {
      setForm((current) => ({ ...current, cardId: cards[0].id }));
    }
  }, [cards, form.cardId]);

  const activeTemplates = templates.filter((template) => template.active);

  const selectedCard = cards.find((card) => card.id === form.cardId);
  const isSplit = form.splitMode && form.splitPeople.length >= 2;

  const toggleSplitPerson = (person: string) => {
    setForm((current) => {
      const splitPeople = current.splitPeople.includes(person)
        ? current.splitPeople.filter((item) => item !== person)
        : [...current.splitPeople, person];

      return {
        ...current,
        splitPeople,
        person: splitPeople.length === 1 ? splitPeople[0] : "",
      };
    });
  };

  const addTemplate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!account || saving) return;

    const amount = Number(form.amount);
    if (!form.description.trim()) return toast.error("Informe a descrição.");
    if (!form.cardId) return toast.error("Selecione um cartão.");
    if (!Number.isFinite(amount) || amount <= 0) return toast.error("Informe um valor válido.");
    if (!Number.isInteger(form.installments) || form.installments < 1) return toast.error("Informe a quantidade de parcelas.");
    if (!Number.isInteger(form.purchaseDay) || form.purchaseDay < 1 || form.purchaseDay > 31) {
      return toast.error("Informe um dia de compra entre 1 e 31.");
    }
    if (isSplit && form.splitPeople.length < 2) {
      return toast.error("Selecione pelo menos duas pessoas.");
    }

    const splitAmounts = Object.fromEntries(
      form.splitPeople.map((person) => [person, Number(form.splitAmounts[person] || 0)]),
    );

    if (isSplit && form.splitCustom) {
      const splitTotal = Object.values(splitAmounts).reduce((sum, value) => sum + value, 0);
      if (Math.abs(splitTotal - amount) > 0.01) {
        return toast.error(`A soma das divisões precisa ser igual a ${brl(amount)}.`);
      }
    }

    const previous = templates.find((template) => template.id === editingId);
    const next: RecurringTemplate = {
      id: editingId || (typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
      description: form.description.trim(),
      cardId: form.cardId,
      categoryId: form.categoryId,
      person: isSplit ? "" : form.person,
      splitPeople: isSplit ? form.splitPeople : [],
      splitCustom: isSplit ? form.splitCustom : false,
      splitAmounts: isSplit ? splitAmounts : {},
      splitCategoryIds: isSplit ? form.splitCategoryIds : {},
      brand: form.brand || "",
      amount,
      installments: Number(form.installments),
      purchaseDay: Number(form.purchaseDay),
      active: true,
      createdAt: previous?.createdAt ?? new Date().toISOString(),
      confirmedMonths: previous?.confirmedMonths ?? [],
      launchIds: previous?.launchIds,
    };

    const updated = editingId
      ? templates.map((template) => (template.id === editingId ? next : template))
      : [...templates, next];

    setSaving(true);
    try {
      setAccount(await saveRecurringTemplates(account, updated));
      setEditingId(null);
      setForm((current) => ({
        ...current,
        description: "",
        amount: "",
        categoryId: "",
        person: "",
        splitMode: false,
        splitPeople: [],
        splitCustom: false,
        splitAmounts: {},
        splitCategoryIds: {},
        brand: "",
        installments: 1,
      }));
      toast.success(editingId ? "Compra planejada atualizada." : "Compra planejada guardada na sua conta.");
    } catch (error: any) {
      toast.error(error.message || "Não foi possível guardar a compra.");
    } finally {
      setSaving(false);
    }
  };

  const editTemplate = (template: RecurringTemplate) => {
    setEditingId(template.id);
    setForm({
      description: template.description,
      cardId: template.cardId,
      categoryId: template.categoryId,
      person: template.person || "",
      splitMode: Boolean(template.splitPeople?.length),
      splitPeople: template.splitPeople || [],
      splitCustom: Boolean(template.splitCustom),
      splitAmounts: Object.fromEntries(
        Object.entries(template.splitAmounts || {}).map(([person, value]) => [person, String(value)]),
      ),
      splitCategoryIds: template.splitCategoryIds || {},
      brand: template.brand || "",
      amount: String(template.amount),
      installments: template.installments,
      purchaseDay: template.purchaseDay,
    });
    setFormExpanded(true);
  };

  const removeTemplate = async (id: string) => {
    if (!account || saving) return;
    setSaving(true);
    try {
      setAccount(await saveRecurringTemplates(account, templates.filter((template) => template.id !== id)));
    } catch (error: any) {
      toast.error(error.message || "Não foi possível excluir a compra planejada.");
    } finally {
      setSaving(false);
    }
  };

  const updateLaunch = async (template: RecurringTemplate, remove = false) => {
    if (!account || saving || !targetMonth) return;
    if (remove && !window.confirm(
      `Remover "${template.description}" da fatura de ${fmtDate(`${targetMonth}-01`).slice(3)}?`,
    )) return;

    setSaving(true);
    try {
      setAccount(await changeRecurringLaunch(account, template.id, targetMonth, remove));
      onCreated();
      toast.success(remove ? "Compra removida da fatura." : "Compra lançada na fatura.");
    } catch (error: any) {
      toast.error(error.message || "Não foi possível atualizar a fatura.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(visible) => {
      if (visible) setTargetMonth(nextMonthISO());
      setOpen(visible);
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="rounded-full">
          <RefreshCw className="w-4 h-4 mr-1" />
          Compras planejadas
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[88vh] max-w-3xl overflow-y-auto rounded-2xl border-border bg-background p-0 shadow-2xl">
        <DialogHeader className="border-b border-border bg-card px-6 py-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
            Cartão de crédito
          </p>
          <DialogTitle className="mt-1 text-xl">
            Compras aguardando a fatura
          </DialogTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Guarde uma compra com o cartão escolhido e confirme o lançamento quando ela aparecer na fatura.
          </p>
        </DialogHeader>

        <div className="space-y-5 px-6 py-5">
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">Seus lançamentos ficam guardados</p>
            <p className="mt-1">
              As compras planejadas ficam guardadas na sua conta. Depois de confirmar,
              elas continuam no histórico como lançadas.
            </p>
          </div>

          <Collapsible
            open={formExpanded}
            onOpenChange={setFormExpanded}
            className="overflow-hidden rounded-xl border border-border"
          >
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="ghost"
                className="w-full justify-between rounded-none border-0 px-4 data-[state=open]:border-b data-[state=open]:border-border"
              >
                <span className="inline-flex items-center gap-2 font-semibold">
                  {formExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  <Plus className="h-4 w-4 text-primary" />
                  {editingId ? "Editar compra planejada" : "Guardar nova compra"}
                </span>
              </Button>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <form onSubmit={addTemplate} className="space-y-3 p-4">

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
                <Select
                  value={form.cardId}
                  onValueChange={(value) => {
                    const card = cards.find((item) => item.id === value);
                    const firstBrand = card?.metadata?.brands?.[0];
                    setForm({
                      ...form,
                      cardId: value,
                      brand: firstBrand
                        ? `${firstBrand.brand.charAt(0).toUpperCase()}${firstBrand.brand.slice(1)} ${firstBrand.last_digits}`
                        : "",
                    });
                  }}
                >
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
                <Label>Valor da compra</Label>
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

              {!isSplit && (
                <div className="space-y-1.5">
                  <Label>Pessoa</Label>
                  <PersonSelect value={form.person} onChange={(value) => setForm({ ...form, person: value })} />
                </div>
              )}

              {(() => {
                const brands = selectedCard?.metadata?.brands || [];
                if (brands.length <= 1) return null;

                return (
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Bandeira da compra</Label>
                    <div className="flex flex-wrap gap-2">
                      {brands.map((brand: any, index: number) => {
                        const label = `${brand.brand.charAt(0).toUpperCase()}${brand.brand.slice(1)} ${brand.last_digits}`;
                        const active = form.brand === label;

                        return (
                          <Button
                            key={index}
                            type="button"
                            variant={active ? "default" : "outline"}
                            size="sm"
                            className="h-8 text-[10px] font-bold uppercase tracking-wider"
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

              <div className="space-y-1.5 sm:col-span-2">
                <Button
                  type="button"
                  variant={form.splitMode ? "default" : "outline"}
                  className="w-full justify-between"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      splitMode: !current.splitMode,
                      person: "",
                      splitPeople: current.splitMode ? [] : current.splitPeople,
                      splitCustom: current.splitMode ? false : current.splitCustom,
                      splitAmounts: current.splitMode ? {} : current.splitAmounts,
                      splitCategoryIds: current.splitMode ? {} : current.splitCategoryIds,
                    }))
                  }
                >
                  <span className="inline-flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Dividir por pessoas
                  </span>
                  <span className="text-xs opacity-80">
                    {form.splitMode
                      ? `${form.splitPeople.length} selecionadas`
                      : "Opcional"}
                  </span>
                </Button>
              </div>

              {form.splitMode && (
                <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-3 sm:col-span-2">
                  <PersonSelect
                    multiSelect
                    value=""
                    selectedValues={form.splitPeople}
                    onChange={(value) => {
                      const next = value ? value.split(",").filter(Boolean) : [];
                      setForm((current) => ({ ...current, splitPeople: next }));
                    }}
                  />

                  {form.splitPeople.length >= 2 && (
                    <>
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={!form.splitCustom ? "secondary" : "ghost"}
                          onClick={() => setForm({ ...form, splitCustom: false })}
                        >
                          <Equal className="h-3.5 w-3.5" />
                          Igual
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={form.splitCustom ? "secondary" : "ghost"}
                          onClick={() => setForm({ ...form, splitCustom: true })}
                        >
                          <SlidersHorizontal className="h-3.5 w-3.5" />
                          Personalizado
                        </Button>
                      </div>

                      <div className="space-y-2">
                        {form.splitPeople.map((person) => (
                          <div key={person} className="grid gap-2 sm:grid-cols-2">
                            {form.splitCustom && (
                              <Input
                                type="number"
                                min="0"
                                step="0.01"
                                placeholder={`Valor de ${person}`}
                                value={form.splitAmounts[person] ?? ""}
                                onChange={(event) =>
                                  setForm((current) => ({
                                    ...current,
                                    splitAmounts: {
                                      ...current.splitAmounts,
                                      [person]: event.target.value,
                                    },
                                  }))
                                }
                              />
                            )}

                            <Select
                              value={form.splitCategoryIds[person] || "none"}
                              onValueChange={(value) =>
                                setForm((current) => ({
                                  ...current,
                                  splitCategoryIds: {
                                    ...current.splitCategoryIds,
                                    [person]: value === "none" ? "" : value,
                                  },
                                }))
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder={`Categoria de ${person}`} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Sem categoria · {person}</SelectItem>
                                {cats
                                  .filter((category) => category.kind === "expense")
                                  .map((category) => (
                                    <SelectItem key={category.id} value={category.id}>
                                      {category.icon ? `${category.icon} ` : ""}
                                      {category.name} · {person}
                                    </SelectItem>
                                  ))}
                              </SelectContent>
                            </Select>
                          </div>
                        ))}

                        {(() => {
                          const total = Number(form.amount) || 0;
                          const assigned = form.splitCustom
                            ? form.splitPeople.reduce(
                                (sum, person) => sum + Number(form.splitAmounts[person] || 0),
                                0,
                              )
                            : form.splitPeople.length >= 2
                              ? total
                              : 0;
                          const remaining = +(total - assigned).toFixed(2);
                          const percentage = total > 0
                            ? Math.min(100, Math.max(0, (assigned / total) * 100))
                            : 0;
                          const isComplete = total > 0 && Math.abs(remaining) < 0.01;
                          const isOver = remaining < -0.01;

                          return (
                            <div className="space-y-2 rounded-lg border border-border/60 bg-background/60 p-3">
                              <div className="flex items-center justify-between gap-3 text-xs">
                                <span className="text-muted-foreground">
                                  Distribuído: <strong className="text-foreground">{brl(assigned)}</strong>
                                </span>
                                <span className="font-semibold text-warning">
                                  Valor restante: {brl(Math.max(0, remaining))}
                                </span>
                                <span
                                  className={
                                    isComplete
                                      ? "font-semibold text-success"
                                      : isOver
                                        ? "font-semibold text-destructive"
                                        : "font-semibold text-warning"
                                  }
                                >
                                  {isComplete
                                    ? "Valor completo"
                                    : isOver
                                      ? `Excedente: ${brl(Math.abs(remaining))}`
                                      : `Restante: ${brl(remaining)}`}
                                </span>
                              </div>

                              <Progress
                                value={percentage}
                                className={
                                  isOver
                                    ? "[&>div]:bg-destructive"
                                    : isComplete
                                      ? "[&>div]:bg-success"
                                      : "[&>div]:bg-primary"
                                }
                              />

                              <div className="flex justify-between text-[10px] text-muted-foreground">
                                <span>{Math.round(percentage)}% distribuído</span>
                                <span>Total: {brl(total)}</span>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </>
                  )}
                </div>
              )}

              {!isSplit && (
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
              )}
            </div>

            <div className="flex gap-2">
              <Button type="submit" disabled={!selectedCard || !account || saving}>
                {editingId ? <Pencil className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
                {editingId ? "Salvar alterações" : "Salvar como rascunho"}
              </Button>
              {editingId && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setEditingId(null);
                    setFormExpanded(false);
                  }}
                >
                  Cancelar
                </Button>
              )}
            </div>
              </form>
            </CollapsibleContent>
          </Collapsible>

          <Collapsible open={draftsExpanded} onOpenChange={setDraftsExpanded} className="space-y-3">
            <CollapsibleTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className="w-full justify-between rounded-xl border-border"
              >
                <span className="inline-flex items-center gap-2 font-semibold">
                  {draftsExpanded ? (
                    <ChevronDown className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  )}
                  Compras guardadas
                </span>
              </Button>
            </CollapsibleTrigger>

            <CollapsibleContent className="space-y-3">
          <div className="space-y-3">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs text-muted-foreground">
                Confirme a compra na fatura escolhida. Ela fica disponível para os próximos meses.
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Fatura que será lançada</Label>
                <Input
                  type="month"
                  value={targetMonth}
                  onChange={(event) => setTargetMonth(event.target.value)}
                  className="w-auto"
                />
              </div>
            </div>

            {loadFailed ? (
              <p role="alert" className="text-sm text-destructive">
                Não foi possível carregar as compras. Feche e reabra esta janela para tentar novamente.
              </p>
            ) : !account ? (
              <p role="status" className="text-sm text-muted-foreground">Carregando compras planejadas…</p>
            ) : activeTemplates.length === 0 ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-border bg-muted/10 px-5 py-8 text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <RefreshCw className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">
                    Nenhuma compra planejada
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Guarde uma compra e confirme quando ela aparecer na fatura.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setFormExpanded(true)}
                >
                  <Plus className="mr-1.5 h-4 w-4" />
                  Guardar uma compra
                </Button>
              </div>
            ) : (
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {activeTemplates.map((template) => {
                  const card = cards.find((item) => item.id === template.cardId);
                  const confirmed =
                    template.confirmedMonths.includes(targetMonth);
                  const people = template.splitPeople?.length
                    ? template.splitPeople
                    : [template.person || "Sem pessoa"];

                  return (
                    <Collapsible
                      key={template.id}
                      className="rounded-xl border border-border bg-background/40"
                    >
                      <CollapsibleTrigger asChild>
                        <Button
                          type="button"
                          variant="ghost"
                          className="h-auto w-full justify-between gap-3 rounded-xl p-3 text-left hover:bg-muted/40"
                        >
                          <span className="flex min-w-0 items-center gap-3">
                            {template.confirmedMonths.includes(targetMonth) ? (
                              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                            )}

                            <span className="min-w-0">
                              <span className="block truncate font-medium">
                                {template.description}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                {card?.name || "Cartão removido"} · {people.join(", ")} · dia{" "}
                                {template.purchaseDay}
                              </span>
                              <span className="block text-sm font-semibold">
                                {brl(template.amount)}
                              </span>
                            </span>
                          </span>

                          {confirmed && (
                            <span className="shrink-0 text-xs font-medium text-success">
                              {`Lançado · ${fmtDate(`${targetMonth}-01`).slice(3)}`}
                            </span>
                          )}
                        </Button>
                      </CollapsibleTrigger>

                      <CollapsibleContent className="border-t border-border/60 px-3 pb-3">
                        <div className="grid gap-2 pt-3 text-xs sm:grid-cols-2">
                          <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
                            <span className="block text-muted-foreground">Cartão</span>
                            <span className="font-medium">{card?.name || "Cartão removido"}</span>
                          </div>

                          <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
                            <span className="block text-muted-foreground">Bandeira</span>
                            <span className="font-medium">{template.brand || "Não informada"}</span>
                          </div>

                          <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
                            <span className="block text-muted-foreground">Parcelas</span>
                            <span className="font-medium">
                              {template.installments}x de{" "}
                              {brl(template.amount / template.installments)}
                            </span>
                          </div>

                          <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5">
                            <span className="block text-muted-foreground">Dia da compra</span>
                            <span className="font-medium">Dia {template.purchaseDay}</span>
                          </div>

                          <div className="rounded-lg border border-border/60 bg-muted/20 p-2.5 sm:col-span-2">
                            <span className="block text-muted-foreground">Pessoas e categorias</span>
                            <div className="mt-1 space-y-1">
                              {people.map((person) => {
                                const categoryId =
                                  template.splitCategoryIds?.[person] || template.categoryId;
                                const category = cats.find((item) => item.id === categoryId);
                                const splitAmount = template.splitCustom
                                  ? template.splitAmounts?.[person]
                                  : undefined;

                                return (
                                  <div
                                    key={person}
                                    className="flex flex-wrap items-center justify-between gap-2"
                                  >
                                    <span className="font-medium">{person}</span>
                                    <span className="text-muted-foreground">
                                      {category
                                        ? `${category.icon ? `${category.icon} ` : ""}${category.name}`
                                        : "Sem categoria"}
                                      {splitAmount !== undefined &&
                                        ` · ${brl(Number(splitAmount))}`}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {confirmed && (
                          <div className="pt-3 text-xs text-success">
                            Confirmado para {fmtDate(`${targetMonth}-01`).slice(3)}
                          </div>
                        )}

                        <div className="flex flex-wrap items-center justify-end gap-2 pt-3">
                          {!confirmed ? (
                            <Button
                              size="sm"
                              variant="default"
                              disabled={saving || !card || !targetMonth}
                              onClick={() => updateLaunch(template)}
                            >
                              Confirmar na fatura
                            </Button>
                          ) : (
                            <Button
                              size="sm"
                              variant="destructive"
                              disabled={saving || !card || !targetMonth}
                              onClick={() => updateLaunch(template, true)}
                            >
                              <Trash2 className="mr-1.5 h-4 w-4" />
                              Remover da fatura
                            </Button>
                          )}

                          <Button
                            size="sm"
                            variant="outline"
                            disabled={saving}
                            onClick={() => editTemplate(template)}
                          >
                            <Pencil className="mr-1.5 h-4 w-4" />
                            Editar
                          </Button>

                          <Button
                            size="icon"
                            variant="ghost"
                            disabled={saving}
                            title="Excluir compra planejada"
                            aria-label="Excluir compra planejada"
                            onClick={() => removeTemplate(template.id)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
            )}
          </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </DialogContent>
    </Dialog>
  );
}