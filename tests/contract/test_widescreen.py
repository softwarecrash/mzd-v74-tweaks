"""Widescreen real package on synthetic CMU files."""
from pathlib import Path
import hashlib
import os
import re
import shlex
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
SHELL = 'C:/Program Files/Git/bin/bash.exe' if os.name == 'nt' else '/bin/sh'
ID = 'widescreen'


def bp(p):
    s = Path(p).resolve().as_posix()
    return '/' + s[0].lower() + s[2:] if len(s) > 1 and s[1] == ':' else s


def write(p, s):
    p.parent.mkdir(parents=True, exist_ok=True)
    if p.is_symlink():
        p.unlink()
    p.write_text(s, encoding='utf-8', newline='\n')
    p.chmod(0o755)


def md5(b):
    return hashlib.md5(b).hexdigest()


def fixture(patch, installed=False):
    # Reconstruct only the checked-in hunk contexts, with unique harmless gaps.
    lines = []
    position = 0
    for line in patch.splitlines(keepends=True):
        if line.startswith('@@ '):
            match = re.match(r'@@ -(\d+)', line)
            while len(lines) < int(match.group(1)) - 1:
                lines.append('<!-- contract fixture gap %d -->\n' % len(lines))
            position += 1
        elif position and line[:1] in [' ', '+', '-']:
            if line[:1] == ' ' or line[:1] == ('+' if installed else '-'):
                lines.append(line[1:])
    return ''.join(lines)


