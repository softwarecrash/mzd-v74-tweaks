"""Actual touch worker/reset/package entrypoints on isolated synthetic fixtures."""
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


def bp(p):
    s = Path(p).resolve().as_posix()
    return '/' + s[0].lower() + s[2:] if len(s) > 1 and s[1] == ':' else s


def write(p, text):
    p.parent.mkdir(parents=True, exist_ok=True)
    if p.is_symlink(): p.unlink()
    p.write_text(text, encoding='utf-8', newline='\n')
    p.chmod(0o755)


checks = 0
with tempfile.TemporaryDirectory(prefix='cmu-touch-') as folder:
    base = Path(folder)
    usb = base / 'usb'; worker = usb / 'tweaks/touch-while-driving'
    bins = base / 'bin'; target = base / 'Common.js'; nvram = base / 'nvram'
    resources = base / 'resources'; state = resources / 'mzd-tweaks/touch-while-driving'
    scripts = base / 'scripts'; events = base / 'events'; version = base / 'version'
    mounts = base / 'mounts'; watchdog = base / 'watchdog'; lock = base / 'lock'
    persist = base / 'persist'; settings = base / 'settings'; archive = base / 'archive'
    for p in [bins, nvram / 'keys', resources, scripts, persist, archive]: p.mkdir(parents=True)
    shutil.copytree(ROOT / 'usb/lib', usb / 'lib')
    shutil.copytree(ROOT / 'usb/tweaks/touch-while-driving', worker)
    patch = (worker / 'assets/change.patch').read_text(encoding='utf-8')
    # Only hunk context is needed, never a firmware dump.
    lines = []; active = False
    for line in patch.splitlines(True):
        if line.startswith('@@ '):
            count = int(re.search(r'-(\d+)', line).group(1)) - 1
            while len(lines) < count: lines.append('// synthetic gap\n')
            active = True
        elif active and line[:1] in [' ', '-']: lines.append(line[1:])
    original = ''.join(lines)
    write(target, original); write(version, 'JCI_SW_VER="MAZ_CMU-150_74.00.324"\n')
    write(watchdog, '0\n')
    write(mounts, f'mock / ext4 ro 0 0\nmock {bp(usb)} vfat rw 0 0\n'
          f'mock {bp(resources)} ext4 ro 0 0\nmock {bp(persist)} ext4 rw 0 0\n')
    write(settings, 'general_speed_restriction=disabled\n')
    replacements = {
        '/jci/gui/common/js/Common.js': bp(target),
        '/sys/class/nvram/nv-config': bp(nvram),
        '/tmp/mnt/resources': bp(resources),
        '/tmp/mnt/data_persist': bp(persist),
        '/tmp/mzd-packages.lock': bp(base / 'packages.lock'),
        '/jci/scripts': bp(scripts),
        '/jci/version.ini': bp(version),
        '/sys/class/gpio/Watchdog\\ Disable/value': bp(watchdog),
        '/proc/mounts': bp(mounts),
        'oem_backup_md5=60680f8a729b3a8eef1df0080c249e7c':
            'oem_backup_md5=' + hashlib.md5(original.encode()).hexdigest(),
    }
    write(usb / 'installer.sh', (ROOT / 'usb/installer.sh').read_text(encoding='utf-8'))
    for p in list(usb.rglob('*.sh')) + [worker / 'manifest.conf', worker / 'managed-paths.tsv']:
        text = p.read_text(encoding='utf-8')
        for before, after in replacements.items(): text = text.replace(before, after)
        if p.suffix == '.sh':
            text = text.replace('#!/bin/sh\n', '#!/bin/sh\nPATH=' + shlex.quote(bp(bins) + ':/usr/bin:/bin') + '\nexport PATH\n', 1)
        if p.name == 'run.sh':
            text = text.replace('PATCH_FILE=', 'LOCK=' + shlex.quote(bp(lock)) + '\nPATCH_FILE=', 1)
            text = text.replace('. "$HERE/touch.sh" || exit 1',
                                '. "$HERE/touch.sh" || exit 1\nif [ "$ACTION" != status ] && [ "$ACTION" != preflight ]; then printf "%s\\n" "$$" > '
                                + shlex.quote(bp(base / 'worker.pid')) + '; fi')
        write(p, text)
    # Mutating commands are harmless fakes and leave an observable trace.
    for name in ['mount', 'sync']:
        write(bins / name, '#!/bin/sh\nprintf "%s\\n" ' + name + ' >> ' + shlex.quote(bp(events)) + '\n')
    for name in ['reboot', 'killall', 'dbus-send']:
        write(bins / name, '#!/bin/sh\nexit 90\n')
    write(bins / 'df', '#!/bin/sh\nprintf "Filesystem 1024-blocks Used Available Capacity Mounted\\nmock 1000000 1000 999000 1%% persist\\n"\n')
    for key, name in [('bus_bcm_speed_restriction', 'set_speed_restriction_config.sh'),
                      ('lvds_speed_restriction', 'set_lvds_speed_restriction_config.sh')]:
        write(scripts / name, '''#!/bin/sh
key=''' + key + '''
printf '%s=%s\\n' "$key" "$1" >> ''' + shlex.quote(bp(events)) + '''
if [ -f ''' + shlex.quote(bp(base / 'interrupt')) + ''' ]; then
    rm ''' + shlex.quote(bp(base / 'interrupt')) + '''
    kill -TERM "$(cat ''' + shlex.quote(bp(base / 'worker.pid')) + ''')"; exit 1
fi
if [ -f ''' + shlex.quote(bp(base / 'fail-always')) + ''' ]; then exit 1; fi
if [ -f ''' + shlex.quote(bp(base / 'fail-once')) + ''' ] && [ "$key" = lvds_speed_restriction ]; then
    rm ''' + shlex.quote(bp(base / 'fail-once')) + '''
    printf '%s\\n' "$1" > ''' + shlex.quote(bp(nvram / 'keys')) + '''/"$key"
    exit 1
fi
if [ -f ''' + shlex.quote(bp(base / 'bad-readback')) + ''' ] && [ "$key" = lvds_speed_restriction ]; then
    rm ''' + shlex.quote(bp(base / 'bad-readback')) + '''; exit 0
fi
printf '%s\\n' "$1" > ''' + shlex.quote(bp(nvram / 'keys')) + '''/"$key"
''')
    if os.environ.get('CMU_TEST_BUSYBOX'):
        busybox = shutil.which('busybox'); assert busybox
        for name in ['awk', 'patch', 'diff', 'cp', 'cmp', 'md5sum', 'cut', 'readlink',
                     'dirname', 'mktemp', 'mkdir', 'rm', 'rmdir', 'cat', 'grep', 'sed']:
            os.symlink(busybox, bins / name)
    env = dict(os.environ, PATH=bp(bins) + ':/usr/bin:/bin', MZD_WORKER_DIRECT='1',
               MZD_SETTINGS_FILE=bp(settings))

    def invoke(args, code=0, extra=None):
        global checks
        r = subprocess.run([SHELL] + [bp(x) if isinstance(x, Path) else x for x in args],
                           env=dict(env, **(extra or {})), capture_output=True, text=True, timeout=60)
        assert r.returncode == code, (args, code, r.returncode, r.stdout, r.stderr)
        checks += 1
        if checks % 10 == 0: print('PASS touch entrypoint checks:', checks, flush=True)
        return r

    def deep(expected, code=0):
        before = {p.relative_to(base): p.read_bytes() for p in base.rglob('*') if p.is_file()}
        r = invoke([worker / 'run.sh', 'status'], code)
        assert r.stdout == (expected + '\n' if expected else ''), (r.stdout, r.stderr)
        if expected in ['broken', 'unavailable'] or code: assert r.stderr
        after = {p.relative_to(base): p.read_bytes() for p in base.rglob('*') if p.is_file()}
        assert before == after, 'Status mutated persistent state'

    def keys(bus='enable', lvds='enable'):
        write(nvram / 'keys/bus_bcm_speed_restriction', bus + '\n')
        write(nvram / 'keys/lvds_speed_restriction', lvds + '\n')

    def values(bus, lvds):
        assert (nvram / 'keys/bus_bcm_speed_restriction').read_text().strip() == bus
        assert (nvram / 'keys/lvds_speed_restriction').read_text().strip() == lvds

    def mutate(action, code=0): return invoke([worker / 'run.sh', action], code)

    adapter = usb / 'installer.sh'
    def preflight_info(code=0): return invoke([adapter, 'preflight-info', 'touch-while-driving'], code)

    for args in [[], ['--help'], ['-h']]: invoke([worker / 'run.sh'] + args)
    invoke([worker / 'run.sh', 'unknown'], 1)
    invoke([worker / 'run.sh', 'status', 'extra'], 1)
    deep('uninstalled')  # Missing keys use the OEM enable default.
    # Factory enable: preflight produces no info message.
    keys('enable', 'enable'); r = preflight_info()
    assert r.returncode == 0 and r.stdout == '' and r.stderr == ''
    # Already disabled: provides non-blocking info message.
    keys('enable', 'disable'); r = preflight_info()
    assert r.returncode == 0
    assert r.stdout == 'info\tTouchscreen while driving is already enabled. Install to disable additional menu operation restriction.\n'
    assert r.stderr == ''
    deep('uninstalled')  # Non-blocking info message does not change uninstalled status.
    write(nvram / 'keys/lvds_speed_restriction', 'invalid\n')
    r = preflight_info(1)
    assert r.returncode == 1 and 'Cannot read valid speed restriction settings.' in r.stderr
    deep('unavailable')
    keys(); write(version, 'unsupported\n'); deep('unavailable')
    write(version, 'JCI_SW_VER="MAZ_CMU-150_74.00.324"\n')
    lock.mkdir(); deep('', 1); lock.rmdir()
    # Matching live values still go through both commit setters.
    keys('disable', 'disable'); mutate('install'); values('disable', 'disable'); deep('installed')
    assert 'bus_bcm_speed_restriction=disable' in events.read_text()
    baseline = (state / 'original.txt').read_bytes()
    mutate('install'); assert (state / 'original.txt').read_bytes() == baseline
    write(target, target.read_text() + '// unrelated sentinel\n')
    mutate('uninstall'); values('disable', 'disable')
    assert target.read_text() == original + '// unrelated sentinel\n' and not state.exists()
    deep('uninstalled')
    # enabled preserves the original bus restriction and original LVDS value.
    write(settings, 'general_speed_restriction=enabled\n'); keys('enable', 'disable')
    mutate('install'); values('enable', 'disable'); deep('installed')
    keys('disable', 'enable'); deep('broken')
    mutate('uninstall'); values('enable', 'disable'); assert not state.exists()
    # Choice options validation rejects invalid values.
    write(settings, 'general_speed_restriction=invalid\n'); mutate('install', 1)
    write(settings, 'general_speed_restriction=disabled\n'); keys()
    for failure in ['fail-once', 'bad-readback']:
        write(base / failure, '1\n'); before = target.read_bytes()
        mutate('install', 1); values('enable', 'enable'); assert target.read_bytes() == before
        # A failed install retains its durable baseline for saved removal.
        mutate('uninstall'); assert not state.exists()
    # A patch write failure rolls settings back as well.
    write(bins / 'cat', '#!/bin/sh\ncase "$1" in */target/install/target.data) exit 1 ;; esac\nexec /bin/cat "$@"\n')
    mutate('install', 1); values('enable', 'enable')
    (bins / 'cat').unlink(); mutate('uninstall')
    write(base / 'fail-always', '1\n'); r = mutate('install', 2)
    assert 'Do NOT reboot' in r.stderr
    (base / 'fail-always').unlink(); mutate('uninstall')
    # A caught interruption restores both entry settings and the entry file.
    before = target.read_bytes(); write(base / 'interrupt', '1\n'); mutate('install', 2)
    values('enable', 'enable'); assert target.read_bytes() == before
    mutate('uninstall')
    # Restore hooks archive and verify the baseline before deleting owned extras.
    mutate('install'); invoke([worker / 'reset.sh', 'check'])
    reset_system = base / 'reset-system'; reset_system.mkdir()
    reset_env = dict(ACTION='run', MZD_REPORT=bp(archive), MZD_SYSTEM=bp(reset_system), MZD_RESET_DIR=bp(archive))
    invoke([worker / 'reset.sh', 'prepare'], extra=reset_env); values('enable', 'enable')
    assert (archive / 'original.txt').read_bytes() == (state / 'original.txt').read_bytes()
    # Simulate Restore's already-tested OEM file restoration between phases.
    write(target, original); invoke([worker / 'reset.sh', 'finish'], extra=reset_env)
    assert not state.exists(); deep('uninstalled')
    # Unknown extras and malformed backups block mutation/reset, without deletion.
    mutate('install'); write(state / 'foreign', 'keep\n'); deep('broken')
    invoke([worker / 'reset.sh', 'check'], 1); assert (state / 'foreign').read_text() == 'keep\n'
    (state / 'foreign').unlink()
    saved = (state / 'original.txt').read_bytes()
    write(state / 'original.txt', 'invalid baseline\n'); deep('broken'); mutate('uninstall', 1)
    (state / 'original.txt').write_bytes(saved); mutate('uninstall')
    write(target, 'unknown\n'); deep('unavailable'); mutate('install', 1)
    write(target, original)
    for key in (nvram / 'keys').iterdir(): key.unlink()
    mutate('install'); values('disable', 'disable')
    assert (state / 'original.txt').read_text().splitlines()[1:3] == ['enable', 'enable']
    mutate('uninstall'); values('enable', 'enable')
    # Full saved-package removal restores settings despite a changed USB payload.
    adapter = usb / 'installer.sh'
    info = invoke([adapter, 'settings-info', 'touch-while-driving']).stdout
    assert 'setting.general_speed_restriction.options=disabled enabled' in info
    assert 'setting.general_speed_restriction.default=enabled' in info
    assert 'value.general_speed_restriction=enabled' in info
    invoke([adapter, 'action', 'touch-while-driving', 'install', 'general_speed_restriction=enabled'])
    values('enable', 'disable')
    write(worker / 'touch.sh', '#!/bin/sh\nexit 97\n')
    write(worker / 'assets/change.patch', 'incompatible USB payload\n')
    invoke([adapter, 'action', 'touch-while-driving', 'uninstall'])
    values('enable', 'enable')
    assert not state.exists() and not (persist / 'mzd-tweaks/installed/touch-while-driving').exists()
    assert target.read_text() == original
    # Restore USB worker for additional adapter checks.
    shutil.copytree(ROOT / 'usb/tweaks/touch-while-driving', worker, dirs_exist_ok=True)
    for p in list(worker.rglob('*.sh')) + [worker / 'manifest.conf', worker / 'managed-paths.tsv']:
        text = p.read_text(encoding='utf-8')
        for before, after in replacements.items(): text = text.replace(before, after)
        if p.suffix == '.sh':
            text = text.replace('#!/bin/sh\n', '#!/bin/sh\nPATH=' + shlex.quote(bp(bins) + ':/usr/bin:/bin') + '\nexport PATH\n', 1)
        if p.name == 'run.sh':
            text = text.replace('PATCH_FILE=', 'LOCK=' + shlex.quote(bp(lock)) + '\nPATCH_FILE=', 1)
            text = text.replace('. "$HERE/touch.sh" || exit 1',
                                '. "$HERE/touch.sh" || exit 1\nif [ "$ACTION" != status ] && [ "$ACTION" != preflight ]; then printf "%s\\n" "$$" > '
                                + shlex.quote(bp(base / 'worker.pid')) + '; fi')
        write(p, text)
    # Default value (enabled) is used by installer.sh when no setting is supplied.
    invoke([adapter, 'action', 'touch-while-driving', 'install'])
    values('enable', 'disable')
    invoke([adapter, 'action', 'touch-while-driving', 'uninstall'])
    values('enable', 'enable')
    # Disabled option sets both bus and lvds restrictions to disable.
    invoke([adapter, 'action', 'touch-while-driving', 'install', 'general_speed_restriction=disabled'])
    values('disable', 'disable')
    invoke([adapter, 'action', 'touch-while-driving', 'uninstall'])
    values('enable', 'enable')
    # Invalid options rejected through adapter.
    invoke([adapter, 'action', 'touch-while-driving', 'install', 'general_speed_restriction=invalid'], 1)

print('TOUCH_CONTRACT_PASSED:', checks, 'entrypoint checks; isolated settings, rollback, reset and saved removal.')
