import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface AdjustmentRow {
  id: string;
  user_id: string;
  transaction_id: string;
  person: string;
  amount: number;
  created_at: string;
  updated_at: string;
}

export interface Share {
  person: string | null;
  amount: number;
}

export const useAdjustments = () =>
  useQuery({
    queryKey: ["transacao_ajustes"],
    queryFn: async () => {
      const { data, error } = await supabase.from("transacao_ajustes").select("*").limit(5000);
      if (error) throw error;
      return (data ?? []) as AdjustmentRow[];
    },
  });

export type AdjustmentMap = Map<string, AdjustmentRow[]>;

export function groupAdjustments(rows: AdjustmentRow[]): AdjustmentMap {
  const m: AdjustmentMap = new Map();
  for (const r of rows) {
    const arr = m.get(r.transaction_id) ?? [];
    arr.push(r);
    m.set(r.transaction_id, arr);
  }
  return m;
}

export function effectiveShares(
  tx: { id: string; amount: number | string; person?: string | null; paid_by?: string | null },
  adj: AdjustmentMap,
): Share[] {
  const list = adj.get(tx.id);
  if (list && list.length > 0) {
    return list.map((a) => ({ person: a.person, amount: Number(a.amount) }));
  }
  const owner = tx.paid_by || tx.person || null;
  return [{ person: owner, amount: Number(tx.amount) || 0 }];
}

export const costPerson = (t: { person?: string | null; paid_by?: string | null }) =>
  t?.paid_by || t?.person || "";

export const costPersonInst = (i: any) =>
  i?.paid_by || i?.cartao_compras?.person || "";

const normalizePerson = (value: string | null | undefined) =>
  (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();

export function installmentResponsibility(i: any): Share[] {
  const amount = Number(i?.amount || 0);
  const person = normalizePerson(i?.cartao_compras?.person);

  if (person !== "familia") {
    return [{ person: i?.cartao_compras?.person || null, amount }];
  }

  const metadata = (i?.metadata || {}) as any;
  const saved = Array.isArray(metadata.responsibility_adjustment)
    ? metadata.responsibility_adjustment
        .map((item: any) => ({
          person: String(item.person || "").trim(),
          amount: Number(item.amount || 0),
        }))
        .filter((item: Share) => item.person && Number.isFinite(item.amount) && item.amount >= 0)
    : [];

  if (saved.length > 0) {
    return saved;
  }

  const half = Number((amount / 2).toFixed(2));

  return [
    { person: "Lorran", amount: half },
    { person: "Tayane", amount: Number((amount - half).toFixed(2)) },
  ];
}

export function installmentValueForPeople(
  installment: any,
  primaryPerson: string,
  secondaryPerson = "all",
): number {
  const selected = [primaryPerson, secondaryPerson]
    .map(normalizePerson)
    .filter((person) => person && person !== "all");

  if (selected.length === 0) {
    return Number(installment?.amount || 0);
  }

  const installmentPerson = normalizePerson(
    installment?.cartao_compras?.person,
  );

  if (installmentPerson !== "familia") {
    return selected.some((person) => person === installmentPerson)
      ? Number(installment?.amount || 0)
      : 0;
  }

  if (selected.includes("familia")) {
    return Number(installment?.amount || 0);
  }

  return installmentResponsibility(installment)
    .filter((share) => selected.includes(normalizePerson(share.person)))
    .reduce((sum, share) => sum + Number(share.amount || 0), 0);
}
