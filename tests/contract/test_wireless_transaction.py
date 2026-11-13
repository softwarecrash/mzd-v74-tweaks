"""Prepared wireless bundle on synthetic files; never starts AP/native code."""
from pathlib import Path
import hashlib
import argparse
import os
import re
import shlex
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
CANDIDATE = ROOT / 'development/candidates/android-auto-wireless'
ID = 'android-auto-wireless'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--driver-source', type=Path, help='Optional TP-Link tweak source for mixed-package lifecycle checks')
DRIVER = parser.parse_args().driver_source
if DRIVER:
    assert (DRIVER / 'manifest.conf').is_file()

def write(p, value):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(value, encoding='utf-8', newline='\n')
    p.chmod(0o755)

def md5(value):
    return hashlib.md5(value).hexdigest()

def fixture(patch, extra=None):
    lines = []
    active = False
    for line in patch.splitlines(keepends=True):
        if line.startswith('@@ '):
            number = int(re.match(r'@@ -(\d+)', line).group(1))
            while len(lines) < number - 1:
                lines.append('<fixture/>\n')
            active = True
        elif active and line[:1] in (' ', '-'):
            lines.append(line[1:])
    if extra:
        position = None
        for line in extra.splitlines(keepends=True):
            if line.startswith('@@ '):
                position = int(re.match(r'@@ -(\d+)', line).group(1)) - 1
            elif position is not None and line[:1] in (' ', '-'):
                while len(lines) <= position:
                    lines.append('<fixture/>\n')
                assert lines[position] in ('<fixture/>\n', line[1:]), 'Conflicting fixture context'
                lines[position] = line[1:]
                position += 1
    return ''.join(lines)

