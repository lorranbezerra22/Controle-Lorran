import { z } from "zod";

export const personSchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório").max(60, "Nome muito longo (máx. 60 caracteres)"),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Cor inválida"),
});

export const categorySchema = z.object({
  name: z.string().trim().min(1, "Nome obrigatório").max(60, "Nome muito longo"),
  kind: z.enum(["expense", "income"], { message: "Tipo inválido" }),
  icon: z.string().trim().max(8, "Use apenas 1 emoji").optional().or(z.literal("")),
  essential: z.boolean(),
  budget: z.union([z.string().length(0), z.coerce.number().nonnegative("Orçamento inválido")]).optional(),
});

export const transactionSchema = z.object({
  description: z.string().trim().min(1, "Descrição obrigatória").max(200, "Descrição muito longa"),
  amount: z.coerce.number().positive("Valor deve ser maior que zero"),
  kind: z.enum(["expense", "income"]),
  due_at: z.string().min(1, "Data obrigatória"),
  person: z.string().trim().min(1, "Pessoa obrigatória").max(60),
  notes: z.string().max(500, "Anotação muito longa").optional().or(z.literal("")),
});

export const cardPurchaseSchema = z.object({
  description: z.string().trim().min(1, "Descrição obrigatória").max(200),
  total_amount: z.coerce.number().refine((v) => v !== 0, "Valor não pode ser zero"),
  installments_count: z.coerce.number().int().min(1).max(48, "Máx. 48 parcelas"),
  purchase_date: z.string().min(1, "Data obrigatória"),
  person: z.string().trim().min(1, "Pessoa obrigatória"),
});

export function firstZodError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Dados inválidos";
}
