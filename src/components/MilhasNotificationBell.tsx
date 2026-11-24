import { Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { Bell, ChevronRight, CircleCheck } from "lucide-react";
import { BankIcon } from "@/components/BankIcon";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useMilhasData } from "@/context/MilhasDataContext";
import {
  bonusDeClubePendentes,
  creditosPendentes,
  dataSaoPaulo,
  formatarDataCredito,
  proximosCreditos,
  statusDoCredito,
} from "@/lib/milhas-clubes";
import { numM } from "@/lib/milhas-storage";

interface RecentCredit {
  id: string;
  programName: string;
  points: number;
  parcelaLabel: string;
}

const statusClass = {
  atrasado: "bg-destructive/10 text-destructive",
  hoje: "bg-primary/15 text-primary",
  previsto: "bg-muted text-muted-foreground",
};

export function MilhasNotificationBell({ credits }: { credits: RecentCredit[] }) {
  const { earnings, programs, loading } = useMilhasData();
  const [open, setOpen] = useState(false);
  const [agora, setAgora] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setAgora(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const pendentes = proximosCreditos(creditosPendentes(earnings, programs), agora);
  const bonus = bonusDeClubePendentes(earnings, programs);
  const aConferir = programs.filter(
    (programa) => programa.appBalance === undefined || programa.appBalance !== programa.balance,
  );
  const total = pendentes.length + bonus.length + aConferir.length;
  const atrasados = pendentes.some(
    ({ data }) => statusDoCredito(data, agora).estado === "atrasado",
  );
  const mesAtual = dataSaoPaulo(agora).slice(0, 7);
  const fechar = () => setOpen(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="relative rounded-xl"
          aria-label={
            total ? `Notificações de milhas, ${total} pendentes` : "Notificações de milhas"
          }
        >
          <Bell className="size-4" aria-hidden />
          {total > 0 && (
            <span
              aria-hidden
              className={
                "absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs font-semibold tabular-nums " +
                (atrasados
                  ? "bg-destructive text-destructive-foreground"
                  : "bg-primary text-primary-foreground")
              }
            >
              {total > 99 ? "99+" : total}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        aria-label="Notificações de milhas"
        align="end"
        sideOffset={10}
        collisionPadding={12}
        className="w-[min(25rem,calc(100vw-1.5rem))] overflow-hidden rounded-2xl border-border p-0 shadow-xl"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="font-semibold">Notificações de milhas</h2>
          {total > 0 && (
            <span className="shrink-0 text-xs text-muted-foreground">
              {total} {total === 1 ? "pendência" : "pendências"}
            </span>
          )}
        </div>
        <div className="max-h-[min(30rem,var(--radix-popover-content-available-height))] space-y-4 overflow-y-auto overscroll-contain px-4 py-3">
          {total === 0 && (
            <p className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
              <CircleCheck className="size-4 shrink-0" aria-hidden />
              {loading ? "Carregando pendências…" : "Nenhuma pendência no CRM."}
            </p>
          )}
          {pendentes.length > 0 && (
            <section className="space-y-2" aria-label="Créditos de clube pendentes">
              <h3 className="text-xs font-semibold text-muted-foreground">Créditos de clube</h3>
              {pendentes.map(({ credito, programa, data, bonus: extra }) => {
                const status = statusDoCredito(data, agora);
                return (
                  <NotificationRow
                    key={credito.id}
                    program={programa.name}
                    description={`${numM(credito.points)} pts · ${extra ? "Bônus" : "Crédito"} · ${formatarDataCredito(data)}`}
                    status={
                      <span
                        className={
                          "w-fit rounded-md px-1.5 py-0.5 text-xs " + statusClass[status.estado]
                        }
                      >
                        {status.texto}
                      </span>
                    }
                  >
                    <Link
                      to="/milhas/registros"
                      search={
                        programa.canEdit && credito.month <= mesAtual ? { credito: credito.id } : {}
                      }
                      hash="creditos-pendentes"
                      onClick={fechar}
                      aria-label={"Consultar crédito de " + programa.name}
                      className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                    >
                      <ChevronRight className="size-4" aria-hidden />
                    </Link>
                  </NotificationRow>
                );
              })}
            </section>
          )}
          {bonus.length > 0 && (
            <section className="space-y-2" aria-label="Bônus de clube pendentes">
              <h3 className="text-xs font-semibold text-muted-foreground">Bônus a receber</h3>
              {bonus.map(({ credito, programa, restante, promocao }) => (
                <NotificationRow
                  key={credito.id}
                  program={programa.name}
                  description={`${numM(restante)} pts pendentes${promocao ? " · " + promocao : ""}`}
                >
                  <Link
                    to="/milhas/registros"
                    hash={"bonus-" + credito.id}
                    onClick={fechar}
                    aria-label={"Consultar bônus de " + programa.name}
                    className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <ChevronRight className="size-4" aria-hidden />
                  </Link>
                </NotificationRow>
              ))}
            </section>
          )}
          {aConferir.length > 0 && (
            <section className="space-y-2" aria-label="Conferência de saldo pendente">
              <h3 className="text-xs font-semibold text-muted-foreground">Conferência de saldo</h3>
              {aConferir.map((programa) => (
                <NotificationRow
                  key={programa.id}
                  program={programa.name}
                  description={
                    programa.appBalance === undefined
                      ? "Saldo do aplicativo a conferir"
                      : `Diferença de ${numM(Math.abs(programa.appBalance - programa.balance))} pts`
                  }
                >
                  <Link
                    to="/milhas/config"
                    search={{ conferir: programa.id }}
                    hash="conferencia-de-saldo"
                    onClick={fechar}
                    aria-label={"Conferir saldo de " + programa.name}
                    className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <ChevronRight className="size-4" aria-hidden />
                  </Link>
                </NotificationRow>
              ))}
            </section>
          )}
          {credits.length > 0 && (
            <section className="space-y-2" aria-label="Créditos recentes">
              <h3 className="text-xs font-semibold text-muted-foreground">
                Créditos nas últimas 24 h
              </h3>
              {credits.map((credito) => (
                <NotificationRow
                  key={credito.id}
                  program={credito.programName}
                  description={credito.parcelaLabel}
                >
                  <span className="shrink-0 text-sm font-semibold tabular-nums text-success">
                    +{numM(credito.points)} pts
                  </span>
                </NotificationRow>
              ))}
            </section>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function NotificationRow({
  program,
  description,
  status,
  children,
}: {
  program: string;
  description: string;
  status?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border border-border/60 bg-card px-3 py-2.5">
      <span className="inline-flex pt-0.5" aria-hidden>
        <BankIcon bank={program} size={28} square />
      </span>
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="break-words text-sm font-medium">{program}</p>
        <p className="break-words text-xs text-muted-foreground">{description}</p>
        {status}
      </div>
      {children}
    </div>
  );
}
