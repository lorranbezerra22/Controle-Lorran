import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import {
  Earning,
  PROGRAM_COLORS,
  Program,
  Redemption,
  Transfer,
  milhasStorage,
} from "@/lib/milhas-storage";
import { brandColor } from "@/lib/banks";

// ------------------------------------------------------------------
// Mapping helpers between DB (snake_case) e domínio (camelCase)
// ------------------------------------------------------------------
const rowToProgram = (r: any): Program => ({
  id: r.id,
  name: r.name,
  category: r.category,
  balance: Number(r.balance) || 0,
  valuePerThousand: Number(r.value_per_thousand) || 0,
  monthlyGoal: r.monthly_goal != null ? Number(r.monthly_goal) : undefined,
  color: r.color,
  createdAt: r.created_at,
});

const rowToEarning = (r: any): Earning => ({
  id: r.id,
  programId: r.program_id,
  month: r.month,
  points: Number(r.points) || 0,
  source: r.source,
  cost: r.cost != null ? Number(r.cost) : undefined,
  parity: r.parity != null ? Number(r.parity) : undefined,
  bonusPercent: r.bonus_percent != null ? Number(r.bonus_percent) : undefined,
  note: r.note ?? undefined,
  createdAt: r.created_at,
});

const rowToTransfer = (r: any): Transfer => ({
  id: r.id,
  fromProgramId: r.from_program_id,
  toProgramName: r.to_program_name,
  pointsSent: Number(r.points_sent) || 0,
  bonusPercent: Number(r.bonus_percent) || 0,
  pointsReceived: Number(r.points_received) || 0,
  cashValue: Number(r.cash_value) || 0,
  date: r.date,
  note: r.note ?? undefined,
  createdAt: r.created_at,
});

const rowToRedemption = (r: any): Redemption => ({
  id: r.id,
  programId: r.program_id,
  points: Number(r.points) || 0,
  type: r.type,
  cashValue: r.cash_value != null ? Number(r.cash_value) : undefined,
  cashEquivalent: r.cash_equivalent != null ? Number(r.cash_equivalent) : undefined,
  taxes: r.taxes != null ? Number(r.taxes) : undefined,
  milesCost: r.miles_cost != null ? Number(r.miles_cost) : undefined,
  screenshotUrl: r.screenshot_url ?? undefined,
  destination: r.destination ?? undefined,
  travelDate: r.travel_date ?? undefined,
  date: r.date,
  note: r.note ?? undefined,
  createdAt: r.created_at,
});

// ------------------------------------------------------------------
// Context contract (mantido igual ao anterior p/ não quebrar telas)
// ------------------------------------------------------------------
interface DataContextValue {
  programs: Program[];
  earnings: Earning[];
  transfers: Transfer[];
  redemptions: Redemption[];
  loading: boolean;
  addProgram: (p: Omit<Program, "id" | "createdAt" | "color"> & { color?: string }) => Promise<void>;
  updateProgram: (id: string, patch: Partial<Program>) => Promise<void>;
  deleteProgram: (id: string) => Promise<void>;
  addEarning: (e: Omit<Earning, "id" | "createdAt">) => Promise<void>;
  updateEarning: (id: string, patch: Partial<Omit<Earning, "id" | "createdAt">>) => Promise<void>;
  deleteEarning: (id: string) => Promise<void>;
  addTransfer: (t: Omit<Transfer, "id" | "createdAt" | "pointsReceived" | "cashValue">) => Promise<void>;
  deleteTransfer: (id: string) => Promise<void>;
  addRedemption: (r: Omit<Redemption, "id" | "createdAt">) => Promise<void>;
  deleteRedemption: (id: string) => Promise<void>;
  resetAll: () => Promise<void>;
}

const DataContext = createContext<DataContextValue | null>(null);

const QK = {
  programs: ["milhas", "programs"] as const,
  earnings: ["milhas", "earnings"] as const,
  transfers: ["milhas", "transfers"] as const,
  redemptions: ["milhas", "redemptions"] as const,
};

const MIGRATION_FLAG = "milhas.migratedToDb.v1";

type BalanceMovement = { programId: string; delta: number };

