import json
import os
import re
import struct

PERMISSION_USAGE_PATTERNS = {
    "sidePanel": [r"chrome\.sidePanel\b"],
    "storage": [r"chrome\.storage\b"],
    "tabs": [r"chrome\.tabs\.(?:query|get|update|create)\b"],
    "alarms": [r"chrome\.alarms\b"],
    "notifications": [r"chrome\.notifications\b"],
    "contextMenus": [r"chrome\.contextMenus\b"],
}

INLINE_HTML_HANDLER_IN_JS_RE = re.compile(
    r"""<[^>\n]+\bon(?:click|dblclick|change|input|submit|load|error|keydown|keyup|keypress|mousedown|mouseup|mouseover|focus|blur)\s*=\s*["']""",
    re.IGNORECASE,
)

EXTERNAL_FONT_RE = re.compile(r"fonts\.googleapis\.com|fonts\.gstatic\.com", re.IGNORECASE)


def verify():
    errors = []
    successes = []

    # 1. Verify manifest.json
    manifest_path = "manifest.json"
    if not os.path.exists(manifest_path):
        errors.append("manifest.json does not exist.")
        return errors, successes

    with open(manifest_path, "r", encoding="utf-8") as f:
        try:
            manifest = json.load(f)
            successes.append("manifest.json is valid JSON.")
        except Exception as e:
            errors.append(f"manifest.json JSON parse error: {e}")
            return errors, successes

    if manifest.get("manifest_version") != 3:
        errors.append(f"manifest_version is {manifest.get('manifest_version')}, expected 3.")
    else:
        successes.append("manifest_version is 3.")

    # 2. Check Action and Side Panel
    action = manifest.get("action")
    if action is None:
        errors.append("manifest.json is missing 'action' key (required for chrome.action.* APIs).")
    elif "default_popup" in action:
        errors.append("action defines default_popup, which prevents openPanelOnActionClick from triggering!")
    else:
        successes.append("action is present with no default_popup (valid for sidePanel & badge APIs).")

    sp_path = manifest.get("side_panel", {}).get("default_path")
    if not sp_path or not os.path.exists(sp_path):
        errors.append(f"side_panel.default_path '{sp_path}' not found.")
    else:
        successes.append(f"side_panel.default_path '{sp_path}' exists.")

    sw_path = manifest.get("background", {}).get("service_worker")
    if not sw_path or not os.path.exists(sw_path):
        errors.append(f"service_worker '{sw_path}' not found.")
    else:
        successes.append(f"service_worker '{sw_path}' exists.")

    # 3. Check Icons
    icons = manifest.get("icons", {})
    for size_str, path in icons.items():
        if not os.path.exists(path):
            errors.append(f"Icon {size_str} file '{path}' does not exist!")
            continue
        try:
            with open(path, "rb") as f:
                header = f.read(24)
                if header[:8] != b"\x89PNG\r\n\x1a\n":
                    errors.append(f"Icon '{path}' is not a valid PNG.")
                else:
                    w, h = struct.unpack(">II", header[16:24])
                    expected = int(size_str)
                    if w != expected or h != expected:
                        errors.append(f"Icon '{path}' dimension mismatch: got {w}x{h}, expected {expected}x{expected}.")
                    else:
                        successes.append(f"Icon {size_str}x{size_str} verified: '{path}'")
        except Exception as e:
            errors.append(f"Error reading icon '{path}': {e}")

    # 4. Check HTML files (CSP, inline handlers, external fonts, local asset refs)
    html_files = sorted(f for f in os.listdir(".") if f.endswith(".html"))
    for hf in html_files:
        with open(hf, "r", encoding="utf-8") as f:
            content = f.read()

        inline_scripts = re.findall(r"<script(?![^>]*src=)[^>]*>(.*?)</script>", content, re.DOTALL | re.IGNORECASE)
        non_empty_inline = [s for s in inline_scripts if s.strip()]
        if non_empty_inline:
            errors.append(f"HTML file '{hf}' contains inline <script> tags! Violates MV3 CSP.")
        else:
            successes.append(f"HTML file '{hf}' has no inline <script> tags.")

        inline_handlers = re.findall(r"\bon[a-z]+\s*=", content, re.IGNORECASE)
        if inline_handlers:
            errors.append(f"HTML file '{hf}' contains inline event handlers: {inline_handlers[:3]}")
        else:
            successes.append(f"HTML file '{hf}' has no inline event handlers.")

        if EXTERNAL_FONT_RE.search(content):
            errors.append(f"HTML file '{hf}' references external Google Fonts (breaks offline privacy promise).")
        else:
            successes.append(f"HTML file '{hf}' has zero external Google Fonts links.")

        for src in re.findall(r'<script[^>]+src=["\']([^"\']+)["\']', content, re.IGNORECASE):
            if src.startswith(("http://", "https://", "chrome-extension://")):
                errors.append(f"HTML file '{hf}' loads remote script '{src}' (violates MV3 CSP).")
            elif not os.path.exists(src):
                errors.append(f"HTML file '{hf}' references missing script '{src}'.")
            else:
                successes.append(f"HTML file '{hf}' script exists: '{src}'")

        for href in re.findall(r'<link[^>]+rel=["\']stylesheet["\'][^>]+href=["\']([^"\']+)["\']', content, re.IGNORECASE):
            if not href.startswith(("http://", "https://")) and not os.path.exists(href):
                errors.append(f"HTML file '{hf}' references missing stylesheet '{href}'.")

    # 5. Check CSS files for external Google Fonts @import
    css_files = sorted(f for f in os.listdir(".") if f.endswith(".css"))
    for cf in css_files:
        with open(cf, "r", encoding="utf-8") as f:
            css_content = f.read()
        if EXTERNAL_FONT_RE.search(css_content):
            errors.append(f"CSS file '{cf}' imports external Google Fonts.")
        else:
            successes.append(f"CSS file '{cf}' has zero external Google Fonts imports.")

    # 6. Check JS files for injected inline HTML handlers, eval/new Function, and permission usage
    js_files = sorted(f for f in os.listdir(".") if f.endswith(".js"))
    all_js_text = []
    for jf in js_files:
        with open(jf, "r", encoding="utf-8") as f:
            js_content = f.read()
        all_js_text.append(js_content)

        injected_handlers = INLINE_HTML_HANDLER_IN_JS_RE.findall(js_content)
        if injected_handlers:
            errors.append(f"JS file '{jf}' injects inline HTML event handler(s): {injected_handlers[:2]}")
        else:
            successes.append(f"JS file '{jf}' injects zero inline HTML event handlers.")

        if re.search(r"\beval\s*\(|\bnew\s+Function\s*\(", js_content):
            errors.append(f"JS file '{jf}' uses eval() or new Function() (violates MV3 CSP).")

    combined_js = "\n".join(all_js_text)
    declared_perms = manifest.get("permissions", [])
    for perm in declared_perms:
        patterns = PERMISSION_USAGE_PATTERNS.get(perm)
        if not patterns:
            continue
        if any(re.search(pat, combined_js) for pat in patterns):
            successes.append(f"Declared permission '{perm}' is actively used in JS.")
        else:
            errors.append(f"Declared permission '{perm}' appears unused in JS.")

    # 7. Check background.js MV3 service worker wiring
    if os.path.exists("background.js"):
        with open("background.js", "r", encoding="utf-8") as f:
            bg_code = f.read()

        if "openPanelOnActionIconClick" in bg_code:
            errors.append("background.js uses invalid 'openPanelOnActionIconClick' (must be 'openPanelOnActionClick').")
        elif "openPanelOnActionClick" in bg_code:
            successes.append("background.js correctly uses 'openPanelOnActionClick'.")
        else:
            errors.append("background.js does not configure openPanelOnActionClick.")

        for api_name, pat in [
            ("chrome.alarms", r"chrome\.alarms\.(?:create|onAlarm)"),
            ("chrome.notifications", r"chrome\.notifications\.create"),
            ("chrome.contextMenus", r"chrome\.contextMenus\.create"),
            ("chrome.runtime.onMessage (async return true)", r"return\s+true\s*;"),
        ]:
            if re.search(pat, bg_code):
                successes.append(f"background.js wires {api_name}.")
            else:
                errors.append(f"background.js is missing {api_name}.")

    return errors, successes


if __name__ == "__main__":
    errs, succs = verify()
    print("=== SUCCESSES ===")
    for s in succs:
        print(f"  [OK] {s}")
    if errs:
        print("\n=== ERRORS ===")
        for e in errs:
            print(f"  [FAIL] {e}")
        exit(1)
    else:
        print("\nALL 100% VERIFIED! Manifest V3 Extension Ready.")
