from __future__ import annotations

import tempfile
from pathlib import Path
from typing import Any
from uuid import uuid4

from playwright.sync_api import Page, expect, sync_playwright

from runtime import ADMIN_PASSWORD, ADMIN_PORT, ADMIN_USERNAME, PUBLIC_PORT, ServiceManager

UI_TIMEOUT_MS = 10_000
PUBLIC_USER_PASSWORD = "e2e-user-pass"
E2E_COMIC_SOURCE = "第一幕：角色进入工作室。"
E2E_REDEEM_CODE = "E2E-REDEEM-CODE"


def main() -> None:
    root = Path(__file__).resolve().parents[2]
    run_id = uuid4().hex[:8]
    with tempfile.TemporaryDirectory(prefix="commercial-studio-e2e-") as temp_dir:
        manager = ServiceManager(root, Path(temp_dir))
        try:
            manager.start_all()
            run_browser_suite(run_id)
        except Exception as exc:
            raise RuntimeError(f"E2E failed\n{manager.log_summary()}") from exc
        finally:
            manager.stop_all()


def run_browser_suite(run_id: str) -> None:
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        try:
            run_public_suite(browser, run_id)
            run_admin_suite(browser, run_id)
        finally:
            browser.close()


def run_public_suite(browser: Any, run_id: str) -> None:
    context = browser.new_context(base_url=f"http://127.0.0.1:{PUBLIC_PORT}")
    try:
        email = f"e2e-user-{run_id}@example.com"
        register_public_user(context.request, email)
        page = context.new_page()
        verify_public_login(page, email)
        verify_public_generation(page, run_id)
        verify_public_tasks(page, run_id)
        verify_public_wallet(page)
        verify_public_comic(page, context.request, run_id)
    finally:
        context.close()


def run_admin_suite(browser: Any, run_id: str) -> None:
    context = browser.new_context(base_url=f"http://127.0.0.1:{ADMIN_PORT}")
    try:
        page = context.new_page()
        email = f"e2e-user-{run_id}@example.com"
        verify_admin_login(page)
        verify_admin_users(page, email)
        verify_admin_billing(page)
        redeem_code = verify_admin_redeem(page, run_id)
        verify_admin_providers(page)
        verify_admin_settings(page)
        verify_admin_jobs(page, run_id)
        verify_redeem_through_public_browser(browser, email, redeem_code)
    finally:
        context.close()


def register_public_user(request: Any, email: str) -> None:
    response = request.post(
        "/api/public/auth/register",
        data={"email": email, "password": PUBLIC_USER_PASSWORD},
    )
    assert response.ok, response.text()


def verify_public_login(page: Page, email: str) -> None:
    page.goto("/login")
    page.get_by_placeholder("name@company.com").fill(email)
    page.get_by_placeholder("输入登录密码").fill(PUBLIC_USER_PASSWORD)
    page.get_by_role("button", name="登录").click()
    expect(page.get_by_text("登录成功", exact=True)).to_be_visible(timeout=UI_TIMEOUT_MS)


def verify_public_generation(page: Page, run_id: str) -> None:
    page.goto("/")
    page.wait_for_load_state("networkidle")
    expect(page.get_by_text("Local Dev Image", exact=True)).to_be_visible(timeout=UI_TIMEOUT_MS)
    page.get_by_placeholder("黄昏港口，蒸汽列车穿过潮湿雾气，电影感光影").fill(f"E2E 联通测试生图任务 {run_id}")
    page.get_by_role("button", name="生成图像").click()
    expect(page.get_by_text("任务已创建", exact=True)).to_be_visible(timeout=UI_TIMEOUT_MS)


def verify_public_tasks(page: Page, run_id: str) -> None:
    page.goto("/tasks")
    expect(page.get_by_text(f"E2E 联通测试生图任务 {run_id}", exact=True)).to_be_visible(timeout=UI_TIMEOUT_MS)


def verify_public_wallet(page: Page) -> None:
    page.goto("/wallet")
    expect(page.get_by_text("余额概览", exact=True)).to_be_visible(timeout=UI_TIMEOUT_MS)
    expect(page.get_by_text("signup_bonus", exact=True)).to_be_visible(timeout=UI_TIMEOUT_MS)


