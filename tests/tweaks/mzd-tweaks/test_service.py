"""Runs the MZD Tweaks settings service test under Lua 5.1 with an in-memory files table."""
from pathlib import Path
import shutil, subprocess

ROOT = Path(__file__).resolve().parents[3]


def main():
    lua = shutil.which('lua5.1') or shutil.which('lua')
    if not lua:
        raise SystemExit('Lua 5.1 is required for the MZD Tweaks service test.')
    entry = ROOT / 'usb/tweaks/mzd-tweaks/assets/service/entry.lua'
    subprocess.run([lua, str(Path(__file__).with_name('service.lua')), str(entry)], check=True, timeout=60)


if __name__ == '__main__':
    main()
