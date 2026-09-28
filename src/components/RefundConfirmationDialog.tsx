import { useEffect, useState } from "react";
import { RotateCcw, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { brl } from "@/lib/format";

type RefundMode = "accounts" | "invoice-only";

interface RefundConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  amount: number;
  lorranAccounts?: Array<{ id: string; label: string; balance?: number }>;
  tayaneAccounts?: Array<{ id: string; label: string; balance?: number }>;
  confirmedMode?: RefundMode | null;
  onConfirm: (options: {
    mode: RefundMode;
    lorranAccountId?: string;
    tayaneAccountId?: string;
  }) => void | Promise<void>;
  onUndo: () => void | Promise<void>;
}

export function RefundConfirmationDialog({
  open,
  onOpenChange,
  amount,
  lorranAccounts = [],
  tayaneAccounts = [],
  confirmedMode = null,
  onConfirm,
  onUndo,
}: RefundConfirmationDialogProps) {
  const [mode, setMode] = useState<RefundMode>("invoice-only");
  const [lorranAccountId, setLorranAccountId] = useState("");
  const [tayaneAccountId, setTayaneAccountId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;

    setMode(confirmedMode ?? "invoice-only");
    setLorranAccountId(lorranAccounts[0]?.id ?? "");
    setTayaneAccountId(tayaneAccounts[0]?.id ?? "");
  }, [open, confirmedMode, lorranAccounts, tayaneAccounts]);

  const isConfirmed = Boolean(confirmedMode);
  const canCreditAccounts =
    lorranAccounts.length > 0 || tayaneAccounts.length > 0;

  const handleConfirm = async () => {
    setSubmitting(true);

    try {
      await onConfirm({
        mode,
        ...(mode === "accounts"
          ? {
              lorranAccountId: lorranAccountId || undefined,
              tayaneAccountId: tayaneAccountId || undefined,
            }
          : {}),
      });

      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUndo = async () => {
    setSubmitting(true);

    try {
      await onUndo();
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-border bg-card">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isConfirmed ? (
              <Undo2 className="h-5 w-5 text-primary" />
            ) : (
              <RotateCcw className="h-5 w-5 text-primary" />
            )}
            {isConfirmed
              ? "Reverter confirmação do reembolso"
              : "Confirmar recebimento do reembolso"}
          </DialogTitle>
          <DialogDescription>
            Crédito de{" "}
            <strong className="text-primary">{brl(amount)}</strong>
          </DialogDescription>
        </DialogHeader>

        {isConfirmed ? (
          <div className="space-y-4">
            <div className="rounded-xl border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">
                Este reembolso já foi confirmado.
              </p>
              <p className="mt-1">
                Ao remover a confirmação, o valor voltará a ser considerado
                pendente na fatura.
                {confirmedMode === "accounts" &&
                  " Os créditos adicionados às contas também serão revertidos."}
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Manter confirmação
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleUndo}
                disabled={submitting}
              >
                <Undo2 className="mr-2 h-4 w-4" />
                Remover confirmação
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 text-sm text-muted-foreground">
              Escolha apenas uma forma de registrar o recebimento. As opções
              são exclusivas.
            </div>

            <div className="grid gap-3">
              <button
                type="button"
                onClick={() => setMode("invoice-only")}
                className={`rounded-xl border p-4 text-left transition-colors ${
                  mode === "invoice-only"
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-muted/40"
                }`}
              >
                <div className="font-medium text-foreground">
                  Apenas confirmar recebimento
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Abate o valor do restante da fatura, sem criar crédito e sem
                  alterar o saldo das contas.
                </p>
              </button>

              <button
                type="button"
                onClick={() => canCreditAccounts && setMode("accounts")}
                disabled={!canCreditAccounts}
                className={`rounded-xl border p-4 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  mode === "accounts"
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-muted/40"
                }`}
              >
                <div className="font-medium text-foreground">
                  Confirmar e creditar nas contas
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Abate a fatura e adiciona o crédito nas contas selecionadas.
                </p>
              </button>
            </div>

            {mode === "accounts" && (
              <div className="space-y-3 rounded-xl border border-border bg-muted/20 p-4">
                {lorranAccounts.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      Conta do Lorran
                    </label>
                    <Select
                      value={lorranAccountId}
                      onValueChange={setLorranAccountId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar conta" />
                      </SelectTrigger>
                      <SelectContent>
                        {lorranAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.label}
                            {account.balance !== undefined
                              ? ` · ${brl(account.balance)}`
                              : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {tayaneAccounts.length > 0 && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-muted-foreground">
                      Conta da Tayane
                    </label>
                    <Select
                      value={tayaneAccountId}
                      onValueChange={setTayaneAccountId}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecionar conta" />
                      </SelectTrigger>
                      <SelectContent>
                        {tayaneAccounts.map((account) => (
                          <SelectItem key={account.id} value={account.id}>
                            {account.label}
                            {account.balance !== undefined
                              ? ` · ${brl(account.balance)}`
                              : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Ainda não recebi
              </Button>
              <Button
                type="button"
                onClick={handleConfirm}
                disabled={
                  submitting ||
                  (mode === "accounts" &&
                    !lorranAccountId &&
                    !tayaneAccountId)
                }
              >
                {mode === "accounts"
                  ? "Confirmar e creditar"
                  : "Apenas confirmar"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}