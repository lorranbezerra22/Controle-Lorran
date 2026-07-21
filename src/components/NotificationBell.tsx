import { useMemo, useState } from "react";
import { Bell } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { brl, fmtDate } from "@/lib/format";

interface NotificationBellProps {
  transactions: any[];
  installments: any[];
  cards: any[];
}

function ymd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function NotificationBell({ transactions, installments, cards }: NotificationBellProps) {
  const [open, setOpen] = useState(false);

  const { overdueTx, overdueInst, cardAlerts, total } = useMemo(() => {
    const now = new Date();
    const today = ymd(now);
    const y = now.getFullYear();
    const m = now.getMonth();
    const monthStart = ymd(new Date(y, m, 1));
    const monthEnd = ymd(new Date(y, m + 1, 0));

    const overdueTx = (transactions || []).filter(
      (t: any) => t.status === "pending" && t.due_at >= monthStart && t.due_at <= monthEnd && t.due_at <= today,
    );
    const overdueInst = (installments || []).filter(
      (i: any) => i.status !== "paid" && i.due_at >= monthStart && i.due_at <= monthEnd && i.due_at <= today,
    );

    const lastDay = new Date(y, m + 1, 0).getDate();
    const cardAlerts = (cards || [])
      .map((c: any) => {
        const dueDay = Math.min(Number(c.due_day) || 0, lastDay);
        if (!dueDay) return null;
        const dueDate = new Date(y, m, dueDay);
        const diff = Math.round((dueDate.getTime() - new Date(y, m, now.getDate()).getTime()) / 86400000);
        if (diff > 5) return null;
        const hasPending = (installments || []).some(
          (i: any) => i.card_id === c.id && i.status !== "paid" && i.due_at >= monthStart && i.due_at <= monthEnd,
        );
        if (!hasPending) return null;
        return { card: c, dueDate, diff };
      })
      .filter(Boolean) as { card: any; dueDate: Date; diff: number }[];

    const total = overdueTx.length + overdueInst.length + cardAlerts.length;
    return { overdueTx, overdueInst, cardAlerts, total };
  }, [transactions, installments, cards]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Notificações"
        className="relative h-10 w-10 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-primary/5 transition-colors flex items-center justify-center text-muted-foreground hover:text-foreground"
      >
        <Bell className="w-4 h-4" />
        {total > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center shadow">
            {total}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-primary" /> Notificações do mês
            </DialogTitle>
            <DialogDescription>Pendências vencidas e vencimentos de cartões próximos.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
            {total === 0 && (
              <div className="text-sm text-muted-foreground text-center py-8">
                Nenhuma pendência vencida no mês. 🎉
              </div>
            )}

            {cardAlerts.length > 0 && (
              <section>
                <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2 font-medium">
                  Vencimento de cartões
                </h4>
                <ul className="space-y-2">
                  {cardAlerts.map(({ card, dueDate, diff }) => (
                    <li
                      key={card.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-card/60 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{card.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {card.bank ? `${card.bank} · ` : ""}Vence dia {card.due_day} ({fmtDate(ymd(dueDate))})
                        </div>
                      </div>
                      <span
                        className={`text-[11px] px-2 py-1 rounded-full font-medium ${
                          diff < 0
                            ? "bg-destructive/15 text-destructive"
                            : diff === 0
                            ? "bg-primary/15 text-primary"
                            : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {diff < 0 ? `Venceu há ${Math.abs(diff)}d` : diff === 0 ? "Hoje" : `Em ${diff}d`}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {overdueTx.length > 0 && (
              <section>
                <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2 font-medium">
                  Lançamentos vencidos ({overdueTx.length})
                </h4>
                <ul className="space-y-2">
                  {overdueTx.map((t: any) => (
                    <li
                      key={t.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{t.description}</div>
                        <div className="text-xs text-muted-foreground">
                          {fmtDate(t.due_at)}{t.person ? ` · ${t.person}` : ""}
                        </div>
                      </div>
                      <span className="text-sm font-semibold tabular-nums text-destructive">{brl(Number(t.amount))}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {overdueInst.length > 0 && (
              <section>
                <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground mb-2 font-medium">
                  Parcelas vencidas ({overdueInst.length})
                </h4>
                <ul className="space-y-2">
                  {overdueInst.map((i: any) => (
                    <li
                      key={i.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2.5"
                    >
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">
                          {i.card_purchases?.description || "Parcela"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {fmtDate(i.due_at)}{i.cards?.name ? ` · ${i.cards.name}` : ""}
                        </div>
                      </div>
                      <span className="text-sm font-semibold tabular-nums text-destructive">{brl(Number(i.amount))}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