def verify_public_comic(page: Page, request: Any, run_id: str) -> None:
    title = f"E2E 漫画项目 {run_id}"
    page.goto("/comic")
    page.wait_for_load_state("networkidle")
    expect(page.get_by_role("heading", name="漫画工作室").first).to_be_visible(timeout=UI_TIMEOUT_MS)
    response = request.post(
        "/api/public/comic/projects",
        data={"title": title, "sourceText": E2E_COMIC_SOURCE, "stylePrompt": ""},
    )
    assert response.ok, response.text()
    page.goto("/comic")
    page.wait_for_load_state("networkidle")
    expect(page.get_by_text(title, exact=True)).to_be_visible(timeout=UI_TIMEOUT_MS)


def verify_admin_login(page: Page) -> None:
    page.goto("/login")
    page.wait_for_load_state("networkidle")
    page.get_by_placeholder("管理员用户名").fill(ADMIN_USERNAME)
    page.get_by_placeholder("管理员密码").fill(ADMIN_PASSWORD)
    page.get_by_role("button", name="登录").click()
    expect(page.get_by_text(f"登录成功：{ADMIN_USERNAME}", exact=True)).to_be_visible(timeout=UI_TIMEOUT_MS)


def verify_admin_users(page: Page, email: str) -> None:
    page.goto("/users")
    expect(page.get_by_text(email)).to_be_visible(timeout=UI_TIMEOUT_MS)


def verify_admin_billing(page: Page) -> None:
    page.goto("/billing")
    page.get_by_placeholder("用户 ID").fill("1")
    page.get_by_role("button", name="查询钱包").click()
    expect(page.get_by_text("已读取用户 1 的钱包与账本", exact=True)).to_be_visible(timeout=UI_TIMEOUT_MS)
    page.get_by_placeholder("例如 100 或 -50").fill("15")
    page.get_by_placeholder("manual_credit / manual_debit").fill("e2e_adjustment")
    page.get_by_role("button", name="写入调账").click()
    expect(page.get_by_text("e2e_adjustment")).to_be_visible(timeout=UI_TIMEOUT_MS)


def verify_admin_redeem(page: Page, run_id: str) -> str:
    page.goto("/redeem")
    page.wait_for_load_state("networkidle")
    page.get_by_placeholder("批次名称").fill(f"E2E 批次 {run_id}")
    page.get_by_placeholder("额度（cents）").fill("50")
    page.get_by_placeholder("逗号分隔多个兑换码").fill(E2E_REDEEM_CODE)
    page.get_by_role("button", name="创建批次").click()
    expect(page.get_by_text(f"批次 E2E 批次 {run_id} 已创建", exact=True)).to_be_visible(timeout=UI_TIMEOUT_MS)
    expect(page.get_by_text(E2E_REDEEM_CODE)).to_be_visible(timeout=UI_TIMEOUT_MS)
    return E2E_REDEEM_CODE


def verify_admin_providers(page: Page) -> None:
    page.goto("/providers")
    expect(page.locator("span").filter(has_text="local-dev").first).to_be_visible(timeout=UI_TIMEOUT_MS)
    expect(page.locator("span").filter(has_text="local-dev-image").first).to_be_visible(timeout=UI_TIMEOUT_MS)


def verify_admin_settings(page: Page) -> None:
    page.goto("/settings")
    page.locator("input[name='site_title']").fill("Commercial Studio E2E")
    page.get_by_role("button", name="保存设置").click()
    expect(page.get_by_text("设置已保存并立即影响新请求", exact=True)).to_be_visible(timeout=UI_TIMEOUT_MS)


def verify_admin_jobs(page: Page, run_id: str) -> None:
    page.goto("/image-jobs")
    expect(page.get_by_text(f"E2E 联通测试生图任务 {run_id}", exact=True)).to_be_visible(timeout=UI_TIMEOUT_MS)
    page.goto("/comic-jobs")
    expect(page.get_by_text("任务列表", exact=True)).to_be_visible(timeout=UI_TIMEOUT_MS)


def verify_redeem_through_public_browser(browser: Any, email: str, code: str) -> None:
    context = browser.new_context(base_url=f"http://127.0.0.1:{PUBLIC_PORT}")
    try:
        page = context.new_page()
        verify_public_login(page, email)
        page.goto("/wallet")
        page.get_by_placeholder("输入充值兑换码").fill(code)
        page.get_by_role("button", name="立即兑换").click()
        expect(page.get_by_text("兑换成功", exact=True)).to_be_visible(timeout=UI_TIMEOUT_MS)
    finally:
        context.close()


if __name__ == "__main__":
    main()
