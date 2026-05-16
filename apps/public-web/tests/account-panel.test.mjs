import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appShellSource = readFileSync(
  new URL("../src/features/shell/app-shell.tsx", import.meta.url),
  "utf8",
);

const appNavigationSource = readFileSync(
  new URL("../src/features/shell/app-navigation.ts", import.meta.url),
  "utf8",
);

const loginPanelSource = readFileSync(
  new URL("../src/features/auth/login-panel.tsx", import.meta.url),
  "utf8",
);

const walletDashboardSource = readFileSync(
  new URL("../src/features/wallet/wallet-dashboard.tsx", import.meta.url),
  "utf8",
);

const welcomeDialogSource = readFileSync(
  new URL("../src/features/shell/welcome-account-dialog.tsx", import.meta.url),
  "utf8",
);

test("account entry opens the user wallet panel", () => {
  assert.match(appShellSource, /href="\/wallet"/);
  assert.match(appNavigationSource, /\{ href: "\/wallet", label: "我的" \}/);
  assert.match(appShellSource, /WelcomeAccountDialog/);
  assert.match(welcomeDialogSource, /匿名使用/);
  assert.match(welcomeDialogSource, /\/login\?mode=register/);
});

test("login page supports both login and registration", () => {
  assert.match(loginPanelSource, /authMode/);
  assert.match(loginPanelSource, /publicApi\.register/);
  assert.match(loginPanelSource, /注册账户/);
});

test("wallet panel shows the current user and balance", () => {
  assert.match(walletDashboardSource, /publicApi\.getCurrentUser/);
  assert.match(walletDashboardSource, /账户概览/);
  assert.match(walletDashboardSource, /额度余额/);
  assert.match(walletDashboardSource, /注册账户/);
  assert.match(walletDashboardSource, /amount_credits/);
  assert.match(walletDashboardSource, /TaskHistorySection/);
});

test("wallet panel includes task charge records", () => {
  const taskHistorySource = readFileSync(
    new URL("../src/features/wallet/wallet-task-history.tsx", import.meta.url),
    "utf8",
  );

  assert.match(taskHistorySource, /任务记录/);
  assert.match(taskHistorySource, /publicApi\.getTasks/);
  assert.match(taskHistorySource, /charge_credits/);
});
