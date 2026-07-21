type CatLite = { id: string; name: string; kind?: string | null };

const RULES: Array<{ pattern: RegExp; category: string; reason: string }> = [
  { pattern: /uber|99\s*pop|99app|cabify|in[- ]?driver|t[áa]xi/i, category: "Transporte", reason: "Uber/99 → Transporte" },
  { pattern: /ifood|rappi|james|aiqfome|zé\s*delivery|ze\s*delivery/i, category: "Restaurante", reason: "Delivery → Restaurante" },
  { pattern: /kabum|pichau|terabyte|amazon|magalu|magazine\s*luiza|americanas|shopee|aliexpress|mercado\s*livre/i, category: "Outros", reason: "E-commerce/Tecnologia" },
  { pattern: /netflix|spotify|disney|hbo|prime\s*video|youtube\s*premium|deezer|globoplay|paramount|apple\s*tv/i, category: "Assinaturas", reason: "Streaming → Assinaturas" },
  { pattern: /mercado|carrefour|extra|p[aã]o\s*de\s*a[çc][uú]car|atacad[aã]o|assa[íi]|sams\s*club|hortifruti|pague\s*menos/i, category: "Mercado", reason: "Mercado" },
  { pattern: /posto|shell|ipiranga|petrobras|combust[íi]vel|gasolina|alcool|etanol/i, category: "Transporte", reason: "Combustível → Transporte" },
  { pattern: /farm[áa]cia|drogaria|drogasil|raia|pacheco|panvel/i, category: "Saúde", reason: "Farmácia → Saúde" },
  { pattern: /escola|faculdade|curso|udemy|alura|coursera|hotmart|kindle/i, category: "Educação", reason: "Educação" },
  { pattern: /aluguel|condom[íi]nio|luz|enel|cemig|copel|[áa]gua|sabesp|sanepar|g[áa]s/i, category: "Moradia", reason: "Moradia" },
  { pattern: /cinema|ingresso|show|teatro|park|bar\s|pub\s|cervej/i, category: "Lazer", reason: "Lazer" },
  { pattern: /sal[áa]rio|holerite|pagamento.*empresa|cred.*sal/i, category: "Salário", reason: "Salário" },
];

const norm = (s: string) =>
  (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export interface Suggestion {
  category_id: string | null;
  category_name: string | null;
  confidence: number;
  reason: string | null;
  is_recurring: boolean;
  kind: "income" | "expense";
}

export function suggest(
  description: string,
  amount: number,
  categories: CatLite[],
  history: Array<{ description: string; amount: number | string; is_recurring?: boolean }>,
): Suggestion {
  const desc = description || "";
  let kind: "income" | "expense" = amount < 0 ? "expense" : "expense";
  let category_id: string | null = null;
  let category_name: string | null = null;
  let confidence = 0;
  let reason: string | null = null;

  for (const r of RULES) {
    if (r.pattern.test(desc)) {
      const cat = categories.find((c) => norm(c.name) === norm(r.category));
      if (cat) {
        category_id = cat.id;
        category_name = cat.name;
        confidence = 0.85;
        reason = r.reason;
        if (cat.kind === "income") kind = "income";
        break;
      }
    }
  }

  const target = norm(desc).slice(0, 12);
  const matches = target.length >= 4
    ? history.filter((h) => norm(h.description).slice(0, 12) === target && Math.abs(Number(h.amount) - Math.abs(amount)) <= Math.abs(amount) * 0.15)
    : [];
  const is_recurring = matches.length >= 2;
  if (is_recurring) {
    confidence = Math.max(confidence, 0.7);
    reason = reason ? `${reason} • padrão recorrente detectado` : "Padrão recorrente detectado";
  }

  return { category_id, category_name, confidence, reason, is_recurring, kind };
}
