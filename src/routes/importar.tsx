import { createFileRoute } from "@tanstack/react-router";
import { ProtectedShell } from "@/components/ProtectedShell";
import { useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { useCards, useCategories, useInvalidate } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Upload, FileSpreadsheet, Trash2, CheckCircle2, AlertCircle, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { brl } from "@/lib/format";
import { PEOPLE } from "@/lib/people";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/importar")({
  component: () => <ProtectedShell><ImportPage /></ProtectedShell>,
  head: () => ({ meta: [{ title: "Importar planilha — Gestão" }] }),
});

type SheetKind = "ignore" | "transactions" | "cartao_compras" | "recurring";
type Field =
  | "ignore"
  | "description"
  | "amount"
  | "date"
  | "due_date"
  | "card"
  | "category"
  | "person"
  | "kind"
  | "installments"
  | "installment_number"
  | "day_of_month";

interface SheetState {
  name: string;
  kind: SheetKind;
  headers: string[];
  rows: any[][];
  mapping: Record<number, Field>; // column index -> field
}

const FIELD_LABELS: Record<Field, string> = {
  ignore: "— ignorar —",
  description: "Descrição",
  amount: "Valor",
  date: "Data lançamento",
  due_date: "Vencimento",
  card: "Cartão",
  category: "Categoria",
  person: "Pessoa",
  kind: "Tipo (receita/despesa)",
  installments: "Nº parcelas",
  installment_number: "Parcela atual (1, 2…)",
  day_of_month: "Dia do mês (fixos)",
};

const FIELDS_BY_KIND: Record<SheetKind, Field[]> = {
  ignore: [],
  transactions: ["ignore", "description", "amount", "date", "due_date", "category", "person", "kind"],
  cartao_compras: ["ignore", "description", "amount", "date", "card", "category", "person", "installments", "installment_number"],
  recurring: ["ignore", "description", "amount", "day_of_month", "category", "kind"],
};

function autoDetect(header: string, allowed: Field[]): Field {
  const h = header.toLowerCase().trim();
  const map: Array<[RegExp, Field]> = [
    [/descri|hist|item|produto|estabel/, "description"],
    [/parcela.*\/|x\d|qtd.*parc|n[º°]?\s*parc|parcelas?$/, "installments"],
    [/parcela|presta/, "installment_number"],
    [/valor|r\$|preço|total|montante/, "amount"],
    [/vencim|venc\.|data.*venc|fatura/, "due_date"],
    [/data|dia.*compra|emiss/, "date"],
    [/cart[ãa]o|bandeira/, "card"],
    [/categ|tipo.*gasto/, "category"],
    [/pessoa|respons|quem|usu[áa]rio/, "person"],
    [/dia.*m[êe]s|dia$/, "day_of_month"],
    [/receita|despesa|tipo$/, "kind"],
  ];
  for (const [re, f] of map) if (re.test(h) && allowed.includes(f)) return f;
  return "ignore";
}

