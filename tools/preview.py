#!/usr/bin/env python3
"""Offline browser preview of the MZD USB Installer UI.

Cross-platform equivalent of tools/preview.ps1 for Linux, WSL2, macOS, and Windows.
Embeds the real UI and manifests in a disposable, offline browser preview.
"""

import argparse
import json
import os
import pathlib
import platform
import subprocess
import sys
import tempfile
import webbrowser


def parse_args():
    parser = argparse.ArgumentParser(description="MZD Installer UI Preview")
    parser.add_argument("--no-open", action="store_true", help="Do not open browser automatically")
    parser.add_argument("--load-delay", type=float, default=5.0, help="Minimum tweak loading delay in seconds for preview (default: 5.0)")
    parser.add_argument("--messages", action="store_true", help="Show example tweak with info and error messages")
    parser.add_argument("--settings", action="store_true", help="Show settings tweak demo")
    parser.add_argument("--restore", action="store_true", help="Show recovery demo")
    parser.add_argument("--restore-denied", action="store_true", help="Show recovery denied demo")
    parser.add_argument("--broken-uninstall", action="store_true", help="Show broken uninstall demo")
    parser.add_argument("--contributors", action="store_true", help="Show tweak contributors")
    parser.add_argument("--out", type=pathlib.Path, help="Custom output path for preview HTML")
    return parser.parse_args()


def is_wsl():
    if "WSL_DISTRO_NAME" in os.environ:
        return True
    try:
        return "microsoft" in pathlib.Path("/proc/version").read_text(encoding="utf-8").lower()
    except Exception:
        return False


def open_in_browser(html_path):
    if is_wsl():
        # Try opening via Windows default browser in WSL
        try:
            win_path = subprocess.check_output(
                ["wslpath", "-w", str(html_path)], stderr=subprocess.DEVNULL, text=True
            ).strip()
            # Try powershell Start-Process or explorer.exe
            subprocess.run(
                ["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", f"Start-Process '{win_path}'"],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )
            return
        except Exception:
            pass

    try:
        webbrowser.open(html_path.resolve().as_uri())
    except Exception as e:
        print(f"Could not automatically launch browser: {e}", file=sys.stderr)


def main():
    args = parse_args()
    scenarios = [args.settings, args.restore, args.restore_denied, args.broken_uninstall, args.messages]
    if sum(bool(s) for s in scenarios) > 1:
        sys.exit("Error: Choose one preview scenario.")

    repo = pathlib.Path(__file__).resolve().parent.parent
    ui = repo / "usb" / "ui"

    manifests = {}
    tweaks_dir = repo / "usb" / "tweaks"
    if tweaks_dir.is_dir():
        for tweak in sorted(tweaks_dir.iterdir()):
            manifest = tweak / "manifest.conf"
            if manifest.is_file():
                manifests[tweak.name] = manifest.read_text(encoding="utf-8")

    bundle_example = repo / "development" / "examples" / "bundle" / "manifest.conf"
    if bundle_example.is_file():
        manifests["bundle-example"] = bundle_example.read_text(encoding="utf-8")

    patch_example = repo / "development" / "examples" / "patch" / "manifest.conf"
    if patch_example.is_file():
        patch_text = patch_example.read_text(encoding="utf-8")
        manifests["patch-example"] = patch_text
        manifests["patch-example-two"] = (
            patch_text.replace("id=patch-example", "id=patch-example-two")
            .replace("name=Patch Example", "name=Second Patch Example")
        )

    settings_example = repo / "development" / "examples" / "settings" / "manifest.conf"
    if settings_example.is_file():
        settings_text = settings_example.read_text(encoding="utf-8")
        if args.contributors:
            settings_text += "\ncontributors=Original author: Example Author; installer integration: Another Developer\n"
            args.settings = True
        manifests["settings-example"] = settings_text

    manifest_json = json.dumps(manifests, separators=(",", ":")).replace("<", "\\u003c")
    html = (ui / "index-template.html").read_text(encoding="utf-8")
    css = (ui / "style.css").read_text(encoding="utf-8")
    app = (ui / "app.js").read_text(encoding="utf-8")
    mock = (repo / "tools" / "preview-bridge.js").read_text(encoding="utf-8")
    nav = (repo / "tools" / "preview-navigation.js").read_text(encoding="utf-8")

    version_file = repo / "usb" / "VERSION"
    version = version_file.read_text(encoding="utf-8").strip() if version_file.is_file() else "1.0.0"

    html = html.replace('<link rel="stylesheet" href="style.css">', f"<style>{css}</style>")
    html = html.replace("@INSTALLER_VERSION@", version)
    html = html.replace("@ORIGIN@", "preview").replace("@TOKEN@", "preview")

    broken_demo = "true" if args.broken_uninstall else "false"
    settings_demo = "true" if args.settings else "false"
    recovery_denied_demo = "true" if args.restore_denied else "false"
    recovery_demo = "true" if (args.restore or args.restore_denied) else "false"
    messages_demo = "true" if args.messages else "false"

    init_script = (
        f"<script>"
        f"window.previewManifests={manifest_json};"
        f"window.previewLoadDelay={max(0.0, args.load_delay)};"
        f"window.previewSettingsDemo={settings_demo};"
        f"window.previewBrokenUninstallDemo={broken_demo};"
        f"window.previewRecoveryDemo={recovery_demo};"
        f"window.previewRecoveryDeniedDemo={recovery_denied_demo};"
        f"window.previewMessagesDemo={messages_demo};"
        f"</script>"
        f"<script>{mock}</script>"
    )
    html = html.replace(
        '<script>window.installerConfig = {origin:"preview",token:"preview"};</script>',
        f'<script>window.installerConfig = {{origin:"preview",token:"preview"}};</script>{init_script}'
    )

    injection = (
        f"<script>{nav}</script>"
        f"<script>{app}</script>"
    )
    html = html.replace('<script src="app.js"></script>', injection)
    html = html.replace("<title>MZD Tweaks</title>", "<title>MZD Tweaks - OFFLINE PREVIEW</title>")

    out_path = args.out or pathlib.Path(tempfile.gettempdir()) / "cmu-tweaks-preview.html"
    out_path.write_text(html, encoding="utf-8")
    print(f"Preview generated: {out_path.resolve()}")

    if not args.no_open:
        open_in_browser(out_path)


if __name__ == "__main__":
    main()
