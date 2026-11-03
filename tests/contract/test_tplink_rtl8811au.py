"""TP-Link Archer T2U RTL8811AU Driver real package on synthetic CMU files; the driver is never loaded."""
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
TWEAK = ROOT / 'usb/tweaks/tplink-rtl8811au'


def bp(p):
    s = Path(p).resolve().as_posix()
    return '/' + s[0].lower() + s[2:] if len(s) > 1 and s[1] == ':' else s


def write(p, s):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(s, encoding='utf-8', newline='\n')
    p.chmod(0o755)


def md5(b):
    return hashlib.md5(b).hexdigest()


def fixture(patch, installed=False):
    # Only the checked-in hunk context, with unique harmless gaps before it.
    lines = []
    position = 0
    for line in patch.splitlines(keepends=True):
        if line.startswith('@@ '):
            match = re.match(r'@@ -(\d+)', line)
            while len(lines) < int(match.group(1)) - 1:
                lines.append('<gap%d/>\n' % len(lines))
            position += 1
        elif position and line[:1] in [' ', '+', '-']:
            if line[:1] == ' ' or line[:1] == ('+' if installed else '-'):
                lines.append(line[1:])
    return ''.join(lines)


# Unchanged files of the cmu150-rtl8811au v1.0.0 release archive.
for name, digest in {
    'assets/rtl8812au.ko': '24bb1c986eb36c83d0fd590aea84ee87a7efeb64114fc38a9b328c503934d55c',
    'assets/load-wlan1.sh': 'b63fe1eda2b70891ebb5c6b49c8f7defb97b4d081d9447aa2a01dccd31d065aa',
    'assets/dongle.conf': 'b5c884b4bb2fdc8c5b941dcbe5b3294bb0a375d1a8256442ae5d9ff4ac7cfba6',
    'LICENSE': '6d66dec8f6c253a1af2ffd858167c722b1ce3218215446172c81355d0a49e7fc',
}.items():
    assert hashlib.sha256((TWEAK / name).read_bytes()).hexdigest() == digest, name

