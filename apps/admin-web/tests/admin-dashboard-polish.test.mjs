import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const overviewSource = readFileSync(
  new URL("../src/features/overview/admin-overview-page.tsx", import.meta.url),
  "utf8",
);
const navigationSource = readFileSync(
  new URL("../src/features/shell/admin-navigation.tsx", import.meta.url),
  "utf8",
);
const nextConfigSource = readFileSync(
  new URL("../next.config.ts", import.meta.url),
  "utf8",
);
const removedAdminFiles = [
  "../src/features/billing/billing-page.tsx",
  "../src/features/redeem/redeem-page.tsx",
  "../src/features/users/user-ledger-list.tsx",
  "../src/features/users/user-credit-adjustment-form.tsx",
  "../src/features/users/user-wallet-panel.tsx",
];

test("admin overview is an operational dashboard instead of a static entry list", () => {
  assert.match(overviewSource, /useAdminUsers/);
  assert.match(overviewSource, /useWorkerSummary/);
  assert.match(overviewSource, /useAdminStats/);
  assert.match(overviewSource, /useAdminJobs/);
  assert.match(overviewSource, /useAdminComicTasks/);
  assert.match(overviewSource, /ADMIN_NAV_GROUPS/);
  assert.doesNotMatch(overviewSource, /useRedeemBatches|user\.wallet\.adjust/);
  assert.doesNotMatch(overviewSource, /\/admin\/billing|\/admin\/redeem/);
  assert.doesNotMatch(overviewSource, /OverviewGroup/);
  assert.doesNotMatch(overviewSource, /任务队列/);
  assert.doesNotMatch(overviewSource, /排队 \/ 运行中/);
  assert.doesNotMatch(overviewSource, /用户、队列/);
});

test("admin billing and redeem surfaces are removed", () => {
  assert.doesNotMatch(navigationSource, /\/admin\/billing|\/admin\/redeem|钱包与账本|激活码/);
  assert.doesNotMatch(nextConfigSource, /\/billing|\/redeem/);
  for (const file of removedAdminFiles) {
    assert.equal(existsSync(new URL(file, import.meta.url)), false, `${file} should be removed`);
  }
});
