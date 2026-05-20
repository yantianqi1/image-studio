const CURRENCY_LOCALE = "zh-CN";

export function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat(CURRENCY_LOCALE, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatDateTime(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(CURRENCY_LOCALE, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}
