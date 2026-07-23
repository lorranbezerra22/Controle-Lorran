import { createFileRoute } from "@tanstack/react-router";
import { personSchema, categorySchema, firstZodError } from "@/lib/schemas";
import { ProtectedShell } from "@/components/ProtectedShell";
import { useCategories, useInvalidate, useTransactions, useInstallments, useCards, usePeople } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, Check, X, UserPlus, ChevronDown, ChevronRight, FileDown, MessageSquare, Database, Settings as SettingsIcon } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { brl, monthLabel } from "@/lib/format";
import { SmartInput } from "@/components/smart-input";
import { personColor, isFamilia } from "@/lib/people";

function useLsBool(key: string, initial: boolean) {
  const storageKey = `base:${key}`;
  const [v, setV] = useState<boolean>(() => {
    if (typeof window === "undefined") return initial;
    const raw = window.localStorage.getItem(storageKey);
    return raw === null ? initial : raw === "1";
  });
  const set = (n: boolean) => {
    setV(n);
    if (typeof window !== "undefined") window.localStorage.setItem(storageKey, n ? "1" : "0");
  };
  return [v, set] as const;
}

export const Route = createFileRoute("/base")({
  component: () => <ProtectedShell><BasePage /></ProtectedShell>,
  head: () => ({ meta: [{ title: "Configurações — Gestão" }] }),
});


function BasePage() {
  const { data: cats = [] } = useCategories();
  const invalidate = useInvalidate();
  const [open, setOpen] = useState(false);
  const [openPerson, setOpenPerson] = useState(false);

  const income = cats.filter((c: any) => c.kind === "income");
  const expense = cats.filter((c: any) => c.kind === "expense");

  return (
    <div className="space-y-6">
      <PageHeader
        icon={SettingsIcon}
        eyebrow="Cadastros"
        title="Configurações"
        subtitle="Categorias e pessoas"
        actions={
          <>
            <Dialog open={openPerson} onOpenChange={setOpenPerson}>
              <DialogTrigger asChild><Button variant="outline" size="sm" className="rounded-full"><UserPlus className="w-4 h-4 mr-1" /> Nova pessoa</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Nova pessoa</DialogTitle></DialogHeader>
                <PersonForm onDone={() => { setOpenPerson(false); invalidate("people"); }} />
              </DialogContent>
            </Dialog>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild><Button size="sm" className="rounded-full shadow-md"><Plus className="w-4 h-4 mr-1" /> Nova categoria</Button></DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Nova categoria</DialogTitle></DialogHeader>
                <CategoryForm onDone={() => { setOpen(false); invalidate("categories"); }} />
              </DialogContent>
            </Dialog>
          </>
        }
      />



      <div className="grid md:grid-cols-2 gap-4">
        <CatList title="Despesas" items={expense} onChange={() => invalidate("categories")} />
        <CatList title="Receitas" items={income} onChange={() => invalidate("categories")} />
      </div>

      <PeopleReportSection />
      <PeopleListSection />
      
    </div>
  );
}

const PALETTE = ["#6366f1","#22c55e","#f59e0b","#ec4899","#06b6d4","#a855f7","#ef4444","#14b8a6","#f97316","#84cc16","#3b82f6","#d946ef","#eab308","#10b981","#f43f5e"];

function pickUniqueColor(used: Set<string>) {
  const free = PALETTE.filter((c) => !used.has(c.toLowerCase()));
  const pool = free.length ? free : PALETTE;
  return pool[Math.floor(Math.random() * pool.length)];
}

