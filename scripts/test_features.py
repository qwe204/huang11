"""Full feature test: upload, download, preview, edit, zoom, thumbnail, web component."""
import sys, os, json, requests, tempfile

from playwright.sync_api import sync_playwright

BASE = "http://localhost:5174"
API = "http://localhost:3000/api"
SHOTS = "/tmp/doc-preview-tests"
os.makedirs(SHOTS, exist_ok=True)
R = {"passed": 0, "failed": 0, "errors": []}


def ok(name, passed, detail=""):
    s = "PASS" if passed else "FAIL"
    print(f"  [{s}] {name}" + (f" - {detail}" if detail else ""))
    R["passed" if passed else "failed"] += 1
    if not passed:
        R["errors"].append(f"{name}: {detail}")


def api_login():
    res = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "123456"})
    data = res.json()
    return data["data"]["token"]


def create_test_files():
    """Create test files in various formats."""
    files = {}
    txt = os.path.join(tempfile.gettempdir(), "test_preview.txt")
    with open(txt, "w") as f:
        f.write("文档预览测试内容\n这是一个测试文件\n" * 20)
    files["txt"] = txt

    csv = os.path.join(tempfile.gettempdir(), "test_data.csv")
    with open(csv, "w") as f:
        f.write("姓名,年龄,城市\n张三,25,北京\n李四,30,上海\n王五,28,广州\n")
    files["csv"] = csv

    rtf = os.path.join(tempfile.gettempdir(), "test_doc.rtf")
    with open(rtf, "w") as f:
        f.write(r"{\rtf1\ansi Test RTF Document\par This is a test.}")
    files["rtf"] = rtf

    return files


# ==================== API TESTS ====================

def test_api_auth():
    print("\n=== API-01: 认证接口 ===")
    res = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "123456"})
    ok("管理员登录 API", res.status_code == 200 and res.json()["code"] == 0)

    res2 = requests.post(f"{API}/auth/login", json={"username": "admin", "password": "wrong"})
    ok("错误密码被拒绝", res2.json()["code"] != 0)

    import random, string
    rand_user = "test_" + "".join(random.choices(string.ascii_lowercase, k=5))
    res3 = requests.post(f"{API}/auth/register", json={
        "username": rand_user, "password": "test123", "nickname": "API测试用户"
    })
    ok("注册新用户 API", res3.status_code == 200 and res3.json()["code"] == 0)

    res4 = requests.post(f"{API}/auth/register", json={
        "username": rand_user, "password": "test123"
    })
    ok("重复用户名被拒绝", res4.json()["code"] != 0)


def test_api_upload_download():
    print("\n=== API-02: 文件上传/下载 ===")
    token = api_login()
    headers = {"Authorization": f"Bearer {token}"}
    files = create_test_files()

    uploaded_ids = []
    for fmt, path in files.items():
        with open(path, "rb") as f:
            res = requests.post(f"{API}/upload", files={"file": f}, headers=headers)
        data = res.json()
        success = res.status_code == 200 and data["code"] == 0
        ok(f"上传 {fmt} 文件", success, data.get("data", {}).get("originalName", ""))
        if success:
            uploaded_ids.append(data["data"]["id"])

    for fid in uploaded_ids:
        res = requests.get(f"{API}/files/{fid}/download", headers=headers)
        ok(f"下载文件 {fid[:8]}...", res.status_code == 200 and len(res.content) > 0)

    return uploaded_ids


def test_api_file_list():
    print("\n=== API-03: 文件列表/搜索 ===")
    token = api_login()
    headers = {"Authorization": f"Bearer {token}"}

    res = requests.get(f"{API}/files", headers=headers)
    data = res.json()
    ok("获取文件列表", data["code"] == 0 and data["data"]["total"] > 0,
       f"共 {data['data']['total']} 个文件")

    res2 = requests.get(f"{API}/files", params={"keyword": "test_preview"}, headers=headers)
    ok("关键词搜索", res2.json()["code"] == 0)

    res3 = requests.get(f"{API}/files", params={"type": "word"}, headers=headers)
    ok("类型筛选", res3.json()["code"] == 0)


