#!/usr/bin/env python3
"""
文档在线预览系统 — 连续录制演示视频
按 screen-recorder 技能规范，一镜到底，模拟真人操作。
"""

import os, sys, subprocess, shutil, tempfile
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw, ImageFont

def create_watermark(width=1920, height=1080, texts=None, output_path="/tmp/watermark.png"):
    """生成透明水印 PNG（3 个位置：左上、正中、右下）"""
    img = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    try:
        font = ImageFont.truetype("/System/Library/Fonts/PingFang.ttc", 28)
    except Exception:
        try:
            font = ImageFont.truetype("/System/Library/Fonts/STHeiti Light.ttc", 28)
        except Exception:
            font = ImageFont.load_default()

    color = (120, 120, 120, 110)

    for pos, text in (texts or {}).items():
        bbox = draw.textbbox((0, 0), text, font=font)
        tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]

        if pos == "top-left":
            x, y = 80, 60
        elif pos == "center":
            x, y = (width - tw) // 2, (height - th) // 2
        elif pos == "bottom-right":
            x, y = width - tw - 80, height - th - 60
        else:
            continue

        draw.text((x, y), text, font=font, fill=color)

    img.save(output_path)
    return output_path


BASE_URL = "http://localhost:5180"
OUTPUT_DIR = "/Volumes/xx/2026BS/面向银河麒麟环境的跨平台办公文档在线预览Web组件设计与实现/docs/demo-videos"
FINAL_VIDEO = "/Volumes/xx/2026BS/面向银河麒麟环境的跨平台办公文档在线预览Web组件设计与实现/docs/系统演示.mp4"
WIDTH, HEIGHT = 1920, 1080

os.makedirs(OUTPUT_DIR, exist_ok=True)


def record_session(name, actions_fn):
    """录制一段连续会话（1080p）"""
    print(f"\n[录制] {name} ...")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": WIDTH, "height": HEIGHT},
            device_scale_factor=1,
            record_video_dir=OUTPUT_DIR,
            record_video_size={"width": WIDTH, "height": HEIGHT},
            locale="zh-CN",
        )
        page = context.new_page()
        try:
            actions_fn(page)
        except Exception as e:
            print(f"[错误] {name}: {e}")
            context.close()
            browser.close()
            raise
        video_path = page.video.path()
        context.close()
        browser.close()

    if video_path and os.path.exists(video_path):
        dst = os.path.join(OUTPUT_DIR, f"{name}.webm")
        if os.path.exists(dst):
            os.remove(dst)
        os.rename(video_path, dst)
        print(f"[完成] {name} -> {dst}")
        return dst
    return None


def create_test_files():
    """创建演示用的测试文件"""
    files = {}

    path = os.path.join(tempfile.gettempdir(), "项目方案报告.txt")
    with open(path, "w") as f:
        f.write(
            "面向银河麒麟环境的跨平台办公文档在线预览Web组件\n\n"
            "一、项目概述\n"
            "本项目旨在设计并实现一个面向银河麒麟操作系统环境的跨平台办公文档在线预览Web组件。"
            "该组件以浏览器为主要运行环境，采用现代Web技术，实现对多种办公文档格式的在线预览。\n\n"
            "二、技术架构\n"
            "前端：Vue 3 + Element Plus + TypeScript\n"
            "后端：Node.js + Express + SQLite\n"
            "文档引擎：OnlyOffice Document Server\n"
            "容器化：Docker + Docker Compose\n\n"
            "三、核心功能\n"
            "1. 多格式文档预览（Word/Excel/PPT/PDF/WPS）\n"
            "2. 文档在线编辑与涂画标注\n"
            "3. 缩放控制与缩略图导航\n"
            "4. 文件上传与下载管理\n"
            "5. Web Component封装，可嵌入任意网页\n"
            "6. Docker一键部署，兼容银河麒麟V10\n"
        )
    files["txt"] = path

    path = os.path.join(tempfile.gettempdir(), "季度数据表.csv")
    with open(path, "w") as f:
        f.write("月份,销售额,利润,增长率\n1月,58000,14500,12%\n2月,63000,15800,8.6%\n3月,71000,18200,12.7%\n4月,68000,16900,-4.2%\n")
    files["csv"] = path

    return files


# ============================================================
# 连续录制会话
# ============================================================