function excelDateToISO(v: any): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  if (v instanceof Date) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  // dd/mm/yyyy
  const m = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (m) {
    let [, d, mo, y] = m;
    if (y.length === 2) y = "20" + y;
    return `${y}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  // yyyy-mm-dd
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return null;
}

function parseAmount(v: any): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return v;
  let s = String(v).replace(/[R$\s]/g, "");
  // brazilian format: 1.234,56
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  s = s.replace(/[^0-9.\-]/g, "");
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function normalizePerson(v: any): string | null {
  if (!v) return null;
  const s = String(v).toLowerCase().trim();
  if (/lor/.test(s)) return "Lorran";
  if (/tay/.test(s)) return "Tayane";
  if (/fam/.test(s)) return "Familia";
  return null;
}

function normalizeKind(v: any, fallback: "income" | "expense" = "expense"): "income" | "expense" {
  if (!v) return fallback;
  const s = String(v).toLowerCase();
  if (/rec|entr|sal|cr[eé]d/.test(s)) return "income";
  if (/desp|sa[íi]d|d[eé]b|gast/.test(s)) return "expense";
  return fallback;
}

function ImportPage() {
  const [sheets, setSheets] = useState<SheetState[]>([]);
  const [filename, setFilename] = useState<string>("");
  const [importing, setImporting] = useState(false);
  const [sendToRequests, setSendToRequests] = useState(true);
  const { data: cards = [] } = useCards();
  const { data: categories = [] } = useCategories();
  const invalidate = useInvalidate();

  const { data: batches = [], refetch: refetchBatches } = useQuery({
    queryKey: ["import_batches"],
    queryFn: async () => {
      const { data, error } = await supabase.from("lotes_importacao").select("*").order("created_at", { ascending: false }).limit(10);
      if (error) throw error;
      return data ?? [];
    },
  });

  const handleFile = async (file: File) => {
    setFilename(file.name);
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { cellDates: true });
    const states: SheetState[] = wb.SheetNames.map((name) => {
      const ws = wb.Sheets[name];
      const data = XLSX.utils.sheet_to_json<any[]>(ws, { header: 1, raw: true, defval: null });
      // find first row with mostly strings as header
      const headerRow = (data.find((r) => r && r.some((c) => typeof c === "string" && String(c).trim().length > 1)) ?? []) as any[];
      const startIdx = data.indexOf(headerRow as any) + 1;
      const headers = headerRow.map((h) => (h == null ? "" : String(h)));
      const rows = data.slice(startIdx).filter((r) => r && r.some((c) => c != null && c !== ""));
      // guess kind from name
      const lower = name.toLowerCase();
      let kind: SheetKind = "ignore";
      if (/cart|fatura|parcel/.test(lower)) kind = "cartao_compras";
      else if (/fix|recorr|mensal/.test(lower)) kind = "recurring";
      else if (/lan[çc]|extrato|movim|despe|receit/.test(lower)) kind = "transactions";
      const allowed = FIELDS_BY_KIND[kind];
      const mapping: Record<number, Field> = {};
      headers.forEach((h, i) => { mapping[i] = allowed.length ? autoDetect(h, allowed) : "ignore"; });
      return { name, kind, headers, rows, mapping };
    });
    setSheets(states);
  };

  const updateSheet = (i: number, patch: Partial<SheetState>) => {
    setSheets((s) => s.map((sh, idx) => (idx === i ? { ...sh, ...patch } : sh)));
  };

  const onKindChange = (i: number, kind: SheetKind) => {
    const allowed = FIELDS_BY_KIND[kind];
    const sheet = sheets[i];
    const mapping: Record<number, Field> = {};
    sheet.headers.forEach((h, idx) => { mapping[idx] = allowed.length ? autoDetect(h, allowed) : "ignore"; });
    updateSheet(i, { kind, mapping });
  };

  const buildPreview = (sheet: SheetState) => {
    const get = (row: any[], field: Field) => {
      const idx = Object.entries(sheet.mapping).find(([, f]) => f === field)?.[0];
      return idx != null ? row[Number(idx)] : null;
    };
    return sheet.rows.map((row) => {
      if (sheet.kind === "transactions") {
        const desc = get(row, "description"); const amt = parseAmount(get(row, "amount"));
        const date = excelDateToISO(get(row, "date")) ?? excelDateToISO(get(row, "due_date"));
        const due = excelDateToISO(get(row, "due_date")) ?? date;
        const kind = normalizeKind(get(row, "kind"), (amt ?? 0) < 0 ? "expense" : "expense");
        const errors: string[] = [];
        if (!desc) errors.push("descrição");
        if (amt == null) errors.push("valor");
        if (!date) errors.push("data");
        return { kind: "tx" as const, errors, data: { description: String(desc ?? ""), amount: Math.abs(amt ?? 0), kind, due_at: due, posted_at: date, person: normalizePerson(get(row, "person")), category_name: get(row, "category") ? String(get(row, "category")) : null } };
      }
      if (sheet.kind === "cartao_compras") {
        const desc = get(row, "description"); const amt = parseAmount(get(row, "amount"));
        const date = excelDateToISO(get(row, "date"));
        const cardName = get(row, "card") ? String(get(row, "card")).trim() : null;
        const inst = parseInt(String(get(row, "installments") ?? "1"), 10) || 1;
        const errors: string[] = [];
        if (!desc) errors.push("descrição");
        if (amt == null) errors.push("valor");
        if (!date) errors.push("data");
        if (!cardName) errors.push("cartão");
        return { kind: "cp" as const, errors, data: { description: String(desc ?? ""), total_amount: Math.abs(amt ?? 0), purchase_date: date, card_name: cardName, installments_count: inst, person: normalizePerson(get(row, "person")), category_name: get(row, "category") ? String(get(row, "category")) : null } };
      }
      if (sheet.kind === "recurring") {
        const desc = get(row, "description"); const amt = parseAmount(get(row, "amount"));
        const day = parseInt(String(get(row, "day_of_month") ?? "1"), 10) || 1;
        const k = normalizeKind(get(row, "kind"), "expense");
        const errors: string[] = [];
        if (!desc) errors.push("descrição");
        if (amt == null) errors.push("valor");
        return { kind: "rr" as const, errors, data: { description: String(desc ?? ""), amount: Math.abs(amt ?? 0), kind: k, day_of_month: Math.min(28, Math.max(1, day)), category_name: get(row, "category") ? String(get(row, "category")) : null } };
      }
      return null;
    }).filter(Boolean) as any[];
  };

  const totals = sheets.map((s) => {
    if (s.kind === "ignore") return { ok: 0, err: 0 };
    const p = buildPreview(s);
    return { ok: p.filter((r) => r.errors.length === 0).length, err: p.filter((r) => r.errors.length > 0).length };
  });

  const runImport = async () => {
    setImporting(true);
    try {
      const { data: ures } = await supabase.auth.getUser();
      const uid = ures.user?.id;
      if (!uid) throw new Error("não autenticado");

      // Create batch
      const { data: batch, error: bErr } = await supabase.from("lotes_importacao").insert({ user_id: uid, source_filename: filename, summary: {} }).select().single();
      if (bErr) throw bErr;
      const batchId = batch.id;

      const cardMap = new Map(cards.map((c: any) => [c.name.toLowerCase().trim(), c.id]));
      const catMap = new Map(categories.map((c: any) => [c.name.toLowerCase().trim(), c.id]));

      const ensureCategory = async (name: string | null, kind: "income" | "expense" = "expense") => {
        if (!name) return null;
        const key = name.toLowerCase().trim();
        if (catMap.has(key)) return catMap.get(key);
        const { data, error } = await supabase.from("categorias").insert({ user_id: uid, name, kind }).select().single();
        if (error) return null;
        catMap.set(key, data.id);
        return data.id;
      };
      const ensureCard = async (name: string) => {
        const key = name.toLowerCase().trim();
        if (cardMap.has(key)) return cardMap.get(key);
        const { data, error } = await supabase.from("cartoes").insert({ user_id: uid, name, closing_day: 1, due_day: 10, credit_limit: 0 }).select().single();
        if (error) return null;
        cardMap.set(key, data.id);
        return data.id;
      };

      let txCount = 0, cpCount = 0, ciCount = 0, rrCount = 0, skipped = 0;

      for (const sheet of sheets) {
        if (sheet.kind === "ignore") continue;
        const preview = buildPreview(sheet);
        const valid = preview.filter((r) => r.errors.length === 0);
        skipped += preview.length - valid.length;

        if (sendToRequests) {
          // Route everything to financial_requests (pending approval)
          const reqRows = await Promise.all(valid.map(async (r: any) => {
            if (sheet.kind === "transactions") {
              return {
                user_id: uid, source: "import", kind: r.data.kind,
                amount: r.data.amount, description: r.data.description,
                suggested_category_id: await ensureCategory(r.data.category_name, r.data.kind),
                person: r.data.person, due_at: r.data.due_at, posted_at: r.data.posted_at,
                status: "pendente", import_batch_id: batchId,
              };
            }
            if (sheet.kind === "cartao_compras") {
              const cardId = await ensureCard(r.data.card_name);
              return {
                user_id: uid, source: "import", kind: "card",
                amount: r.data.total_amount, description: r.data.description,
                suggested_category_id: await ensureCategory(r.data.category_name),
                suggested_card_id: cardId, installments_count: r.data.installments_count,
                purchase_date: r.data.purchase_date, person: r.data.person,
                status: "pendente", import_batch_id: batchId,
              };
            }
            // recurring
            return {
              user_id: uid, source: "import", kind: r.data.kind,
              amount: r.data.amount, description: r.data.description,
              suggested_category_id: await ensureCategory(r.data.category_name, r.data.kind),
              is_recurring: true, recurring_day: r.data.day_of_month,
              status: "pendente", import_batch_id: batchId,
            };
          }));
          for (let i = 0; i < reqRows.length; i += 500) {
            const chunk = reqRows.slice(i, i + 500);
            const { error } = await supabase.from("requisicoes_financeiras").insert(chunk);
            if (!error) txCount += chunk.length;
          }
          continue;
        }

        if (sheet.kind === "transactions") {
          const rows = await Promise.all(valid.map(async (r) => ({
            user_id: uid,
            description: r.data.description,
            amount: r.data.amount,
            kind: r.data.kind,
            due_at: r.data.due_at,
            posted_at: r.data.posted_at,
            person: r.data.person,
            category_id: await ensureCategory(r.data.category_name, r.data.kind),
            status: "pending",
            import_batch_id: batchId,
          })));
          for (let i = 0; i < rows.length; i += 500) {
            const chunk = rows.slice(i, i + 500);
            const { error } = await supabase.from("transacoes").insert(chunk);
            if (!error) txCount += chunk.length;
          }
        } else if (sheet.kind === "cartao_compras") {
          for (const r of valid) {
            const cardId = await ensureCard(r.data.card_name);
            if (!cardId) continue;
            const catId = await ensureCategory(r.data.category_name);
            const { data: cp, error } = await supabase.from("cartao_compras").insert({
              user_id: uid, card_id: cardId, category_id: catId,
              description: r.data.description, total_amount: r.data.total_amount,
              installments_count: r.data.installments_count, purchase_date: r.data.purchase_date,
              person: r.data.person, import_batch_id: batchId,
            }).select().single();
            if (error || !cp) continue;
            cpCount++;
            const per = +(r.data.total_amount / r.data.installments_count).toFixed(2);
            const installments = [];
            const base = new Date(r.data.purchase_date + "T00:00:00");
            for (let n = 1; n <= r.data.installments_count; n++) {
              const d = new Date(base); d.setMonth(d.getMonth() + n);
              installments.push({
                user_id: uid, card_id: cardId, purchase_id: cp.id,
                installment_number: n, amount: per,
                due_at: d.toISOString().slice(0, 10),
                status: "pending", import_batch_id: batchId,
              });
            }
            const { error: iErr } = await supabase.from("cartao_parcelas").insert(installments);
            if (!iErr) ciCount += installments.length;
          }
        } else if (sheet.kind === "recurring") {
          const rows = await Promise.all(valid.map(async (r) => ({
            user_id: uid,
            description: r.data.description,
            amount: r.data.amount,
            kind: r.data.kind,
            day_of_month: r.data.day_of_month,
            category_id: await ensureCategory(r.data.category_name, r.data.kind),
            active: true,
            import_batch_id: batchId,
          })));
          const { error } = await supabase.from("regras_recorrentes").insert(rows);
          if (!error) rrCount += rows.length;
        }
      }

      await supabase.from("lotes_importacao").update({
        summary: { transactions: txCount, cartao_compras: cpCount, installments: ciCount, recurring: rrCount, skipped },
      }).eq("id", batchId);

      if (sendToRequests) {
        toast.success(`${txCount} pedidos criados para aprovação. ${skipped} ignorados.`);
      } else {
        toast.success(`Importado: ${txCount} lançamentos, ${cpCount} compras, ${ciCount} parcelas, ${rrCount} fixos. ${skipped} ignorados.`);
      }
      setSheets([]); setFilename("");
      invalidate("transactions"); invalidate("installments"); invalidate("recurring_rules"); invalidate("cards"); invalidate("categories"); invalidate("financial_requests");
      refetchBatches();
    } catch (e: any) {
      toast.error("Erro: " + (e.message ?? e));
    } finally {
      setImporting(false);
    }
  };

  const undoBatch = async (id: string) => {
    if (!confirm("Desfazer essa importação? Tudo que foi criado por ela será removido.")) return;
    await supabase.from("transacoes").delete().eq("import_batch_id", id);
    await supabase.from("cartao_parcelas").delete().eq("import_batch_id", id);
    await supabase.from("cartao_compras").delete().eq("import_batch_id", id);
    await supabase.from("regras_recorrentes").delete().eq("import_batch_id", id);
    await supabase.from("lotes_importacao").delete().eq("id", id);
    toast.success("Importação desfeita");
    invalidate("transactions"); invalidate("installments"); invalidate("recurring_rules");
    refetchBatches();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Importar planilha</h1>
        <p className="text-sm text-muted-foreground">Suba o Gestão_Familia.xlsx e mapeie cada aba.</p>
      </div>

      {sheets.length === 0 && (
        <Card>
          <CardContent className="p-10">
            <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-border rounded-xl p-10 cursor-pointer hover:bg-muted/40">
              <Upload className="w-10 h-10 text-muted-foreground" />
              <div className="text-sm">Clique para selecionar um arquivo .xlsx</div>
              <input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
            </label>
          </CardContent>
        </Card>
      )}

      {sheets.length > 0 && (
        <>
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2 text-sm">
              <FileSpreadsheet className="w-4 h-4" /> {filename} • {sheets.length} aba(s)
            </div>
            <div className="flex gap-2 items-center">
              <label className="flex items-center gap-2 text-xs text-muted-foreground mr-2">
                <input type="checkbox" checked={sendToRequests} onChange={(e) => setSendToRequests(e.target.checked)} />
                Enviar para Pedidos (aprovação)
              </label>
              <Button variant="outline" onClick={() => { setSheets([]); setFilename(""); }}><Trash2 className="w-4 h-4 mr-1" />Cancelar</Button>
              <Button onClick={runImport} disabled={importing}>{importing ? "Importando..." : "Importar tudo"}</Button>
            </div>
          </div>

          {sheets.map((sheet, i) => {
            const allowed = FIELDS_BY_KIND[sheet.kind];
            const preview = sheet.kind === "ignore" ? [] : buildPreview(sheet).slice(0, 8);
            const t = totals[i];
            return (
              <Card key={i}>
                <CardHeader className="flex flex-row items-center justify-between gap-4">
                  <div>
                    <CardTitle className="text-base">{sheet.name}</CardTitle>
                    <div className="text-xs text-muted-foreground">{sheet.rows.length} linhas</div>
                  </div>
                  <div className="flex items-center gap-3">
                    {sheet.kind !== "ignore" && (
                      <div className="flex items-center gap-2 text-xs">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" /> {t.ok}
                        <AlertCircle className="w-4 h-4 text-amber-500 ml-2" /> {t.err}
                      </div>
                    )}
                    <Select value={sheet.kind} onValueChange={(v) => onKindChange(i, v as SheetKind)}>
                      <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ignore">Ignorar aba</SelectItem>
                        <SelectItem value="transactions">Lançamentos</SelectItem>
                        <SelectItem value="cartao_compras">Compras no cartão</SelectItem>
                        <SelectItem value="recurring">Fixos / recorrentes</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>

                {sheet.kind !== "ignore" && (
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                      {sheet.headers.map((h, idx) => (
                        <div key={idx} className="space-y-1">
                          <div className="text-xs text-muted-foreground truncate">{h || `Coluna ${idx + 1}`}</div>
                          <Select value={sheet.mapping[idx] ?? "ignore"} onValueChange={(v) => updateSheet(i, { mapping: { ...sheet.mapping, [idx]: v as Field } })}>
                            <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {allowed.map((f) => <SelectItem key={f} value={f}>{FIELD_LABELS[f]}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      ))}
                    </div>

                    {preview.length > 0 && (
                      <div className="border border-border rounded-lg overflow-x-auto text-xs">
                        <table className="w-full">
                          <thead className="bg-muted">
                            <tr>
                              <th className="text-left p-2">Status</th>
                              <th className="text-left p-2">Descrição</th>
                              <th className="text-left p-2">Valor</th>
                              <th className="text-left p-2">Data</th>
                              <th className="text-left p-2">Pessoa</th>
                              <th className="text-left p-2">Extra</th>
                            </tr>
                          </thead>
                          <tbody>
                            {preview.map((p, k) => (
                              <tr key={k} className={p.errors.length ? "bg-red-500/10" : ""}>
                                <td className="p-2">{p.errors.length ? <span className="text-red-500">erro: {p.errors.join(", ")}</span> : <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />}</td>
                                <td className="p-2 max-w-[220px] truncate">{p.data.description}</td>
                                <td className="p-2">{brl(p.data.amount ?? p.data.total_amount)}</td>
                                <td className="p-2">{p.data.due_at ?? p.data.purchase_date ?? `dia ${p.data.day_of_month ?? ""}`}</td>
                                <td className="p-2">{p.data.person ?? "-"}</td>
                                <td className="p-2 text-muted-foreground">{p.data.card_name ? `cartão: ${p.data.card_name}` : ""} {p.data.installments_count ? ` ${p.data.installments_count}x` : ""}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </>
      )}

      {batches.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Importações recentes</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {batches.map((b: any) => (
              <div key={b.id} className="flex items-center justify-between text-sm border border-border rounded-lg p-3">
                <div>
                  <div className="font-medium">{b.source_filename ?? "(sem nome)"}</div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(b.created_at).toLocaleString("pt-BR")} •{" "}
                    {b.summary ? `${b.summary.transactions ?? 0} lançamentos, ${b.summary.cartao_compras ?? 0} compras, ${b.summary.recurring ?? 0} fixos` : ""}
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={() => undoBatch(b.id)}><Undo2 className="w-4 h-4 mr-1" />Desfazer</Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
