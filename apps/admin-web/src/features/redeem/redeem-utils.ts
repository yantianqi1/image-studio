import type { AdminRedeemBatchCode } from "@/lib/admin-api";
import { adminErrorMessage } from "@/features/ui/admin-errors";

export const SITE_CREDIT_CENTS = 10;

const DATE_TIME_DISPLAY = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatDateTime(value: string) {
  return DATE_TIME_DISPLAY.format(new Date(value));
}

export function formatNullableDate(value: string | null) {
  return value ? formatDateTime(value) : "无";
}

export function errorText(error: unknown, fallback: string) {
  return adminErrorMessage(error, fallback);
}

export function normalizeOptionalString(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

export function creditsToCents(value: FormDataEntryValue | null) {
  return Math.round(Number(value ?? "0") * SITE_CREDIT_CENTS);
}

export function getCodeEffectiveStatus(code: AdminRedeemBatchCode) {
  if (code.status === "unused" && code.expires_at && new Date(code.expires_at) <= new Date()) {
    return "expired";
  }
  return code.status;
}

export async function copyCodeLines(codes: readonly string[]) {
  await navigator.clipboard.writeText(codes.join("\n"));
}

export function downloadCodesCsv(filename: string, codes: readonly AdminRedeemBatchCode[]) {
  const csv = buildCodesCsv(codes);
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function buildCodesCsv(codes: readonly AdminRedeemBatchCode[]) {
  const header = ["id", "code", "status", "effective_status", "credit_amount_cents", "redeemed_by_user_id", "redeemed_at", "expires_at", "created_at"];
  const rows = codes.map((code) => [
    code.id,
    code.code,
    code.status,
    getCodeEffectiveStatus(code),
    code.credit_amount_cents,
    code.redeemed_by_user_id ?? "",
    code.redeemed_at ?? "",
    code.expires_at ?? "",
    code.created_at,
  ]);
  return [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
}

function csvCell(value: string | number) {
  const text = String(value);
  return `"${text.replaceAll("\"", "\"\"")}"`;
}
