"""Live smoke test for the document preview app with a local OnlyOffice server."""

import os
import sys
import tempfile
from pathlib import Path

import requests
from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


BASE = os.getenv("APP_BASE_URL", "http://localhost:5173").rstrip("/")
API = os.getenv("APP_API_URL", "http://localhost:3000/api").rstrip("/")
ONLYOFFICE_BASE = os.getenv("ONLYOFFICE_BASE_URL", "http://localhost").rstrip("/")
BACKEND_BASE = os.getenv(
    "APP_INTERNAL_BASE_URL",
    API[:-4] if API.endswith("/api") else API,
).rstrip("/")
SHOTS = Path(os.getenv("APP_SHOT_DIR", str(Path(tempfile.gettempdir()) / "doc-preview-tests")))
SHOTS.mkdir(parents=True, exist_ok=True)

RESULTS = {"passed": 0, "failed": 0, "errors": []}


def ok(name: str, passed: bool, detail: str = "") -> None:
    status = "PASS" if passed else "FAIL"
    print(f"  [{status}] {name}" + (f" - {detail}" if detail else ""))
    RESULTS["passed" if passed else "failed"] += 1
    if not passed:
        RESULTS["errors"].append(f"{name}: {detail}" if detail else name)


def api_login() -> str:
    response = requests.post(
        f"{API}/auth/login",
        json={"username": "admin", "password": "123456"},
        timeout=10,
    )
    response.raise_for_status()
    return response.json()["data"]["token"]


def create_test_file(name: str, content: str) -> str:
    path = Path(tempfile.gettempdir()) / name
    path.write_text(content, encoding="utf-8")
    return str(path)


def create_test_pdf(name: str) -> str:
    path = Path(tempfile.gettempdir()) / name
    pdf = b"""%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 144] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length 49 >>
stream
BT
/F1 18 Tf
36 72 Td
(Live preview smoke test) Tj
ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000241 00000 n 
0000000339 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
409
%%EOF
"""
    path.write_bytes(pdf)
    return str(path)


def ensure_logged_in(page) -> None:
    page.goto(BASE)
    page.wait_for_load_state("networkidle")

    if page.locator(".file-manager").count() > 0:
        return

    auth_card = page.locator(".auth-card")
    if auth_card.count() == 0:
        return

    text_inputs = auth_card.locator('input:not([type="password"])')
    password_inputs = auth_card.locator('input[type="password"]')

    if text_inputs.count() == 0 or password_inputs.count() == 0:
        return

    text_inputs.first.fill("admin")
    password_inputs.first.fill("123456")
    auth_card.locator("button").first.click()
    page.wait_for_timeout(2000)
    page.wait_for_load_state("networkidle")


def test_onlyoffice_health() -> bool:
    print("\n=== CHECK: OnlyOffice Document Server ===")

    try:
        response = requests.get(f"{ONLYOFFICE_BASE}/", timeout=5)
        ok("OnlyOffice HTTP response", response.status_code in (200, 302))
    except Exception as exc:
        ok("OnlyOffice HTTP response", False, str(exc))
        return False

    try:
        response = requests.get(
            f"{ONLYOFFICE_BASE}/web-apps/apps/api/documents/api.js",
            timeout=5,
        )
        ok("OnlyOffice API JS", response.status_code == 200 and len(response.text) > 100)
    except Exception as exc:
        ok("OnlyOffice API JS", False, str(exc))
        return False

    return True


