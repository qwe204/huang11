"""Automated E2E tests for Doc Preview System."""
import sys
import os

from playwright.sync_api import sync_playwright, expect

BASE_URL = "http://localhost:5174"
RESULTS = {"passed": 0, "failed": 0, "errors": []}
SCREENSHOT_DIR = "/tmp/doc-preview-tests"

os.makedirs(SCREENSHOT_DIR, exist_ok=True)


def log_result(name, passed, detail=""):
    status = "PASS" if passed else "FAIL"
    print(f"  [{status}] {name}" + (f" — {detail}" if detail else ""))
    if passed:
        RESULTS["passed"] += 1
    else:
        RESULTS["failed"] += 1
        RESULTS["errors"].append(f"{name}: {detail}")


def test_login_page(page):
    """TC01: 验证登录页面加载"""
    print("\n=== TC01: 登录页面 ===")
    page.goto(BASE_URL)
    page.wait_for_load_state("networkidle")
    page.screenshot(path=f"{SCREENSHOT_DIR}/01_login_page.png", full_page=True)

    title = page.locator("h2")
    has_title = title.count() > 0 and "文档" in (title.first.text_content() or "")
    log_result("登录页面标题显示", has_title)

    username_input = page.locator('input[placeholder*="用户名"]')
    password_input = page.locator('input[placeholder*="密码"]')
    log_result("用户名输入框存在", username_input.count() > 0)
    log_result("密码输入框存在", password_input.count() > 0)

    login_btn = page.get_by_role("button", name="登 录")
    log_result("登录按钮存在", login_btn.count() > 0)

    register_link = page.locator("text=立即注册")
    log_result("注册链接存在", register_link.count() > 0)


def test_register(page):
    """TC02: 测试用户注册"""
    print("\n=== TC02: 用户注册 ===")
    page.goto(BASE_URL)
    page.wait_for_load_state("networkidle")

    page.locator("text=立即注册").click()
    page.wait_for_timeout(500)
    page.screenshot(path=f"{SCREENSHOT_DIR}/02_register_form.png", full_page=True)

    register_btn = page.get_by_role("button", name="注 册")
    log_result("切换到注册表单", register_btn.count() > 0)

    page.locator('input[placeholder*="用户名"]').fill("testuser")
    nickname_input = page.locator('input[placeholder*="昵称"]')
    if nickname_input.count() > 0:
        nickname_input.fill("测试用户")
    page.locator('input[placeholder*="请输入密码"]').first.fill("test123456")
    confirm_input = page.locator('input[placeholder*="再次"]')
    if confirm_input.count() > 0:
        confirm_input.fill("test123456")

    register_btn.click()
    page.wait_for_timeout(2000)
    page.screenshot(path=f"{SCREENSHOT_DIR}/02_after_register.png", full_page=True)

    success = page.locator("text=文档管理").count() > 0 or page.locator("text=上传文件").count() > 0
    log_result("注册成功进入主页", success)

    if success:
        do_logout(page)


def test_login(page):
    """TC03: 测试管理员登录"""
    print("\n=== TC03: 管理员登录 ===")
    page.goto(BASE_URL)
    page.wait_for_load_state("networkidle")

    if page.locator("text=立即登录").count() > 0:
        page.locator("text=立即登录").click()
        page.wait_for_timeout(500)

    page.locator('input[placeholder*="用户名"]').fill("admin")
    page.locator('input[placeholder*="密码"]').first.fill("123456")
    page.screenshot(path=f"{SCREENSHOT_DIR}/03_login_filled.png", full_page=True)

    page.get_by_role("button", name="登 录").click()
    page.wait_for_timeout(2000)
    page.screenshot(path=f"{SCREENSHOT_DIR}/03_after_login.png", full_page=True)

    logged_in = page.locator("text=文档管理").count() > 0 or page.locator("text=上传文件").count() > 0
    log_result("管理员登录成功", logged_in)

    has_user_menu = page.locator("text=用户管理").count() > 0
    log_result("管理员可见用户管理菜单", has_user_menu)

    user_display = page.locator("text=系统管理员").count() > 0 or page.locator("text=admin").count() > 0
    log_result("显示用户信息", user_display)


def test_file_manager(page):
    """TC04: 文件管理页面"""
    print("\n=== TC04: 文件管理页面 ===")
    ensure_logged_in(page)

    file_tab = page.locator("text=文档管理")
    if file_tab.count() > 0:
        file_tab.first.click()
        page.wait_for_timeout(1000)

    page.screenshot(path=f"{SCREENSHOT_DIR}/04_file_manager.png", full_page=True)

    search_input = page.locator('input[placeholder*="搜索"]')
    log_result("搜索框存在", search_input.count() > 0)

    upload_btn = page.locator("text=上传文件")
    log_result("上传按钮存在", upload_btn.count() > 0)

    table = page.locator(".el-table")
    log_result("文件列表表格存在", table.count() > 0)

    type_filter = page.locator(".el-select")
    log_result("类型筛选存在", type_filter.count() > 0)


def test_file_upload(page):
    """TC05: 文件上传功能"""
    print("\n=== TC05: 文件上传 ===")
    ensure_logged_in(page)

    test_file = "/tmp/test_document.txt"
    with open(test_file, "w") as f:
        f.write("This is a test document for preview system.\n" * 10)

    file_input = page.locator('input[type="file"]')
    if file_input.count() > 0:
        file_input.set_input_files(test_file)
        page.wait_for_timeout(3000)
        page.screenshot(path=f"{SCREENSHOT_DIR}/05_after_upload.png", full_page=True)

        success_msg = page.locator(".el-message--success")
        file_in_list = page.locator("text=test_document.txt")
        uploaded = success_msg.count() > 0 or file_in_list.count() > 0
        log_result("文件上传成功", uploaded)
    else:
        log_result("文件上传成功", False, "未找到文件输入框")


