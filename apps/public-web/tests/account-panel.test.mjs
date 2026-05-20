import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const appShellSource = readSource("../src/features/shell/app-shell.tsx");
const appNavigationSource = readSource("../src/features/shell/app-navigation.ts");
const loginPageSource = readSource("../src/app/login/page.tsx");
const accountDashboardSource = readSource("../src/features/account/account-dashboard.tsx");
const accountShellSource = readSource("../src/features/account/account-shell.tsx");
const accountTopNavigationSource = readSource("../src/features/account/account-top-navigation.tsx");
const accountLoginSource = readSource("../src/features/account/account-login-page.tsx");
const personalCenterSource = readSource("../src/features/account/account-personal-center.tsx");
const publicApiSource = readSource("../src/lib/public-api.ts");

const unauthorizedForbiddenTerms = [
  "钱包余额",
  "可用额度",
  "任务记录",
  "最近任务",
  "消费明细",
  "账本",
  "账户 ID",
  "个人中心",
  "用户头像",
  "用户昵称",
  "个人信息",
  "安全中心",
  "设置",
];

const authenticatedRequiredTerms = [
  "个人中心",
  "账户状态",
  "今日次数",
  "最近任务",
  "账户 ID",
  "个人信息",
  "安全中心",
  "资产归属",
];

const deprecatedSecurityTerms = [
  "绑定手机",
  "双重认证",
  "登录设备管理",
];

test("account entry points to login route without wallet surface", () => {
  assert.match(appShellSource, /href="\/login"/);
  assert.doesNotMatch(appShellSource, /href="\/wallet"/);
  assert.match(appNavigationSource, /\{ href: "\/", label: "图库" \}/);
  assert.match(appNavigationSource, /\{ href: "\/generate", label: "创作台" \}/);
  assert.match(appNavigationSource, /\{ href: "\/comic", label: "漫画" \}/);
  assert.match(appNavigationSource, /\{ href: "\/apps", label: "应用" \}/);
});

test("login route reuses the isolated account page instead of the legacy shell", () => {
  assert.match(loginPageSource, /AccountDashboard/);
  assert.doesNotMatch(loginPageSource, /LoginPanel/);
});

test("account dashboard has explicit unauthenticated and authenticated render branches", () => {
  assert.match(accountDashboardSource, /userState\.status === "ready"/);
  assert.match(accountDashboardSource, /const session: AccountSession = \{ user: userState\.data \}/);
  assert.match(accountDashboardSource, /session: null/);
  assert.match(accountDashboardSource, /searchParams\.get\("mode"\) === "register"/);
  assert.match(accountDashboardSource, /renderLoginPage/);
  assert.match(accountDashboardSource, /renderPersonalCenterPage/);
  assert.match(accountShellSource, /renderTopNavigation/);
});

test("unauthenticated account branch renders only login and registration entry", () => {
  const guestActions = extractFunctionBody(accountTopNavigationSource, "renderGuestTopActions");

  assert.match(accountLoginSource, /欢迎来到 Image Studio/);
  assert.match(accountLoginSource, /AI 创作与账户管理的一站式平台/);
  assert.match(accountLoginSource, /密码登录/);
  assert.match(accountLoginSource, /验证码登录/);
  assert.match(accountLoginSource, /邮箱 \/ 手机号/);
  assert.match(accountLoginSource, /记住我/);
  assert.match(accountLoginSource, /忘记密码/);
  assert.match(accountLoginSource, /注册账户/);
  assert.match(guestActions, /帮助中心/);
  assert.match(guestActions, /注册/);
  assert.doesNotMatch(accountLoginSource, /其他登录方式|微信|QQ|支付宝|Apple/);

  for (const term of unauthorizedForbiddenTerms) {
    assert.doesNotMatch(accountLoginSource, new RegExp(term));
    assert.doesNotMatch(guestActions, new RegExp(term));
  }
});

