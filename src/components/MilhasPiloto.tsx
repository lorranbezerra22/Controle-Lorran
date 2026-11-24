import { useState, type FormEvent, type ReactNode } from "react";
import {
  ArrowUpRight,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Coins,
  LayoutDashboard,
  ListOrdered,
  Plus,
  Settings2,
  Wallet,
} from "lucide-react";
import { KpiTile } from "@/components/KpiTile";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
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
import { brlM, numM } from "@/lib/milhas-storage";
import {
  acompanharCredito,
  avancarDia,
  creditosIniciais,
  custoContrato,
  custoInicial,
  dataCurta,
  dataLocal,
  inicioSimulacao,
  planoSmiles,
  pontosContrato,
  proximoCredito,
  registrarCredito,
  saldoInicial,
  valorMilheiro,
} from "@/lib/milhas-piloto";

const views = [
  { id: "painel", label: "Painel", icon: LayoutDashboard },
  { id: "extrato", label: "Extrato", icon: ListOrdered },
  { id: "plano", label: "Configurações", icon: Settings2 },
] as const;

type View = (typeof views)[number]["id"];

const alertStyle = {
  previsto: "border-border bg-muted/25 text-muted-foreground",
  hoje: "border-warning/35 bg-warning/10 text-foreground",
  atrasado: "border-destructive/35 bg-destructive/10 text-destructive",
};

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-card shadow-[var(--shadow-card)]">
      <div className="flex min-h-16 flex-wrap items-center justify-between gap-2 border-b border-border/65 px-4 py-3 sm:px-5">
        <h2 className="text-base font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function SmilesMark() {
  return (
    <span
      aria-hidden
      className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-[#fff0e2] text-base font-extrabold text-[#9d4404]"
    >
      S
    </span>
  );
}

