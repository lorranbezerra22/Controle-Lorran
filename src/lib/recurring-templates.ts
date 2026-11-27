import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";

export type RecurringTemplate = {
  id: string;
  description: string;
  cardId: string;
  categoryId: string;
  person: string;
  splitPeople?: string[];
  splitCustom?: boolean;
  splitAmounts?: Record<string, number>;
  splitCategoryIds?: Record<string, string>;
  brand?: string;
  amount: number;
  installments: number;
  purchaseDay: number;
  active: boolean;
  createdAt: string;
  confirmedMonths: string[];
  launchedMonth?: string;
  launchIds?: Record<string, string[]>;
};

type Row = Database["public"]["Tables"]["cartao_recorrentes"]["Row"];
export type RecurringAccount = {
  userId: string;
  version: string | null;
  templates: RecurringTemplate[];
};

const legacyKey = "cartoes:recorrentes";
const migrationKey = "cartoes:recorrentes:importados";
export const recurringChangeEvent = "recurring-templates-changed";

function parseTemplates(value: unknown): RecurringTemplate[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item: RecurringTemplate) =>
        item && typeof item.id === "string" && typeof item.cardId === "string",
    )
    .map((item: RecurringTemplate) => ({
      ...item,
      active: item.active ?? true,
      confirmedMonths: [
        ...new Set([
          ...(Array.isArray(item.confirmedMonths) ? item.confirmedMonths : []),
          ...(item.launchedMonth ? [item.launchedMonth] : []),
        ]),
      ],
    }));
}

function fromRow(userId: string, row: Row | null): RecurringAccount {
  return { userId, version: row?.updated_at ?? null, templates: parseTemplates(row?.templates) };
}

export async function loadRecurringAccount(): Promise<RecurringAccount> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) throw authError;
  if (!user) throw new Error("Entre na sua conta para ver as compras planejadas.");
  const { data, error } = await supabase
    .from("cartao_recorrentes")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  return fromRow(user.id, data);
}

export async function saveRecurringTemplates(
  account: RecurringAccount,
  templates: RecurringTemplate[],
) {
  const table = supabase.from("cartao_recorrentes");
  const payload = { templates: templates as Json };
  const request = account.version
    ? table.update(payload).eq("user_id", account.userId).eq("updated_at", account.version)
    : table.insert({ ...payload, user_id: account.userId });
  const { data, error } = await request.select().maybeSingle();
  if (error && error.code !== "23505") throw error;
  if (!data)
    throw new Error(
      "A lista foi atualizada em outra aba. Reabra Compras planejadas e tente novamente.",
    );
  window.dispatchEvent(new Event(recurringChangeEvent));
  return fromRow(account.userId, data);
}

export async function importRecurringTemplates(
  account: RecurringAccount,
  cards: { id: string; user_id?: string }[],
) {
  let legacy: RecurringTemplate[];
  try {
    const owner = window.localStorage.getItem(migrationKey);
    if (owner) return account;
    legacy = parseTemplates(JSON.parse(window.localStorage.getItem(legacyKey) || "[]"));
  } catch {
    return account;
  }

  const ownedCards = new Set(
    cards.filter((card) => card.user_id === account.userId).map((card) => card.id),
  );
  const known = new Set(account.templates.map((item) => item.id));
  const imported = legacy.filter((item) => ownedCards.has(item.cardId) && !known.has(item.id));
  if (imported.length === 0) return account;
  const saved = await saveRecurringTemplates(account, [...account.templates, ...imported]);
  try {
    window.localStorage.setItem(migrationKey, account.userId);
  } catch {
    // The saved copy is already available in the account.
  }
  return saved;
}

export async function changeRecurringLaunch(
  account: RecurringAccount,
  id: string,
  month: string,
  remove = false,
) {
  const { data, error } = await supabase.rpc("confirmar_compra_planejada", {
    p_id: id,
    p_mes: month,
    p_remover: remove,
  });
  if (error) throw error;
  window.dispatchEvent(new Event(recurringChangeEvent));
  return fromRow(account.userId, data);
}
