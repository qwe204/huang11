"""Capture demo screenshots of all system features."""
import os, tempfile
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5174"
OUT = "/Volumes/xx/2026BS/面向银河麒麟环境的跨平台办公文档在线预览Web组件设计与实现/docs/screenshots"
os.makedirs(OUT, exist_ok=True)

def shot(page, name):
    path = os.path.join(OUT, f"{name}.png")
    page.screenshot(path=path, full_page=True)
    print(f"  [OK] {name}.png")


def main():
    print("=" * 50)
    print("  系统功能截图")
    print("=" * 50)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})

        # 1. 登录页面
        print("\n1. 登录页面")
        page.goto(BASE)
        page.wait_for_load_state("networkidle")
        shot(page, "01-登录页面")

        # 2. 注册页面
        print("2. 注册页面")
        page.locator("text=立即注册").click()
        page.wait_for_timeout(500)
        shot(page, "02-注册页面")

        # 3. 注册测试用户
        print("3. 注册用户")
        page.locator('input[placeholder*="用户名"]').fill("zhangsan")
        page.locator('input[placeholder*="昵称"]').fill("张三")
        page.locator('input[placeholder*="邮箱"]').fill("zhangsan@example.com")
        page.locator('input[placeholder*="请输入密码"]').first.fill("zhang123")
        page.locator('input[placeholder*="再次"]').fill("zhang123")
        shot(page, "03-注册填写")
        page.get_by_role("button", name="注 册").click()
        page.wait_for_timeout(2000)

        # Logout and login as admin
        page.evaluate("() => { localStorage.removeItem('token'); localStorage.removeItem('user'); }")
        page.goto(BASE)
        page.wait_for_timeout(1000)

        # 4. 管理员登录
        print("4. 管理员登录")
        page.locator('input[placeholder*="用户名"]').fill("admin")
        page.locator('input[placeholder*="密码"]').first.fill("123456")
        shot(page, "04-登录填写")
        page.get_by_role("button", name="登 录").click()
        page.wait_for_timeout(2000)
        shot(page, "05-主页面空状态")

        # 5. 上传文件
        print("5. 上传文件")
        test_files = []
        for name, ext, content in [
            ("项目方案报告", ".txt", "面向银河麒麟环境的跨平台办公文档在线预览Web组件\n\n一、项目概述\n本项目旨在设计并实现一个基于Web的文档在线预览组件...\n" * 20),
            ("2026年工作计划", ".csv", "月份,任务,负责人,状态\n1月,需求分析,张三,已完成\n2月,系统设计,李四,已完成\n3月,核心开发,王五,进行中\n4月,测试优化,赵六,待开始\n"),
            ("技术文档", ".rtf", r"{\rtf1\ansi 技术架构说明\par Vue 3 + Element Plus + OnlyOffice\par Docker Compose 部署}"),
        ]:
            path = os.path.join(tempfile.gettempdir(), f"{name}{ext}")
            with open(path, "w") as f:
                f.write(content)
            test_files.append(path)

        for i, tf in enumerate(test_files):
            fi = page.locator('input[type="file"]')
            fi.set_input_files(tf)
            page.wait_for_timeout(2000)

        shot(page, "06-文件列表")

        # 6. 搜索功能
        print("6. 搜索功能")
        page.locator('input[placeholder*="搜索"]').fill("项目方案")
        page.wait_for_timeout(1000)
        shot(page, "07-搜索文件")
        page.locator('input[placeholder*="搜索"]').clear()
        page.wait_for_timeout(500)

        # 7. 类型筛选
        print("7. 类型筛选")
        page.locator(".el-select").first.click()
        page.wait_for_timeout(300)
        shot(page, "08-类型筛选下拉")
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)

        # 8. 文档预览
        print("8. 文档预览")
        btns = page.locator(".el-table .el-button").filter(has_text="预览")
        if btns.count() > 0:
            btns.first.click()
            page.wait_for_timeout(3000)
            shot(page, "09-文档预览加载中")

            # Wait for OnlyOffice
            for i in range(12):
                page.wait_for_timeout(5000)
                loading = page.locator(".editor-loading")
                if loading.count() == 0:
                    break

            shot(page, "10-文档预览完成")

        # 9. 缩放控制
        print("9. 缩放控制")
        zoom_dropdown = page.locator(".zoom-display")
        if zoom_dropdown.count() > 0:
            zoom_dropdown.click()
            page.wait_for_timeout(300)
            shot(page, "11-缩放下拉菜单")
            page.keyboard.press("Escape")

        # 10. 编辑模式
        print("10. 编辑模式切换")
        edit_btn = page.locator("button").filter(has_text="编辑")
        if edit_btn.count() > 0:
            edit_btn.first.click()
            page.wait_for_timeout(3000)
            shot(page, "12-编辑模式")

        # 11. 缩略图
        print("11. 缩略图面板")
        toolbar_btns = page.locator(".toolbar-right button").all()
        for btn in toolbar_btns:
            btn.click()
            page.wait_for_timeout(300)
            if page.locator(".thumbnail-sidebar").count() > 0:
                shot(page, "13-缩略图面板")
                break

        # 返回
        back = page.locator("button").filter(has_text="返回")
        if back.count() > 0:
            back.first.click()
            page.wait_for_timeout(1000)

        # 12. 用户管理
        print("12. 用户管理")
        user_menu = page.locator("text=用户管理")
        if user_menu.count() > 0:
            user_menu.first.click()
            page.wait_for_timeout(1500)
            shot(page, "14-用户管理列表")

        # 13. 添加用户
        print("13. 添加用户")
        add_btn = page.locator("text=添加用户")
        if add_btn.count() > 0:
            add_btn.click()
            page.wait_for_timeout(500)
            shot(page, "15-添加用户对话框")

            page.locator(".el-dialog").locator("text=取消").click()
            page.wait_for_timeout(300)

        # 14. 用户下拉菜单
        print("14. 用户菜单")
        user_info = page.locator(".user-info")
        if user_info.count() > 0:
            user_info.click()
            page.wait_for_timeout(500)
            shot(page, "16-用户下拉菜单")
            page.keyboard.press("Escape")

        browser.close()

    print(f"\n截图保存在: {OUT}/")
    files = sorted(os.listdir(OUT))
    print(f"共 {len(files)} 张截图")


if __name__ == "__main__":
    main()
