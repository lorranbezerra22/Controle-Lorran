// Catálogo central de marcas: logo, cor e domínio usados em todas as telas.
export type BankInfo = {
  id: string;
  name: string;
  color: string;
  emoji: string;
  domain?: string;
  logoUrl?: string;
  logo?: "nubank" | "itau" | "santander" | "bradesco" | "bb" | "caixa" | "inter" | "c6" | "xp" | "btg" | "neon" | "picpay" | "revolut" | "mercadopago" | "smiles";
  iconBg?: "brand" | "white";
};

export const BANKS: BankInfo[] = [
  { id: "nubank", name: "Nubank", color: "#8A05BE", emoji: "💜", domain: "nubank.com.br", logo: "nubank", iconBg: "brand" },
  { id: "itau", name: "Itaú", color: "#EC7000", emoji: "🟧", domain: "itau.com.br", logo: "itau", iconBg: "brand" },
  { id: "santander", name: "Santander", color: "#EC0000", emoji: "🔴", domain: "santander.com.br", logo: "santander", iconBg: "brand" },
  { id: "bradesco", name: "Bradesco", color: "#CC092F", emoji: "🅱️", domain: "bradesco.com.br", logo: "bradesco", iconBg: "white" },
  { id: "bb", name: "Banco do Brasil", color: "#FAE100", emoji: "🟡", domain: "bb.com.br", logo: "bb", iconBg: "brand" },
  { id: "caixa", name: "Caixa", color: "#005CA9", emoji: "🔵", domain: "caixa.gov.br", logo: "caixa", iconBg: "brand" },
  { id: "inter", name: "Inter", color: "#FF7A00", emoji: "🟠", domain: "bancointer.com.br", logo: "inter", iconBg: "brand" },
  { id: "c6", name: "C6 Bank", color: "#222222", emoji: "⚫", domain: "c6bank.com.br", logo: "c6", iconBg: "brand" },
  { id: "xp", name: "XP", color: "#000000", emoji: "✖️", domain: "xpi.com.br", logo: "xp", iconBg: "brand" },
  { id: "btg", name: "BTG Pactual", color: "#1A2A4F", emoji: "🔷", domain: "btgpactual.com", logo: "btg", iconBg: "brand" },
  { id: "neon", name: "Neon", color: "#00E0FF", emoji: "💎", domain: "neon.com.br", logo: "neon", iconBg: "brand" },
  { id: "picpay", name: "PicPay", color: "#11C76F", emoji: "💚", domain: "picpay.com", logo: "picpay", iconBg: "brand" },
  { id: "revolut", name: "Revolut", color: "#0075EB", emoji: "🟦", domain: "revolut.com", logo: "revolut", iconBg: "brand" },
  { id: "mercadopago", name: "Mercado Pago", color: "#00B1EA", emoji: "💙", domain: "mercadopago.com.br", logo: "mercadopago", iconBg: "brand" },
  { id: "livelo", name: "Livelo", color: "#FF0099", emoji: "🌸", domain: "livelo.com.br", iconBg: "white" },
  { id: "smiles", name: "Smiles", color: "#FF6A13", emoji: "🟠", domain: "smiles.com.br", iconBg: "white" },
  { id: "latampass", name: "Latam Pass", color: "#1B0088", emoji: "✈️", domain: "latampass.latam.com", iconBg: "white" },
  { id: "latam", name: "Latam", color: "#1B0088", emoji: "✈️", domain: "latam.com", iconBg: "white" },
  { id: "tudoazul", name: "TudoAzul", color: "#00A1E0", emoji: "💠", domain: "tudoazul.voeazul.com.br", iconBg: "white" },
  { id: "azul", name: "Azul Fidelidade", color: "#00A1E0", emoji: "💠", domain: "voeazul.com.br", iconBg: "white" },
  { id: "esfera", name: "Esfera", color: "#EC0000", emoji: "🔴", domain: "esfera.com.vc", iconBg: "white" },
  { id: "iupp", name: "Iupp", color: "#FFCC00", emoji: "⭐", domain: "iupp.com.br", iconBg: "white" },
  { id: "multiplus", name: "Multiplus", color: "#F58220", emoji: "🟧", domain: "multiplus.com.br", iconBg: "white" },
  { id: "americanairlines", name: "American Airlines", color: "#0078D2", emoji: "🦅", domain: "aa.com", iconBg: "white" },
  { id: "aadvantage", name: "AAdvantage", color: "#0078D2", emoji: "🦅", domain: "aa.com", iconBg: "white" },
  { id: "iberia", name: "Iberia", color: "#D7192D", emoji: "✈️", domain: "iberia.com", iconBg: "white" },
  { id: "iberiaplus", name: "Iberia Plus", color: "#D7192D", emoji: "✈️", domain: "iberia.com", iconBg: "white" },
  { id: "outro", name: "Outro", color: "#6366f1", emoji: "💳", iconBg: "white" },
];

const norm = (s: string) =>
  (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export function findBank(name?: string | null): BankInfo {
  const n = norm(name || "");
  return BANKS.find((b) => {
    const bankName = norm(b.name);
    return bankName === n || b.id === n || n.includes(bankName) || n.includes(b.id);
  }) ?? BANKS[BANKS.length - 1];
}

export function bankLogoUrl(bank: BankInfo, size = 256): string | null {
  if (!bank.domain) return null;
  return `https://t3.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://${bank.domain}&size=${size}`;
}

export function brandColor(name: string | null | undefined, fallback: string): string {
  const b = findBank(name);
  return b.id === "outro" ? fallback : b.color;
}

export function syncedBrand(name: string | null | undefined, fallback = "#6366f1"): BankInfo {
  const bank = findBank(name);
  return bank.id === "outro" ? { ...bank, name: name?.trim() || bank.name, color: fallback } : bank;
}
