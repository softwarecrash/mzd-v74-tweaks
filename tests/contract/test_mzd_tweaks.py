"""MZD Tweaks component bundle real package on synthetic CMU files."""
from pathlib import Path
import hashlib
import os
import re
import shlex
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
SHELL = 'C:/Program Files/Git/bin/bash.exe' if os.name == 'nt' else '/bin/sh'
sys.path.insert(0, str(ROOT / 'tools'))
from manifest import read as read_manifest

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
    lines = []
    position = 0
    for line in patch.splitlines(keepends=True):
        if line.startswith('@@ '):
            match = re.match(r'@@ -(\d+)', line)
            while len(lines) < int(match.group(1)) - 1:
                lines.append('// contract fixture gap %d\n' % len(lines))
            position += 1
        elif position and line[:1] in [' ', '+', '-']:
            if line[:1] == ' ' or line[:1] == ('+' if installed else '-'):
                lines.append(line[1:])
    return ''.join(lines)

checks = 0

# 1. Manifest schema verification
m = read_manifest(ROOT / 'usb/tweaks/mzd-tweaks/manifest.conf')
assert m['id'] == 'mzd-tweaks'
assert m['lock_group'] == 'jci-gui'
assert m['type'] == 'files'
assert m['components'] == 'components.tsv'
assert m['config.settings.path'] == '/tmp/mnt/data_persist/mzd-tweaks/data/mzd-tweaks/settings.conf'
assert m['config.script.path'] == '/tmp/mnt/data_persist/mzd-tweaks/data/mzd-tweaks/settings.js'
checks += 1

