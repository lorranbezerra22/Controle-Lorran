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
    queryKey: ["transaction_adjustments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("transaction_adjustments").select("*").limit(5000);
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
  i?.paid_by || i?.card_purchases?.person || "";
