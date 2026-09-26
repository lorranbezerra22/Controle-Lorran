export type RecurringAlertTemplate = {
  id: string;
  description: string;
  purchaseDay: number;
  active: boolean;
  confirmedMonths?: string[];
};

export type RecurringAlert = {
  template: RecurringAlertTemplate;
  occurrenceDate: string;
  month: string;
  daysUntil: number;
};

const STORAGE_KEY = "cartoes:recorrentes";

const localISO = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const monthISO = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const clampDay = (year: number, month: number, day: number) =>
  Math.min(Math.max(day, 1), new Date(year, month + 1, 0).getDate());

export function readRecurringTemplates(): RecurringAlertTemplate[] {
  if (typeof window === "undefined") return [];

  try {
    return JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}

export function getRecurringAlerts(
  templates: RecurringAlertTemplate[] = readRecurringTemplates(),
  now = new Date(),
  daysBefore = 5,
): RecurringAlert[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const alerts: RecurringAlert[] = [];

  for (const template of templates) {
    if (!template.active || !template.purchaseDay) continue;

    let occurrence = new Date(
      today.getFullYear(),
      today.getMonth(),
      clampDay(today.getFullYear(), today.getMonth(), Number(template.purchaseDay)),
    );

    if (occurrence < today) {
      occurrence = new Date(
        today.getFullYear(),
        today.getMonth() + 1,
        clampDay(today.getFullYear(), today.getMonth() + 1, Number(template.purchaseDay)),
      );
    }

    const daysUntil = Math.round(
      (occurrence.getTime() - today.getTime()) / 86400000,
    );
    const month = monthISO(occurrence);

    if (daysUntil < 0 || daysUntil > daysBefore) continue;
    if (template.confirmedMonths?.includes(month)) continue;

    alerts.push({
      template,
      occurrenceDate: localISO(occurrence),
      month,
      daysUntil,
    });
  }

  return alerts.sort(
    (a, b) =>
      a.daysUntil - b.daysUntil ||
      a.template.description.localeCompare(b.template.description, "pt-BR"),
  );
}