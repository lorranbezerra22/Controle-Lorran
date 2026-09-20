import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const STALE_60S = 60 * 1000;

export const useTransactions = () =>
  useQuery({
    queryKey: ["transactions"],
    staleTime: STALE_60S,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transacoes")
        .select("*, categorias:category_id(name, icon)")
        .order("due_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

export const useCategories = () =>
  useQuery({
    queryKey: ["categories"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("categorias").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

export const usePeople = () =>
  useQuery({
    queryKey: ["people"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("pessoas").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

export const useCards = () =>
  useQuery({
    queryKey: ["cards"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.from("cartoes").select("*").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

export const useInstallments = () =>
  useQuery({
    queryKey: ["installments"],
    staleTime: STALE_60S,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cartao_parcelas")
        .select(`
          *,
          cartao_compras:purchase_id(
            description, person, total_amount, installments_count, purchase_date, category_id, brand,
            categorias:category_id(name, icon)
          ),
          cartoes:card_id(name, color, bank, last_digits, metadata),
          participacoes:participacoes_parcelas(*)
        `)
        .order("due_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });

export const useAccounts = () =>
  useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("contas").select("*").order("bank");
      if (error) throw error;
      return data ?? [];
    },
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

export function useInvalidate() {
  const qc = useQueryClient();
  return (key: string) => qc.invalidateQueries({ queryKey: [key] });
}

export const useMutateGeneric = () => useMutation({ mutationFn: async (fn: () => Promise<any>) => fn() });
