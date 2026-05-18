import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const overviewSource = readFileSync(
  new URL("../src/features/overview/admin-overview-page.tsx", import.meta.url),
  "utf8",
);
const billingSource = readFileSync(
  new URL("../src/features/billing/billing-page.tsx", import.meta.url),
  "utf8",
);
const ledgerSource = readFileSync(
  new URL("../src/features/users/user-ledger-list.tsx", import.meta.url),
  "utf8",
);
const adjustmentSource = readFileSync(
  new URL("../src/features/users/user-credit-adjustment-form.tsx", import.meta.url),
  "utf8",
);
const redeemCreateSource = readFileSync(
  new URL("../src/features/redeem/redeem-create-batch-panel.tsx", import.meta.url),
  "utf8",
);

test("admin overview is an operational dashboard instead of a static entry list", () => {
  assert.match(overviewSource, /useAdminUsers/);
  assert.match(overviewSource, /useWorkerSummary/);
  assert.match(overviewSource, /useAdminStats/);
  assert.match(overviewSource, /useRedeemBatches/);
  assert.match(overviewSource, /useAdminAuditLogs/);
  assert.match(overviewSource, /useAdminJobs/);
  assert.match(overviewSource, /useAdminComicTasks/);
  assert.match(overviewSource, /ADMIN_NAV_GROUPS/);
  assert.doesNotMatch(overviewSource, /OverviewGroup/);
});

test("billing page uses credit units and explicit search failures", () => {
  assert.match(billingSource, /UserCreditAdjustmentForm/);
  assert.match(billingSource, /searchError/);
  assert.doesNotMatch(billingSource, /name="amount_cents"/);
  assert.doesNotMatch(billingSource, /\.catch\(\(\) => \{\}\)/);
});

test("user wallet surfaces credits and successful adjustments", () => {
  assert.match(ledgerSource, /formatCredits\(entry\.amount_credits\)/);
  assert.doesNotMatch(ledgerSource, /formatCents\(entry\.amount_cents\)/);
  assert.match(adjustmentSource, /toast\.success/);
});

test("redeem batch creation accepts credits and converts to cents", () => {
  assert.match(redeemCreateSource, /name="credit_amount_credits"/);
  assert.match(redeemCreateSource, /credit_amount_cents: creditsToCents/);
  assert.doesNotMatch(redeemCreateSource, /name="credit_amount_cents"/);
  assert.doesNotMatch(redeemCreateSource, /单码额度（分）/);
});