with tempfile.TemporaryDirectory(prefix='cmu-mzd-tweaks-') as temporary:
    base = Path(temporary)
    usb = base / 'usb'
    internal = base / 'internal'
    persist = base / 'persist'
    data = base / 'data'
    data_dir = persist / 'mzd-tweaks/data/mzd-tweaks'
    bins = base / 'bin'
    mounts = base / 'mounts'
    version = base / 'version'
    gpio = base / 'watchdog'
    lock = base / 'packages.lock'
    for d in [usb, internal, persist, data / 'integration', bins, base / 'locks']:
        d.mkdir(parents=True, exist_ok=True)

    startup = internal / 'scripts/stage_wifi.sh'
    write(startup, '#!/bin/sh\necho original\n')

    store = persist / 'mzd-tweaks/installed'
    shutil.copytree(ROOT / 'usb/lib', usb / 'lib')
    write(usb / 'installer.sh', (ROOT / 'usb/installer.sh').read_text().replace('#!/bin/sh\n', '#!/bin/sh\nPATH=' + shlex.quote(bp(bins) + ':/usr/bin:/bin') + '\nexport PATH\n', 1))

    for p in (usb / 'lib').glob('*.sh'):
        s = p.read_text().replace('/tmp/mnt/data_persist', bp(persist)).replace('/proc/mounts', bp(mounts)).replace('/jci/version.ini', bp(version))
        s = s.replace('MZD_SHIM_ROOT=/', 'MZD_SHIM_ROOT=' + shlex.quote(bp(internal)))
        s = s.replace('MZD_GUI_STARTUP_MOUNT=/', 'MZD_GUI_STARTUP_MOUNT=' + shlex.quote(bp(internal)))
        s = s.replace('/tmp/mnt/data', bp(data))
        s = s.replace('/jci/scripts/stage_wifi.sh', bp(startup))
        s = s.replace('/tmp/mzd-stage_wifi-tweak.lock', bp(base / 'locks/stage_wifi.lock'))
        s = s.replace('/tmp/mzd-gui-extension.lock', bp(base / 'locks/gui.lock'))
        s = s.replace('/tmp/mzd-packages.lock', bp(lock))
        s = s.replace('/sys/class/gpio/Watchdog\\ Disable/value', shlex.quote(bp(gpio)))
        s = s.replace('LOCK="/tmp/mzd-$LOCK_GROUP-tweak.lock"', 'LOCK="' + bp(base / 'locks') + '/$LOCK_GROUP.lock"')
        write(p, s)

    write(version, 'JCI_SW_VER="MAZ_CMU-150_74.00.324"\n')
    write(gpio, '0\n')
    write(mounts, f'/dev/root {bp(internal)} relfs ro 0 0\n/dev/data {bp(persist)} relfs rw 0 0\n/dev/usb {bp(usb)} vfat rw 0 0\n/dev/data2 {bp(data)} relfs rw 0 0\n')

    if os.environ.get('CMU_TEST_BUSYBOX'):
        busybox = shutil.which('busybox')
        assert busybox, 'BusyBox requested but missing.'
        for name in ['awk', 'patch', 'diff', 'cp', 'cmp', 'md5sum', 'cut', 'readlink', 'dirname', 'mktemp', 'mkdir', 'rm', 'cat', 'grep', 'od', 'dd']:
            os.symlink(busybox, bins / name)

    write(bins / 'sync', '#!/bin/sh\nexit 0\n')
    write(bins / 'df', '#!/bin/sh\nprintf "Filesystem 1024-blocks Used Available Capacity Mounted\\nfixture 1000000 1 900000 1%% internal\\n"\n')
    write(bins / 'mount', '#!/bin/sh\nexit 0\n')
    for name in ['lua', 'setsid']:
        write(bins / name, '#!/bin/sh\nexit 0\n')
    with (usb / 'lib/gui-services.sh').open('a', encoding='utf-8') as f:
        f.write('\nmzd_gui_services_stop() { :; }\n')
        f.write('mzd_gui_services_start() { :; }\n')

    # Synthesize stock targets from patch files
    list2_patch = (ROOT / 'usb/tweaks/mzd-tweaks/assets/list2.patch').read_text(encoding='utf-8')
    mainmenu_patch = (ROOT / 'usb/tweaks/mzd-tweaks/assets/mainmenu.patch').read_text(encoding='utf-8')

    stock_list2 = fixture(list2_patch, installed=False)
    stock_mainmenu = fixture(mainmenu_patch, installed=False)

    target_list2 = internal / 'jci/gui/common/controls/List2/js/List2Ctrl.js'
    target_mainmenu = internal / 'jci/gui/apps/system/controls/MainMenu/js/MainMenuCtrl.js'
    write(target_list2, stock_list2)
    write(target_mainmenu, stock_mainmenu)

    env = dict(os.environ, PATH=bp(bins) + ':/usr/bin:/bin')

    folder = usb / 'tweaks/mzd-tweaks'
    shutil.copytree(ROOT / 'usb/tweaks/mzd-tweaks', folder)

    # Adapt paths in manifest.conf & components.tsv for synthetic sandbox
    manifest_text = (folder / 'manifest.conf').read_text()
    manifest_text = manifest_text.replace('/jci/gui/common/controls/List2/js/List2Ctrl.js', bp(target_list2))
    manifest_text = manifest_text.replace('e111883b9dcbeb6bb154521826fcacac', md5(stock_list2.encode()))
    manifest_text = manifest_text.replace('/tmp/mnt/data_persist', bp(persist))
    write(folder / 'manifest.conf', manifest_text)

    table_text = (folder / 'components.tsv').read_text()
    table_text = table_text.replace('/jci/gui/common/controls/List2/js/List2Ctrl.js', bp(target_list2))
    table_text = table_text.replace('e111883b9dcbeb6bb154521826fcacac', md5(stock_list2.encode()))
    table_text = table_text.replace('/jci/gui/apps/system/controls/MainMenu/js/MainMenuCtrl.js', bp(target_mainmenu))
    table_text = table_text.replace('40ccb293b8c6f80960f0b953dd2e173e', md5(stock_mainmenu.encode()))
    write(folder / 'components.tsv', table_text)

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
        r = subprocess.run([SHELL, '-c', 'exec /bin/sh ' + shlex.quote(bp(worker)) + ' status'], env=cfg, capture_output=True, text=True, timeout=90)
        assert r.returncode == 0 and r.stdout == state + '\n', (r.returncode, r.stdout, r.stderr)
        checks += 1
        return r

    settings_conf = base / 'temp_settings.conf'
    write(settings_conf, '')

    # Initial status check: uninstalled
    deep(folder / 'run.sh', settings_conf, 'uninstalled')
    call(['manifest', 'mzd-tweaks'])

    # Install action
    call(['action', 'mzd-tweaks', 'install'])
    assert (store / 'mzd-tweaks').is_dir()
    assert (data_dir / 'settings.conf').is_file()
    assert (data_dir / 'settings.js').is_file()
    assert (target_list2.with_name('List2Ctrl.js.org')).is_file()
    assert (target_mainmenu.with_name('MainMenuCtrl.js.org')).is_file()
    assert 'get autoscrollTier1Timeout' in target_list2.read_text()
    assert 'window.mzdTweaks.main_menu_loop' in target_mainmenu.read_text()
    assert (data / 'integration/developer_mode_GuiConfig.js').exists()
    assert (data / 'integration/mzd-gui-registry.js').exists()
    assert 'mzd-tweaks' in (data / 'integration/mzd-gui-registry.js').read_text()
    assert (data / 'integration/mzd-gui-services.tsv').read_text().strip() == 'mzd-tweaks\tassets/service/entry.lua'

    # Installed status
    deep(folder / 'run.sh', settings_conf, 'installed')

    # Preserved config uninstall
    call(['action', 'mzd-tweaks', 'uninstall', '--preserve-config'])
    assert not (store / 'mzd-tweaks').exists()
    assert target_list2.read_text() == stock_list2
    assert target_mainmenu.read_text() == stock_mainmenu
    assert (data_dir / 'settings.conf').is_file(), 'Preserved config was deleted'

    # Status after uninstall: uninstalled
    deep(folder / 'run.sh', settings_conf, 'uninstalled')

    # Reinstall and test full uninstall (cleans config)
    call(['action', 'mzd-tweaks', 'install'])
    assert (store / 'mzd-tweaks').is_dir()
    call(['action', 'mzd-tweaks', 'uninstall'])
    assert not (store / 'mzd-tweaks').exists()
    assert target_list2.read_text() == stock_list2
    assert target_mainmenu.read_text() == stock_mainmenu

    def refused(args):
        global checks
        command = 'exec /bin/sh ' + ' '.join(shlex.quote(a) for a in [bp(usb / 'installer.sh'), *args])
        r = subprocess.run([SHELL, '-c', command], env=env, capture_output=True, text=True, timeout=150)
        assert r.returncode != 0, (args, r.stdout, r.stderr)
        checks += 1
        return r

    def status(state):
        global checks
        cfg = dict(env, MZD_WORKER_DIRECT='1', MZD_SETTINGS_FILE=bp(settings_conf))
        r = subprocess.run([SHELL, '-c', 'exec /bin/sh ' + shlex.quote(bp(folder / 'run.sh')) + ' status'], env=cfg, capture_output=True, text=True, timeout=90)
        assert r.returncode == 0 and r.stdout == state + '\n', (r.returncode, r.stdout, r.stderr)
        checks += 1
        return r

    registry = data / 'integration/mzd-gui-registry.js'
    services = data / 'integration/mzd-gui-services.tsv'
    org_list2 = target_list2.with_name('List2Ctrl.js.org')
    org_mainmenu = target_mainmenu.with_name('MainMenuCtrl.js.org')

    def not_registered():
        assert not registry.exists() or 'mzd-tweaks' not in registry.read_text()
        assert not services.exists() or 'mzd-tweaks' not in services.read_text()

    # Full uninstall removed the saved settings and the GUI registration.
    assert not (data_dir / 'settings.conf').exists() and not (data_dir / 'settings.js').exists(), 'full uninstall removes the settings'
    not_registered()
    assert not (data / 'integration/developer_mode_GuiConfig.js').exists(), 'the last GUI consumer removes the boot hook'
    assert startup.read_text() == '#!/bin/sh\necho original\n'

    # OEM backups hold the exact stock files.
    call(['action', 'mzd-tweaks', 'install'])
    assert org_list2.read_text() == stock_list2, 'List2Ctrl.js.org is the stock file'
    assert org_mainmenu.read_text() == stock_mainmenu, 'MainMenuCtrl.js.org is the stock file'

    # One target reverted: the shared bundle status reports it with a reason. It maps a
    # partial component state to unavailable (shared bundle.sh behaviour, not MZD Tweaks).
    patched_mainmenu = target_mainmenu.read_text()
    write(target_mainmenu, stock_mainmenu)
    saved = store / 'mzd-tweaks/package'
    r = deep(saved / 'tweaks/mzd-tweaks/run.sh', saved / 'settings.conf', 'unavailable')
    assert 'Partial component installation' in r.stderr, r.stderr
    write(target_mainmenu, patched_mainmenu)
    deep(saved / 'tweaks/mzd-tweaks/run.sh', saved / 'settings.conf', 'installed')

    # Changed settings survive an uninstall that keeps the configuration.
    custom_conf = 'main_menu_loop=true\nlist_loop=true\nlist_beep=false\nshort_delay=true\n'
    custom_js = 'window.mzdTweaks = {\n    "main_menu_loop": true,\n    "list_loop": true,\n    "list_beep": false,\n    "short_delay": true\n};\n'
    (data_dir / 'settings.conf').write_text(custom_conf)
    (data_dir / 'settings.js').write_text(custom_js)
    call(['action', 'mzd-tweaks', 'uninstall', '--preserve-config'])
    call(['action', 'mzd-tweaks', 'install'])
    assert (data_dir / 'settings.conf').read_text() == custom_conf, 'install keeps saved settings.conf'
    assert (data_dir / 'settings.js').read_text() == custom_js, 'install keeps saved settings.js'
    call(['action', 'mzd-tweaks', 'uninstall'])
    assert target_list2.read_text() == stock_list2 and target_mainmenu.read_text() == stock_mainmenu

    # A second target that is not the known OEM file: unavailable, and Install changes nothing.
    foreign_mainmenu = stock_mainmenu + '// changed by another tool\n'
    write(target_mainmenu, foreign_mainmenu)
    r = status('unavailable')
    assert r.stderr.strip(), 'unavailable status gives a reason'
    refused(['action', 'mzd-tweaks', 'install'])
    assert target_list2.read_text() == stock_list2, 'List2Ctrl.js is untouched when MainMenuCtrl.js is unknown'
    assert target_mainmenu.read_text() == foreign_mainmenu
    assert not org_list2.exists() and not org_mainmenu.exists(), 'no OEM backup is left behind'
    assert not (store / 'mzd-tweaks').exists(), 'no receipt is published'
    not_registered()
    write(target_mainmenu, stock_mainmenu)

    # Restore hook: check, prepare, then finish only once the OEM files are back.
    call(['action', 'mzd-tweaks', 'install'])
    saved = store / 'mzd-tweaks/package'
    archive = base / 'reset-archive'
    archive.mkdir()
    system = base / 'reset-system'
    system.mkdir()
    write(system / 'mounts', '')
    write(system / 'locks', '')
    reset_script = base / 'reset-hook.sh'
    write(reset_script, f'''ROOT={shlex.quote(bp(saved))}
HERE={shlex.quote(bp(saved / 'tweaks/mzd-tweaks'))}
MZD_SETTINGS_FILE={shlex.quote(bp(saved / 'settings.conf'))}
ACTION=run
MZD_RESET_DIR={shlex.quote(bp(archive))}
MZD_SYSTEM={shlex.quote(bp(system))}
. "$ROOT/lib/bundle.sh"
mzd_bundle_reset_main "$1"
''')

    def run_reset(phase, expected=0):
        global checks
        r = subprocess.run([SHELL, bp(reset_script), phase], env=env, capture_output=True, text=True, timeout=20)
        assert r.returncode == expected, (phase, r.returncode, r.stdout, r.stderr)
        checks += 1
        return r

    run_reset('check')
    run_reset('prepare')
    run_reset('finish', 1)
    shutil.copyfile(org_list2, target_list2)
    shutil.copyfile(org_mainmenu, target_mainmenu)
    run_reset('finish')
    assert target_list2.read_text() == stock_list2 and target_mainmenu.read_text() == stock_mainmenu

print('MZD_TWEAKS_CONTRACT_PASSED:', checks, 'checks passed.')
