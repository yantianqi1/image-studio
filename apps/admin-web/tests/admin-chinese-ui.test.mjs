import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(path) {
  return readFileSync(new URL(`../src/${path}`, import.meta.url), "utf8");
}

function assertNotContains(file, forbidden) {
  const text = source(file);
  for (const item of forbidden) {
    assert.equal(
      text.includes(item),
      false,
      `${file} should not expose "${item}" as visible admin UI text`,
    );
  }
}

function assertContains(file, expected) {
  const text = source(file);
  for (const item of expected) {
    assert.equal(
      text.includes(item),
      true,
      `${file} should expose "${item}" in the admin UI text mapping`,
    );
  }
}

test("admin shell and login surfaces use Chinese labels", () => {
  assertNotContains("features/shell/admin-navigation.tsx", [
    'label: "Dashboard"',
    'label: "Users"',
    'label: "Models"',
    'label: "Jobs"',
    'label: "Content"',
    'label: "System"',
    'label: "Provider"',
    'label: "Facilities"',
    'token: "dashboard"',
  ]);
  assertNotContains("features/shell/admin-sidebar.tsx", ["CS Admin", "image Studio operations"]);
  assertNotContains("features/shell/admin-topbar.tsx", ['"Dashboard"', '"admin"']);
  assertNotContains("features/login/login-page.tsx", ["Admin Web", "提交后会请求 /api/admin/auth/login"]);
  assertNotContains("lib/site-metadata.ts", ['"Admin"']);
});

test("admin tables, filters, and status controls do not render raw English labels", () => {
  assertNotContains("features/audit/audit-page.tsx", [
    "<th>Action</th>",
    "<th>Target</th>",
    "<th>Reason</th>",
    "<th>Admin</th>",
    "<th>Metadata</th>",
    "<th>Created</th>",
    'placeholder="action"',
    'placeholder="target_type"',
    'placeholder="target_id"',
    'placeholder="admin_user_id"',
    "[redacted]",
  ]);
  assertNotContains("features/users/users-toolbar.tsx", [
    'label: "active"',
    'label: "disabled"',
    'label: "deleted"',
    'label: "suspended"',
  ]);
  assertNotContains("features/users/user-status-management-panel.tsx", [
    "恢复为 active",
    "恢复为 active？",
    "需要 reason",
  ]);
});

test("admin operational pages avoid English unit labels and raw backend terms", () => {
  assertNotContains("features/settings/settings-page.tsx", [
    "API 入口",
    "public_signup_disabled",
    "anonymous_image_disabled",
    "URL 池",
  ]);
  assertNotContains("features/facilities/llm-facilities-page.tsx", ["Provider 页"]);
});

test("admin jobs and provider controls localize visible raw enums", () => {
  assertNotContains("features/jobs/image-job-log-list.tsx", ["Asset #"]);
  assertNotContains("features/jobs/image-job-log-list.tsx", [
    '错误码 {job.error_code ?? "未知"}',
  ]);
  assertNotContains("features/jobs/comic-jobs-page.tsx", ["{task.task_type}"]);
  assertNotContains("features/overview/admin-overview-lists.tsx", [
    "job.error_message || job.error_code || job.prompt",
    "task.error_message || task.error_code ||",
    "{item.token}",
    "{task.task_type} · {task.stage}",
  ]);
  assertContains("features/jobs/image-job-format.ts", [
    'provider_api_key_missing: "上游密钥未配置"',
    '"authorization is invalid": "授权无效"',
  ]);
  assertContains("features/ui/admin-labels.ts", ['member: "会员生图"']);
});