def full_demo_session(page):
    """完整系统演示——一镜到底"""

    test_files = create_test_files()

    # ────────────── 1. 登录页面 ──────────────
    print("  [1] 登录页面展示")
    page.goto(BASE_URL)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(3000)

    # ────────────── 2. 注册功能 ──────────────
    print("  [2] 用户注册")
    page.locator("text=立即注册").click()
    page.wait_for_timeout(1500)

    page.locator('input[placeholder*="用户名"]').fill("zhangsan")
    page.wait_for_timeout(400)
    nick = page.locator('input[placeholder*="昵称"]')
    if nick.count() > 0:
        nick.fill("张三")
    page.wait_for_timeout(400)
    email = page.locator('input[placeholder*="邮箱"]')
    if email.count() > 0:
        email.fill("zhangsan@example.com")
    page.wait_for_timeout(400)
    page.locator('input[placeholder*="请输入密码"]').first.fill("zhang123")
    page.wait_for_timeout(400)
    confirm = page.locator('input[placeholder*="再次"]')
    if confirm.count() > 0:
        confirm.fill("zhang123")
    page.wait_for_timeout(1000)

    page.get_by_role("button", name="注 册").click()
    page.wait_for_timeout(2500)

    # 退出，切换到管理员
    page.evaluate("() => { localStorage.removeItem('token'); localStorage.removeItem('user'); }")
    page.goto(BASE_URL)
    page.wait_for_timeout(1500)

    # ────────────── 3. 管理员登录 ──────────────
    print("  [3] 管理员登录")
    if page.locator("text=立即登录").count() > 0:
        page.locator("text=立即登录").click()
        page.wait_for_timeout(500)

    page.locator('input[placeholder*="用户名"]').fill("admin")
    page.wait_for_timeout(500)
    page.locator('input[placeholder*="密码"]').first.fill("123456")
    page.wait_for_timeout(800)
    page.get_by_role("button", name="登 录").click()
    page.wait_for_timeout(3000)

    # ────────────── 4. 文件上传（多格式） ──────────────
    print("  [4] 文件上传")
    for fmt, path in test_files.items():
        fi = page.locator('input[type="file"]')
        if fi.count() > 0:
            fi.set_input_files(path)
            page.wait_for_timeout(2500)
    page.wait_for_timeout(2000)

    # ────────────── 5. 文件列表展示 ──────────────
    print("  [5] 文件列表")
    page.wait_for_timeout(2500)

    # ────────────── 6. 搜索功能 ──────────────
    print("  [6] 搜索功能")
    search = page.locator('input[placeholder*="搜索"]')
    if search.count() > 0:
        search.fill("项目方案")
        page.wait_for_timeout(2000)
        search.clear()
        page.wait_for_timeout(500)
        search.fill("季度")
        page.wait_for_timeout(2000)
        search.clear()
        page.wait_for_timeout(1000)

    # ────────────── 7. 类型筛选 ──────────────
    print("  [7] 类型筛选")
    sel = page.locator(".el-select").first
    if sel.count() > 0:
        sel.click()
        page.wait_for_timeout(800)
        excel = page.locator(".el-select-dropdown__item").filter(has_text="Excel")
        if excel.count() > 0:
            excel.click()
            page.wait_for_timeout(2000)
        # 清除筛选
        sel.click()
        page.wait_for_timeout(500)
        word = page.locator(".el-select-dropdown__item").filter(has_text="Word")
        if word.count() > 0:
            word.click()
            page.wait_for_timeout(1500)
        # 再次清除
        try:
            page.locator(".el-select .el-tag__close, .el-select .el-icon-close").first.click()
            page.wait_for_timeout(1000)
        except:
            page.keyboard.press("Escape")
            page.wait_for_timeout(500)

    # ────────────── 8. 文件下载 ──────────────
    print("  [8] 文件下载")
    dl = page.locator(".el-table .el-button").filter(has_text="下载")
    if dl.count() > 0:
        try:
            with page.expect_download(timeout=5000) as di:
                dl.first.click()
            page.wait_for_timeout(2000)
        except:
            page.wait_for_timeout(1000)

    # ────────────── 9. 文档预览（OnlyOffice） ──────────────
    print("  [9] 文档预览")
    preview = page.locator(".el-table .el-button").filter(has_text="预览")
    if preview.count() > 0:
        preview.first.click()
        page.wait_for_timeout(3000)

        # 等待 OnlyOffice iframe 加载
        for _ in range(12):
            iframe = page.locator("iframe")
            if iframe.count() > 0:
                break
            page.wait_for_timeout(2000)

        page.wait_for_timeout(5000)

        # ────────────── 10. 编码选择对话框 ──────────────
        print("  [10] 编码选择 + 文档渲染")
        try:
            frame = page.frame_locator("iframe").first
            ok_btn = frame.locator('button:has-text("确定")')
            for _ in range(10):
                if ok_btn.count() > 0:
                    break
                page.wait_for_timeout(2000)

            if ok_btn.count() > 0:
                page.wait_for_timeout(2000)
                ok_btn.click()
                page.wait_for_timeout(8000)

                # 关闭协作者名称弹窗
                try:
                    cancel = frame.locator('button:has-text("取消")')
                    if cancel.count() > 0:
                        cancel.first.click()
                        page.wait_for_timeout(1000)
                except:
                    pass
        except:
            page.wait_for_timeout(3000)

        # ────────────── 11. 文档内容展示 ──────────────
        print("  [11] 文档内容展示")
        page.wait_for_timeout(4000)

        # ────────────── 12. 缩放控制 ──────────────
        print("  [12] 缩放控制")
        zoom = page.locator(".zoom-display")
        if zoom.count() > 0:
            zoom.click()
            page.wait_for_timeout(1000)
            items = page.locator(".el-dropdown-menu__item").all()
            for item in items:
                txt = item.text_content() or ""
                if "150" in txt:
                    item.click()
                    page.wait_for_timeout(2500)
                    break
            else:
                page.keyboard.press("Escape")
                page.wait_for_timeout(500)

        # ────────────── 13. 编辑模式切换 ──────────────
        print("  [13] 编辑模式切换")
        edit = page.locator("button").filter(has_text="编辑")
        if edit.count() > 0:
            edit.first.click()
            page.wait_for_timeout(4000)

            # 切回预览
            view = page.locator("button").filter(has_text="预览")
            if view.count() > 0:
                view.first.click()
                page.wait_for_timeout(3000)

        # ────────────── 14. 缩略图面板 ──────────────
        print("  [14] 缩略图面板")
        tb_btns = page.locator(".toolbar-right button").all()
        for btn in tb_btns:
            try:
                btn.click()
                page.wait_for_timeout(500)
                if page.locator(".thumbnail-sidebar").count() > 0:
                    page.wait_for_timeout(2500)
                    btn.click()
                    page.wait_for_timeout(800)
                    break
            except:
                pass

        # ────────────── 15. 返回文件列表 ──────────────
        print("  [15] 返回文件列表")
        back = page.locator("button").filter(has_text="返回")
        if back.count() > 0:
            back.first.click()
            page.wait_for_timeout(2000)

        # ────────────── 16. 文件删除 ──────────────
        print("  [16] 文件删除")
        delete = page.locator(".el-table .el-button").filter(has_text="删除")
        if delete.count() > 0:
            delete.first.click()
            page.wait_for_timeout(1000)
            confirm = page.locator(".el-message-box").locator("button").filter(has_text="删除")
            if confirm.count() > 0:
                confirm.click()
                page.wait_for_timeout(2000)
            page.keyboard.press("Escape")
            page.wait_for_timeout(1000)

    # ────────────── 17. 用户管理 ──────────────
    print("  [17] 用户管理")
    um = page.locator("text=用户管理")
    if um.count() > 0:
        um.first.click()
        page.wait_for_timeout(2500)

        # 查看用户列表
        page.wait_for_timeout(2000)

        # 添加用户
        print("  [18] 添加用户")
        add = page.locator("text=添加用户")
        if add.count() > 0:
            add.click()
            page.wait_for_timeout(1500)

            inputs = page.locator(".el-dialog").locator("input").all()
            if len(inputs) >= 4:
                inputs[0].fill("wangwu")
                page.wait_for_timeout(400)
                inputs[1].fill("wang123456")
                page.wait_for_timeout(400)
                inputs[2].fill("王五")
                page.wait_for_timeout(400)
                inputs[3].fill("wangwu@example.com")
                page.wait_for_timeout(1000)

            submit = page.locator(".el-dialog").locator("button").filter(has_text="确定")
            if submit.count() > 0:
                submit.click()
                page.wait_for_timeout(2500)

        # 搜索用户
        print("  [19] 搜索用户")
        user_search = page.locator('input[placeholder*="搜索"]')
        if user_search.count() > 0:
            user_search.fill("admin")
            page.wait_for_timeout(2000)
            user_search.clear()
            page.wait_for_timeout(800)
            user_search.fill("王五")
            page.wait_for_timeout(2000)
            user_search.clear()
            page.wait_for_timeout(1000)

        # 删除测试用户（清理）
        print("  [20] 删除测试用户")
        del_btn = page.locator(".el-table .el-button").filter(has_text="删除")
        if del_btn.count() > 0:
            del_btn.first.click()
            page.wait_for_timeout(1000)
            cfm = page.locator(".el-message-box").locator("button").filter(has_text="确定")
            if cfm.count() > 0:
                cfm.click()
                page.wait_for_timeout(2000)
            # 确保对话框遮罩关闭
            page.keyboard.press("Escape")
            page.wait_for_timeout(1000)

    # ────────────── 21. 用户下拉菜单 ──────────────
    print("  [21] 用户下拉菜单")
    page.evaluate('''() => {
        const el = document.querySelector('.user-info');
        if (el) el.click();
    }''')
    page.wait_for_timeout(2500)
    page.keyboard.press("Escape")
    page.wait_for_timeout(800)

    # ────────────── 22. 修改密码弹窗 ──────────────
    print("  [22] 修改密码功能")
    page.evaluate('''() => {
        const el = document.querySelector('.user-info');
        if (el) el.click();
    }''')
    page.wait_for_timeout(800)
    page.evaluate('''() => {
        const items = document.querySelectorAll('.el-dropdown-menu__item');
        for (const it of items) {
            if (it.textContent.includes('修改密码') && it.offsetParent !== null) {
                it.click(); return;
            }
        }
    }''')
    page.wait_for_timeout(1500)
    page.evaluate('''() => {
        const btns = document.querySelectorAll('button');
        for (const b of btns) {
            if (b.textContent.includes('取消') && b.getBoundingClientRect().width > 0 && b.offsetParent !== null) {
                b.click(); return;
            }
        }
    }''')
    page.wait_for_timeout(800)

    # 结尾停留
    page.wait_for_timeout(3000)


