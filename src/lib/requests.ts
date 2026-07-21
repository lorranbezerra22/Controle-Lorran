import { supabase } from "@/integrations/supabase/client";

export interface RequestRow {
  id: string;
  user_id: string;
  source: string;
  kind: "income" | "expense" | "card";
  amount: number;
  description: string;
  suggested_category_id: string | null;
  suggested_account_id: string | null;
  suggested_card_id: string | null;
  installments_count: number;
  is_recurring: boolean;
  recurring_day: number | null;
  person: string | null;
  splits: Array<{ person: string; amount: number }>;
  tags: string[];
  due_at: string | null;
  posted_at: string | null;
  purchase_date: string | null;
  status: "pendente" | "revisando" | "aprovado" | "rejeitado";
  ai_confidence: number | null;
  ai_reason: string | null;
  notes: string | null;
  attachments: string[];
  approved_transaction_id: string | null;
  rejected_reason: string | null;
  created_at: string;
  updated_at: string;
}

export async function logHistory(requestId: string, action: string, changes: any) {
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  await supabase.from("financial_request_history").insert({
    request_id: requestId,
    user_id: u.user.id,
    action,
    changes,
  });
}

export async function approveRequest(req: RequestRow) {
  const { data: u } = await supabase.auth.getUser();
  const uid = u.user?.id;
  if (!uid) throw new Error("não autenticado");

  let approvedId: string | null = null;

  if (req.kind === "card") {
    if (!req.suggested_card_id) throw new Error("Cartão obrigatório para pedido de cartão");
    const { data: cp, error } = await supabase
      .from("card_purchases")
      .insert({
        user_id: uid,
        card_id: req.suggested_card_id,
        category_id: req.suggested_category_id,
        description: req.description,
        total_amount: req.amount,
        installments_count: req.installments_count,
        purchase_date: req.purchase_date ?? req.due_at ?? new Date().toISOString().slice(0, 10),
        person: req.person,
      })
      .select()
      .single();
    if (error) throw error;
    approvedId = cp.id;
    const per = +(req.amount / req.installments_count).toFixed(2);
    const base = new Date((req.purchase_date ?? req.due_at ?? new Date().toISOString().slice(0, 10)) + "T00:00:00");
    const insts = [];
    for (let n = 1; n <= req.installments_count; n++) {
      const d = new Date(base);
      d.setMonth(d.getMonth() + n);
      insts.push({
        user_id: uid,
        card_id: req.suggested_card_id,
        purchase_id: cp.id,
        installment_number: n,
        amount: per,
        due_at: d.toISOString().slice(0, 10),
        status: "pending",
      });
    }
    await supabase.from("card_installments").insert(insts);
  } else {
    const { data: tx, error } = await supabase
      .from("transactions")
      .insert({
        user_id: uid,
        description: req.description,
        amount: req.amount,
        kind: req.kind,
        due_at: req.due_at ?? new Date().toISOString().slice(0, 10),
        posted_at: req.posted_at ?? req.due_at ?? new Date().toISOString().slice(0, 10),
        person: req.person,
        category_id: req.suggested_category_id,
        account_id: req.suggested_account_id,
        status: "pending",
        notes: req.notes,
      })
      .select()
      .single();
    if (error) throw error;
    approvedId = tx.id;
  }

  if (req.is_recurring && req.kind !== "card" && req.recurring_day) {
    await supabase.from("recurring_rules").insert({
      user_id: uid,
      description: req.description,
      amount: req.amount,
      kind: req.kind,
      day_of_month: Math.min(28, Math.max(1, req.recurring_day)),
      category_id: req.suggested_category_id,
      person: req.person,
      active: true,
    });
  }

  await supabase
    .from("financial_requests")
    .update({ status: "aprovado", approved_transaction_id: approvedId })
    .eq("id", req.id);

  await logHistory(req.id, "approved", { approved_transaction_id: approvedId });
  return approvedId;
}

export async function rejectRequest(id: string, reason: string) {
  await supabase
    .from("financial_requests")
    .update({ status: "rejeitado", rejected_reason: reason })
    .eq("id", id);
  await logHistory(id, "rejected", { reason });
}