checks = 0
with tempfile.TemporaryDirectory(prefix='cmu-tplink-rtl8811au-') as temporary:
    base = Path(temporary)
    usb = base / 'usb'; internal = base / 'internal'; persist = base / 'persist'
    bins = base / 'bin'; mounts = base / 'mounts'; version = base / 'version'
    gpio = base / 'watchdog'; lock = base / 'packages.lock'; devices = base / 'usb-devices'
    for d in [usb, internal, persist, bins, devices, base / 'locks']:
        d.mkdir()
    store = persist / 'mzd-tweaks/installed'
    config = internal / 'sm.conf'; second = internal / 'sm_WCP.conf'
    patch_std = (TWEAK / 'assets/sm.conf.patch').read_text(encoding='utf-8')
    patch_wcp = (TWEAK / 'assets/sm_WCP.conf.patch').read_text(encoding='utf-8')
    stock_std = fixture(patch_std); stock_wcp = fixture(patch_wcp)
    installed_std = fixture(patch_std, True); installed_wcp = fixture(patch_wcp, True)
    assert stock_std != stock_wcp, 'The two manifests need distinct fingerprints.'
    write(config, stock_std); write(second, stock_wcp)
    cfg80211 = internal / 'cfg80211.ko'
    write(cfg80211, 'synthetic cfg80211 module\n')

    shutil.copytree(ROOT / 'usb/lib', usb / 'lib')
    write(usb / 'installer.sh', (ROOT / 'usb/installer.sh').read_text().replace('#!/bin/sh\n', '#!/bin/sh\nPATH=' + shlex.quote(bp(bins) + ':/usr/bin:/bin') + '\nexport PATH\n', 1))
    for p in (usb / 'lib').glob('*.sh'):
        s = p.read_text().replace('/tmp/mnt/data_persist', bp(persist)).replace('/proc/mounts', bp(mounts)).replace('/jci/version.ini', bp(version))
        s = s.replace('MZD_SHIM_ROOT=/', 'MZD_SHIM_ROOT=' + shlex.quote(bp(internal)))
        s = s.replace('/tmp/mzd-packages.lock', bp(lock))
        s = s.replace('/sys/class/gpio/Watchdog\\ Disable/value', shlex.quote(bp(gpio)))
        s = s.replace('LOCK="/tmp/mzd-$LOCK_GROUP-tweak.lock"', 'LOCK="' + bp(base / 'locks') + '/$LOCK_GROUP.lock"')
        write(p, s)
    write(version, 'JCI_SW_VER="MAZ_CMU-150_74.00.324"\n'); write(gpio, '0\n')
    write(mounts, f'/dev/root {bp(internal)} relfs ro 0 0\n/dev/data {bp(persist)} relfs rw 0 0\n/dev/usb {bp(usb)} vfat rw 0 0\n')
    if os.environ.get('CMU_TEST_BUSYBOX'):
        busybox = shutil.which('busybox')
        assert busybox, 'BusyBox requested but missing.'
        for name in ['awk', 'patch', 'diff', 'cp', 'cmp', 'md5sum', 'cut', 'readlink', 'dirname',
                     'mktemp', 'mkdir', 'rm', 'cat', 'grep', 'od', 'dd']:
            os.symlink(busybox, bins / name)
    write(bins / 'sync', '#!/bin/sh\nexit 0\n')
    write(bins / 'df', '#!/bin/sh\nprintf "Filesystem 1024-blocks Used Available Capacity Mounted\\nfixture 1000000 1 900000 1%% internal\\n"\n')
    write(bins / 'mount', '#!/bin/sh\nexit 0\n')
    # Loading the driver is the boot service's job, never the installer's.
    for name in ['insmod', 'rmmod', 'modprobe', 'reboot']:
        write(bins / name, '#!/bin/sh\nexit 90\n')
    env = dict(os.environ, PATH=bp(bins) + ':/usr/bin:/bin')

    folder = usb / 'tweaks/tplink-rtl8811au'
    shutil.copytree(TWEAK, folder)
    payload_dir = persist / 'wl'
    m = (folder / 'manifest.conf').read_text()
    m = m.replace('/jci/sm/sm.conf', bp(config)).replace('74d9fc389b74fb01d0cfc2615a82c782', md5(stock_std.encode()))
    m = m.replace('/tmp/mnt/data_persist/wl', bp(payload_dir))
    write(folder / 'manifest.conf', m)
    table = (folder / 'components.tsv').read_text()
    for old, new in {
        '/jci/sm/sm_WCP.conf': bp(second), '/jci/sm/sm.conf': bp(config),
        '74d9fc389b74fb01d0cfc2615a82c782': md5(stock_std.encode()),
        '030e918f5d6edcd62d196ee37b86fe99': md5(stock_wcp.encode()),
        '/tmp/mnt/data_persist': bp(persist),
        '/lib/modules/3.0.35/kernel/net/wireless/cfg80211.ko': bp(cfg80211),
        '7fc7fe6f63774b82465318ee86fd6542': md5(cfg80211.read_bytes()),
    }.items():
        table = table.replace(old, new)
    write(folder / 'components.tsv', table)
    worker = (folder / 'run.sh').read_text()
    assert 'USB_DEVICES=/sys/bus/usb/devices\n' in worker
    write(folder / 'run.sh', worker.replace('USB_DEVICES=/sys/bus/usb/devices\n', 'USB_DEVICES=' + shlex.quote(bp(devices)) + '\n'))

    def call(args, code=0):
        global checks
        command = 'exec /bin/sh ' + ' '.join(shlex.quote(a) for a in [bp(usb / 'installer.sh'), *args])
        r = subprocess.run([SHELL, '-c', command], env=env, capture_output=True, text=True, timeout=150)
        assert r.returncode == code, (args, r.returncode, r.stdout, r.stderr)
        checks += 1
        return r

    def deep(worker, settings, state):
        global checks
        cfg = dict(env, MZD_WORKER_DIRECT='1', MZD_SETTINGS_FILE=bp(settings))
        before = {p.relative_to(usb).as_posix(): md5(p.read_bytes()) for p in usb.rglob('*') if p.is_file()}
        r = subprocess.run([SHELL, '-c', 'exec /bin/sh ' + shlex.quote(bp(worker)) + ' status'], env=cfg, capture_output=True, text=True, timeout=90)
        assert r.returncode == 0 and r.stdout == state + '\n', (r.returncode, r.stdout, r.stderr)
        assert before == {p.relative_to(usb).as_posix(): md5(p.read_bytes()) for p in usb.rglob('*') if p.is_file()}, 'Status wrote to USB'
        checks += 1
        return r

    def unchanged():
        global checks
        assert config.read_text() == stock_std and second.read_text() == stock_wcp
        assert not payload_dir.exists() and not (internal / 'sm.conf.org').exists()
        checks += 1

    settings = base / 'settings.conf'; write(settings, '')
    r = call(['statuses', 'tplink-rtl8811au'])
    assert 'tplink-rtl8811au\tuninstalled\t\n' in r.stdout
    deep(folder / 'run.sh', settings, 'uninstalled')
    config.unlink(); r = deep(folder / 'run.sh', settings, 'unavailable'); assert 'Missing target' in r.stderr
    write(config, stock_std)
    call(['manifest', 'tplink-rtl8811au'])

    # The adapter is reported, never required.
    r = call(['preflight-info', 'tplink-rtl8811au']); assert r.stdout.startswith('info\tNo supported adapter')
    write(devices / '1-1.3/idVendor', '2357\n'); write(devices / '1-1.3/idProduct', '011f\n')
    r = call(['preflight-info', 'tplink-rtl8811au']); assert r.stdout == 'info\tA supported TP-Link Archer T2U adapter is connected.\n'

    # A boot entry added by hand from the driver's install guide blocks installation,
    # even when it is the very block this package adds: it is not registered as ours.
    block = ''.join(line[1:] + '\n' for line in patch_wcp.splitlines() if line.startswith('+') and not line.startswith('+++'))
    manual = stock_wcp.replace('<gap3/>\n', block, 1)
    write(second, manual)
    r = call(['preflight-info', 'tplink-rtl8811au'], 1); assert 'already in ' + bp(second) in r.stdout
    call(['action', 'tplink-rtl8811au', 'install'], 1)
    assert second.read_text() == manual and config.read_text() == stock_std and not payload_dir.exists()
    write(second, stock_wcp)
    # So do driver files installed by hand.
    write(payload_dir / 'rtl8812au.ko', 'manual copy\n'); write(payload_dir / 'dongle.conf.new', 'manual copy\n')
    r = call(['preflight-info', 'tplink-rtl8811au'], 1); assert bp(payload_dir) + ' already exists' in r.stdout
    call(['action', 'tplink-rtl8811au', 'install'], 1)
    assert (payload_dir / 'rtl8812au.ko').read_text() == 'manual copy\n'
    shutil.rmtree(payload_dir); unchanged()
    # A cfg80211 other than the one the driver was built against.
    original_module = cfg80211.read_bytes(); cfg80211.write_bytes(b'other cfg80211 build\n')
    r = call(['action', 'tplink-rtl8811au', 'install'], 1); assert 'Unsupported native module' in r.stdout + r.stderr
    unchanged(); cfg80211.write_bytes(original_module)

    # Install with an unrelated edit already in sm.conf (another tweak's change).
    edited = stock_std.replace('<gap5/>\n', '<unrelated-edit/>\n', 1)
    write(internal / 'sm.conf.org', stock_std); write(config, edited)
    call(['action', 'tplink-rtl8811au', 'install'])
    assert config.read_text() == installed_std.replace('<gap5/>\n', '<unrelated-edit/>\n', 1)
    assert second.read_text() == installed_wcp and (internal / 'sm_WCP.conf.org').read_text() == stock_wcp
    for text in [config.read_text(), second.read_text()]:
        assert text.count('name="load_wlan1"') == 1 and 'path="/data_persist/wl/load-wlan1.sh"' in text
    assert sorted(p.name for p in payload_dir.iterdir()) == ['dongle.conf', 'load-wlan1.sh', 'rtl8812au.ko']
    for name in ['rtl8812au.ko', 'load-wlan1.sh', 'dongle.conf']:
        assert (payload_dir / name).read_bytes() == (TWEAK / 'assets' / name).read_bytes()
    # The boot service runs the loader directly, so it must be executable; the rest is not.
    modes = {name: (payload_dir / name).stat().st_mode & 0o777 for name in ['rtl8812au.ko', 'load-wlan1.sh', 'dongle.conf']}
    assert modes == {'rtl8812au.ko': 0o644, 'load-wlan1.sh': 0o755, 'dongle.conf': 0o644}, modes
    call(['action', 'tplink-rtl8811au', 'install'])  # already installed: no change
    assert config.read_text().count('name="load_wlan1"') == 1
    r = call(['statuses', 'tplink-rtl8811au']); assert 'tplink-rtl8811au\tinstalled\t\n' in r.stdout
    saved = store / 'tplink-rtl8811au/package'
    saved_settings = saved / 'settings.conf'
    if not saved_settings.exists():
        saved_settings = settings
    deep(saved / 'tweaks/tplink-rtl8811au/run.sh', saved_settings, 'installed')
    # An upgrade validates the new USB version while this one is installed: own entry, no block.
    r = call(['preflight-info', 'tplink-rtl8811au']); assert 'block' not in r.stdout
    module = payload_dir / 'rtl8812au.ko'; original_ko = module.read_bytes(); module.write_bytes(b'corrupted payload')
    r = deep(saved / 'tweaks/tplink-rtl8811au/run.sh', saved_settings, 'broken'); assert 'payload differs' in r.stderr
    module.write_bytes(original_ko)
    loader = payload_dir / 'load-wlan1.sh'; loader.chmod(0o644)
    r = deep(saved / 'tweaks/tplink-rtl8811au/run.sh', saved_settings, 'broken'); assert 'not executable' in r.stderr
    loader.chmod(0o755)

    # Saved removal works with a changed cfg80211 and a broken newer USB copy.
    cfg80211.write_bytes(b'changed after install\n')
    (folder / 'assets/rtl8812au.ko').write_bytes(b'new invalid USB version')
    call(['action', 'tplink-rtl8811au', 'uninstall'])
    assert config.read_text() == edited and second.read_text() == stock_wcp and not payload_dir.exists()
    assert not lock.exists() and gpio.read_text() == '0\n'
    print('TPLINK_RTL8811AU_PASSED:', checks, 'real package checks; release asset pins, adapter info, hand-installed driver and cfg80211 refusal, unrelated sm.conf edits preserved, executable loader mode, exact saved uninstall.')