test("account pages use mobile-first layout for login and account views", () => {
  assert.match(accountShellSource, /px-3 py-4 sm:px-8 sm:py-8/);
  assert.match(accountTopNavigationSource, /min-h-\[56px\].*sm:min-h-\[72px\]/);
  assert.match(accountTopNavigationSource, /hidden truncate sm:inline/);
  assert.match(accountLoginSource, /min-h-\[calc\(100dvh-88px\)\]/);
  assert.match(accountLoginSource, /relative hidden overflow-hidden/);
  assert.match(accountLoginSource, /mx-auto w-full max-w-md/);
  assert.match(accountLoginSource, /账户中心/);
  assert.match(personalCenterSource, /grid grid-cols-2 gap-2 rounded-2xl/);
});

test("authenticated account branch renders the personal center modules only after login", () => {
  const authenticatedActions = extractFunctionBody(accountTopNavigationSource, "renderAuthenticatedTopActions");

  for (const term of authenticatedRequiredTerms) {
    assert.match(personalCenterSource, new RegExp(term));
  }

  assert.match(authenticatedActions, /今日次数/);
  assert.match(authenticatedActions, /设置/);
  assert.match(authenticatedActions, /ChevronDown/);
  assert.match(authenticatedActions, /LogoutButton/);
  assert.match(accountTopNavigationSource, /退出登录/);
  assert.match(accountTopNavigationSource, /LogOut/);

  for (const term of deprecatedSecurityTerms) {
    assert.doesNotMatch(personalCenterSource, new RegExp(term));
  }
});

test("account panel keeps identity and task API client wiring", () => {
  assert.match(accountDashboardSource, /publicApi\.getCurrentUser/);
  assert.match(accountDashboardSource, /publicApi\.getTasks/);
  assert.match(accountDashboardSource, /publicApi\.getPublicQuotaStatus/);
  assert.match(accountDashboardSource, /publicApi\.login/);
  assert.match(accountDashboardSource, /publicApi\.register/);
  assert.match(accountDashboardSource, /publicApi\.logout/);
  assert.match(publicApiSource, /apiFetch<[^>]+>\("\/auth\/logout"/);
  assert.match(accountDashboardSource, /notifyComicOwnerChanged\(\)/);
  assert.doesNotMatch(accountDashboardSource, /getWalletSummary|getWalletLedger/);
  assert.doesNotMatch(publicApiSource, /billing\/wallets|redeem/);
});

test("account pages do not expose wallet ledger or charge amount fields", () => {
  assert.doesNotMatch(personalCenterSource, /amount_credits|balance_after_credits|charge_credits/);
  assert.doesNotMatch(accountLoginSource, /amount_credits|balance_after_credits|charge_credits/);
  assert.doesNotMatch(personalCenterSource, /钱包|余额|消费明细|兑换码/);
});

function readSource(relativePath) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function extractFunctionBody(source, functionName) {
  const declarationStart = source.indexOf(`function ${functionName}`);
  assert.notEqual(declarationStart, -1, `${functionName} declaration not found`);

  const parenStart = source.indexOf("(", declarationStart);
  const bodyStart = findFunctionBodyStart(source, parenStart);
  let depth = 0;

  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === "{") {
      depth += 1;
    }
    if (source[index] === "}") {
      depth -= 1;
      if (depth === 0) {
        return source.slice(bodyStart, index + 1);
      }
    }
  }

  assert.fail(`${functionName} body is not closed`);
}

function findFunctionBodyStart(source, parenStart) {
  assert.notEqual(parenStart, -1, "function parameters not found");
  let depth = 0;

  for (let index = parenStart; index < source.length; index += 1) {
    if (source[index] === "(") {
      depth += 1;
    }
    if (source[index] === ")") {
      depth -= 1;
      if (depth === 0) {
        const braceStart = source.indexOf("{", index);
        assert.notEqual(braceStart, -1, "function body not found");
        return braceStart;
      }
    }
  }

  assert.fail("function parameters are not closed");
}
