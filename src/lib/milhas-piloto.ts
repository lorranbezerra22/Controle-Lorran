const hora = 60 * 60 * 1000;
const dia = 24 * hora;

export const inicioSimulacao = Date.parse("2026-11-24T12:00:00-03:00");
export const saldoInicial = 150_000;
export const custoInicial = 1_740;
export const valorMilheiro = 16;
export const planoSmiles = {
  nome: "Clube Smiles 2.000",
  modalidade: "Anual parcelado",
  primeiroCredito: "2026-09-25",
  fim: "2027-09-24",
  parcelas: 12,
  custoParcela: 70,
  pontosIniciais: 18_000,
  pontosMensais: 2_000,
};

export const custoContrato = planoSmiles.parcelas * planoSmiles.custoParcela;
export const pontosContrato =
  planoSmiles.pontosIniciais + (planoSmiles.parcelas - 1) * planoSmiles.pontosMensais;

export const agendaDeCreditos = Array.from({ length: planoSmiles.parcelas }, (_, index) =>
  new Date(Date.UTC(2026, 8 + index, 25)).toISOString().slice(0, 10),
);

export type Credito = { competencia: string; data: string; pontos: number; custo: number };

export const creditosIniciais: Credito[] = [
  {
    competencia: agendaDeCreditos[0],
    data: agendaDeCreditos[0],
    pontos: planoSmiles.pontosIniciais,
    custo: planoSmiles.custoParcela,
  },
  {
    competencia: agendaDeCreditos[1],
    data: agendaDeCreditos[1],
    pontos: planoSmiles.pontosMensais,
    custo: planoSmiles.custoParcela,
  },
];

const dataSaoPaulo = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" });

export function dataLocal(instante: number) {
  return dataSaoPaulo.format(instante);
}

export function dataCurta(data: string) {
  return data.split("-").reverse().join("/");
}

export function avancarDia(instante: number) {
  return instante + dia;
}

export function proximoCredito(creditos: Credito[]) {
  return agendaDeCreditos.find((data) => !creditos.some((credito) => credito.competencia === data));
}

export function acompanharCredito(
  dataPrevista: string,
  instante: number,
): { estado: "previsto" | "hoje" | "atrasado"; rotulo: string } {
  const hoje = dataLocal(instante);
  const horarioPrevisto = Date.parse(dataPrevista + "T00:00:00-03:00");
  const horas = Math.floor(Math.abs(horarioPrevisto - instante) / hora);
  const tempo =
    String(Math.floor(horas / 24)).padStart(2, "0") +
    " dias " +
    String(horas % 24).padStart(2, "0") +
    " hrs";

  if (hoje > dataPrevista) return { estado: "atrasado", rotulo: "Atrasado há " + tempo };
  if (hoje === dataPrevista) return { estado: "hoje", rotulo: "Previsto para hoje" };
  return { estado: "previsto", rotulo: "Em " + tempo };
}

export function registrarCredito(
  creditos: Credito[],
  competencia: string,
  data: string,
  instante: number,
) {
  const instanteCredito = Date.parse(data + "T12:00:00-03:00");
  if (
    competencia !== proximoCredito(creditos) ||
    competencia > dataLocal(instante) ||
    !Number.isFinite(instanteCredito) ||
    data !== dataLocal(instanteCredito) ||
    data < competencia.slice(0, 7) + "-01" ||
    data > dataLocal(instante)
  ) {
    return creditos;
  }

  return [
    ...creditos,
    { competencia, data, pontos: planoSmiles.pontosMensais, custo: planoSmiles.custoParcela },
  ];
}
