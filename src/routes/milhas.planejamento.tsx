import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarDays, Coins, Landmark, MapPinned, Pencil, Plane, Plus, Sparkles, Trash2, type LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSession } from "@/lib/auth";
import { AIRPORTS, findAirport, searchAirports, type Airport } from "@/lib/airports";
import { TravelMap, type MapLeg } from "@/components/TravelMap";
import { PageHeader } from "@/components/PageHeader";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/milhas/planejamento")({
  component: PlanejamentoPage,
  head: () => ({ meta: [{ title: "Planejamento de Viagens — CRM Milhas" }] }),
});

const brl = (n?: number | null) =>
  typeof n === "number"
    ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "—";
const num = (n?: number | null) => (typeof n === "number" ? n.toLocaleString("pt-BR") : "—");

type TravelPricing = {
  points_qty?: number | null;
  cost_per_thousand?: number | null;
  taxes?: number | null;
  pax?: number | null;
};

type Plan = { id: string; title: string; notes: string | null; created_at: string; start_date: string | null; end_date: string | null };
type Leg = {
  id: string;
  plan_id: string;
  position: number;
  origin_iata: string;
  destination_iata: string;
  days: number | null;
  flight_time: string | null;
  points_qty: number | null;
  program: string | null;
  cost_per_thousand: number | null;
  taxes: number | null;
  pax: number | null;
  class: string | null;
  airline: string | null;
  aircraft: string | null;
  total: number | null;
  emitted: boolean;
  departure_at: string | null;
  arrival_at: string | null;
};

const EMPTY_LEG = {
  origin_iata: "",
  destination_iata: "",
  days: 0,
  flight_time: "",
  points_qty: 0,
  program: "",
  cost_per_thousand: 0,
  taxes: 0,
  pax: 1,
  class: "Economy",
  airline: "",
  aircraft: "",
  total: 0,
  emitted: false,
  departure_at: "",
  arrival_at: "",
};

const money = (value: number | null | undefined) => Math.max(0, Number(value ?? 0) || 0);
const getPax = (l: TravelPricing) => Math.max(1, Number(l.pax ?? 1) || 1);
const getTotalMiles = (l: TravelPricing) => money(l.points_qty) * getPax(l);
const getMilesCashValue = (l: TravelPricing) => (getTotalMiles(l) / 1000) * money(l.cost_per_thousand);
const getTotalTaxes = (l: TravelPricing) => money(l.taxes) * getPax(l);

function computeTotal(l: TravelPricing) {
  return getMilesCashValue(l) + getTotalTaxes(l);
}

