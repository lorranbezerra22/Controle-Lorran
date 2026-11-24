import { Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Bell, CheckCircle2, ChevronDown, ClipboardCheck } from "lucide-react";
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
import { useMilhasData } from "@/context/MilhasDataContext";
import {
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
  creditoId,
  selecionar,
}: {
  creditoId?: string;
  selecionar?: (id?: string) => void;
}) {
  const { earnings, programs, loading } = useMilhasData();
  const [agora, setAgora] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setAgora(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  const pendentes = creditosPendentes(earnings, programs);
  const visiveis = proximosCreditos(pendentes, agora);
  const selecionado = pendentes.find(
    ({ credito, programa }) =>
      credito.id === creditoId &&
      programa.canEdit &&
      credito.month <= dataSaoPaulo(agora).slice(0, 7),
  );

  return (
    <Card
      id="creditos-pendentes"
      className="min-w-0 scroll-mt-6 rounded-2xl shadow-[var(--shadow-card)]"
    >
      <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 border-b border-border/65 p-4 sm:p-5">
        <CardTitle className="flex items-center gap-2 text-base">
          <Bell className="size-4 text-primary" aria-hidden />
          Créditos de clube a registrar
        </CardTitle>
        <Button asChild variant="ghost" size="sm">
          <Link to="/milhas/config">Configurar clubes</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 p-4 sm:p-5" aria-live="polite">
        {visiveis.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {loading ? "Carregando créditos…" : "Nenhum crédito de clube pendente."}
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
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={dataSaoPaulo(agora) < credito.month + "-01"}
                    onClick={() => selecionar?.(credito.id)}
                  >
                    Registrar crédito
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
      {selecionado && (
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

export function MilhasConferencia({
  programas,
  programaInicial,
}: {
  programas: Program[];
  programaInicial?: string;
}) {
  const { loading } = useMilhasData();
  const [selecionado, setSelecionado] = useState(programaInicial);
  const [editando, setEditando] = useState(false);
  const programa = programas.find((item) => item.id === selecionado) ?? programas[0];
  const diferenca =
    programa?.appBalance === undefined ? null : programa.appBalance - programa.balance;

  return (
    <Card
      id="conferencia-de-saldo"
      className="min-w-0 scroll-mt-6 rounded-2xl shadow-[var(--shadow-card)]"
    >
      <CardHeader className="flex flex-wrap items-start justify-between gap-4 space-y-0 border-b border-border/65 p-4 sm:flex-row sm:items-center sm:p-5">
        <CardTitle className="flex items-center gap-2 text-base">
          <ClipboardCheck className="size-4 text-primary" aria-hidden /> Conferência de saldo
        </CardTitle>
        {programa && (
          <div className="relative w-full sm:w-auto">
            <Label htmlFor="milhas-programa-conferencia" className="sr-only">
              Programa para conferir
            </Label>
            <select
              id="milhas-programa-conferencia"
              value={programa.id}
              onChange={(event) => {
                setEditando(false);
                setSelecionado(event.target.value);
              }}
              className="h-9 w-full appearance-none rounded-xl border border-border bg-card pl-3 pr-9 text-sm focus-visible:outline-2 focus-visible:outline-ring sm:min-w-48"
            >
              {programas.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            <ChevronDown
              className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4 p-4 sm:p-5">
        {programa ? (
          <>
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="min-w-0 rounded-xl bg-muted/35 p-3">
                <dt className="text-xs text-muted-foreground">Saldo no CRM</dt>
                <dd className="mt-1 break-words text-lg font-semibold tabular-nums">
                  {numM(programa.balance)}
                </dd>
              </div>
              <div className="min-w-0 rounded-xl bg-muted/35 p-3">
                <dt className="text-xs text-muted-foreground">Saldo no aplicativo</dt>
                <dd className="mt-1 break-words text-lg font-semibold tabular-nums">
                  {programa.appBalance === undefined ? "—" : numM(programa.appBalance)}
                </dd>
              </div>
              <div className="col-span-2 min-w-0 rounded-xl bg-muted/35 p-3 sm:col-span-1">
                <dt className="text-xs text-muted-foreground">Diferença (app − CRM)</dt>
                <dd
                  className={
                    "mt-1 flex items-center gap-1.5 text-lg font-semibold tabular-nums " +
                    (diferenca === null
                      ? "text-muted-foreground"
                      : diferenca === 0
                        ? "text-success"
                        : "text-destructive")
                  }
                >
                  {diferenca === 0 && <CheckCircle2 className="size-4 shrink-0" aria-hidden />}
                  {diferenca === null
                    ? "A conferir"
                    : diferenca === 0
                      ? "Confere"
                      : numM(diferenca)}
                </dd>
              </div>
            </dl>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                {programa.appBalanceDate ? (
                  <>
                    Última conferência em{" "}
                    <time dateTime={programa.appBalanceDate}>
                      {formatarDataCredito(programa.appBalanceDate)}
                    </time>
                  </>
                ) : (
                  "Saldo do aplicativo ainda não registrado."
                )}
              </p>
              {programa.canEdit && (
                <Button type="button" size="sm" variant="outline" onClick={() => setEditando(true)}>
                  Atualizar conferência
                </Button>
              )}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {loading
              ? "Carregando saldos…"
              : "Cadastre um programa para conferir o saldo com o aplicativo."}
          </p>
        )}
      </CardContent>
      {programa && editando && (
        <ConferirSaldo key={programa.id} programa={programa} fechar={() => setEditando(false)} />
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
