"""Record a demo video of the Doc Preview System using Playwright."""
import os, tempfile, shutil
from playwright.sync_api import sync_playwright

BASE = "http://localhost:5174"
VIDEO_DIR = "/Volumes/xx/2026BS/面向银河麒麟环境的跨平台办公文档在线预览Web组件设计与实现/docs"

def main():
    print("=" * 50)
    print("  录制系统演示视频")
    print("=" * 50)

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1280, "height": 720},
            record_video_dir=tempfile.mkdtemp(),
            record_video_size={"width": 1280, "height": 720},
            locale="zh-CN",
        )
        page = context.new_page()

        print("\n[场景1] 登录页面")
        page.goto(BASE)
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(2000)

        print("[场景2] 切换到注册页面")
        page.locator("text=立即注册").click()
        page.wait_for_timeout(1500)
        page.locator("text=立即登录").click()
        page.wait_for_timeout(1000)

        print("[场景3] 管理员登录")
        page.locator('input[placeholder*="用户名"]').fill("admin")
        page.wait_for_timeout(500)
        page.locator('input[placeholder*="密码"]').first.fill("123456")
        page.wait_for_timeout(500)
        page.get_by_role("button", name="登 录").click()
        page.wait_for_timeout(2500)

        print("[场景4] 上传文件")
        test_files = []
        for name, ext, content in [
            ("项目方案报告", ".txt", "面向银河麒麟环境的文档预览Web组件\n系统架构设计\n" * 30),
            ("季度数据表", ".csv", "月份,销售额,利润\n1月,50000,12000\n2月,63000,15000\n3月,71000,18000\n"),
        ]:
            path = os.path.join(tempfile.gettempdir(), f"{name}{ext}")
            with open(path, "w") as f:
                f.write(content)
            test_files.append(path)

        for tf in test_files:
            fi = page.locator('input[type="file"]')
            fi.set_input_files(tf)
            page.wait_for_timeout(2000)
        page.wait_for_timeout(1000)

        print("[场景5] 搜索文件")
        search = page.locator('input[placeholder*="搜索"]')
        search.fill("项目")
        page.wait_for_timeout(1500)
        search.clear()
        page.wait_for_timeout(1000)

        print("[场景6] 预览文档")
        btns = page.locator(".el-table .el-button").filter(has_text="预览")
        if btns.count() > 0:
            btns.first.click()
            page.wait_for_timeout(5000)

            print("[场景7] 缩放控制")
            zoom = page.locator(".zoom-display")
            if zoom.count() > 0:
                zoom.click()
                page.wait_for_timeout(1000)
                page.keyboard.press("Escape")

            print("[场景8] 编辑模式")
            edit = page.locator("button").filter(has_text="编辑")
            if edit.count() > 0:
                edit.first.click()
                page.wait_for_timeout(2000)

            print("[场景9] 缩略图")
            tb = page.locator(".toolbar-right button").all()
            for btn in tb:
                btn.click()
                page.wait_for_timeout(500)
                if page.locator(".thumbnail-sidebar").count() > 0:
                    page.wait_for_timeout(1500)
                    btn.click()
                    page.wait_for_timeout(500)
                    break

            print("[场景10] 返回列表")
            back = page.locator("button").filter(has_text="返回")
            if back.count() > 0:
                back.first.click()
                page.wait_for_timeout(1500)

        print("[场景11] 用户管理")
        um = page.locator("text=用户管理")
        if um.count() > 0:
            um.first.click()
            page.wait_for_timeout(2000)

            add = page.locator("text=添加用户")
            if add.count() > 0:
                add.click()
                page.wait_for_timeout(1500)
                page.locator(".el-dialog").locator("text=取消").click()
                page.wait_for_timeout(500)

        print("[场景12] 用户菜单")
        ui = page.locator(".user-info")
        if ui.count() > 0:
            ui.click()
            page.wait_for_timeout(1500)
            page.keyboard.press("Escape")

        page.wait_for_timeout(2000)

        video_path = page.video.path()
        context.close()
        browser.close()

        output_path = os.path.join(VIDEO_DIR, "系统演示.webm")
        if video_path and os.path.exists(video_path):
            shutil.copy2(video_path, output_path)
            size_mb = os.path.getsize(output_path) / (1024 * 1024)
            print(f"\n演示视频已保存: {output_path}")
            print(f"文件大小: {size_mb:.1f} MB")
        else:
            print("视频录制失败")


if __name__ == "__main__":
    main()
