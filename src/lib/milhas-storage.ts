export type ProgramCategory = "fidelidade" | "milhagem";

export const CATEGORY_LABEL: Record<ProgramCategory, string> = {
  fidelidade: "Fidelidade (bancos)",
  milhagem: "Milhagem (companhias)",
};

export interface Program {
  id: string;
  name: string;
  category: ProgramCategory;
  balance: number;
  valuePerThousand: number;
  monthlyGoal?: number;
  color: string;
  createdAt: string;
}

export type EarningSource = "cartao" | "bonificadas" | "clube" | "transferencia";

export const SOURCE_LABEL: Record<EarningSource, string> = {
  cartao: "Cartão",
  bonificadas: "Bonificadas",
  clube: "Clube",
  transferencia: "Transferência",
};

export interface Earning {
  id: string;
  programId: string;
  month: string;
  points: number;
  source: EarningSource;
  cost?: number;
  parity?: number;         // paridade da transferência (ex.: 1 = 1:1, 2 = 1:2)
  bonusPercent?: number;   // % de bônus (transferência bonificada)
  note?: string;
  createdAt: string;
}

export interface Transfer {
  id: string;
  fromProgramId: string;
  toProgramName: string;
  pointsSent: number;
  bonusPercent: number;
  pointsReceived: number;
  cashValue: number;
  date: string;
  note?: string;
  createdAt: string;
}

export type RedemptionType = "dinheiro" | "viagem";

export const REDEMPTION_LABEL: Record<RedemptionType, string> = {
  dinheiro: "Dinheiro",
  viagem: "Viagem",
};

export interface Redemption {
  id: string;
  programId: string;
  points: number;
  type: RedemptionType;
  cashValue?: number;         // se convertido em dinheiro (valor recebido)
  cashEquivalent?: number;    // preço em dinheiro equivalente (comparação)
  taxes?: number;             // taxas pagas
  milesCost?: number;         // custo real das milhas usadas
  screenshotUrl?: string;     // print do preço em dinheiro
  destination?: string;       // se viagem
  travelDate?: string;        // se viagem (YYYY-MM-DD)
  date: string;               // data do resgate
  note?: string;
  createdAt: string;
}

const KEYS = {
  programs: "milhas.programs",
  earnings: "milhas.earnings",
  transfers: "milhas.transfers",
  redemptions: "milhas.redemptions",
};

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  localStorage.setItem(key, JSON.stringify(value));
}

export const milhasStorage = {
  getPrograms: () => read<Program[]>(KEYS.programs, []),
  setPrograms: (v: Program[]) => write(KEYS.programs, v),
  getEarnings: () => read<Earning[]>(KEYS.earnings, []),
  setEarnings: (v: Earning[]) => write(KEYS.earnings, v),
  getTransfers: () => read<Transfer[]>(KEYS.transfers, []),
  setTransfers: (v: Transfer[]) => write(KEYS.transfers, v),
  getRedemptions: () => read<Redemption[]>(KEYS.redemptions, []),
  setRedemptions: (v: Redemption[]) => write(KEYS.redemptions, v),
};


export function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export const brlM = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

export const numM = (n: number) => n.toLocaleString("pt-BR");

export const PROGRAM_COLORS = [
  "#C9A961",
  "#8FA5C4",
  "#B87333",
  "#6B8E7F",
  "#9B7EBD",
  "#D97757",
];