checks = 0
with tempfile.TemporaryDirectory(prefix='cmu-widescreen-') as temporary:
    base = Path(temporary)
    usb = base / 'usb'
    internal = base / 'internal'
    persist = base / 'persist'
    bins = base / 'bin'
    mounts = base / 'mounts'
    version = base / 'version'
    gpio = base / 'watchdog'
    lock = base / 'packages.lock'
    for d in [usb, internal, persist, bins, base / 'locks']:
        d.mkdir()

    css_dir = internal / 'jci/gui/common/css'
    font_dir = internal / 'jci/fonts/CHN'
    css_dir.mkdir(parents=True)
    font_dir.mkdir(parents=True)
    index_file = internal / 'jci/gui/index.html'

    shutil.copytree(ROOT / 'usb/lib', usb / 'lib')
    write(
        usb / 'installer.sh',
        (ROOT / 'usb/installer.sh').read_text().replace(
            '#!/bin/sh\n',
            '#!/bin/sh\nPATH=' + shlex.quote(bp(bins) + ':/usr/bin:/bin') + '\nexport PATH\n',
            1,
        ),
    )
    for p in (usb / 'lib').glob('*.sh'):
        s = (
            p.read_text()
            .replace('/tmp/mnt/data_persist', bp(persist))
            .replace('/proc/mounts', bp(mounts))
            .replace('/jci/version.ini', bp(version))
        )
        s = s.replace('MZD_SHIM_ROOT=/', 'MZD_SHIM_ROOT=' + shlex.quote(bp(internal)))
        s = s.replace('/tmp/mzd-packages.lock', bp(lock))
        s = s.replace('/sys/class/gpio/Watchdog\\ Disable/value', shlex.quote(bp(gpio)))
        s = s.replace('LOCK="/tmp/mzd-$LOCK_GROUP-tweak.lock"', 'LOCK="' + bp(base / 'locks') + '/$LOCK_GROUP.lock"')
        write(p, s)

    write(version, 'JCI_SW_VER="MAZ_CMU-150_74.00.324"\n')
    write(gpio, '0\n')
    write(
        mounts,
        f'/dev/root {bp(internal)} relfs ro 0 0\n'
        f'/dev/data {bp(persist)} relfs rw 0 0\n'
        f'/dev/usb {bp(usb)} vfat rw 0 0\n',
    )
    if os.environ.get('CMU_TEST_BUSYBOX'):
        busybox = shutil.which('busybox')
        assert busybox, 'BusyBox requested but missing.'
        for name in [
            'awk', 'patch', 'diff', 'cp', 'cmp', 'md5sum', 'cut', 'readlink',
            'dirname', 'mktemp', 'mkdir', 'rm', 'cat', 'grep', 'chmod', 'mv',
        ]:
            os.symlink(busybox, bins / name)
    write(bins / 'sync', '#!/bin/sh\nexit 0\n')
    write(bins / 'mount', '#!/bin/sh\nexit 0\n')
    env = dict(os.environ, PATH=bp(bins) + ':/usr/bin:/bin')

    folder = usb / 'tweaks' / ID
    shutil.copytree(ROOT / 'usb/tweaks' / ID, folder)

    patch_text = (folder / 'assets/gui-index.patch').read_text(encoding='utf-8')
    stock_index = fixture(patch_text, installed=False)
    mod_index = fixture(patch_text, installed=True)
    write(index_file, stock_index)

    # Verify the shipped patch cleanly transforms stock -> mod_index.
    expected = base / 'expected'
    expected.mkdir()
    write(expected / 'target.data', stock_index)
    r = subprocess.run(
        [SHELL, '-c', 'cd "$1" && patch -p0 -i "$2" < /dev/null', '--', bp(expected), bp(folder / 'assets/gui-index.patch')],
        env=env,
        capture_output=True,
        text=True,
        timeout=15,
    )
    assert r.returncode == 0, (r.stdout, r.stderr)
    assert (expected / 'target.data').read_text(encoding='utf-8') == mod_index

    manifest_text = (
        (folder / 'manifest.conf')
        .read_text(encoding='utf-8')
        .replace('/jci/gui/index.html', bp(index_file))
        .replace('0ad187b787e242953a9a7612f55bfcfb', md5(stock_index.encode('utf-8')))
    )
    write(folder / 'manifest.conf', manifest_text)

    for script_name in ['run.sh', 'reset.sh']:
        script = folder / script_name
        text = (
            script.read_text(encoding='utf-8')
            .replace('GUI_CSS_DIR=/jci/gui/common/css', 'GUI_CSS_DIR=' + shlex.quote(bp(css_dir)))
            .replace('FONT_DIR=/jci/fonts/CHN', 'FONT_DIR=' + shlex.quote(bp(font_dir)))
        )
        write(script, text)

    def call(args, code=0):
        global checks
        command = 'exec /bin/sh ' + ' '.join(shlex.quote(a) for a in [bp(usb / 'installer.sh'), *args])
        r = subprocess.run([SHELL, '-c', command], env=env, capture_output=True, text=True, timeout=150)
        assert r.returncode == code, (args, r.returncode, r.stdout, r.stderr)
        checks += 1
        return r

    def deep(state):
        global checks
        cfg = dict(env, MZD_WORKER_DIRECT='1')
        before = {p.relative_to(usb).as_posix(): md5(p.read_bytes()) for p in usb.rglob('*') if p.is_file()}
        r = subprocess.run(
            [SHELL, '-c', 'exec /bin/sh ' + shlex.quote(bp(folder / 'run.sh')) + ' status'],
            env=cfg,
            capture_output=True,
            text=True,
            timeout=90,
        )
        assert r.returncode == 0 and r.stdout == state + '\n', (r.returncode, r.stdout, r.stderr)
        assert before == {p.relative_to(usb).as_posix(): md5(p.read_bytes()) for p in usb.rglob('*') if p.is_file()}, 'Status wrote to USB'
        checks += 1
        return r

    def run_reset(phase, code=0, extra_env=None):
        global checks
        cfg = dict(env, **(extra_env or {}))
        r = subprocess.run(
            [SHELL, '-c', 'exec /bin/sh ' + shlex.quote(bp(folder / 'reset.sh')) + ' ' + phase],
            env=cfg,
            capture_output=True,
            text=True,
            timeout=90,
        )
        assert r.returncode == code, (phase, r.returncode, r.stdout, r.stderr)
        checks += 1
        return r

    css_target = css_dir / 'widescreen.css'
    font_reg_target = font_dir / 'SairaExtraCondensed-Regular.ttf'
    font_med_target = font_dir / 'SairaExtraCondensed-Medium.ttf'
    css_asset = folder / 'assets/widescreen.css'
    font_reg_asset = folder / 'assets/fonts/SairaExtraCondensed-Regular.ttf'
    font_med_asset = folder / 'assets/fonts/SairaExtraCondensed-Medium.ttf'

    # 1. Uninstalled status & unavailable when target is missing.
    deep('uninstalled')
    index_file.unlink()
    r = deep('unavailable')
    assert r.stderr.strip()
    write(index_file, stock_index)

    # 2. Unknown file at payload path blocks install and reports unavailable/broken.
    write(css_target, 'foreign css\n')
    r = deep('unavailable')
    assert 'Unknown or altered file' in r.stderr
    call(['action', ID, 'install'], 1)
    assert css_target.read_text(encoding='utf-8') == 'foreign css\n'
    assert index_file.read_text(encoding='utf-8') == stock_index
    css_target.unlink()

    # 3. Install succeeds, copies assets, patches index.html, and is idempotent.
    call(['manifest', ID])
    call(['action', ID, 'install'])
    deep('installed')
    assert index_file.read_text(encoding='utf-8') == mod_index
    assert css_target.read_bytes() == css_asset.read_bytes()
    assert font_reg_target.read_bytes() == font_reg_asset.read_bytes()
    assert font_med_target.read_bytes() == font_med_asset.read_bytes()

    call(['action', ID, 'install'])
    deep('installed')

    # 4. Partial removal of a payload file reports broken and blocks uninstall.
    font_med_target.unlink()
    r = deep('broken')
    assert r.stderr.strip()
    call(['action', ID, 'uninstall'], 1)
    write(font_med_target, '')
    font_med_target.write_bytes(font_med_asset.read_bytes())
    deep('installed')

    # 5. Reset hook check & finish remove payload files cleanly.
    run_reset('check', 0)
    reset_dir = base / 'reset_dir'
    reset_dir.mkdir()
    sys_dir = base / 'sys_dir'
    sys_dir.mkdir()
    run_reset('finish', 0, {'ACTION': 'run', 'MZD_RESET_DIR': bp(reset_dir), 'MZD_SYSTEM': bp(sys_dir)})
    assert not css_target.exists() and not font_reg_target.exists() and not font_med_target.exists()
    # Restore payload files + test full uninstall.
    css_target.write_bytes(css_asset.read_bytes())
    font_reg_target.write_bytes(font_reg_asset.read_bytes())
    font_med_target.write_bytes(font_med_asset.read_bytes())
    deep('installed')

    # 6. Uninstall removes payload files, restores stock index.html, and is idempotent.
    call(['action', ID, 'uninstall'])
    deep('uninstalled')
    assert index_file.read_text(encoding='utf-8') == stock_index
    assert not css_target.exists() and not font_reg_target.exists() and not font_med_target.exists()

    call(['action', ID, 'uninstall'])
    deep('uninstalled')

print('Widescreen checks:', checks)