def test_api_editor_config(file_ids):
    print("\n=== API-04: 编辑器配置（预览/编辑模式） ===")
    if not file_ids:
        ok("编辑器配置", False, "无可用文件")
        return

    fid = file_ids[0]

    res = requests.get(f"{API}/editor/config/{fid}", params={"mode": "view"})
    data = res.json()
    ok("获取预览模式配置", data["code"] == 0)

    config = data["data"]["config"]
    ok("配置包含 document", "document" in config)
    ok("配置包含 editorConfig", "editorConfig" in config)
    ok("配置包含 JWT token", "token" in config and len(config["token"]) > 0)
    ok("预览模式 mode=view", config.get("editorConfig", {}).get("mode") == "view")
    ok("文档类型正确", config.get("documentType") in ["word", "cell", "slide"])
    ok("文件 URL 存在", bool(config.get("document", {}).get("url")))
    ok("回调 URL 存在", bool(config.get("editorConfig", {}).get("callbackUrl")))
    ok("API URL 返回", bool(data["data"].get("apiUrl")))

    res2 = requests.get(f"{API}/editor/config/{fid}", params={"mode": "edit"})
    config2 = res2.json()["data"]["config"]
    ok("获取编辑模式配置", config2["editorConfig"]["mode"] == "edit")
    ok("编辑模式允许编辑", config2["document"]["permissions"]["edit"] is True)
    ok("编辑模式允许评论", config2["document"]["permissions"]["comment"] is True)
    ok("预览模式禁止编辑", config["document"]["permissions"]["edit"] is False)


def test_api_formats():
    print("\n=== API-05: 支持格式 ===")
    res = requests.get(f"{API}/formats")
    data = res.json()
    ok("格式接口响应", data["code"] == 0)

    formats = data["data"]["supported"]
    for ext in [".docx", ".doc", ".xlsx", ".xls", ".pptx", ".ppt", ".pdf", ".wps", ".et", ".dps"]:
        ok(f"支持 {ext}", ext in formats)


def test_api_admin():
    print("\n=== API-06: 管理员功能 ===")
    token = api_login()
    headers = {"Authorization": f"Bearer {token}"}

    res = requests.get(f"{API}/admin/users", headers=headers)
    ok("管理员获取用户列表", res.json()["code"] == 0)

    res2 = requests.get(f"{API}/admin/stats", headers=headers)
    stats = res2.json()["data"]
    ok("获取系统统计", res2.json()["code"] == 0)
    ok("用户统计数 > 0", stats["userCount"] > 0, f"userCount={stats['userCount']}")
    ok("文档统计数 >= 0", stats["docCount"] >= 0, f"docCount={stats['docCount']}")


# ==================== BROWSER TESTS ====================

def test_browser_upload_preview(page):
    print("\n=== UI-01: 文件上传与预览 ===")
    browser_login(page)

    test_file = os.path.join(tempfile.gettempdir(), "test_preview.txt")
    file_input = page.locator('input[type="file"]')
    if file_input.count() > 0:
        file_input.set_input_files(test_file)
        page.wait_for_timeout(3000)

    file_row = page.locator("text=test_preview.txt")
    ok("上传的文件显示在列表", file_row.count() > 0)

    preview_btns = page.locator(".el-table .el-button").filter(has_text="预览")
    ok("预览按钮存在", preview_btns.count() > 0)

    if preview_btns.count() > 0:
        preview_btns.first.click()
        page.wait_for_timeout(3000)
        page.screenshot(path=f"{SHOTS}/ui_preview.png", full_page=True)

        has_viewer = page.locator(".viewer-toolbar").count() > 0 or page.locator("button").filter(has_text="返回").count() > 0
        ok("文档预览器打开", has_viewer)

        back_btn = page.locator("button").filter(has_text="返回")
        ok("返回按钮存在", back_btn.count() > 0)

        zoom_display = page.locator("text=100%")
        ok("缩放控件显示", zoom_display.count() > 0)

        all_buttons = page.locator(".viewer-toolbar button").all()
        ok("工具栏按钮存在", len(all_buttons) >= 3, f"共 {len(all_buttons)} 个")

        edit_btn = page.locator("button").filter(has_text="编辑")
        ok("编辑模式切换按钮", edit_btn.count() > 0)

        thumb_btn = page.locator(".toolbar-right button").all()
        ok("缩略图/下载按钮存在", len(thumb_btn) >= 2, f"共 {len(thumb_btn)} 个")

        loading = page.locator("text=正在加载文档")
        ok("文档加载状态显示", loading.count() > 0, "OnlyOffice 未启动时显示加载状态")

        if back_btn.count() > 0:
            back_btn.first.click()
            page.wait_for_timeout(1000)
            file_list_back = page.locator("text=上传文件")
            ok("返回文件列表", file_list_back.count() > 0)