def test_editor_config_api() -> None:
    print("\n=== API: editor config ===")
    token = api_login()

    test_file = create_test_file("api_test.txt", "API smoke test content\n" * 3)
    with open(test_file, "rb") as file_obj:
        upload_response = requests.post(
            f"{API}/upload",
            files={"file": file_obj},
            headers={"Authorization": f"Bearer {token}"},
            timeout=20,
        )
    upload_response.raise_for_status()
    file_id = upload_response.json()["data"]["id"]

    config_response = requests.get(f"{API}/editor/config/{file_id}", timeout=10)
    config_response.raise_for_status()
    payload = config_response.json()["data"]

    ok(
        "Editor apiUrl points to local OnlyOffice",
        payload["apiUrl"].startswith(f"{ONLYOFFICE_BASE}/web-apps/"),
        payload["apiUrl"],
    )
    ok(
        "Document URL points to backend download API",
        payload["config"]["document"]["url"].startswith(f"{BACKEND_BASE}/api/files/"),
        payload["config"]["document"]["url"],
    )
    ok(
        "Callback URL points to backend callback API",
        payload["config"]["editorConfig"]["callbackUrl"].startswith(f"{BACKEND_BASE}/api/callback"),
        payload["config"]["editorConfig"]["callbackUrl"],
    )


def test_ui_preview(page) -> None:
    print("\n=== UI: upload and preview ===")
    ensure_logged_in(page)

    upload_input = page.locator('input[type="file"]').first
    if upload_input.count() == 0:
        ok("Upload input exists", False)
        return

    test_file = create_test_pdf("live_preview_test.pdf")
    upload_input.set_input_files(test_file)
    page.wait_for_timeout(3000)
    page.wait_for_load_state("networkidle")

    preview_buttons = page.locator(".el-table .el-button")
    if preview_buttons.count() == 0:
        ok("Preview button exists", False)
        return

    preview_buttons.first.click()
    page.wait_for_timeout(5000)

    deadline = 20
    loaded = False
    for _ in range(deadline):
        editor_container = page.locator("#onlyoffice-editor")
        iframe_count = page.locator("iframe").count()
        if iframe_count > 0:
            loaded = True
            break
        if editor_container.count() == 0:
            if page.locator("text=Collaboration").count() > 0:
                loaded = True
                break
        else:
            editor_html_length = editor_container.evaluate("(el) => el.innerHTML.trim().length")
            if iframe_count > 0 or editor_html_length > 0:
                loaded = True
                break
        page.wait_for_timeout(1000)

    if loaded:
        page.screenshot(path=str(SHOTS / "live_preview_loaded.png"), full_page=True)
        ok("OnlyOffice preview loads", True)
    else:
        page.screenshot(path=str(SHOTS / "live_preview_error.png"), full_page=True)
        ok("OnlyOffice preview loads", False, "editor container stayed empty for 20s")
        return

    toolbar_buttons = page.locator(".toolbar-right .el-button")
    if toolbar_buttons.count() > 0:
        toolbar_buttons.first.click()
        page.wait_for_timeout(5000)
        ok("Edit toggle is clickable", True)
    else:
        ok("Edit toggle exists", False)


def main() -> int:
    print("=" * 60)
    print("  Document preview live smoke test")
    print("=" * 60)

    test_onlyoffice_health()
    test_editor_config_api()

    with sync_playwright() as playwright:
        edge_path = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
        if os.path.exists(edge_path):
            browser = playwright.chromium.launch(
                channel="msedge",
                headless=True,
            )
        else:
            browser = playwright.chromium.launch(headless=True)
        context = browser.new_context(
            viewport={"width": 1280, "height": 800},
            locale="zh-CN",
            accept_downloads=True,
        )
        page = context.new_page()
        try:
            test_ui_preview(page)
        except Exception as exc:
            page.screenshot(path=str(SHOTS / "unexpected_error.png"), full_page=True)
            ok("UI preview smoke test", False, str(exc))
        finally:
            browser.close()

    print("\n" + "=" * 60)
    total = RESULTS["passed"] + RESULTS["failed"]
    print(f"  Finished: {RESULTS['passed']}/{total} passed, {RESULTS['failed']} failed")
    print("=" * 60)

    if RESULTS["errors"]:
        print("\nFailures:")
        for error in RESULTS["errors"]:
            print(f"  - {error}")

    return 0 if RESULTS["failed"] == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
