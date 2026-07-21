import { useState } from "react";
import { Bell } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { BankIcon } from "@/components/BankIcon";
import { numM } from "@/lib/milhas-storage";

interface RecentCredit {
  id: string;
  programName: string;
  points: number;
  parcelaLabel: string;
  t: number;
}

interface Props {
  credits: RecentCredit[];
}

export function MilhasNotificationBell({ credits }: Props) {
  const [open, setOpen] = useState(false);
  const total = credits.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Notificações do clube"
        className="relative h-10 w-10 rounded-xl border border-border bg-card hover:border-primary/40 hover:bg-primary/5 transition-colors flex items-center justify-center text-muted-foreground hover:text-foreground"
      >
        <Bell className="w-4 h-4" />
        {total > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-gold text-navy text-[10px] font-bold flex items-center justify-center shadow">
            {total}
          </span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-gold" /> Parcelas creditadas hoje
            </DialogTitle>
            <DialogDescription>
              Parcelas de clube creditadas nas últimas 24h. Some do painel no dia seguinte.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
            {total === 0 && (
              <div className="text-sm text-muted-foreground text-center py-8">
                Nenhuma parcela creditada nas últimas 24h.
              </div>
            )}
            {credits.map((r) => (
              <div
                key={r.id}
                className="flex items-center justify-between gap-3 border border-border bg-gradient-to-br from-primary/5 to-transparent rounded-xl p-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <BankIcon bank={r.programName} size={26} square />
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{r.programName}</p>
                    <p className="text-xs text-muted-foreground">{r.parcelaLabel}</p>
                  </div>
                </div>
                <p className="text-lg font-[var(--font-display)] tabular-nums text-gold whitespace-nowrap">
                  +{numM(r.points)}<span className="text-xs text-muted-foreground ml-1">pts</span>
                </p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
