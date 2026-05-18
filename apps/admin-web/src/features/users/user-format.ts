import { adminErrorMessage } from "@/features/ui/admin-errors";

const DATE_TIME_FORMAT = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatDateTime(value: string) {
  return DATE_TIME_FORMAT.format(new Date(value));
}

export function formatCents(value: number) {
  return `${value} cents`;
}

export function formatCredits(value: number) {
  return `${value} 额度`;
}

export function errorMessage(error: unknown, fallback: string) {
  return adminErrorMessage(error, fallback);
}
