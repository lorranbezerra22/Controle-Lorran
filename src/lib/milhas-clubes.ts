import type { Earning, Program } from "@/lib/milhas-storage";

const fusoSaoPaulo = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" });
const hora = 60 * 60 * 1000;
export const antecedenciaDeCredito = 7;

export function dataSaoPaulo(agora = Date.now()) {
  return fusoSaoPaulo.format(agora);
}

export function formatarDataCredito(data: string) {
  return data.split("-").reverse().join("/");
}

export function isPendingEarning(note?: string) {
  return (note ?? "").includes("[PENDING]");
}

export function mesDoBanco(mes: string) {
  return mes.slice(0, 7) + "-01";
}

export function somarMeses(data: string, meses: number) {
  const [ano, mes, dia] = data.split("-").map(Number);
  const ultimoDia = new Date(Date.UTC(ano, mes + meses, 0)).getUTCDate();
  return new Date(Date.UTC(ano, mes - 1 + meses, Math.min(dia, ultimoDia)))
    .toISOString()
    .slice(0, 10);
}

export type PrevisaoDeClube = {
  data_prevista: string;
  pontos: number;
  custo: number;
  descricao: string;
};

export function creditosPendentes(earnings: Earning[], programs: Program[]) {
  const programas = new Map(programs.map((programa) => [programa.id, programa]));
  return earnings
    .flatMap((credito) => {
      const nota = credito.note ?? "";
      if (credito.source !== "clube" || !isPendingEarning(nota)) return [];
      const programa = programas.get(credito.programId);
      const data = nota.match(/\[DUE:(\d{4}-\d{2}-\d{2})\]/)?.[1];
      if (!programa || !data || !Number.isFinite(Date.parse(data + "T03:00:00Z"))) return [];
      return [
        {
          credito,
          programa,
          data,
          serie: nota.match(/\[SERIE:([^\]]+)\]/)?.[1] ?? "",
          promocao: nota.match(/(?:^| • )Promo: ([^•]+)/)?.[1]?.trim(),
          bonus: nota.includes("[EXTRA]"),
        },
      ];
    })
    .sort((a, b) => a.data.localeCompare(b.data) || a.credito.id.localeCompare(b.credito.id));
}

export type CreditoPendente = ReturnType<typeof creditosPendentes>[number];

export function proximosCreditos(pendentes: CreditoPendente[], agora: number, dias: number | null) {
  const limite = new Date(Date.parse(dataSaoPaulo(agora) + "T12:00:00Z") + (dias ?? 0) * 24 * hora)
    .toISOString()
    .slice(0, 10);
  const vistos = new Set<string>();
  return pendentes.filter((pendente) => {
    const grupo = [pendente.programa.id, pendente.serie, pendente.bonus].join(":");
    if (vistos.has(grupo) || (dias !== null && pendente.data > limite)) return false;
    vistos.add(grupo);
    return true;
  });
}

export function statusDoCredito(data: string, agora: number) {
  const hoje = dataSaoPaulo(agora);
  if (data === hoje) return { estado: "hoje" as const, texto: "Previsto para hoje" };
  const horas = Math.floor(Math.abs(Date.parse(data + "T03:00:00Z") - agora) / hora);
  const dias = Math.floor(horas / 24);
  const duracao =
    String(dias).padStart(2, "0") +
    (dias === 1 ? " dia " : " dias ") +
    String(horas % 24).padStart(2, "0") +
    " hrs";
  return data < hoje
    ? { estado: "atrasado" as const, texto: "Atrasado há " + duracao }
    : { estado: "previsto" as const, texto: "Em " + duracao };
}
