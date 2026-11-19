import json
import os
import re
import struct

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
    action = manifest.get("action", {})
    if "default_popup" in action:
        errors.append("action defines default_popup, which prevents openPanelOnActionClick from triggering!")
    else:
        successes.append("action has no default_popup (valid for sidePanel trigger).")

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
                if header[:8] != b'\x89PNG\r\n\x1a\n':
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

    # 4. Check HTML for inline scripts / event handlers
    html_files = [f for f in os.listdir(".") if f.endswith(".html")]
    for hf in html_files:
        with open(hf, "r", encoding="utf-8") as f:
            content = f.read()

        # Check for inline script tags: <script>...</script> without src
        inline_scripts = re.findall(r'<script(?![^>]*src=)[^>]*>(.*?)</script>', content, re.DOTALL | re.IGNORECASE)
        # Filter out purely empty or whitespace scripts
        non_empty_inline = [s for s in inline_scripts if s.strip()]
        if non_empty_inline:
            errors.append(f"HTML file '{hf}' contains inline <script> tags! Violates MV3 CSP.")
        else:
            successes.append(f"HTML file '{hf}' has no inline <script> tags.")

        # Check for inline event handlers (onclick=, onload=, etc.)
        inline_handlers = re.findall(r'\bon[a-z]+\s*=', content, re.IGNORECASE)
        if inline_handlers:
            errors.append(f"HTML file '{hf}' contains inline event handlers: {inline_handlers[:3]}")
        else:
            successes.append(f"HTML file '{hf}' has no inline event handlers.")

    # 5. Check background.js API calls
    if os.path.exists("background.js"):
        with open("background.js", "r", encoding="utf-8") as f:
            bg_code = f.read()
        if "openPanelOnActionIconClick" in bg_code:
            errors.append("background.js uses invalid 'openPanelOnActionIconClick' (must be 'openPanelOnActionClick').")
        elif "openPanelOnActionClick" in bg_code:
            successes.append("background.js correctly uses 'openPanelOnActionClick'.")

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
