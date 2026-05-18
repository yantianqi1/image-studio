import { apiFetch } from "@/lib/api-client";
import type {
  AdminRedeemBatch,
  AdminRedeemBatchCode,
  AdminRedeemBatchDetail,
  AdminRedeemBatchSummary,
  AdminRedeemCode,
  CreateRedeemBatchInput,
  DisableRedeemBatchInput,
  DisableRedeemCodeInput,
} from "@/lib/admin-redeem";

export const adminRedeemApi = {
  createRedeemBatch(input: CreateRedeemBatchInput) {
    return apiFetch<AdminRedeemBatch>("/api/admin/redeem/batches", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  redeemBatches() {
    return apiFetch<readonly AdminRedeemBatchSummary[]>("/api/admin/redeem/batches");
  },
  redeemBatch(batchId: number) {
    return apiFetch<AdminRedeemBatchDetail>(`/api/admin/redeem/batches/${batchId}`);
  },
  redeemBatchCodes(batchId: number) {
    return apiFetch<readonly AdminRedeemBatchCode[]>(`/api/admin/redeem/batches/${batchId}/codes`);
  },
  redeemCodes() {
    return apiFetch<readonly AdminRedeemCode[]>("/api/admin/redeem/codes");
  },
  disableRedeemBatch(batchId: number, input: DisableRedeemBatchInput) {
    return apiFetch<AdminRedeemBatchDetail>(`/api/admin/redeem/batches/${batchId}/disable`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  disableRedeemCode(codeId: number, input: DisableRedeemCodeInput) {
    return apiFetch<AdminRedeemBatchCode>(`/api/admin/redeem/codes/${codeId}/disable`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
};
