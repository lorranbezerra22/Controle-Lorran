export const brl = (n: number | null | undefined) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(n ?? 0));

export const fmtDate = (d: string | Date | null | undefined) => {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d + (d.length === 10 ? "T00:00:00" : "")) : d;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
};

export const monthLabel = (m: number) =>
  ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][m];