function PeopleListSection() {
  const { data: people = [] } = usePeople();
  const invalidate = useInvalidate();
  const fixedRef = useRef(false);

  // Ajusta cores duplicadas / faltantes uma única vez
  useEffect(() => {
    if (fixedRef.current || people.length === 0) return;
    const used = new Set<string>();
    const updates: Array<{ id: string; color: string }> = [];
    people.forEach((p: any) => {
      const c = (p.color || "").toLowerCase();
      if (!c || used.has(c)) {
        const newC = pickUniqueColor(used);
        updates.push({ id: p.id, color: newC });
        used.add(newC.toLowerCase());
      } else {
        used.add(c);
      }
    });
    if (updates.length === 0) { fixedRef.current = true; return; }
    fixedRef.current = true;
    Promise.all(updates.map((u) => supabase.from("pessoas").update({ color: u.color }).eq("id", u.id)))
      .then(() => invalidate("people"));
  }, [people, invalidate]);

  const remove = async (id: string, name: string) => {
    if (!confirm(`Excluir pessoa "${name}"? Todos os lançamentos vinculados a esta pessoa também serão excluídos.`)) return;
    
    // Deletamos as parcelas de cartão vinculadas (via compras)
    const { data: purchases } = await supabase.from("cartao_compras").select("id").eq("person", name);
    if (purchases && purchases.length > 0) {
      const pIds = purchases.map(p => p.id);
      await supabase.from("cartao_parcelas").delete().in("purchase_id", pIds);
      await supabase.from("cartao_compras").delete().in("id", pIds);
    }

    // Deletamos as transações diretas
    await supabase.from("transacoes").delete().eq("person", name);

    // Finalmente deletamos a pessoa
    const { error } = await supabase.from("pessoas").delete().eq("id", id);
    if (error) toast.error(error.message); else { 
      toast.success("Pessoa e lançamentos removidos"); 
      invalidate("people"); 
      invalidate("transactions"); 
      invalidate("installments"); 
    }
  };
  const [open, setOpen] = useLsBool("peopleList", true);
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden" style={{ boxShadow: "var(--shadow-elegant)" }}>
      <button onClick={() => setOpen(!open)} className="w-full px-4 py-3 border-b border-border bg-muted/30 text-sm font-semibold flex items-center gap-2 hover:bg-muted/50">
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        Pessoas cadastradas ({people.length})
      </button>
      {open && (people.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma pessoa cadastrada. Use "Nova pessoa" para começar.</div>
      ) : (
        <ul className="divide-y divide-border">
          {[...people].sort((a: any, b: any) => a.name.localeCompare(b.name, "pt-BR")).map((p: any) => (
            <li key={p.id} className="p-3 flex items-center gap-3 hover:bg-muted/20">
              <span className="w-3 h-3 rounded-full" style={{ background: p.color || personColor(p.name) }} />
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{p.name}</div>
              </div>
              <button onClick={() => remove(p.id, p.name)} className="w-7 h-7 rounded-md flex items-center justify-center bg-muted text-muted-foreground hover:bg-destructive/20 hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

function PeopleReportSection() {
  const { data: tx = [] } = useTransactions();
  const { data: inst = [] } = useInstallments();
  const { data: people = [] } = usePeople();
  const [selectedPerson, setSelectedPerson] = useState<string>("");
  const [open, setOpen] = useLsBool("reportSection", true);
  const [pixNote, setPixNote] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem("report:pixNote") || "";
  });

  useEffect(() => {
    if (typeof window !== "undefined") window.localStorage.setItem("report:pixNote", pixNote);
  }, [pixNote]);

  const now = new Date();
  const [reportMode, setReportMode] = useState<"all" | "month">("month");
  const [reportM, setReportM] = useState<number>(now.getMonth());
  const [reportY, setReportY] = useState<number>(now.getFullYear());

  const downloadReport = async () => {
    if (!selectedPerson) {
      toast.error("Selecione uma pessoa");
      return;
    }

    const inReportPeriod = (s: string) => {
      if (reportMode === "all") return true;
      const d = new Date(s + "T00:00:00");
      return d.getFullYear() === reportY && d.getMonth() === reportM;
    };

    const personTx = tx.filter((t: any) => {
      const p = (t.person || "").trim();
      const matchesPerson = p === selectedPerson || (isFamilia(p) && (selectedPerson === "Lorran" || selectedPerson === "Tayane"));
      return matchesPerson && inReportPeriod(t.due_at);
    });

    const personInst = inst.filter((i: any) => {
      const p = (i.cartao_compras?.person || "").trim();
      const matchesPerson = p === selectedPerson || (isFamilia(p) && (selectedPerson === "Lorran" || selectedPerson === "Tayane"));
      return matchesPerson && inReportPeriod(i.due_at);
    });

    if (personTx.length === 0 && personInst.length === 0) {
      toast.error("Nenhum dado encontrado para esta pessoa no período selecionado");
      return;
    }

    const data = [
      ...personTx.map((t: any) => {
        const amount = isFamilia(t.person) && !isFamilia(selectedPerson) ? Number(t.amount) / 2 : Number(t.amount);
          return {
            date: t.posted_at || t.due_at,
          type: "Lançamento",
          desc: t.description || "",
          installment: "—",
          amount,
          status: amount < 0 ? "Estorno" : (t.status === "paid" ? "Pago" : "Pendente"),
          original: t.person || ""
        };
      }),
      ...personInst.map((i: any) => {
        const amount = isFamilia(i.cartao_compras?.person) && !isFamilia(selectedPerson) ? Number(i.amount) / 2 : Number(i.amount);
        const installmentText = i.installment_number && i.cartao_compras?.installments_count 

          ? `${i.installment_number}/${i.cartao_compras.installments_count}` 
          : "—";
        return {
          date: i.cartao_compras?.purchase_date || i.due_at,
          type: "Cartão",
          desc: i.cartao_compras?.description || "",
          installment: installmentText,
          amount,
          status: amount < 0 ? "Estorno" : (i.status === "paid" ? "Pago" : "Pendente"),
          original: i.cartao_compras?.person || ""
        };
      })
    ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const fileName = `relatorio_${selectedPerson.toLowerCase()}_${new Date().toISOString().split("T")[0]}`;

    // Code splitting: jsPDF (~300KB) só carrega quando o usuário gera o relatório
    const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
      import("jspdf"),
      import("jspdf-autotable"),
    ]);
    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();

    // ===== Cabeçalho (faixa navy) =====
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, pageW, 32, "F");
    doc.setFillColor(59, 130, 246); // accent azul
    doc.rect(0, 32, pageW, 1.2, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.text("Relatório Financeiro", 14, 14);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(203, 213, 225); // slate-300
    doc.text(`Responsável: ${selectedPerson}`, 14, 22);

    const periodLabel = reportMode === "all" ? "Todos os períodos" : `${monthLabel(reportM)} / ${reportY}`;
    const emissao = new Date().toLocaleString("pt-BR");
    doc.text(`Período: ${periodLabel}`, 14, 28);
    const emissaoTxt = `Emitido em ${emissao}`;
    doc.text(emissaoTxt, pageW - 14 - doc.getTextWidth(emissaoTxt), 28);

    // ===== Cards de resumo =====
    const totalGeral = data.reduce((acc, c) => acc + c.amount, 0);
    const totalPago = data.filter(d => d.status === "Pago").reduce((a, c) => a + c.amount, 0);
    const totalPend = totalGeral - totalPago;

    const cardY = 42;
    const cardH = 22;
    const gap = 4;
    const cardW = (pageW - 28 - gap * 2) / 3;
    const cards: Array<[string, string, [number, number, number]]> = [
      ["Total Geral", brl(totalGeral), [30, 41, 59]],
      ["Pago", brl(totalPago), [22, 163, 74]],
      ["Em Aberto", brl(totalPend), [220, 38, 38]],
    ];
    cards.forEach(([label, value, color], i) => {
      const x = 14 + i * (cardW + gap);
      doc.setFillColor(248, 250, 252);
      doc.setDrawColor(226, 232, 240);
      doc.roundedRect(x, cardY, cardW, cardH, 2, 2, "FD");
      doc.setFillColor(...color);
      doc.rect(x, cardY, 2, cardH, "F");
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.setFont("helvetica", "normal");
      doc.text(label.toUpperCase(), x + 6, cardY + 7);
      doc.setFontSize(13);
      doc.setTextColor(...color);
      doc.setFont("helvetica", "bold");
      doc.text(value, x + 6, cardY + 16);
    });

    // ===== Callout de Mensagem (PIX) — logo abaixo do Total Geral =====
    let afterPixY = cardY + cardH + 6;
    if (pixNote) {
      const pixValue = pixNote.replace(/^\s*pix\s*:?\s*/i, "").trim();
      const boxY = cardY + cardH + 6;
      const boxH = 24;
      doc.setFillColor(254, 242, 242);
      doc.setDrawColor(220, 38, 38);
      doc.setLineWidth(0.4);
      doc.roundedRect(14, boxY, pageW - 28, boxH, 2, 2, "FD");
      doc.setFillColor(220, 38, 38);
      doc.rect(14, boxY, 2, boxH, "F");

      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.setTextColor(153, 27, 27);
      doc.text("CHAVE PIX PARA PAGAMENTO", 20, boxY + 7);

      const yText = boxY + 15;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.setTextColor(120, 120, 120);
      const label = "PIX: ";
      doc.text(label, 20, yText);
      const labelW = doc.getTextWidth(label);

      doc.setTextColor(220, 38, 38);
      doc.text(pixValue, 20 + labelW, yText);
      const valueW = doc.getTextWidth(pixValue);
      const escaped = pixValue.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
      try {
        (doc as any).link(20 + labelW, yText - 4, valueW, 6, {
          url: `javascript:app.setClipboard("${escaped}");app.alert("Chave PIX copiada!");`,
        });
      } catch {}

      doc.setFont("helvetica", "italic");
      doc.setFontSize(7);
      doc.setTextColor(120, 120, 120);
      doc.text("(toque na chave acima para copiar)", 20, yText + 5);

      afterPixY = boxY + boxH + 6;
    }

    const tableData = data.map(d => [
      new Date(d.date + "T00:00:00").toLocaleDateString("pt-BR"),
      d.type,
      d.desc,
      d.installment,
      brl(d.amount),
      d.status,
    ]);

    autoTable(doc, {
      startY: afterPixY,
      head: [["Data", "Tipo", "Descrição", "Parc.", "Valor", "Status"]],
      body: tableData,
      foot: [["", "", "", "TOTAL", brl(totalGeral), ""]],
      theme: "grid",
      styles: { font: "helvetica", fontSize: 9, cellPadding: 3, textColor: [30, 41, 59], lineColor: [226, 232, 240] },
      headStyles: { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold", halign: "left" },
      footStyles: { fillColor: [241, 245, 249], textColor: [15, 23, 42], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 22 },
        1: { cellWidth: 20 },
        3: { cellWidth: 16, halign: "center" },
        4: { cellWidth: 28, halign: "right" },
        5: { cellWidth: 22, halign: "center" },
      },
      didParseCell: (d: any) => {
        if (d.section === "body" && d.column.index === 5) {
          const v = String(d.cell.raw);
          if (v === "Pago") { d.cell.styles.textColor = [22, 163, 74]; d.cell.styles.fontStyle = "bold"; }
          if (v === "Pendente") { d.cell.styles.textColor = [220, 38, 38]; d.cell.styles.fontStyle = "bold"; }
          if (v === "Estorno") { d.cell.styles.textColor = [16, 185, 129]; d.cell.styles.fontStyle = "bold"; }
        }
      },
      margin: { left: 14, right: 14 },
    });



    // ===== Rodapé com paginação =====
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setDrawColor(226, 232, 240);
      doc.line(14, pageH - 14, pageW - 14, pageH - 14);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(148, 163, 184);
      doc.text("Gestão Familiar • Relatório Financeiro", 14, pageH - 8);
      const pg = `Página ${i} de ${pages}`;
      doc.text(pg, pageW - 14 - doc.getTextWidth(pg), pageH - 8);
    }

    doc.save(`${fileName}.pdf`);
    toast.success("Relatório baixado com sucesso");
  };


  const peopleOptions = useMemo(() => {
    // Filtramos apenas as pessoas cadastradas. 
    // Lorran e Tayane já devem estar no cadastro para aparecerem aqui.
    // "Familia" é uma constante especial que tratamos separadamente no relatório se necessário.
    const names = new Set(people.map((p: any) => p.name));
    return Array.from(names).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [people]);

  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden" style={{ boxShadow: "var(--shadow-elegant)" }}>
      <button onClick={() => setOpen(!open)} className="w-full px-4 py-3 border-b border-border bg-muted/30 text-sm font-semibold flex items-center gap-2 hover:bg-muted/50">
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        Relatórios por Pessoa
      </button>
      {open && (
        <div className="p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
            <div className="space-y-1.5">
              <Label>Pessoa</Label>
              <Select value={selectedPerson} onValueChange={setSelectedPerson}>
                <SelectTrigger><SelectValue placeholder="Selecione..." /></SelectTrigger>
                <SelectContent>
                  {peopleOptions.map(name => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Modo</Label>
              <Select value={reportMode} onValueChange={(v: any) => setReportMode(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="month">Mensal</SelectItem>
                  <SelectItem value="all">Todos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {reportMode === "month" && (
              <>
                <div className="space-y-1.5">
                  <Label>Mês</Label>
                  <Select value={String(reportM)} onValueChange={v => setReportM(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 12 }, (_, mi) => <SelectItem key={mi} value={String(mi)}>{monthLabel(mi)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Ano</Label>
                  <Select value={String(reportY)} onValueChange={v => setReportY(Number(v))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {years.map(yr => <SelectItem key={yr} value={String(yr)}>{yr}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </>
            )}
          </div>
          <div className="space-y-1.5">
            <Label>Mensagem</Label>
            <Input 
              value={pixNote} 
              onChange={(e) => setPixNote(e.target.value)} 
              placeholder="Digite um aviso ou informação adicional..."
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => downloadReport()} className="w-full" disabled={!selectedPerson}>
              <FileDown className="w-4 h-4 mr-2" /> Baixar PDF
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function PersonForm({ onDone }: any) {
  const { data: people = [] } = usePeople();
  const initialColor = useMemo(() => {
    const used = new Set(people.map((p: any) => (p.color || "").toLowerCase()));
    return pickUniqueColor(used);
  }, [people]);
  const [form, setForm] = useState({ name: "", color: initialColor });
  const [saving, setSaving] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = personSchema.safeParse({ name: form.name, color: form.color });
    if (!parsed.success) { toast.error(firstZodError(parsed.error)); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      // Check for duplicate name (case-insensitive)
      const norm = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      const newNameNorm = norm(parsed.data.name);
      const isDuplicate = people.some((p: any) => norm(p.name) === newNameNorm);
      
      if (isDuplicate) {
        toast.error("Já existe uma pessoa com este nome.");
        return;
      }

      const { error } = await supabase.from("pessoas").insert({
        user_id: user!.id,
        name: parsed.data.name,
        color: parsed.data.color,
      });
      if (error) throw error;
      toast.success("Pessoa criada");
      onDone();
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5"><Label>Nome</Label><SmartInput value={form.name} onChange={(v) => setForm({ ...form, name: v })} required /></div>
      <div className="space-y-1.5"><Label>Cor (sorteada — pode ajustar)</Label><Input type="color" value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} /></div>
      
      <Button type="submit" disabled={saving} className="w-full">{saving ? "Salvando…" : "Criar pessoa"}</Button>
    </form>
  );
}

function PeopleSection() {
  const { data: tx = [] } = useTransactions();
  const { data: inst = [] } = useInstallments();
  const { data: cards = [] } = useCards();
  const { data: people = [] } = usePeople();
  const now = new Date();
  const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const [mode, setMode] = useState<"month" | "year" | "all">("month");
  const [m, setM] = useState<number | "all">(next.getMonth());
  const [y, setY] = useState<number | "all">(next.getFullYear());
  const [openTotals, setOpenTotals] = useLsBool("totals", true);
  const [openChart, setOpenChart] = useLsBool("chart", true);
  const years = Array.from({ length: 5 }, (_, i) => now.getFullYear() - 2 + i);

  const colorFor = (name: string) => {
    const p = people.find((p: any) => p.name === name);
    return p?.color || personColor(name);
  };

  const inPeriod = (s: string) => {
    const d = new Date(s + "T00:00:00");
    if (mode === "all") return true;
    if (mode === "year") return y === "all" || d.getFullYear() === y;
    return (y === "all" || d.getFullYear() === y) && (m === "all" || d.getMonth() === m);
  };

  const { peopleTotals, byCardPerson, peopleNames } = useMemo(() => {
    const tot: Record<string, { tx: number; card: number; restante: number }> = {};
    const ensure = (p: string) => (tot[p] = tot[p] ?? { tx: 0, card: 0, restante: 0 });

    // Adiciona valor (com split 50/50 quando é Família)
    const addTx = (rawPerson: string, amount: number, paid: boolean) => {
      const p = rawPerson.trim();
      if (!p) return;
      ensure(p).tx += amount;
      if (!paid) ensure(p).restante += amount;
      if (isFamilia(p)) {
        ensure("Lorran").tx += amount / 2;
        ensure("Tayane").tx += amount / 2;
        if (!paid) {
          ensure("Lorran").restante += amount / 2;
          ensure("Tayane").restante += amount / 2;
        }
      }
    };
    const addCard = (rawPerson: string, amount: number, paid: boolean) => {
      const p = rawPerson.trim();
      if (!p) return;
      ensure(p).card += amount;
      if (!paid) ensure(p).restante += amount;
      if (isFamilia(p)) {
        ensure("Lorran").card += amount / 2;
        ensure("Tayane").card += amount / 2;
        if (!paid) {
          ensure("Lorran").restante += amount / 2;
          ensure("Tayane").restante += amount / 2;
        }
      }
    };

    tx.forEach((t: any) => {
      if (t.kind !== "expense") return;
      if (!inPeriod(t.due_at)) return;
      // Não contar lançamentos que são pagamentos de cartão, pois o custo já está sendo contato nos card_installments
      if (t.card_installment_id) return;
      addTx(t.person || "", Number(t.amount), t.status === "paid");
    });
    inst.forEach((i: any) => {
      if (!inPeriod(i.due_at)) return;
      addCard(i.cartao_compras?.person || "", Number(i.amount), i.status === "paid");
    });

    // por cartão x pessoa (SEM split — cada compra é da pessoa cadastrada)
    const cardMap: Record<string, Record<string, number>> = {};
    inst.forEach((i: any) => {
      if (!inPeriod(i.due_at)) return;
      const cardName = i.cartoes?.name ?? "—";
      const p = (i.cartao_compras?.person || "").trim();
      if (!p) return;
      const v = Number(i.amount);
      cardMap[cardName] = cardMap[cardName] ?? {};
      cardMap[cardName][p] = (cardMap[cardName][p] ?? 0) + v;
    });
    const allPeople = new Set<string>();
    Object.values(cardMap).forEach((row) => Object.keys(row).forEach((p) => allPeople.add(p)));
    Object.keys(tot).forEach((p) => allPeople.add(p));

    const byCard = Object.entries(cardMap).map(([cardName, row]) => ({ cardName, ...row }));
    return { peopleTotals: tot, byCardPerson: byCard, peopleNames: Array.from(allPeople) };
  }, [tx, inst, mode, m, y]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h2 className="text-xl font-semibold">Gastos de Pessoas</h2>
        <div className="flex flex-wrap gap-2">
          {(() => {
            const activeCls = "border-primary bg-primary/10 ring-1 ring-primary/40 font-medium";
            const inactiveCls = "border-border";
            const baseSel = "bg-card border rounded-lg px-3 py-1.5 text-sm transition-colors appearance-none focus:outline-none focus:ring-1 focus:ring-primary/40 [&>option]:bg-card [&>option]:text-foreground text-foreground";
            const nowD = new Date();
            const nextD = new Date(nowD.getFullYear(), nowD.getMonth() + 1, 1);
            return (
              <>
                <select value={mode} onChange={(e) => setMode(e.target.value as any)} className={`${baseSel} ${mode !== "all" ? activeCls : inactiveCls}`}>
                  <option value="month">Mês</option>
                  <option value="year">Ano</option>
                  <option value="all">Todos</option>
                </select>
                {mode === "month" && (
                  <select value={String(m)} onChange={(e) => setM(e.target.value === "all" ? "all" : Number(e.target.value))} className={`${baseSel} ${m !== "all" ? activeCls : inactiveCls}`}>
                    <option value="all">Todos os meses</option>
                    {Array.from({ length: 12 }, (_, mi) => <option key={mi} value={String(mi)}>{monthLabel(mi)}</option>)}
                  </select>
                )}
                {mode !== "all" && (
                  <select value={String(y)} onChange={(e) => setY(e.target.value === "all" ? "all" : Number(e.target.value))} className={`${baseSel} ${y !== "all" ? activeCls : inactiveCls}`}>
                    <option value="all">Todos os anos</option>
                    {years.map((yr) => <option key={yr} value={String(yr)}>{yr}</option>)}
                  </select>
                )}
              </>
            );
          })()}
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden" style={{ boxShadow: "var(--shadow-elegant)" }}>
        <button onClick={() => setOpenTotals(!openTotals)} className="w-full px-4 py-3 border-b border-border bg-muted/30 text-sm font-semibold flex items-center gap-2 hover:bg-muted/50">
          {openTotals ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          Totais por pessoa ({Object.keys(peopleTotals).length})
        </button>
        {openTotals && (Object.keys(peopleTotals).length === 0 ? (
          <div className="p-6 text-center text-sm text-muted-foreground">Nenhum lançamento no período</div>
        ) : (
          <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[520px]">
            <thead className="bg-muted/30 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="text-left p-3">Pessoa</th>
                <th className="text-right p-3">Lançamentos</th>
                <th className="text-right p-3">Cartão</th>
                <th className="text-right p-3">Restante</th>
                <th className="text-right p-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(peopleTotals).sort((a, b) => (b[1].tx + b[1].card) - (a[1].tx + a[1].card)).map(([p, v]) => (
                <tr key={p} className="border-t border-border">
                  <td className="p-3 flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: colorFor(p) }} />
                    {p}
                  </td>
                  <td className="p-3 text-right">{brl(v.tx)}</td>
                  <td className="p-3 text-right">{brl(v.card)}</td>
                  <td className={`p-3 text-right font-medium ${v.restante === 0 ? "text-success" : "text-destructive"}`}>{brl(v.restante)}</td>
                  <td className="p-3 text-right font-semibold">{brl(v.tx + v.card)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card overflow-hidden" style={{ boxShadow: "var(--shadow-elegant)" }}>
        <button onClick={() => setOpenChart(!openChart)} className="w-full px-4 py-3 border-b border-border bg-muted/30 text-sm font-semibold flex items-center gap-2 hover:bg-muted/50">
          {openChart ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          Uso de cada cartão por pessoa
        </button>
        {openChart && (
          <div className="p-2">
            {byCardPerson.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-12">Sem compras no cartão neste período</div>
            ) : (
              <ul className="divide-y divide-border">
                {byCardPerson
                  .map((row: any) => {
                    const { cardName, ...rest } = row;
                    const entries = Object.entries(rest as Record<string, number>)
                      .filter(([, v]) => Number(v) > 0)
                      .sort((a, b) => Number(b[1]) - Number(a[1]));
                    const total = entries.reduce((s, [, v]) => s + Number(v), 0);
                    return { cardName, entries, total };
                  })
                  .sort((a, b) => b.total - a.total)
                  .map(({ cardName, entries, total }) => (
                    <li key={cardName} className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="font-semibold text-sm">{cardName}</div>
                        <div className="text-sm font-semibold">{brl(total)}</div>
                      </div>
                      <ul className="space-y-1.5">
                        {entries.map(([p, v]) => {
                          const pct = total > 0 ? (Number(v) / total) * 100 : 0;
                          return (
                            <li key={p} className="flex items-center gap-3 text-sm">
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colorFor(p) }} />
                              <span className="w-24 truncate text-foreground">{p}</span>
                              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: colorFor(p) }} />
                              </div>
                              <span className="w-12 text-right text-xs text-muted-foreground">{pct.toFixed(0)}%</span>
                              <span className="w-24 text-right font-medium tabular-nums">{brl(Number(v))}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </li>
                  ))}
              </ul>
            )}
            {cards.length === 0 && <p className="text-xs text-muted-foreground mt-2 px-3">Cadastre cartões na aba Cartões.</p>}
          </div>
        )}
      </div>
    </div>
  );
}

function CatList({ title, items, onChange }: any) {
  const [open, setOpen] = useLsBool(`cat:${title}`, true);
  return (
    <div className="rounded-xl border border-border bg-card overflow-hidden" style={{ boxShadow: "var(--shadow-elegant)" }}>
      <button onClick={() => setOpen(!open)} className="w-full px-4 py-3 border-b border-border bg-muted/30 text-sm font-semibold flex items-center gap-2 hover:bg-muted/50">
        {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        {title} ({items.length})
      </button>
      {open && (items.length === 0 ? (
        <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma categoria</div>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((c: any) => <CatRow key={c.id} cat={c} onChange={onChange} />)}
        </ul>
      ))}
    </div>
  );
}

function CatRow({ cat, onChange }: any) {
  const [edit, setEdit] = useState(false);
  const [form, setForm] = useState({
    name: cat.name,
    icon: cat.icon ?? "",
    essential: cat.essential,
    budget: cat.budget?.toString() ?? "",
  });

  const save = async () => {
    const { error } = await supabase.from("categorias").update({
      name: form.name.trim(),
      icon: form.icon || null,
      essential: form.essential,
      budget: form.budget ? Number(form.budget) : null,
    }).eq("id", cat.id);
    if (error) toast.error(error.message);
    else { toast.success("Atualizado"); setEdit(false); onChange(); }
  };

  const remove = async () => {
    if (!confirm(`Excluir "${cat.name}"? Lançamentos vinculados ficarão sem categoria.`)) return;
    const { error } = await supabase.from("categorias").delete().eq("id", cat.id);
    if (error) toast.error(error.message);
    else { toast.success("Removido"); onChange(); }
  };

  if (edit) {
    return (
      <li className="p-3 space-y-2 bg-muted/20">
        <div className="flex gap-2">
          <Input className="w-16" placeholder="📦" value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })} />
          <SmartInput value={form.name} onChange={(v) => setForm({ ...form, name: v })} placeholder="Nome" />
        </div>
        <div className="flex gap-2 items-center">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={form.essential} onChange={e => setForm({ ...form, essential: e.target.checked })} />
            <span className="font-normal">Marcar como Essencial</span>
          </label>
        </div>
        <div className="flex gap-2 justify-end">
          <Button size="sm" variant="ghost" onClick={() => setEdit(false)}><X className="w-4 h-4" /></Button>
          <Button size="sm" onClick={save}><Check className="w-4 h-4 mr-1" /> Salvar</Button>
        </div>
      </li>
    );
  }

  return (
    <li className="p-3 flex items-center gap-3 hover:bg-muted/20">
      <span className="text-xl w-6 text-center">{cat.icon ?? "•"}</span>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{cat.name}</div>
        <div className="text-xs text-muted-foreground">
          {cat.essential && <span className="mr-2">Essencial</span>}
          {cat.budget && <span>Meta: {brl(cat.budget)}</span>}
          {!cat.essential && !cat.budget && "—"}
        </div>
      </div>
      <button onClick={() => setEdit(true)} className="w-7 h-7 rounded-md flex items-center justify-center bg-muted text-muted-foreground hover:bg-primary/20 hover:text-primary"><Pencil className="w-3.5 h-3.5" /></button>
      <button onClick={remove} className="w-7 h-7 rounded-md flex items-center justify-center bg-muted text-muted-foreground hover:bg-destructive/20 hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
    </li>
  );
}

function CategoryForm({ onDone }: any) {
  const [form, setForm] = useState({ name: "", kind: "expense", icon: "", essential: false, budget: "" });
  const [saving, setSaving] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = categorySchema.safeParse(form);
    if (!parsed.success) { toast.error(firstZodError(parsed.error)); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { data: existingCats = [] } = await supabase.from("categorias").select("name, kind");
      const norm = (s: string) => (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      const newNameNorm = norm(parsed.data.name);
      const isDuplicate = existingCats?.some((c: any) => c.kind === parsed.data.kind && norm(c.name) === newNameNorm);
      
      if (isDuplicate) {
        toast.error(`Já existe uma categoria de ${parsed.data.kind === 'income' ? 'receita' : 'despesa'} com este nome.`);
        return;
      }

      const { error } = await supabase.from("categorias").insert({
        user_id: user!.id,
        name: parsed.data.name,
        kind: parsed.data.kind,
        icon: parsed.data.icon || null,
        essential: parsed.data.essential,
        budget: typeof parsed.data.budget === "number" ? parsed.data.budget : null,
      });
      if (error) throw error;
      toast.success("Categoria criada");
      onDone();
    } catch (err: any) { toast.error(err.message); } finally { setSaving(false); }
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5"><Label>Tipo</Label>
          <Select value={form.kind} onValueChange={v => setForm({ ...form, kind: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="expense">Despesa</SelectItem>
              <SelectItem value="income">Receita</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5"><Label>Ícone (emoji)</Label>
          <Input value={form.icon} onChange={e => setForm({ ...form, icon: e.target.value })} placeholder="🛒" />
        </div>
      </div>
      <div className="space-y-1.5"><Label>Nome</Label>
        <SmartInput value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
      </div>
      <div className="flex items-center gap-2 text-sm pt-1">
        <input type="checkbox" id="is_essential" checked={form.essential} onChange={e => setForm({ ...form, essential: e.target.checked })} />
        <Label htmlFor="is_essential" className="cursor-pointer font-normal">Marcar como Essencial</Label>
      </div>
      <Button type="submit" disabled={saving} className="w-full">{saving ? "Salvando…" : "Criar categoria"}</Button>
    </form>
  );
}