export function MilhasPiloto() {
  const [view, setView] = useState<View>("painel");
  const [instante, setInstante] = useState(inicioSimulacao);
  const [creditos, setCreditos] = useState(creditosIniciais);
  const [referencia, setReferencia] = useState({
    pontos: saldoInicial,
    data: dataLocal(inicioSimulacao),
  });
  const [dialog, setDialog] = useState<"credito" | "saldo" | null>(null);
  const [dataCredito, setDataCredito] = useState("");
  const [saldoDigitado, setSaldoDigitado] = useState("");
  const [feedback, setFeedback] = useState("");

  const hoje = dataLocal(instante);
  const novos = creditos.slice(creditosIniciais.length);
  const saldo = saldoInicial + novos.reduce((soma, credito) => soma + credito.pontos, 0);
  const custo = custoInicial + novos.reduce((soma, credito) => soma + credito.custo, 0);
  const cpm = (custo * 1000) / saldo;
  const recebido = creditos.reduce((soma, credito) => soma + credito.pontos, 0);
  const diferenca = referencia.pontos - saldo;
  const proximaData = proximoCredito(creditos);
  const alerta = proximaData ? acompanharCredito(proximaData, instante) : null;
  const permiteRegistro = Boolean(proximaData && proximaData <= hoje);
  const nomeTela = views.find((item) => item.id === view)?.label;

  function abrirExtrato() {
    setView("extrato");
    setFeedback("");
  }

  function abrirRegistro() {
    setDataCredito(hoje);
    setDialog("credito");
  }

  function salvarCredito(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!proximaData) return;
    const atualizado = registrarCredito(creditos, proximaData, dataCredito, instante);
    if (atualizado === creditos) return;
    setCreditos(atualizado);
    setDialog(null);
    setFeedback(numM(planoSmiles.pontosMensais) + " milhas lançadas no extrato.");
  }

  function salvarSaldo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const pontos = Number(saldoDigitado);
    if (!saldoDigitado.trim() || !Number.isSafeInteger(pontos) || pontos < 0) return;
    setReferencia({ pontos, data: hoje });
    setDialog(null);
  }

  function reiniciar() {
    setInstante(inicioSimulacao);
    setCreditos(creditosIniciais);
    setReferencia({ pontos: saldoInicial, data: dataLocal(inicioSimulacao) });
    setView("painel");
    setFeedback("");
  }

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Wallet}
        title={view === "painel" ? "Painel de Milhas" : (nomeTela ?? "CRM de Milhas")}
        subtitle="CRM de Milhas · Carteira de demonstração"
      />
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 pb-3">
        <nav aria-label="Navegação da prévia" className="flex flex-wrap gap-1.5">
          {views.map(({ id, label, icon: Icon }) => (
            <Button
              key={id}
              type="button"
              variant={view === id ? "secondary" : "ghost"}
              aria-current={view === id ? "page" : undefined}
              onClick={() => setView(id)}
            >
              <Icon /> {label}
            </Button>
          ))}
        </nav>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-sm tabular-nums text-muted-foreground">
            <CalendarDays className="size-4" aria-hidden />
            <span className="sr-only">Data simulada</span>
            {dataCurta(hoje)}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={() => setInstante(avancarDia)}>
            Avançar 1 dia
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={reiniciar}>
            Reiniciar
          </Button>
        </div>
      </div>

      {view === "painel" && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiTile
              icon={<Coins className="size-5" />}
              label="Saldo de milhas"
              value={saldo}
              format={numM}
              sub="Smiles"
              highlight
            />
            <KpiTile
              icon={<Wallet className="size-5" />}
              label="Custo no saldo"
              value={custo}
              sub="Custo das milhas disponíveis"
              index={1}
            />
            <KpiTile
              icon={<ListOrdered className="size-5" />}
              label="CPM do saldo"
              value={cpm}
              sub="Custo a cada 1.000 milhas"
              index={2}
            />
            <KpiTile
              icon={<ArrowUpRight className="size-5" />}
              label="Possível venda bruta"
              value={(saldo * valorMilheiro) / 1000}
              sub={brlM(valorMilheiro) + " por 1.000 milhas"}
              index={3}
            />
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-[1.35fr_1fr]">
            <Section
              title="Pendências"
              action={<Bell className="size-4 text-muted-foreground" aria-hidden />}
            >
              <div className="p-4 sm:p-5" aria-live="polite">
                {proximaData && alerta ? (
                  <div className={"rounded-xl border p-4 " + alertStyle[alerta.estado]}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex gap-3">
                        <SmilesMark />
                        <div>
                          <p className="text-sm font-semibold text-foreground">
                            Crédito do Clube Smiles
                          </p>
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            {numM(planoSmiles.pontosMensais)} milhas · {dataCurta(proximaData)}
                          </p>
                        </div>
                      </div>
                      <span className="rounded-md bg-background/70 px-2.5 py-1 text-sm font-semibold tabular-nums">
                        {alerta.rotulo}
                      </span>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border/70 pt-3">
                      <span className="text-sm text-muted-foreground">
                        Aguardando lançamento no extrato
                      </span>
                      <Button type="button" size="sm" variant="outline" onClick={abrirExtrato}>
                        Abrir extrato <ChevronRight />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <p className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="size-4 text-success" /> Todos os créditos do ciclo
                    foram lançados.
                  </p>
                )}
              </div>
            </Section>

            <Section
              title="Conferência de saldo"
              action={
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setSaldoDigitado(String(referencia.pontos));
                    setDialog("saldo");
                  }}
                >
                  Atualizar saldo do app
                </Button>
              }
            >
              <div className="grid grid-cols-2 gap-4 p-4 sm:p-5">
                <div>
                  <p className="text-sm text-muted-foreground">Saldo no CRM</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">{numM(saldo)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Saldo no app</p>
                  <p className="mt-1 text-xl font-semibold tabular-nums">
                    {numM(referencia.pontos)}
                  </p>
                </div>
                <p
                  aria-live="polite"
                  className={
                    "col-span-2 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border/70 pt-3 text-sm " +
                    (diferenca === 0 ? "text-success" : "text-destructive")
                  }
                >
                  {diferenca === 0 ? (
                    <>
                      <CheckCircle2 className="size-4" aria-hidden /> Saldo confere
                    </>
                  ) : (
                    "Diferença (app − CRM): " + numM(diferenca) + " milhas"
                  )}
                  <span className="text-xs text-muted-foreground">
                    · Conferido em {dataCurta(referencia.data)}
                  </span>
                </p>
              </div>
            </Section>
          </div>

          <Section title="Programas">
            <Table className="min-w-[610px]">
              <TableHeader className="bg-muted/25">
                <TableRow>
                  <TableHead className="pl-5" scope="col">
                    Programa
                  </TableHead>
                  <TableHead scope="col">Clube atual</TableHead>
                  <TableHead className="text-right" scope="col">
                    Saldo
                  </TableHead>
                  <TableHead className="text-right" scope="col">
                    CPM do plano
                  </TableHead>
                  <TableHead className="pr-5 text-right" scope="col">
                    Extrato
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell className="py-3 pl-5">
                    <span className="flex items-center gap-2 font-semibold">
                      <SmilesMark /> Smiles
                    </span>
                  </TableCell>
                  <TableCell>Clube 2.000 · Com promoção</TableCell>
                  <TableCell className="text-right tabular-nums">{numM(saldo)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {brlM((custoContrato * 1000) / pontosContrato)}
                  </TableCell>
                  <TableCell className="pr-5 text-right">
                    <Button type="button" variant="outline" size="sm" onClick={abrirExtrato}>
                      Ver extrato
                    </Button>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </Section>
        </>
      )}

      {view === "extrato" && (
        <Section
          title="Extrato Smiles"
          action={
            permiteRegistro ? (
              <Button type="button" onClick={abrirRegistro}>
                <Plus /> Lançar crédito do clube
              </Button>
            ) : null
          }
        >
          {feedback && (
            <p
              role="status"
              className="border-b border-border/70 px-5 py-3 text-sm font-medium text-success"
            >
              {feedback}
            </p>
          )}
          {proximaData && (
            <p className="px-5 py-3 text-sm text-muted-foreground">
              Próximo crédito previsto em {dataCurta(proximaData)} ·{" "}
              {numM(planoSmiles.pontosMensais)} milhas
            </p>
          )}
          <Table className="min-w-[560px]">
            <TableHeader className="bg-muted/25">
              <TableRow>
                <TableHead className="pl-5" scope="col">
                  Data do crédito
                </TableHead>
                <TableHead scope="col">Competência</TableHead>
                <TableHead scope="col">Descrição</TableHead>
                <TableHead className="text-right" scope="col">
                  Milhas
                </TableHead>
                <TableHead className="pr-5 text-right" scope="col">
                  Custo atribuído
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...creditos].reverse().map((credito) => (
                <TableRow key={credito.competencia}>
                  <TableCell className="py-3 pl-5 tabular-nums">
                    {dataCurta(credito.data)}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {dataCurta(credito.competencia).slice(3)}
                  </TableCell>
                  <TableCell>
                    {credito.competencia === planoSmiles.primeiroCredito
                      ? "Clube Smiles · Crédito inicial"
                      : "Clube Smiles · Crédito mensal"}
                  </TableCell>
                  <TableCell className="text-right font-semibold tabular-nums text-success">
                    +{numM(credito.pontos)}
                  </TableCell>
                  <TableCell className="pr-5 text-right tabular-nums">
                    {brlM(credito.custo)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Section>
      )}

      {view === "plano" && (
        <Section
          title={planoSmiles.nome}
          action={<span className="text-sm text-muted-foreground">Com promoção</span>}
        >
          <dl className="grid gap-x-5 gap-y-4 p-5 sm:grid-cols-2 lg:grid-cols-3">
            {[
              ["Modalidade", planoSmiles.modalidade],
              ["Primeiro crédito do plano", dataCurta(planoSmiles.primeiroCredito)],
              ["Fim do ciclo", dataCurta(planoSmiles.fim)],
              [
                "Custo do contrato",
                brlM(custoContrato) + " · 12 × " + brlM(planoSmiles.custoParcela),
              ],
              ["Créditos do ciclo", numM(recebido) + " de " + numM(pontosContrato) + " milhas"],
              ["CPM do contrato", brlM((custoContrato * 1000) / pontosContrato)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="mt-1 text-sm font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
        </Section>
      )}

      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent>
          {dialog === "credito" && proximaData && (
            <form className="space-y-4" onSubmit={salvarCredito}>
              <DialogHeader>
                <DialogTitle>Lançar crédito do Clube Smiles</DialogTitle>
                <DialogDescription>
                  Confirme o crédito de {numM(planoSmiles.pontosMensais)} milhas no aplicativo antes
                  de registrar a competência de {dataCurta(proximaData).slice(3)}.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="piloto-data-credito">Data do crédito no extrato</Label>
                <Input
                  id="piloto-data-credito"
                  type="date"
                  min={proximaData.slice(0, 7) + "-01"}
                  max={hoje}
                  value={dataCredito}
                  onChange={(event) => setDataCredito(event.target.value)}
                  required
                />
              </div>
              <DialogFooter>
                <Button type="submit">Registrar {numM(planoSmiles.pontosMensais)} milhas</Button>
              </DialogFooter>
            </form>
          )}
          {dialog === "saldo" && (
            <form className="space-y-4" onSubmit={salvarSaldo}>
              <DialogHeader>
                <DialogTitle>Atualizar saldo do app Smiles</DialogTitle>
                <DialogDescription>
                  Informe o saldo consultado em {dataCurta(hoje)} para conferir com o CRM.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-2">
                <Label htmlFor="piloto-saldo-app">Saldo no app</Label>
                <Input
                  id="piloto-saldo-app"
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  value={saldoDigitado}
                  onChange={(event) => setSaldoDigitado(event.target.value)}
                  required
                />
              </div>
              <DialogFooter>
                <Button type="submit">Salvar conferência</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
