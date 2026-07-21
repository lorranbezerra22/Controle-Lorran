export const PEOPLE = ["Lorran", "Tayane", "Familia"] as const;
export type Person = (typeof PEOPLE)[number];

const norm = (s: string) =>
  (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export const isFamilia = (name?: string | null) => norm(name || "") === "familia";

export function personSplit(items: Array<{ amount: number | string; person?: string | null }>) {
  const t: Record<string, number> = { Lorran: 0, Tayane: 0, Familia: 0, "Sem pessoa": 0 };
  for (const i of items) {
    const a = Number(i.amount) || 0;
    const p = (i.person || "").trim();
    if (isFamilia(p)) {
      t.Familia += a;
      t.Lorran += a / 2;
      t.Tayane += a / 2;
    } else if (norm(p) === "lorran") t.Lorran += a;
    else if (norm(p) === "tayane") t.Tayane += a;
    else t["Sem pessoa"] += a;
  }
  return t;
}

export function personSplitAll(
  items: Array<{ amount: number | string; person?: string | null }>,
): Record<string, number> {
  const t: Record<string, number> = {};
  const add = (name: string, v: number) => { t[name] = (t[name] ?? 0) + v; };
  for (const i of items) {
    const a = Number(i.amount) || 0;
    const p = (i.person || "").trim();
    if (!p) continue;
    if (isFamilia(p)) {
      add(p, a);
      add("Lorran", a / 2);
      add("Tayane", a / 2);
    } else add(p, a);
  }
  return t;
}

export function personColor(name: string | null | undefined): string {
  const safeName = name ?? "";
  const palette = [
    "oklch(0.65 0.2 250)",
    "oklch(0.7 0.18 340)",
    "oklch(0.7 0.15 50)",
    "oklch(0.72 0.18 155)",
    "oklch(0.7 0.2 295)",
    "oklch(0.75 0.15 200)",
    "oklch(0.7 0.2 25)",
    "oklch(0.78 0.15 100)",
  ];
  const n = norm(safeName);
  if (n === "lorran") return palette[0];
  if (n === "tayane") return palette[1];
  if (n === "familia") return palette[2];
  let h = 0;
  for (let i = 0; i < safeName.length; i++) h = (h * 31 + safeName.charCodeAt(i)) >>> 0;
  return palette[3 + (h % (palette.length - 3))];
}
