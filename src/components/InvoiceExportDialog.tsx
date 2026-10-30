import { useEffect, useMemo, useState } from "react";
import { Download, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { brl, fmtDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PersonSelect } from "@/components/person-select";

type Allocation = {
  person: string;
  amount: string;
};

type DraftItem = {
  id: string;
  cardName: string;
  bank: string;
  brand: string;
  dueDate: string;
  purchaseDate: string;
  installmentLabel: string;
  description: string;
  categoryId: string;
  allocations: Allocation[];
};

type Props = {
  installments: any[];
  cats: any[];
};

const cents = (value: number) => Math.round((Number(value) || 0) * 100);

function splitAmount(total: number, count: number): string[] {
  const totalCents = cents(total);
  const base = Math.trunc(totalCents / count);
  let remainder = totalCents - base * count;

  return Array.from({ length: count }, () => {
    const value = base + (remainder !== 0 ? Math.sign(remainder) : 0);
    if (remainder !== 0) remainder -= Math.sign(remainder);
    return (value / 100).toFixed(2);
  });
}

function createDraft(installments: any[]): DraftItem[] {
  return installments.map((item) => ({
    id: item.id,
    cardName: item.cartoes?.name || "Cartão",
    bank: item.cartoes?.bank || "",
    brand: item.cartao_compras?.brand || "",
    dueDate: item.due_at || "",
    purchaseDate: item.cartao_compras?.purchase_date || "",
    installmentLabel: `${item.installment_number || 1}/${item.cartao_compras?.installments_count || 1}`,
    description: item.cartao_compras?.description || "",
    categoryId: item.cartao_compras?.category_id || "",
    allocations: [{
      person: item.cartao_compras?.person || "",
      amount: Number(item.amount || 0).toFixed(2),
    }],
  }));
}

function csvCell(value: unknown): string {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export function InvoiceExportDialog({ installments, cats }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DraftItem[]>([]);

  useEffect(() => {
    if (open) setDraft(createDraft(installments));
  }, [open, installments]);

  const categoriesById = useMemo(
    () => new Map(cats.map((category: any) => [category.id, category])),
    [cats],
  );

  const updateItem = (id: string, patch: Partial<DraftItem>) => {
    setDraft((current) =>
      current.map((item) => item.id === id ? { ...item, ...patch } : item),
    );
  };

  const updateAllocation = (
    itemId: string,
    index: number,
    patch: Partial<Allocation>,
  ) => {
    setDraft((current) =>
      current.map((item) => item.id === itemId
        ? {
            ...item,
            allocations: item.allocations.map((allocation, allocationIndex) =>
              allocationIndex === index
                ? { ...allocation, ...patch }
                : allocation,
            ),
          }
        : item),
    );
  };

  const addPerson = (itemId: string) => {
    setDraft((current) =>
      current.map((item) => {
        if (item.id !== itemId) return item;

        const total = item.allocations.reduce(
          (sum, allocation) => sum + Number(allocation.amount || 0),
          0,
        );
        const count = item.allocations.length + 1;
        const amounts = splitAmount(total, count);

        return {
          ...item,
          allocations: [
            ...item.allocations.map((allocation, index) => ({
              ...allocation,
              amount: amounts[index],
            })),
            { person: "", amount: amounts[count - 1] },
          ],
        };
      }),
    );
  };

  const removePerson = (itemId: string, index: number) => {
    setDraft((current) =>
      current.map((item) => {
        if (item.id !== itemId || item.allocations.length <= 1) return item;

        const total = item.allocations.reduce(
          (sum, allocation) => sum + Number(allocation.amount || 0),
          0,
        );
        const allocations = item.allocations.filter(
          (_, allocationIndex) => allocationIndex !== index,
        );
        const amounts = splitAmount(total, allocations.length);

        return {
          ...item,
          allocations: allocations.map((allocation, allocationIndex) => ({
            ...allocation,
            amount: amounts[allocationIndex],
          })),
        };
      }),
    );
  };

  const exportDraft = () => {
    if (draft.some((item) =>
      !item.description.trim() ||
      item.allocations.some((allocation) => !allocation.person.trim()),
    )) {
      toast.error("Preencha a descrição e a pessoa de cada divisão.");
      return;
    }

    const rows = draft.flatMap((item) =>
      item.allocations.map((allocation) => [
        item.bank,
        item.cardName,
        item.brand,
        item.dueDate,
        item.purchaseDate,
        item.installmentLabel,
        item.description,
        categoriesById.get(item.categoryId)?.name || "Sem categoria",
        allocation.person,
        Number(allocation.amount || 0).toFixed(2),
      ]),
    );

    const headers = [
      "Banco",
      "Cartão",
      "Bandeira",
      "Vencimento",
      "Data da compra",
      "Parcela",
      "Descrição",
      "Categoria",
      "Pessoa",
      "Valor",
    ];

    const csv = "\uFEFF" + [headers, ...rows]
      .map((row) => row.map(csvCell).join(";"))
      .join("\r\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const firstDueDate = draft[0]?.dueDate || "";
    link.href = url;
    link.download = `fatura-${firstDueDate.slice(0, 7) || "rascunho"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success("Rascunho da fatura exportado.");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={installments.length === 0}>
          <Download className="mr-1.5 h-4 w-4" />
          Exportar fatura
        </Button>
      </DialogTrigger>

      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto rounded-2xl p-0">
        <DialogHeader className="border-b border-border bg-card px-6 py-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
            Rascunho da fatura
          </p>
          <DialogTitle className="mt-1 text-xl">Revise e exporte os lançamentos</DialogTitle>
          <DialogDescription>
            Banco, cartão, datas e parcelas vêm preenchidos. Ajuste os campos do lançamento e distribua o valor entre pessoas antes de baixar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 px-6 py-5">
          {draft.map((item) => {
            const itemTotal = item.allocations.reduce(
              (sum, allocation) => sum + Number(allocation.amount || 0),
              0,
            );

            return (
              <section
                key={item.id}
                className="space-y-4 rounded-xl border border-border bg-card p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border/70 pb-3">
                  <div>
                    <p className="font-semibold">{item.cardName}</p>
                    <p className="text-xs text-muted-foreground">
                      {[item.bank, item.brand].filter(Boolean).join(" · ") || "Dados do cartão"}
                    </p>
                  </div>
                  <div className="text-right text-xs text-muted-foreground">
                    <p>Vencimento: <strong className="text-foreground">{fmtDate(item.dueDate)}</strong></p>
                    <p>Compra: <strong className="text-foreground">{fmtDate(item.purchaseDate) || "—"}</strong></p>
                    <p>Parcela: <strong className="text-foreground">{item.installmentLabel}</strong></p>
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Descrição</Label>
                    <Input
                      value={item.description}
                      onChange={(event) => updateItem(item.id, { description: event.target.value })}
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label>Categoria</Label>
                    <Select
                      value={item.categoryId || "none"}
                      onValueChange={(value) =>
                        updateItem(item.id, { categoryId: value === "none" ? "" : value })
                      }
                    >
                      <SelectTrigger><SelectValue placeholder="Sem categoria" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem categoria</SelectItem>
                        {cats
                          .filter((category: any) => category.kind === "expense")
                          .map((category: any) => (
                            <SelectItem key={category.id} value={category.id}>
                              {category.icon ? `${category.icon} ` : ""}
                              {category.name}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-end justify-between rounded-lg border border-border/70 bg-muted/20 px-3 py-2">
                    <span className="text-xs text-muted-foreground">Total distribuído</span>
                    <strong className="tabular-nums">{brl(itemTotal)}</strong>
                  </div>
                </div>

                <div className="space-y-2 rounded-lg border border-border/70 bg-muted/10 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">Pessoas e valores</p>
                      <p className="text-xs text-muted-foreground">
                        Ao adicionar alguém, o valor é dividido igualmente; você pode ajustar cada parte.
                      </p>
                    </div>
                    <Button type="button" size="sm" variant="outline" onClick={() => addPerson(item.id)}>
                      <Plus className="mr-1 h-4 w-4" />
                      Pessoa
                    </Button>
                  </div>

                  {item.allocations.map((allocation, index) => (
                    <div
                      key={`${item.id}-${index}`}
                      className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_150px_36px]"
                    >
                      <div className="space-y-1">
                        <Label className="text-xs">Pessoa {index + 1}</Label>
                        <PersonSelect
                          value={allocation.person}
                          onChange={(person) => updateAllocation(item.id, index, { person })}
                          placeholder="Selecione uma pessoa"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs">Valor</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={allocation.amount}
                          onChange={(event) =>
                            updateAllocation(item.id, index, { amount: event.target.value })
                          }
                        />
                      </div>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label="Remover pessoa"
                        disabled={item.allocations.length <= 1}
                        onClick={() => removePerson(item.id, index)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            );
          })}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
            <p className="text-xs text-muted-foreground">
              O arquivo contém os dados revisados; os lançamentos originais não serão alterados.
            </p>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Fechar rascunho
              </Button>
              <Button type="button" onClick={exportDraft}>
                <Download className="mr-2 h-4 w-4" />
                Baixar arquivo CSV
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}