function MetricCard({
  icon: Icon,
  label,
  value,
  caption,
  emphasis = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  caption?: string;
  emphasis?: boolean;
}) {
  return (
    <div className={`relative overflow-hidden border rounded-xl p-4 ${emphasis ? "border-primary/50 bg-primary/10" : "border-border bg-card"}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
          <p className={`mt-1 text-xl font-semibold tabular-nums ${emphasis ? "text-gold" : "text-foreground"}`}>{value}</p>
        </div>
        <div className="rounded-lg border border-border bg-background/60 p-2 text-gold">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      {caption && <p className="mt-3 border-t border-border/70 pt-2 text-[11px] text-muted-foreground">{caption}</p>}
    </div>
  );
}

// TIMESTAMPTZ ISO string ↔ <input type="datetime-local"> value (local time, no seconds)
function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function IataInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const suggestions = useMemo(() => searchAirports(value), [value]);
  return (
    <div className="relative">
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value.toUpperCase());
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder}
        className="w-full border border-border px-2 py-1.5 text-xs uppercase bg-background rounded-md"
        maxLength={4}
      />
      {open && suggestions.length > 0 && (
        <div className="absolute z-20 mt-1 w-64 max-h-64 overflow-auto border border-border bg-popover shadow-lg rounded-md">
          {suggestions.map((a) => (
            <button
              key={a.iata}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(a.iata);
                setOpen(false);
              }}
              className="block w-full text-left px-2 py-1.5 text-xs hover:bg-muted"
            >
              <span className="font-semibold">{a.iata}</span>{" "}
              <span className="text-muted-foreground">
                — {a.city}, {a.country}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PlanejamentoPage() {
  const qc = useQueryClient();
  const { session } = useSession();
  const userId = session?.user?.id;

  const plansQ = useQuery({
    queryKey: ["travel_plans"],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("travel_plans")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Plan[];
    },
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const currentPlanId = selectedId ?? plansQ.data?.[0]?.id ?? null;

  const legsQ = useQuery({
    queryKey: ["travel_legs", currentPlanId],
    enabled: !!currentPlanId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("travel_legs")
        .select("*")
        .eq("plan_id", currentPlanId!)
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Leg[];
    },
  });

  const [newPlanTitle, setNewPlanTitle] = useState("");
  const createPlan = useMutation({
    mutationFn: async (title: string) => {
      if (!userId) throw new Error("Não autenticado");
      const { data, error } = await supabase
        .from("travel_plans")
        .insert({ user_id: userId, title })
        .select("*")
        .single();
      if (error) throw error;
      return data as Plan;
    },
    onSuccess: (p) => {
      setNewPlanTitle("");
      setSelectedId(p.id);
      qc.invalidateQueries({ queryKey: ["travel_plans"] });
    },
  });

  const deletePlan = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("travel_plans").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      setSelectedId(null);
      qc.invalidateQueries({ queryKey: ["travel_plans"] });
    },
  });


  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...EMPTY_LEG });

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_LEG });
    setDialogOpen(true);
  };
  const openEdit = (l: Leg) => {
    setEditingId(l.id);
    setForm({
      origin_iata: l.origin_iata ?? "",
      destination_iata: l.destination_iata ?? "",
      days: l.days ?? 0,
      flight_time: l.flight_time ?? "",
      points_qty: l.points_qty ?? 0,
      program: l.program ?? "",
      cost_per_thousand: l.cost_per_thousand ?? 0,
      taxes: l.taxes ?? 0,
      pax: l.pax ?? 1,
      class: l.class ?? "Economy",
      airline: l.airline ?? "",
      aircraft: l.aircraft ?? "",
      total: l.total ?? 0,
      emitted: !!l.emitted,
      departure_at: toLocalInput(l.departure_at),
      arrival_at: toLocalInput(l.arrival_at),
    });
    setDialogOpen(true);
  };

  const saveLeg = useMutation({
    mutationFn: async () => {
      if (!userId || !currentPlanId) throw new Error("Selecione um planejamento.");
      const from = findAirport(form.origin_iata);
      const to = findAirport(form.destination_iata);
      if (!from || !to) throw new Error("Aeroporto (IATA) não encontrado. Use 3 letras válidas.");
      const dep = fromLocalInput(form.departure_at);
      const arr = fromLocalInput(form.arrival_at);
      if (dep && arr && new Date(arr) < new Date(dep))
        throw new Error("Chegada não pode ser antes da partida.");

      const total = computeTotal(form);
      const payload = {
        origin_iata: from.iata,
        destination_iata: to.iata,
        days: form.days || null,
        flight_time: form.flight_time || null,
        points_qty: form.points_qty || null,
        program: form.program || null,
        cost_per_thousand: form.cost_per_thousand || null,
        taxes: form.taxes || null,
        pax: form.pax || null,
        class: form.class || null,
        airline: form.airline || null,
        aircraft: form.aircraft || null,
        total,
        emitted: form.emitted,
        departure_at: dep,
        arrival_at: arr,
      };
      if (editingId) {
        const { error } = await supabase.from("travel_legs").update(payload).eq("id", editingId);
        if (error) throw error;
      } else {
        const pos = legsQ.data?.length ?? 0;
        const { error } = await supabase.from("travel_legs").insert({
          user_id: userId,
          plan_id: currentPlanId,
          position: pos,
          ...payload,
        });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      setForm({ ...EMPTY_LEG });
      setEditingId(null);
      setDialogOpen(false);
      qc.invalidateQueries({ queryKey: ["travel_legs", currentPlanId] });
    },
  });

  const deleteLeg = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("travel_legs").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["travel_legs", currentPlanId] }),
  });

  const legs = legsQ.data ?? [];
  const currentPlan = plansQ.data?.find((p) => p.id === currentPlanId);
  const mapLegs: MapLeg[] = useMemo(
    () =>
      legs
        .map((l) => {
          const from = findAirport(l.origin_iata);
          const to = findAirport(l.destination_iata);
          if (!from || !to) return null;
          return {
            from,
            to,
            emitted: l.emitted,
            label: `${from.iata} → ${to.iata}`,
          } as MapLeg;
        })
        .filter(Boolean) as MapLeg[],
    [legs]
  );

  const totals = useMemo(() => {
    const points = legs.reduce((s, l) => s + getTotalMiles(l), 0);
    const milesValue = legs.reduce((s, l) => s + getMilesCashValue(l), 0);
    const taxes = legs.reduce((s, l) => s + getTotalTaxes(l), 0);
    const total = milesValue + taxes;
    const pax = legs.reduce((m, l) => Math.max(m, getPax(l)), 0);
    return { points, milesValue, taxes, total, pax };
  }, [legs]);

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        icon={Plane}
        title="Planejamento de Viagens"
        subtitle="Monte a rota, veja no mapa e acompanhe custo, taxas e emissão de cada trecho."
      />

      {/* Seletor de planos */}
      <div className="flex flex-wrap gap-2 items-center">
        {(plansQ.data ?? []).map((p) => (
          <button
            key={p.id}
            onClick={() => setSelectedId(p.id)}
            className={`px-3 py-1.5 text-sm border rounded-lg transition-colors ${
              currentPlanId === p.id
                ? "border-primary bg-primary/10 ring-1 ring-primary/40 font-medium"
                : "border-border text-muted-foreground hover:bg-muted"
            }`}
          >
            <Plane className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
            {p.title}
          </button>
        ))}
        <div className="flex items-center gap-2 ml-auto">
          <input
            value={newPlanTitle}
            onChange={(e) => setNewPlanTitle(e.target.value)}
            placeholder="Novo planejamento (ex.: Foz — Jul/26)"
            className="border border-border px-3 py-1.5 text-sm bg-background rounded-md"
          />
          <button
            onClick={() => newPlanTitle.trim() && createPlan.mutate(newPlanTitle.trim())}
            disabled={!newPlanTitle.trim() || createPlan.isPending}
            className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md flex items-center gap-1 disabled:opacity-50"
          >
            <Plus className="w-4 h-4" /> Criar
          </button>
        </div>
      </div>

      {!currentPlanId && (
        <p className="text-sm text-muted-foreground">
          Nenhum planejamento ainda — crie o primeiro acima.
        </p>
      )}

      {currentPlanId && (() => {
        const sortedLegs = [...legs].sort((a, b) => {
          const ta = a.departure_at ? new Date(a.departure_at).getTime() : Infinity;
          const tb = b.departure_at ? new Date(b.departure_at).getTime() : Infinity;
          return ta - tb;
        });
        const timed = sortedLegs.filter((l) => l.departure_at);
        const tripStart = timed[0]?.departure_at ?? null;
        const tripEnd = [...sortedLegs]
          .filter((l) => l.arrival_at)
          .sort((a, b) => new Date(b.arrival_at!).getTime() - new Date(a.arrival_at!).getTime())[0]?.arrival_at ?? null;
        const fmtDT = (iso: string | null) =>
          iso
            ? new Date(iso).toLocaleString("pt-BR", {
                day: "2-digit", month: "2-digit", year: "2-digit",
                hour: "2-digit", minute: "2-digit",
              })
            : "—";
        const partOfDay = (iso: string | null) => {
          if (!iso) return "";
          const h = new Date(iso).getHours();
          if (h < 6) return "🌙 madrugada";
          if (h < 12) return "🌅 manhã";
          if (h < 18) return "☀️ tarde";
          return "🌙 noite";
        };
        const days =
          tripStart && tripEnd
            ? Math.max(1, Math.round((new Date(tripEnd).getTime() - new Date(tripStart).getTime()) / 86400000) + 1)
            : null;
        return (
        <>
          <section className="relative overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/70 to-transparent" />
            <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-[11px] uppercase tracking-wider text-gold">
                  <Sparkles className="h-3.5 w-3.5" /> Planejamento inteligente
                </div>
                <div>
                  <h2 className="text-2xl font-semibold">{currentPlan?.title ?? "Roteiro em construção"}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Custos recalculados por passageiro em cada trecho, com milhas convertidas automaticamente para reais.
                  </p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-2 text-xs sm:grid-cols-3 lg:min-w-[520px]">
                <div className="rounded-xl border border-border bg-background/50 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Primeira partida</p>
                  <p className="mt-1 font-medium">{fmtDT(tripStart)}</p>
                  <p className="text-muted-foreground">{partOfDay(tripStart) || "aguardando horário"}</p>
                </div>
                <div className="rounded-xl border border-border bg-background/50 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Última chegada</p>
                  <p className="mt-1 font-medium">{fmtDT(tripEnd)}</p>
                  <p className="text-muted-foreground">{partOfDay(tripEnd) || "aguardando horário"}</p>
                </div>
                <div className="rounded-xl border border-border bg-background/50 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Duração</p>
                  <p className="mt-1 font-medium">{days ? `${days} dia${days > 1 ? "s" : ""}` : "—"}</p>
                  <p className="text-muted-foreground">calculada pela rota</p>
                </div>
              </div>
            </div>
          </section>

          <TravelMap legs={mapLegs} height={440} />

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard icon={MapPinned} label="Trechos" value={String(legs.length)} caption={`${legs.length === 1 ? "voo programado" : "voos programados"} nesta viagem`} />
            <MetricCard icon={Plane} label="Milhas totais" value={num(totals.points)} caption="Milhas por trecho multiplicadas pelos passageiros" />
            <MetricCard icon={Coins} label="Milhas em reais" value={brl(totals.milesValue)} caption="Milhas totais × custo do milheiro" />
            <MetricCard icon={Landmark} label="Taxas totais" value={brl(totals.taxes)} caption="Taxas por trecho multiplicadas pelos passageiros" />
            <MetricCard icon={CalendarDays} label="Total geral" value={brl(totals.total)} caption="Milhas em reais + taxas totais" emphasis />
          </div>

          <div className="flex justify-between items-center">
            <button
              onClick={openCreate}
              className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md flex items-center gap-1"
            >
              <Plus className="w-4 h-4" /> Novo trecho
            </button>
            <button
              onClick={() => {
                if (confirm("Apagar este planejamento e todos os trechos?"))
                  deletePlan.mutate(currentPlanId);
              }}
              className="text-xs text-muted-foreground hover:text-destructive flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" /> Apagar planejamento
            </button>
          </div>

          {/* Dialog do trecho (criar/editar) */}
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>{editingId ? "Editar trecho" : "Novo trecho"}</DialogTitle>
              </DialogHeader>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] uppercase text-muted-foreground">Origem (IATA)</label>
                  <IataInput value={form.origin_iata} onChange={(v) => setForm({ ...form, origin_iata: v })} placeholder="GRU" />
                </div>
                <div>
                  <label className="text-[11px] uppercase text-muted-foreground">Destino (IATA)</label>
                  <IataInput value={form.destination_iata} onChange={(v) => setForm({ ...form, destination_iata: v })} placeholder="IGU" />
                </div>
                <div>
                  <label className="text-[11px] uppercase text-muted-foreground">Tempo voo</label>
                  <input value={form.flight_time} onChange={(e) => setForm({ ...form, flight_time: e.target.value })} placeholder="2h20" className="w-full border border-border px-2 py-1.5 text-xs bg-background rounded-md" />
                </div>
                <div>
                  <label className="text-[11px] uppercase text-muted-foreground">Milhas por pessoa</label>
                  <input type="number" value={form.points_qty || ""} onChange={(e) => setForm({ ...form, points_qty: Number(e.target.value) })} className="w-full border border-border px-2 py-1.5 text-xs bg-background rounded-md" />
                </div>
                <div>
                  <label className="text-[11px] uppercase text-muted-foreground">Programa</label>
                  <input value={form.program} onChange={(e) => setForm({ ...form, program: e.target.value })} placeholder="Smiles" className="w-full border border-border px-2 py-1.5 text-xs bg-background rounded-md" />
                </div>
                <div>
                  <label className="text-[11px] uppercase text-muted-foreground">Custo milheiro R$</label>
                  <input type="number" step="0.01" value={form.cost_per_thousand || ""} onChange={(e) => setForm({ ...form, cost_per_thousand: Number(e.target.value) })} className="w-full border border-border px-2 py-1.5 text-xs bg-background rounded-md" />
                </div>
                <div>
                  <label className="text-[11px] uppercase text-muted-foreground">Taxa por pessoa R$</label>
                  <input type="number" step="0.01" value={form.taxes || ""} onChange={(e) => setForm({ ...form, taxes: Number(e.target.value) })} className="w-full border border-border px-2 py-1.5 text-xs bg-background rounded-md" />
                </div>
                <div>
                  <label className="text-[11px] uppercase text-muted-foreground">Passageiros</label>
                  <input type="number" value={form.pax || ""} onChange={(e) => setForm({ ...form, pax: Number(e.target.value) })} className="w-full border border-border px-2 py-1.5 text-xs bg-background rounded-md" />
                </div>
                <div>
                  <label className="text-[11px] uppercase text-muted-foreground">Classe</label>
                  <select value={form.class} onChange={(e) => setForm({ ...form, class: e.target.value })} className="w-full border border-border px-2 py-1.5 text-xs bg-background rounded-md">
                    <option>Economy</option>
                    <option>Premium Economy</option>
                    <option>Business</option>
                    <option>First</option>
                  </select>
                </div>
                <div>
                  <label className="text-[11px] uppercase text-muted-foreground">Cia Aérea</label>
                  <input value={form.airline} onChange={(e) => setForm({ ...form, airline: e.target.value })} placeholder="GOL" className="w-full border border-border px-2 py-1.5 text-xs bg-background rounded-md" />
                </div>
                <div>
                  <label className="text-[11px] uppercase text-muted-foreground">Aeronave</label>
                  <input value={form.aircraft} onChange={(e) => setForm({ ...form, aircraft: e.target.value })} placeholder="B737-800" className="w-full border border-border px-2 py-1.5 text-xs bg-background rounded-md" />
                </div>
                <div>
                  <label className="text-[11px] uppercase text-muted-foreground">Partida</label>
                  <input type="datetime-local" value={form.departure_at} onChange={(e) => setForm({ ...form, departure_at: e.target.value })} className="w-full border border-border px-2 py-1.5 text-xs bg-background rounded-md" />
                </div>
                <div>
                  <label className="text-[11px] uppercase text-muted-foreground">Chegada</label>
                  <input type="datetime-local" value={form.arrival_at} onChange={(e) => setForm({ ...form, arrival_at: e.target.value })} className="w-full border border-border px-2 py-1.5 text-xs bg-background rounded-md" />
                </div>
                <div className="md:col-span-2 rounded-xl border border-primary/30 bg-primary/10 p-3">
                  <label className="text-[11px] uppercase tracking-wider text-muted-foreground">Total automático do trecho</label>
                  <p className="mt-1 text-2xl font-semibold text-gold tabular-nums">{brl(computeTotal(form))}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {num(getTotalMiles(form))} milhas convertidas ({brl(getMilesCashValue(form))}) + {brl(getTotalTaxes(form))} em taxas.
                  </p>
                </div>
                <label className="flex items-center gap-2 text-xs mt-5">
                  <input type="checkbox" checked={form.emitted} onChange={(e) => setForm({ ...form, emitted: e.target.checked })} />
                  Emitido
                </label>
              </div>
              {saveLeg.error && <p className="text-xs text-destructive">{(saveLeg.error as Error).message}</p>}
              <DialogFooter>
                <button onClick={() => setDialogOpen(false)} className="px-3 py-1.5 text-sm border border-border rounded-md">Cancelar</button>
                <button onClick={() => saveLeg.mutate()} disabled={saveLeg.isPending} className="px-3 py-1.5 text-sm bg-primary text-primary-foreground rounded-md disabled:opacity-50">
                  {editingId ? "Salvar alterações" : "Adicionar trecho"}
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>


          {/* Tabela de trechos */}
          <div className="overflow-x-auto border border-border rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr className="text-left uppercase tracking-wider text-[10px] text-muted-foreground">
                  <th className="px-3 py-2">Itinerário</th>
                  <th className="px-3 py-2">Partida</th>
                  <th className="px-3 py-2">Chegada</th>
                  <th className="px-3 py-2">Tempo voo</th>
                  <th className="px-3 py-2 text-right">Milhas totais</th>
                  <th className="px-3 py-2">Programa</th>
                  <th className="px-3 py-2 text-right">Milheiro</th>
                  <th className="px-3 py-2 text-right">Taxas totais</th>
                  <th className="px-3 py-2 text-center">Passageiros</th>
                  <th className="px-3 py-2">Classe</th>
                  <th className="px-3 py-2">Cia</th>
                  <th className="px-3 py-2">Aeronave</th>
                  <th className="px-3 py-2 text-right">Total</th>
                  <th className="px-3 py-2 text-center">Emitido</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {sortedLegs.length === 0 && (
                  <tr>
                    <td colSpan={15} className="px-3 py-6 text-center text-muted-foreground">
                      Nenhum trecho ainda. Adicione o primeiro em "Novo trecho".
                    </td>
                  </tr>
                )}
                {sortedLegs.map((l) => {
                  const from = findAirport(l.origin_iata);
                  const to = findAirport(l.destination_iata);
                  const rowMiles = getTotalMiles(l);
                  const rowTaxes = getTotalTaxes(l);
                  const rowTotal = computeTotal(l);
                  return (
                    <tr key={l.id} className="border-t border-border">
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="font-medium">{l.origin_iata}</span>
                        <span className="text-muted-foreground mx-1">✈</span>
                        <span className="font-medium">{l.destination_iata}</span>
                        <span className="text-[10px] text-muted-foreground ml-2">
                          {from?.city} → {to?.city}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {l.departure_at ? (
                          <span>
                            {fmtDT(l.departure_at)}{" "}
                            <span className="text-[10px] text-muted-foreground">{partOfDay(l.departure_at)}</span>
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {l.arrival_at ? (
                          <span>
                            {fmtDT(l.arrival_at)}{" "}
                            <span className="text-[10px] text-muted-foreground">{partOfDay(l.arrival_at)}</span>
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-3 py-2">{l.flight_time ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <span className="font-medium">{num(rowMiles)}</span>
                        <span className="block text-[10px] text-muted-foreground">{num(l.points_qty)} por pessoa</span>
                      </td>
                      <td className="px-3 py-2 text-gold">{l.program ?? "—"}</td>

                      <td className="px-3 py-2 text-right tabular-nums">{brl(l.cost_per_thousand)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        <span className="font-medium">{brl(rowTaxes)}</span>
                        <span className="block text-[10px] text-muted-foreground">{brl(l.taxes)} por pessoa</span>
                      </td>
                      <td className="px-3 py-2 text-center tabular-nums">{l.pax ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{l.class ?? "—"}</td>
                      <td className="px-3 py-2">{l.airline ?? "—"}</td>
                      <td className="px-3 py-2 text-muted-foreground">{l.aircraft ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold text-gold">{brl(rowTotal)}</td>
                      <td className="px-3 py-2 text-center">
                        {l.emitted ? <span className="text-gold">✓</span> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button onClick={() => openEdit(l)} className="text-muted-foreground hover:text-gold p-1"><Pencil className="w-4 h-4" /></button>
                        <button onClick={() => { if (confirm("Excluir trecho?")) deleteLeg.mutate(l.id); }} className="text-muted-foreground hover:text-destructive p-1"><Trash2 className="w-4 h-4" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-[11px] text-muted-foreground">
            IATA suportadas: {AIRPORTS.length} aeroportos (Brasil + hubs). Se faltar algum, me avise que eu adiciono.
          </p>
        </>
        );
      })()}
    </div>
  );
}
