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

export const RECURRING_ALERT_DAYS_BEFORE = 5;

const localISO = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const monthISO = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;

const clampDay = (year: number, month: number, day: number) =>
  Math.min(Math.max(day, 1), new Date(year, month + 1, 0).getDate());

export function getRecurringAlerts(
  templates: RecurringAlertTemplate[],
  now = new Date(),
  daysBefore = RECURRING_ALERT_DAYS_BEFORE,
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
    const invoiceMonth = monthISO(new Date(occurrence.getFullYear(), occurrence.getMonth() + 1, 1));
    if (template.confirmedMonths?.includes(invoiceMonth)) continue;

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