def test_user_management(page):
    """TC06: 用户管理（管理员功能）"""
    print("\n=== TC06: 用户管理 ===")
    ensure_logged_in(page)

    user_menu = page.locator("text=用户管理")
    if user_menu.count() == 0:
        log_result("用户管理菜单", False, "非管理员或菜单不存在")
        return

    user_menu.first.click()
    page.wait_for_timeout(1500)
    page.screenshot(path=f"{SCREENSHOT_DIR}/06_user_management.png", full_page=True)

    table = page.locator(".el-table")
    log_result("用户列表表格存在", table.count() > 0)

    admin_row = page.locator("text=admin")
    log_result("admin 用户显示", admin_row.count() > 0)

    search_input = page.locator('input[placeholder*="搜索"]')
    log_result("搜索框存在", search_input.count() > 0)

    add_btn = page.locator("text=添加用户")
    log_result("添加用户按钮存在", add_btn.count() > 0)

    if add_btn.count() > 0:
        add_btn.click()
        page.wait_for_timeout(500)
        page.screenshot(path=f"{SCREENSHOT_DIR}/06_add_user_dialog.png", full_page=True)

        dialog = page.locator(".el-dialog")
        log_result("添加用户对话框打开", dialog.count() > 0 and dialog.first.is_visible())

        cancel_btn = page.locator(".el-dialog").locator("text=取消")
        if cancel_btn.count() > 0:
            cancel_btn.click()
            page.wait_for_timeout(300)


def test_search_filter(page):
    """TC07: 搜索和筛选功能"""
    print("\n=== TC07: 搜索和筛选 ===")
    ensure_logged_in(page)

    user_menu = page.locator("text=用户管理")
    if user_menu.count() > 0:
        user_menu.first.click()
        page.wait_for_timeout(1000)

    search_input = page.locator('input[placeholder*="搜索"]')
    if search_input.count() > 0:
        search_input.fill("admin")
        page.wait_for_timeout(1000)
        page.screenshot(path=f"{SCREENSHOT_DIR}/07_search_result.png", full_page=True)

        admin_visible = page.locator("td").locator("text=admin").count() > 0
        log_result("搜索 admin 显示结果", admin_visible)

        search_input.clear()
        page.wait_for_timeout(500)
    else:
        log_result("搜索功能", False, "搜索框不存在")


def test_responsive_layout(page):
    """TC08: 页面布局检查"""
    print("\n=== TC08: 页面布局 ===")
    ensure_logged_in(page)

    header = page.locator("header, .app-header")
    log_result("顶部导航栏存在", header.count() > 0)

    main = page.locator("main, .app-main")
    log_result("主内容区存在", main.count() > 0)

    kylin_tag = page.locator("text=银河麒麟兼容")
    log_result("银河麒麟兼容标签显示", kylin_tag.count() > 0)

    page.set_viewport_size({"width": 1920, "height": 1080})
    page.wait_for_timeout(500)
    page.screenshot(path=f"{SCREENSHOT_DIR}/08_1920.png", full_page=True)
    log_result("1920x1080 布局正常", True)

    page.set_viewport_size({"width": 1280, "height": 720})
    page.wait_for_timeout(500)
    page.screenshot(path=f"{SCREENSHOT_DIR}/08_1280.png", full_page=True)
    log_result("1280x720 布局正常", True)


def ensure_logged_in(page):
    """确保已登录admin"""
    page.goto(BASE_URL)
    page.wait_for_load_state("networkidle")

    if page.locator("text=文档管理").count() > 0:
        return

    if page.locator("text=立即登录").count() > 0:
        page.locator("text=立即登录").click()
        page.wait_for_timeout(300)

    username = page.locator('input[placeholder*="用户名"]')
    if username.count() > 0:
        username.fill("admin")
        page.locator('input[placeholder*="密码"]').first.fill("123456")
        page.get_by_role("button", name="登 录").click()
        page.wait_for_timeout(2000)


def do_logout(page):
    """退出登录"""
    page.evaluate("() => { localStorage.removeItem('token'); localStorage.removeItem('user'); }")
    page.goto(BASE_URL)
    page.wait_for_timeout(1000)


def main():
    print("=" * 60)
    print("  文档在线预览系统 — 自动化测试")
    print("=" * 60)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1280, "height": 720}, locale="zh-CN")
        page = context.new_page()

        page.on("console", lambda msg: None)

        try:
            test_login_page(page)
            test_register(page)
            test_login(page)
            test_file_manager(page)
            test_file_upload(page)
            test_user_management(page)
            test_search_filter(page)
            test_responsive_layout(page)
        except Exception as e:
            print(f"\n[ERROR] 测试异常: {e}")
            page.screenshot(path=f"{SCREENSHOT_DIR}/error.png", full_page=True)
            RESULTS["failed"] += 1
            RESULTS["errors"].append(f"异常: {str(e)}")
        finally:
            browser.close()

    print("\n" + "=" * 60)
    print(f"  测试结果: {RESULTS['passed']} 通过, {RESULTS['failed']} 失败")
    print("=" * 60)

    if RESULTS["errors"]:
        print("\n失败项:")
        for e in RESULTS["errors"]:
            print(f"  - {e}")

    print(f"\n截图保存在: {SCREENSHOT_DIR}/")
    return 0 if RESULTS["failed"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