# ============================================================
# 主流程
# ============================================================


def main():
    print("=" * 55)
    print("  文档在线预览系统 — 功能演示录制（1080p）")
    print("=" * 55)

    recorded = []

    try:
        f = record_session("01-完整演示", full_demo_session)
        if f:
            recorded.append(f)
    except Exception as e:
        print(f"[失败] {e}")
        sys.exit(1)

    if not recorded:
        print("[失败] 没有录制到视频")
        sys.exit(1)

    # 转码为 MP4（无水印版）
    clean_video = FINAL_VIDEO + ".clean.mp4"
    print(f"\n[转码] -> {clean_video}")
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-i", recorded[0],
            "-c:v", "libx264", "-preset", "medium", "-crf", "23",
            "-pix_fmt", "yuv420p", "-r", "25",
            clean_video,
        ],
        check=True,
        capture_output=True,
    )

    # 生成水印 PNG
    watermark_path = os.path.join(OUTPUT_DIR, "watermark.png")
    print(f"[水印] 生成水印 -> {watermark_path}")
    create_watermark(WIDTH, HEIGHT, {
        "top-left": "程序猿毕设V:Rosee6439",
        "center": "程序猿熙毕设",
        "bottom-right": "程序猿熙毕设",
    }, watermark_path)

    # 叠加水印
    print(f"[水印] 叠加到视频 -> {FINAL_VIDEO}")
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-i", clean_video,
            "-i", watermark_path,
            "-filter_complex", "[0:v][1:v]overlay=0:0",
            "-c:v", "libx264", "-preset", "medium", "-crf", "23",
            "-pix_fmt", "yuv420p",
            FINAL_VIDEO,
        ],
        check=True,
        capture_output=True,
    )

    os.remove(clean_video)

    size_mb = os.path.getsize(FINAL_VIDEO) / (1024 * 1024)
    print(f"[完成] {FINAL_VIDEO} ({size_mb:.1f} MB)")


if __name__ == "__main__":
    main()