with tempfile.TemporaryDirectory(prefix='wireless-transaction-') as directory:
    base = Path(directory)
    usb, internal, persist, bins = (base / n for n in ('usb', 'internal', 'persist', 'bin'))
    for p in (usb, internal, persist, bins, base / 'locks'):
        p.mkdir()
    mounts, version, gpio = (base / n for n in ('mounts', 'version', 'watchdog'))
    shutil.copytree(ROOT / 'usb/lib', usb / 'lib')
    write(usb / 'installer.sh', (ROOT / 'usb/installer.sh').read_text(encoding='utf-8').replace('#!/bin/sh\n', '#!/bin/sh\nPATH=' + shlex.quote(str(bins) + ':/usr/bin:/bin') + '\nexport PATH\n', 1))
    for p in (usb / 'lib').glob('*.sh'):
        s = p.read_text(encoding='utf-8').replace('/tmp/mnt/data_persist', str(persist)).replace('/proc/mounts', str(mounts)).replace('/jci/version.ini', str(version))
        s = s.replace('MZD_SHIM_ROOT=/', 'MZD_SHIM_ROOT=' + shlex.quote(str(internal)))
        s = s.replace('/tmp/mzd-packages.lock', str(base / 'packages.lock'))
        s = s.replace('/tmp/mzd-sm-config-tweak.lock', str(base / 'locks/sm-config.lock'))
        s = s.replace('/sys/class/gpio/Watchdog\\ Disable/value', shlex.quote(str(gpio)))
        s = s.replace('LOCK="/tmp/mzd-$LOCK_GROUP-tweak.lock"', 'LOCK="' + str(base / 'locks') + '/$LOCK_GROUP.lock"')
        write(p, s)
    write(version, 'JCI_SW_VER="MAZ_CMU-150_74.00.324"\n')
    write(gpio, '0\n')
    write(mounts, f'/dev/root {internal} relfs ro 0 0\n/dev/data {persist} relfs rw 0 0\n/dev/usb {usb} vfat rw 0 0\n')
    write(bins / 'sync', '#!/bin/sh\nexit 0\n')
    write(bins / 'mount', '#!/bin/sh\nexit 0\n')
    write(bins / 'df', '#!/bin/sh\nprintf "Filesystem 1024-blocks Used Available Capacity Mounted\\nfixture 1000000 1 900000 1%% internal\\n"\n')
    real_mv = shutil.which('mv')
    write(bins / 'mv', '#!/bin/sh\nif [ -n "${WIRELESS_FAIL:-}" ] && [ -f "$WIRELESS_FAIL" ]; then\n case "$*" in *BdsConfiguration.xml) rm -f "$WIRELESS_FAIL"; exit 1;; esac\nfi\nexec ' + shlex.quote(real_mv) + ' "$@"\n')
    worker = usb / 'tweaks' / ID
    shutil.copytree(CANDIDATE, worker)
    # The package fixture has no active processes. POSIX shutdown is covered separately.
    modules = base / 'lua-fixture'
    modules.mkdir()
    write(modules / 'lfs.lua', "return {symlinkattributes=function()return nil end,dir=function()return function()return nil end end}\n")
    write(modules / 'posix.lua', "return {kill=function()error('Unexpected live signal')end}\n")
    write(modules / 'socket.lua', "return {sleep=function()error('Unexpected live sleep')end}\n")
    write(bins / 'lua', '#!/bin/sh\n[ "${WIRELESS_STOP_FAIL:-0}" != 1 ] || exit 1\nLUA_PATH=' + shlex.quote(str(modules) + '/?.lua;;') + ' exec /usr/bin/lua5.1 "$@"\n')
    cli = worker / 'assets/service/lifecycle-cli.lua'
    text = cli.read_text(encoding='utf-8').replace('/tmp/mnt/data_persist', str(persist))
    write(cli, text)
    # Use the normal public candidate entrypoint, including its real preflight.
    net = base / 'net/wlan1';net.mkdir(parents=True)
    phy = base / 'radio/phy1';phy.mkdir(parents=True)
    rtl = base / 'drivers/rtl8812au';rtl.mkdir(parents=True)
    (net / 'device').mkdir()
    (net / 'device/driver').symlink_to(rtl)
    (net / 'phy80211').symlink_to(phy)
    upstream = worker / 'upstream.sh'
    write(upstream, upstream.read_text(encoding='utf-8').replace('NET=/sys/class/net/wlan1', 'NET=' + str(net)))
    for patch in (worker / 'assets/runtime').glob('*.patch'):
        write(patch, patch.read_text(encoding='utf-8').replace('/data_persist/', str(persist) + '/'))
    write(bins / 'iw', """#!/bin/sh
case "${WIRELESS_CAPABILITY:-normal}" in
 normal) printf 'Supported interface modes:\\n * AP\\n * 5180 MHz [36] (20.0 dBm)\\n' ;;
 noap) printf 'Supported interface modes:\\n * managed\\n * 5180 MHz [36] (20.0 dBm)\\n' ;;
 disabled) printf 'Supported interface modes:\\n * AP\\n * 5180 MHz [36] (disabled)\\n' ;;
 *) exit 1 ;;
esac
""")
    write(bins / 'timeout', '#!/bin/sh\n[ "$1" = -t ] || exit 1\nshift 2\nexec "$@"\n')
    for command in ('hostapd', 'udhcpd', 'iptables', 'ifconfig'):
        write(bins / command, '#!/bin/sh\necho unexpected > ' + shlex.quote(str(base / 'unexpected-network')) + '\nexit 91\n')
    manifest = (worker / 'manifest.conf').read_text(encoding='utf-8').replace('/tmp/mnt/data_persist', str(persist)).replace('conflicts=android-auto', 'conflicts=')
    if not DRIVER:
        manifest = manifest.replace('requires=tplink-rtl8811au', 'requires=')
    records = []
    originals = {}
    for line in (worker / 'components.tsv').read_text(encoding='utf-8').splitlines():
        if not line or line.startswith('#'):
            continue
        kind, target, source, service, original = line.split('\t')
        if kind == 'patch':
            path = internal / target.lstrip('/')
            extra = None
            if DRIVER and target in ('/jci/sm/sm.conf', '/jci/sm/sm_WCP.conf'):
                extra = (DRIVER / ('assets/' + Path(target).name + '.patch')).read_text(encoding='utf-8')
            content = fixture((worker / source).read_text(encoding='utf-8'), extra)
            write(path, content)
            os.utime(path, (1234567890, 1234567890))
            originals[path] = path.read_bytes()
            manifest = manifest.replace(target, str(path)).replace(original, md5(path.read_bytes()))
            target, original = str(path), md5(path.read_bytes())
        elif kind == 'check':
            path = internal / target.lstrip('/')
            write(path, 'synthetic native module: ' + Path(target).name + '\n')
            target, original = str(path), md5(path.read_bytes())
        else:
            target = target.replace('/tmp/mnt/data_persist', str(persist))
        records.append('\t'.join((kind, target, source, service, original)))
    write(worker / 'manifest.conf', manifest)
    write(worker / 'components.tsv', '\n'.join(records) + '\n')
    env = dict(os.environ, PATH=str(bins) + ':/usr/bin:/bin')
    def action(name, code=0, extra=()):
        result = subprocess.run(['/bin/sh', str(usb / 'installer.sh'), 'action', ID, name, *extra], env=env, text=True, capture_output=True, timeout=120)
        assert result.returncode == code, (name, result.returncode, result.stdout, result.stderr)
        return result
    driver_id = 'tplink-rtl8811au'
    driver = usb / 'tweaks' / driver_id
    driver_payload = persist / 'wl'
    def driver_action(name, code=0):
        result = subprocess.run(['/bin/sh', str(usb / 'installer.sh'), 'action', driver_id, name], env=env, text=True, capture_output=True, timeout=120)
        assert result.returncode == code, (name, result.returncode, result.stdout, result.stderr)
        return result
    if DRIVER:
        shutil.copytree(DRIVER, driver)
        cfg80211 = internal / 'cfg80211.ko'
        write(cfg80211, 'synthetic cfg80211\n')
        manifest_text = (driver / 'manifest.conf').read_text(encoding='utf-8').replace('/tmp/mnt/data_persist', str(persist))
        table = (driver / 'components.tsv').read_text(encoding='utf-8').replace('/tmp/mnt/data_persist', str(persist))
        for target, original in [('/jci/sm/sm.conf', '74d9fc389b74fb01d0cfc2615a82c782'), ('/jci/sm/sm_WCP.conf', '030e918f5d6edcd62d196ee37b86fe99')]:
            path = internal / target.lstrip('/')
            manifest_text = manifest_text.replace(target, str(path)).replace(original, md5(originals[path]))
            table = table.replace(target, str(path)).replace(original, md5(originals[path]))
        table = table.replace('/lib/modules/3.0.35/kernel/net/wireless/cfg80211.ko', str(cfg80211)).replace('7fc7fe6f63774b82465318ee86fd6542', md5(cfg80211.read_bytes()))
        write(driver / 'manifest.conf', manifest_text)
        write(driver / 'components.tsv', table)
        devices = base / 'usb-devices';devices.mkdir()
        text = (driver / 'run.sh').read_text(encoding='utf-8').replace('USB_DEVICES=/sys/bus/usb/devices', 'USB_DEVICES=' + str(devices))
        write(driver / 'run.sh', text)
        text = (driver / 'diagnostics.sh').read_text(encoding='utf-8').replace('/data_persist/log', str(persist / 'log'))
        write(driver / 'diagnostics.sh', text)
        blocked = action('install', code=1)
        assert 'Requires a complete managed installation' in blocked.stderr or 'Install the TP-Link driver first' in blocked.stdout, (blocked.stdout, blocked.stderr)
        assert all(path.read_bytes() == value for path, value in originals.items())
        driver_action('install')
        assert (driver_payload / 'load-wlan1.sh').stat().st_mode & 0o777 == 0o755
        write(driver / 'manifest.conf', manifest_text.replace('version=1.0.3', 'version=1.0.4'))
        driver_action('update')
    template = worker / 'assets/libpatch.conf'
    default_template = template.read_text(encoding='utf-8')
    write(template, default_template.replace('wireless = false', 'wireless = true').replace('aa_psk =\n', 'aa_psk = fixture-key-123\n'))
    def preflight(code, expected):
        before = {path: path.read_bytes() for path in originals}
        result = subprocess.run(['/bin/sh', str(worker / 'run.sh'), 'preflight'], env=env, text=True, capture_output=True, timeout=20)
        assert result.returncode == code and expected in result.stdout, (result.returncode, result.stdout, result.stderr)
        assert all(path.read_bytes() == value for path, value in before.items())
        assert not (base / 'unexpected-network').exists()
    preflight(0, 'AP mode and selected 5 GHz channel detected')
    env['WIRELESS_CAPABILITY'] = 'noap';preflight(1, 'does not advertise AP mode')
    env['WIRELESS_CAPABILITY'] = 'disabled';preflight(1, 'channel is unavailable')
    del env['WIRELESS_CAPABILITY']
    (net / 'phy80211').unlink();preflight(1, 'Cannot identify the wlan1 radio')
    (net / 'phy80211').symlink_to(phy)
    write(template, default_template.replace('wireless = false', 'wireless = true'))
    preflight(1, 'Invalid wireless config')
    write(template, default_template)
    baseline = {path: path.read_bytes() for path in originals}
    baseline_times = {path: int(path.stat().st_mtime) for path in originals}
    payload = persist / 'mzd-tweaks/shims' / ID
    conf = payload / 'libpatch.conf'
    action('install')
    assert conf.exists()
    if DRIVER:
        snapshots = {path: path.read_bytes() for path in originals}
        blocked = driver_action('uninstall', code=1)
        assert 'Required by installed tweak' in blocked.stderr
        assert (driver_payload / 'rtl8812au.ko').exists()
        assert all(path.read_bytes() == value for path, value in snapshots.items())
    for name in ('aaw_listend', 'aaw_handler', 'start-aa-ap.sh', 'reset-aa-dongle.sh'):
        assert (payload / name).stat().st_mode & 0o777 == 0o755
    for path in originals:
        assert path.read_bytes() != originals[path]
    # Restore preparation uses the same runtime shutdown hook, never install preflight.
    reset_settings = base / 'reset-settings.conf';write(reset_settings, '')
    reset_archive = base / 'reset-archive';reset_archive.mkdir()
    reset_system = base / 'reset-system';reset_system.mkdir()
    def reset_prepare(code=0):
        reset_env = dict(env, MZD_SETTINGS_FILE=str(reset_settings), MZD_RESET_DIR=str(reset_archive), MZD_SYSTEM=str(reset_system), ACTION='run')
        result = subprocess.run(['/bin/sh', str(worker / 'reset.sh'), 'prepare'], env=reset_env, text=True, capture_output=True, timeout=30)
        assert result.returncode == code, (result.returncode, result.stdout, result.stderr)
    reset_prepare()
    env['WIRELESS_STOP_FAIL'] = '1';reset_prepare(1);del env['WIRELESS_STOP_FAIL']
    assert (payload / 'aaw_listend').exists()
    # Failed runtime shutdown must retain every installed file and patch.
    env['WIRELESS_STOP_FAIL'] = '1'
    before = {path: path.read_bytes() for path in originals}
    action('uninstall', code=1)
    assert all(path.read_bytes() == value for path, value in before.items())
    assert (payload / 'aaw_listend').exists() and conf.exists()
    del env['WIRELESS_STOP_FAIL']
    action('uninstall', extra=('--preserve-config',))
    action('install')
    # Mutated config survives Update and preserve-config removal.
    changed = conf.read_text(encoding='utf-8').replace('aa_ssid = MazdaAA', 'aa_ssid = My car')
    write(conf, changed)
    version_manifest = (worker / 'manifest.conf').read_text(encoding='utf-8')
    write(worker / 'manifest.conf', version_manifest.replace('version=0.1.0', 'version=0.1.1'))
    action('update')
    assert conf.read_text(encoding='utf-8') == changed
    action('uninstall', extra=('--preserve-config',))
    assert conf.read_text(encoding='utf-8') == changed
    for path, value in originals.items():
        assert path.read_bytes() == baseline[path], (str(path), md5(path.read_bytes()), md5(baseline[path]))
        shared = DRIVER and path.name in ('sm.conf', 'sm_WCP.conf')
        if not shared:
            assert int(path.stat().st_mtime) == baseline_times[path]
        assert Path(str(path) + '.org').exists() == bool(shared)
    action('install')
    assert conf.read_text(encoding='utf-8') == changed
    action('uninstall')
    assert not payload.exists()
    # Failure after publishing payload rolls back before any native code is run.
    flag = base / 'fail-publish'
    flag.touch()
    env['WIRELESS_FAIL'] = str(flag)
    action('install', code=1)
    for path, value in originals.items():
        assert path.read_bytes() == baseline[path]
    assert not (payload / 'aaw_listend').exists()
    # The controller retains failed-install evidence until explicit removal.
    action('uninstall')
    if DRIVER:
        # Last registered consumer removed: original bytes, metadata and no .org leftovers.
        driver_action('uninstall')
        assert not driver_payload.exists()
        for path, value in originals.items():
            assert path.read_bytes() == value
            assert int(path.stat().st_mtime) == 1234567890
            assert not Path(str(path) + '.org').exists()
        driver_action('install')
    # A later unrelated SM edit must survive removal of this package's hunks.
    action('install')
    sm = internal / 'jci/sm/sm.conf'
    foreign = '<!-- unrelated SSH/GUI service owner -->\n'
    write(sm, sm.read_text(encoding='utf-8') + foreign)
    action('uninstall')
    assert sm.read_bytes() == baseline[sm] + foreign.encode()
    assert not payload.exists()
    if DRIVER:
        assert (driver_payload / 'rtl8812au.ko').exists()
        for name in ('sm.conf', 'sm_WCP.conf'):
            assert b'name="load_wlan1"' in (internal / 'jci/sm' / name).read_bytes()
            assert b'name="start_aa_ap"' not in (internal / 'jci/sm' / name).read_bytes()
        driver_action('uninstall')
        assert not driver_payload.exists() and not payload.exists()
        for path, value in originals.items():
            assert path.read_bytes() == value + (foreign.encode() if path == sm else b'')
            assert Path(str(path) + '.org').exists() == (path == sm)
            if path == sm:
                assert Path(str(path) + '.org').read_bytes() == value
            if path != sm:
                assert int(path.stat().st_mtime) == 1234567890
        print('WIRELESS_TPLINK_PASSED: real driver install/update, dependency refusal, mixed SM ownership, wireless update/removal, driver retention and final driver cleanup.')
print('WIRELESS_TRANSACTION_PASSED: real shared package install, executable modes, Update, config preservation, full removal, metadata restoration and rollback on synthetic targets.')
