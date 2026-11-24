import { Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Bell, CheckCircle2, ChevronRight, ClipboardCheck } from "lucide-react";
import { toast } from "sonner";
import { BankIcon } from "@/components/BankIcon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useMilhasData } from "@/context/MilhasDataContext";
import {
  antecedenciaDeCredito,
  creditosPendentes,
  dataSaoPaulo,
  formatarDataCredito,
  proximosCreditos,
  statusDoCredito,
  type CreditoPendente,
} from "@/lib/milhas-clubes";
import { numM, type Program } from "@/lib/milhas-storage";

const estilos = {
  previsto: "border-border bg-muted/25 text-muted-foreground",
  hoje: "border-warning/35 bg-warning/10 text-foreground",
  atrasado: "border-destructive/35 bg-destructive/10 text-destructive",
};

export function MilhasPendencias({
  modo,
  programaId,
  creditoId,
  selecionar,
}: {
  modo: "painel" | "registros";
  programaId?: string;
  creditoId?: string;
  selecionar?: (id?: string) => void;
}) {
  const { earnings, programs, loading } = useMilhasData();
  const [agora, setAgora] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setAgora(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const painel = modo === "painel";
  const pendentes = creditosPendentes(earnings, programs);
  const visiveis = proximosCreditos(
    pendentes.filter(({ programa }) => !programaId || programa.id === programaId),
    agora,
    painel ? antecedenciaDeCredito : null,
  );
  const selecionado = pendentes.find(
    ({ credito, programa }) => credito.id === creditoId && programa.canEdit,
  );

  return (
    <Card className="min-w-0 rounded-2xl shadow-[var(--shadow-card)]">
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 border-b border-border/65 p-4 sm:p-5">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="size-4 text-primary" aria-hidden />
          {painel ? "Pendências" : "Créditos de clube a registrar"}
        </CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link to="/milhas/config">Configurar clubes</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 p-4 sm:p-5" aria-live="polite">
        {visiveis.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Carregando créditos…"
              : painel
                ? "Nenhum crédito próximo ou atrasado."
                : "Nenhum crédito de clube pendente."}
          </p>
        )}
        {visiveis.map((item) => {
          const { credito, programa, data, bonus, promocao } = item;
          const status = statusDoCredito(data, agora);
          return (
            <div
              key={credito.id}
              className={"rounded-xl border p-3 sm:p-4 " + estilos[status.estado]}
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <BankIcon bank={programa.name} size={30} square />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">
                      {programa.name} · {bonus ? "Bônus do clube" : "Crédito do clube"}
                    </p>
                    {promocao && <p className="text-xs text-muted-foreground">{promocao}</p>}
                    <p className="mt-0.5 text-sm text-muted-foreground">
                      {numM(credito.points)} pontos · {formatarDataCredito(data)}
                    </p>
                  </div>
                </div>
                <span className="rounded-md bg-background/70 px-2.5 py-1 text-sm font-semibold tabular-nums">
                  {status.texto}
                </span>
              </div>
              {programa.canEdit && (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-2.5">
                  <span className="text-sm text-muted-foreground">
                    Aguardando registro no extrato
                  </span>
                  {painel ? (
                    <Button asChild variant="outline" size="sm">
                      <Link to="/milhas/registros" search={{ credito: credito.id }}>
                        Abrir extrato <ChevronRight />
                      </Link>
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={dataSaoPaulo(agora) < credito.month + "-01"}
                      onClick={() => selecionar?.(credito.id)}
                    >
                      Registrar crédito
                    </Button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
      {!painel && selecionado && (
        <ConfirmarCredito
          key={selecionado.credito.id}
          pendente={selecionado}
          fechar={() => selecionar?.()}
        />
      )}
    </Card>
  );
}

function ConfirmarCredito({ pendente, fechar }: { pendente: CreditoPendente; fechar: () => void }) {
  const { confirmClubCredit } = useMilhasData();
  const hoje = dataSaoPaulo();
  const [data, setData] = useState(hoje);
  const [pontos, setPontos] = useState(String(pendente.credito.points));
  const [saving, setSaving] = useState(false);
  const minimo = pendente.credito.month + "-01";

  async function salvar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const total = Number(pontos);
    if (saving || !Number.isSafeInteger(total) || total < 1 || data < minimo || data > hoje) return;
    setSaving(true);
    try {
      await confirmClubCredit(pendente.credito.id, data, total);
      toast.success("Crédito registrado no extrato.");
      fechar();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível registrar o crédito.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) fechar();
      }}
    >
      <DialogContent>
        <form onSubmit={salvar} className="space-y-4">
          <DialogHeader>
            <DialogTitle>
              Registrar {pendente.bonus ? "bônus" : "crédito"} de {pendente.programa.name}
            </DialogTitle>
            <DialogDescription>
              Previsão de {formatarDataCredito(pendente.data)}. Informe o crédito que aparece no
              extrato do programa.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="data-credito-milhas">Data no extrato</Label>
              <Input
                id="data-credito-milhas"
                type="date"
                value={data}
                min={minimo}
                max={hoje}
                onChange={(event) => setData(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pontos-credito-milhas">Pontos recebidos nesse crédito</Label>
              <Input
                id="pontos-credito-milhas"
                type="number"
                inputMode="numeric"
                min={1}
                max={1e12}
                value={pontos}
                onChange={(event) => setPontos(event.target.value)}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={fechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Registrando…" : "Registrar no extrato"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MilhasConferencia({ programas }: { programas: Program[] }) {
  const { loading } = useMilhasData();
  const [programaId, setProgramaId] = useState<string>();
  const programa = programas.find((item) => item.id === programaId);
  return (
    <Card className="min-w-0 rounded-2xl shadow-[var(--shadow-card)]">
      <CardHeader className="border-b border-border/65 p-4 sm:p-5">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="size-4 text-primary" aria-hidden /> Conferência de saldo
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {programas.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {loading
              ? "Carregando saldos…"
              : "Cadastre um programa para conferir o saldo com o aplicativo."}
          </p>
        ) : (
          <Table className="min-w-[450px]">
            <TableHeader className="bg-muted/25">
              <TableRow>
                <TableHead scope="col" className="pl-4">
                  Programa
                </TableHead>
                <TableHead scope="col" className="text-right">
                  CRM
                </TableHead>
                <TableHead scope="col" className="text-right">
                  App
                </TableHead>
                <TableHead scope="col" className="pr-4">
                  Conferência
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {programas.map((item) => {
                const diferenca =
                  item.appBalance === undefined ? null : item.appBalance - item.balance;
                return (
                  <TableRow key={item.id}>
                    <TableCell className="py-3 pl-4 font-medium">{item.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{numM(item.balance)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {item.appBalance === undefined ? "—" : numM(item.appBalance)}
                    </TableCell>
                    <TableCell className="space-y-1 pr-4">
                      {diferenca === null ? (
                        <p className="text-muted-foreground">A conferir</p>
                      ) : (
                        <p
                          className={
                            diferenca === 0
                              ? "flex items-center gap-1 text-success"
                              : "text-destructive"
                          }
                        >
                          {diferenca === 0 ? (
                            <>
                              <CheckCircle2 className="size-3.5" aria-hidden /> Confere
                            </>
                          ) : (
                            "Diferença (app − CRM): " + numM(diferenca)
                          )}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        {item.appBalanceDate && (
                          <time
                            className="text-xs text-muted-foreground"
                            dateTime={item.appBalanceDate}
                          >
                            {formatarDataCredito(item.appBalanceDate)}
                          </time>
                        )}
                        {item.canEdit && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setProgramaId(item.id)}
                          >
                            Atualizar saldo
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
      {programa && (
        <ConferirSaldo
          key={programa.id}
          programa={programa}
          fechar={() => setProgramaId(undefined)}
        />
      )}
    </Card>
  );
}

function ConferirSaldo({ programa, fechar }: { programa: Program; fechar: () => void }) {
  const { updateProgram } = useMilhasData();
  const hoje = dataSaoPaulo();
  const [data, setData] = useState(hoje);
  const [saldo, setSaldo] = useState(programa.appBalance?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  async function salvar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const total = Number(saldo);
    if (
      saving ||
      !saldo.trim() ||
      !Number.isSafeInteger(total) ||
      total < 0 ||
      !data ||
      data > hoje
    )
      return;
    setSaving(true);
    try {
      await updateProgram(programa.id, { appBalance: total, appBalanceDate: data });
      toast.success("Saldo do aplicativo atualizado.");
      fechar();
    } catch {
      toast.error("Não foi possível salvar a conferência de saldo.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) fechar();
      }}
    >
      <DialogContent>
        <form onSubmit={salvar} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Conferir saldo de {programa.name}</DialogTitle>
            <DialogDescription>
              Informe os pontos disponíveis no aplicativo e a data da consulta.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="saldo-app-milhas">Saldo do aplicativo</Label>
              <Input
                id="saldo-app-milhas"
                type="number"
                min={0}
                inputMode="numeric"
                value={saldo}
                onChange={(event) => setSaldo(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="consulta-saldo-milhas">Data da consulta</Label>
              <Input
                id="consulta-saldo-milhas"
                type="date"
                value={data}
                max={hoje}
                onChange={(event) => setData(event.target.value)}
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={saving} onClick={fechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando…" : "Salvar conferência"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