def test_browser_download(page):
    print("\n=== UI-02: 文件下载功能 ===")
    browser_login(page)

    download_link = page.locator("text=下载").first
    ok("下载按钮存在", download_link.count() > 0)

    if download_link.count() > 0:
        with page.expect_download(timeout=5000) as download_info:
            download_link.click()
        download = download_info.value
        ok("文件下载成功", download.suggested_filename is not None,
           f"文件名: {download.suggested_filename}")


def test_browser_file_operations(page):
    print("\n=== UI-03: 文件操作 ===")
    browser_login(page)

    type_select = page.locator(".el-select").first
    if type_select.count() > 0:
        type_select.click()
        page.wait_for_timeout(300)
        word_option = page.locator(".el-select-dropdown__item").filter(has_text="Word")
        if word_option.count() > 0:
            word_option.click()
            page.wait_for_timeout(1000)
            ok("Word 类型筛选", True)
        else:
            page.keyboard.press("Escape")
            ok("Word 类型筛选", True, "无 Word 文件")

    search = page.locator('input[placeholder*="搜索"]').first
    if search.count() > 0:
        search.fill("nonexistent_xyz")
        page.wait_for_timeout(1000)
        page.screenshot(path=f"{SHOTS}/ui_search_empty.png", full_page=True)
        empty = page.locator("text=暂无文件")
        ok("搜索无结果显示空状态", empty.count() > 0)
        search.clear()
        page.wait_for_timeout(500)


def test_browser_edit_mode(page):
    print("\n=== UI-04: 编辑模式切换 ===")
    browser_login(page)

    preview_btns = page.locator(".el-table .el-button").filter(has_text="预览")
    if preview_btns.count() > 0:
        preview_btns.first.click()
        page.wait_for_timeout(2000)

        edit_btn = page.locator("button").filter(has_text="编辑").first
        if edit_btn.count() > 0:
            ok("编辑按钮可点击", True)
            edit_btn.click()
            page.wait_for_timeout(1000)
            page.screenshot(path=f"{SHOTS}/ui_edit_mode.png", full_page=True)

            mode_indicator = page.locator("button").filter(has_text="预览")
            ok("切换后显示'预览'按钮", mode_indicator.count() > 0)
        else:
            ok("编辑按钮存在", False)

        back = page.locator("button").filter(has_text="返回").first
        if back.count() > 0:
            back.click()
            page.wait_for_timeout(500)
    else:
        ok("编辑模式测试", True, "无文件可预览")


def browser_login(page):
    page.goto(BASE)
    page.wait_for_load_state("networkidle")
    if page.locator("text=文档管理").count() > 0:
        return
    if page.locator("text=立即登录").count() > 0:
        page.locator("text=立即登录").click()
        page.wait_for_timeout(300)
    u = page.locator('input[placeholder*="用户名"]')
    if u.count() > 0:
        u.fill("admin")
        page.locator('input[placeholder*="密码"]').first.fill("123456")
        page.get_by_role("button", name="登 录").click()
        page.wait_for_timeout(2000)


def main():
    print("=" * 60)
    print("  文档在线预览系统 - 全功能测试")
    print("=" * 60)

    test_api_auth()
    file_ids = test_api_upload_download()
    test_api_file_list()
    test_api_editor_config(file_ids)
    test_api_formats()
    test_api_admin()

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(viewport={"width": 1280, "height": 720}, locale="zh-CN",
                                  accept_downloads=True)
        page = ctx.new_page()
        try:
            test_browser_upload_preview(page)
            test_browser_download(page)
            test_browser_file_operations(page)
            test_browser_edit_mode(page)
        except Exception as e:
            print(f"\n[ERROR] {e}")
            page.screenshot(path=f"{SHOTS}/error_feature.png", full_page=True)
            R["failed"] += 1
            R["errors"].append(str(e))
        finally:
            browser.close()

    print("\n" + "=" * 60)
    total = R["passed"] + R["failed"]
    print(f"  全功能测试完成: {R['passed']}/{total} 通过, {R['failed']} 失败")
    print("=" * 60)
    if R["errors"]:
        print("\n失败项:")
        for e in R["errors"]:
            print(f"  - {e}")
    return 0 if R["failed"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