type EarningBalanceInput = Pick<
  Earning,
  "programId" | "points" | "source" | "parity" | "bonusPercent" | "note"
>;

const normalizeProgramName = (value?: string) => (value ?? "").trim().toLowerCase();
const isPendingEarning = (note?: string) => (note ?? "").includes("[PENDING]");

const getTransferOriginName = (note?: string) => {
  const match = (note ?? "").match(/Origem:\s*([^•]+)/i);
  return match ? match[1].trim() : "";
};

const getTransferSourcePoints = (earning: EarningBalanceInput) => {
  const parity = earning.parity ?? 1;
  const bonus = earning.bonusPercent ?? 0;
  const multiplier = parity * (1 + bonus / 100);
  return multiplier > 0 ? Math.round(earning.points / multiplier) : earning.points;
};

export const MilhasDataProvider = ({ children }: { children: React.ReactNode }) => {
  const qc = useQueryClient();
  const { session } = useSession();
  const userId = session?.user?.id;

  const programsQ = useQuery({
    queryKey: QK.programs,
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("milhas_programas")
        .select("*")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map(rowToProgram);
    },
  });

  const earningsQ = useQuery({
    queryKey: QK.earnings,
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("milhas_ganhos")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(rowToEarning);
    },
  });

  const transfersQ = useQuery({
    queryKey: QK.transfers,
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("milhas_transferencias")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(rowToTransfer);
    },
  });

  const redemptionsQ = useQuery({
    queryKey: QK.redemptions,
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("milhas_resgates")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map(rowToRedemption);
    },
  });

  const rawPrograms = programsQ.data ?? [];
  const earnings = earningsQ.data ?? [];
  const transfers = transfersQ.data ?? [];
  const redemptions = redemptionsQ.data ?? [];
  const programs = rawPrograms;

  const invalidate = useCallback(
    (keys: (keyof typeof QK)[]) => {
      keys.forEach((k) => qc.invalidateQueries({ queryKey: QK[k] }));
    },
    [qc]
  );

  // ---- helpers de saldo ---------------------------------------------------
  const adjustBalance = useCallback(
    async (programId: string, delta: number) => {
      if (!delta) return;
      const { data: currentRow, error: readError } = await supabase
        .from("milhas_programas")
        .select("*")
        .eq("id", programId)
        .single();
      if (readError || !currentRow) {
        throw new Error("Carteira do programa não encontrada para atualizar o saldo.");
      }

      const current = rowToProgram(currentRow);
      const next = Math.max(0, current.balance + delta);
      const { data: updatedRow, error } = await supabase
        .from("milhas_programas")
        .update({ balance: next })
        .eq("id", programId)
        .select("*")
        .single();
      if (error) throw error;
      const updated = rowToProgram(updatedRow);
      qc.setQueryData<Program[]>(QK.programs, (existing = []) =>
        existing.map((program) => (program.id === programId ? updated : program))
      );
    },
    [qc]
  );

  const getEarningBalanceMovements = useCallback(
    (earning: EarningBalanceInput): BalanceMovement[] => {
      if (isPendingEarning(earning.note)) return [];

      const movements: BalanceMovement[] = [{ programId: earning.programId, delta: earning.points }];

      if (earning.source === "transferencia") {
        const originName = getTransferOriginName(earning.note);
        const origin = programs.find((p) => normalizeProgramName(p.name) === normalizeProgramName(originName));
        if (origin && origin.id !== earning.programId) {
          movements.push({ programId: origin.id, delta: -getTransferSourcePoints(earning) });
        }
      }

      return movements;
    },
    [programs]
  );

  const applyBalanceMovements = useCallback(
    async (movements: BalanceMovement[], direction: 1 | -1 = 1) => {
      const grouped = new Map<string, number>();
      for (const movement of movements) {
        grouped.set(movement.programId, (grouped.get(movement.programId) ?? 0) + movement.delta * direction);
      }
      for (const [programId, delta] of grouped) {
        await adjustBalance(programId, delta);
      }
    },
    [adjustBalance]
  );

  // ------------------------------------------------------------------
  // Programs
  // ------------------------------------------------------------------
  const addProgram: DataContextValue["addProgram"] = useCallback(
    async (p) => {
      if (!userId) throw new Error("Usuário não autenticado");
      const count = programs.length;
      const fallbackColor = p.color ?? PROGRAM_COLORS[count % PROGRAM_COLORS.length];
      const color = brandColor(p.name, fallbackColor);
      const { error } = await supabase.from("milhas_programas").insert({
        user_id: userId,
        name: p.name,
        category: p.category,
        balance: p.balance ?? 0,
        value_per_thousand: p.valuePerThousand ?? 0,
        monthly_goal: p.monthlyGoal ?? null,
        color,
      });
      if (error) throw error;
      invalidate(["programs"]);
    },
    [userId, programs.length, invalidate]
  );

  const updateProgram: DataContextValue["updateProgram"] = useCallback(
    async (id, patch) => {
      const dbPatch: Record<string, any> = {};
      if (patch.name !== undefined) dbPatch.name = patch.name;
      if (patch.category !== undefined) dbPatch.category = patch.category;
      if (patch.balance !== undefined) dbPatch.balance = patch.balance;
      if (patch.valuePerThousand !== undefined) dbPatch.value_per_thousand = patch.valuePerThousand;
      if (patch.monthlyGoal !== undefined) dbPatch.monthly_goal = patch.monthlyGoal;
      if (patch.name !== undefined) {
        const current = programs.find((program) => program.id === id);
        dbPatch.color = brandColor(patch.name, patch.color ?? current?.color ?? PROGRAM_COLORS[0]);
      } else if (patch.color !== undefined) dbPatch.color = patch.color;
      const { error } = await supabase.from("milhas_programas").update(dbPatch as any).eq("id", id);
      if (error) throw error;
      invalidate(["programs"]);
    },
    [programs, invalidate]
  );

  const deleteProgram: DataContextValue["deleteProgram"] = useCallback(
    async (id) => {
      const { error } = await supabase.from("milhas_programas").delete().eq("id", id);
      if (error) throw error;
      invalidate(["programs", "earnings", "transfers", "redemptions"]);
    },
    [invalidate]
  );

  // ------------------------------------------------------------------
  // Earnings
  // ------------------------------------------------------------------
  const addEarning: DataContextValue["addEarning"] = useCallback(
    async (e) => {
      if (!userId) throw new Error("Usuário não autenticado");
      const { error } = await supabase.from("milhas_ganhos").insert({
        user_id: userId,
        program_id: e.programId,
        month: e.month,
        points: e.points,
        source: e.source,
        cost: e.cost ?? null,
        parity: e.parity ?? null,
        bonus_percent: e.bonusPercent ?? null,
        note: e.note ?? null,
      });
      if (error) throw error;
      await applyBalanceMovements(getEarningBalanceMovements(e));
      invalidate(["earnings", "programs"]);
    },
    [userId, applyBalanceMovements, getEarningBalanceMovements, invalidate]
  );

  const updateEarning: DataContextValue["updateEarning"] = useCallback(
    async (id, patch) => {
      const target = earnings.find((e) => e.id === id);
      if (!target) return;
      const newPoints = patch.points ?? target.points;
      const newProgramId = patch.programId ?? target.programId;
      const dbPatch: Record<string, any> = {};
      if (patch.programId !== undefined) dbPatch.program_id = patch.programId;
      if (patch.month !== undefined) dbPatch.month = patch.month;
      if (patch.points !== undefined) dbPatch.points = patch.points;
      if (patch.source !== undefined) dbPatch.source = patch.source;
      if (patch.cost !== undefined) dbPatch.cost = patch.cost ?? null;
      if (patch.parity !== undefined) dbPatch.parity = patch.parity ?? null;
      if (patch.bonusPercent !== undefined) dbPatch.bonus_percent = patch.bonusPercent ?? null;
      if (patch.note !== undefined) dbPatch.note = patch.note ?? null;
      const { error } = await supabase.from("milhas_ganhos").update(dbPatch as any).eq("id", id);
      if (error) throw error;
      await applyBalanceMovements(getEarningBalanceMovements(target), -1);
      await applyBalanceMovements(
        getEarningBalanceMovements({
          ...target,
          ...patch,
          programId: newProgramId,
          points: newPoints,
        })
      );
      invalidate(["earnings", "programs"]);
    },
    [earnings, applyBalanceMovements, getEarningBalanceMovements, invalidate]
  );

  const deleteEarning: DataContextValue["deleteEarning"] = useCallback(
    async (id) => {
      const target = earnings.find((e) => e.id === id);
      const { error } = await supabase.from("milhas_ganhos").delete().eq("id", id);
      if (error) throw error;
      if (target) await applyBalanceMovements(getEarningBalanceMovements(target), -1);
      invalidate(["earnings", "programs"]);
    },
    [earnings, applyBalanceMovements, getEarningBalanceMovements, invalidate]
  );

  // ------------------------------------------------------------------
  // Materialização automática de parcelas de clube + alerta de conclusão
  // ------------------------------------------------------------------
  const materializedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!earnings.length) return;
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
    for (const e of earnings) {
      const note = e.note ?? "";
      if (!note.includes("[PENDING]")) continue;
      const due = note.match(/\[DUE:(\d{4}-\d{2}-\d{2})\]/)?.[1];
      if (!due || due > today) continue;
      if (materializedRef.current.has(e.id)) continue;
      materializedRef.current.add(e.id);

      const cleaned = note
        .replace(/\s*\[PENDING\]\s*/g, "")
        .replace(/\s*\[DUE:\d{4}-\d{2}-\d{2}\]\s*/g, "")
        .replace(/\s*•\s*•\s*/g, " • ")
        .replace(/^\s*•\s*/, "")
        .replace(/\s*•\s*$/, "")
        .trim();

      const parcela = cleaned.match(/Parcela\s+(\d+)\s*\/\s*(\d+)/);
      const isLast = parcela && parcela[1] === parcela[2];
      const programName = programs.find((p) => p.id === e.programId)?.name ?? "Programa";

      (async () => {
        try {
          await updateEarning(e.id, { note: cleaned });
          if (isLast) {
            toast.success(`🎉 Clube ${programName} concluído!`, {
              description: `Última parcela recebida: ${e.points.toLocaleString("pt-BR")} pts creditados.`,
              duration: 8000,
            });
          } else {
            toast(`Parcela do clube ${programName} creditada`, {
              description: `${e.points.toLocaleString("pt-BR")} pts adicionados ao saldo.`,
            });
          }
        } catch (err) {
          materializedRef.current.delete(e.id);
          console.error("[Milhas] Falha ao materializar parcela:", err);
        }
      })();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [earnings, programs]);


  // ------------------------------------------------------------------
  // Transfers
  // ------------------------------------------------------------------
  const addTransfer: DataContextValue["addTransfer"] = useCallback(
    async (t) => {
      if (!userId) throw new Error("Usuário não autenticado");
      const from = programs.find((p) => p.id === t.fromProgramId);
      if (!from) throw new Error("Programa de origem não encontrado.");
      if (from.balance < t.pointsSent) {
        throw new Error(`Saldo insuficiente em ${from.name}: ${from.balance.toLocaleString("pt-BR")} pts disponíveis.`);
      }
      const pointsReceived = Math.round(t.pointsSent * (1 + t.bonusPercent / 100));
      const to = programs.find((p) => normalizeProgramName(p.name) === normalizeProgramName(t.toProgramName));
      if (!to) throw new Error("Programa de destino não encontrado.");
      if (to.id === from.id) throw new Error("Programa de origem e destino não podem ser iguais.");
      const cashValue = to ? (pointsReceived / 1000) * to.valuePerThousand : 0;
      const { error } = await supabase.from("milhas_transferencias").insert({
        user_id: userId,
        from_program_id: t.fromProgramId,
        to_program_name: t.toProgramName,
        points_sent: t.pointsSent,
        bonus_percent: t.bonusPercent,
        points_received: pointsReceived,
        cash_value: cashValue,
        date: t.date,
        note: t.note ?? null,
      });
      if (error) throw error;
      await adjustBalance(t.fromProgramId, -t.pointsSent);
      await adjustBalance(to.id, pointsReceived);
      invalidate(["transfers", "programs"]);
    },
    [userId, programs, adjustBalance, invalidate]
  );

  const deleteTransfer: DataContextValue["deleteTransfer"] = useCallback(
    async (id) => {
      const target = transfers.find((t) => t.id === id);
      const { error } = await supabase.from("milhas_transferencias").delete().eq("id", id);
      if (error) throw error;
      if (target) {
        await adjustBalance(target.fromProgramId, target.pointsSent);
        const to = programs.find((p) => normalizeProgramName(p.name) === normalizeProgramName(target.toProgramName));
        if (to) await adjustBalance(to.id, -target.pointsReceived);
      }
      invalidate(["transfers", "programs"]);
    },
    [transfers, programs, adjustBalance, invalidate]
  );

  // ------------------------------------------------------------------
  // Redemptions
  // ------------------------------------------------------------------
  const addRedemption: DataContextValue["addRedemption"] = useCallback(
    async (r) => {
      if (!userId) throw new Error("Usuário não autenticado");
      const program = programs.find((p) => p.id === r.programId);
      if (!program) throw new Error("Programa não encontrado.");
      if (program.balance < r.points) {
        throw new Error(`Saldo insuficiente em ${program.name}: ${program.balance.toLocaleString("pt-BR")} pts disponíveis.`);
      }
      const computedMilesCost =
        r.milesCost ?? (program ? (r.points / 1000) * program.valuePerThousand : undefined);
      const { error } = await supabase.from("milhas_resgates").insert({
        user_id: userId,
        program_id: r.programId,
        points: r.points,
        type: r.type,
        cash_value: r.cashValue ?? null,
        cash_equivalent: r.cashEquivalent ?? null,
        taxes: r.taxes ?? null,
        miles_cost: computedMilesCost ?? null,
        screenshot_url: r.screenshotUrl ?? null,
        destination: r.destination ?? null,
        travel_date: r.travelDate ?? null,
        date: r.date,
        note: r.note ?? null,
      });
      if (error) throw error;
      await adjustBalance(r.programId, -r.points);
      invalidate(["redemptions", "programs"]);
    },
    [userId, programs, adjustBalance, invalidate]
  );

  const deleteRedemption: DataContextValue["deleteRedemption"] = useCallback(
    async (id) => {
      const target = redemptions.find((r) => r.id === id);
      const { error } = await supabase.from("milhas_resgates").delete().eq("id", id);
      if (error) throw error;
      if (target) await adjustBalance(target.programId, target.points);
      invalidate(["redemptions", "programs"]);
    },
    [redemptions, adjustBalance, invalidate]
  );

  const resetAll: DataContextValue["resetAll"] = useCallback(async () => {
    if (!userId) return;
    // Deletar programs em cascata remove filhos, mas removo tudo explicitamente por segurança.
    await supabase.from("milhas_resgates").delete().eq("user_id", userId);
    await supabase.from("milhas_transferencias").delete().eq("user_id", userId);
    await supabase.from("milhas_ganhos").delete().eq("user_id", userId);
    await supabase.from("milhas_programas").delete().eq("user_id", userId);
    invalidate(["programs", "earnings", "transfers", "redemptions"]);
  }, [userId, invalidate]);

  // ------------------------------------------------------------------
  // Migração one-time do localStorage → banco
  // ------------------------------------------------------------------
  useEffect(() => {
    if (!userId) return;
    if (typeof window === "undefined") return;
    if (localStorage.getItem(MIGRATION_FLAG)) return;
    // Aguarda o primeiro carregamento das queries pra saber se o banco está vazio.
    if (programsQ.isLoading || earningsQ.isLoading || transfersQ.isLoading || redemptionsQ.isLoading) return;

    const localPrograms = milhasStorage.getPrograms();
    const localEarnings = milhasStorage.getEarnings();
    const localTransfers = milhasStorage.getTransfers();
    const localRedemptions = milhasStorage.getRedemptions();

    const hasLocal =
      localPrograms.length + localEarnings.length + localTransfers.length + localRedemptions.length > 0;
    const dbEmpty =
      (programsQ.data?.length ?? 0) === 0 &&
      (earningsQ.data?.length ?? 0) === 0 &&
      (transfersQ.data?.length ?? 0) === 0 &&
      (redemptionsQ.data?.length ?? 0) === 0;

    if (!hasLocal) {
      localStorage.setItem(MIGRATION_FLAG, "no-local-data");
      return;
    }
    if (!dbEmpty) {
      // Banco já tem coisas — não sobrescreve. Marca para não repetir.
      localStorage.setItem(MIGRATION_FLAG, "db-already-populated");
      return;
    }

    (async () => {
      try {
        // Insere programas mantendo mapping id local -> id novo do banco
        const idMap = new Map<string, string>();
        for (const p of localPrograms) {
          const { data, error } = await supabase
            .from("milhas_programas")
            .insert({
              user_id: userId,
              name: p.name,
              category: p.category,
              balance: p.balance,
              value_per_thousand: p.valuePerThousand,
              monthly_goal: p.monthlyGoal ?? null,
              color: p.color,
            })
            .select("id")
            .single();
          if (error) throw error;
          idMap.set(p.id, data.id);
        }
        // Earnings
        if (localEarnings.length) {
          const rows = localEarnings
            .filter((e) => idMap.has(e.programId))
            .map((e) => ({
              user_id: userId,
              program_id: idMap.get(e.programId)!,
              month: e.month,
              points: e.points,
              source: e.source,
              cost: e.cost ?? null,
              note: e.note ?? null,
            }));
          if (rows.length) await supabase.from("milhas_ganhos").insert(rows);
        }
        // Transfers
        if (localTransfers.length) {
          const rows = localTransfers
            .filter((t) => idMap.has(t.fromProgramId))
            .map((t) => ({
              user_id: userId,
              from_program_id: idMap.get(t.fromProgramId)!,
              to_program_name: t.toProgramName,
              points_sent: t.pointsSent,
              bonus_percent: t.bonusPercent,
              points_received: t.pointsReceived,
              cash_value: t.cashValue,
              date: t.date,
              note: t.note ?? null,
            }));
          if (rows.length) await supabase.from("milhas_transferencias").insert(rows);
        }
        // Redemptions
        if (localRedemptions.length) {
          const rows = localRedemptions
            .filter((r) => idMap.has(r.programId))
            .map((r) => ({
              user_id: userId,
              program_id: idMap.get(r.programId)!,
              points: r.points,
              type: r.type,
              cash_value: r.cashValue ?? null,
              destination: r.destination ?? null,
              travel_date: r.travelDate ?? null,
              date: r.date,
              note: r.note ?? null,
            }));
          if (rows.length) await supabase.from("milhas_resgates").insert(rows);
        }
        localStorage.setItem(MIGRATION_FLAG, "migrated-" + new Date().toISOString());
        invalidate(["programs", "earnings", "transfers", "redemptions"]);
      } catch (err) {
        console.error("[Milhas] Falha ao migrar localStorage para o banco:", err);
      }
    })();
  }, [
    userId,
    programsQ.isLoading,
    earningsQ.isLoading,
    transfersQ.isLoading,
    redemptionsQ.isLoading,
    programsQ.data,
    earningsQ.data,
    transfersQ.data,
    redemptionsQ.data,
    invalidate,
  ]);

  const value = useMemo<DataContextValue>(
    () => ({
      programs,
      earnings,
      transfers,
      redemptions,
      loading:
        programsQ.isLoading || earningsQ.isLoading || transfersQ.isLoading || redemptionsQ.isLoading,
      addProgram,
      updateProgram,
      deleteProgram,
      addEarning,
      updateEarning,
      deleteEarning,
      addTransfer,
      deleteTransfer,
      addRedemption,
      deleteRedemption,
      resetAll,
    }),
    [
      programs,
      earnings,
      transfers,
      redemptions,
      programsQ.isLoading,
      earningsQ.isLoading,
      transfersQ.isLoading,
      redemptionsQ.isLoading,
      addProgram,
      updateProgram,
      deleteProgram,
      addEarning,
      updateEarning,
      deleteEarning,
      addTransfer,
      deleteTransfer,
      addRedemption,
      deleteRedemption,
      resetAll,
    ]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
};

export const useMilhasData = () => {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useMilhasData must be used within MilhasDataProvider");
  return ctx;
};
