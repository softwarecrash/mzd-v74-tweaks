"""Exercise real entrypoints on synthetic patch fixtures, never vehicle files.

Each worker runs with isolated target/service/mount paths and command guards.
Linux CI also runs this suite using BusyBox applets. No patch logic is mocked.
"""
from pathlib import Path
import hashlib
import json
import os
import re
import shlex
import shutil
import subprocess
import tempfile
import sys
from cases import CASES

ROOT = Path(__file__).resolve().parents[2] / 'usb'
SHELL = 'C:/Program Files/Git/bin/bash.exe' if os.name == 'nt' else '/bin/sh'

def bp(path):
    s = Path(path).resolve().as_posix()
    return '/' + s[0].lower() + s[2:] if len(s) > 1 and s[1] == ':' else s

def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.is_symlink():
        path.unlink()
    path.write_text(text, encoding='utf-8', newline='\n')
    path.chmod(0o755)

def fixture(patch, installed=False):
    # Reconstruct only the checked-in hunk contexts, with unique harmless gaps.
    lines = []; position = 0
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
for id_, runner in CASES.items():
    if os.environ.get('CMU_TEST_ONLY') and id_ != os.environ['CMU_TEST_ONLY']: continue
    if runner == 'gui-extension':
        subprocess.run([sys.executable,str(Path(__file__).with_name('test_gui_extensions.py')),'--tetris-only'],check=True)
        continue
    if runner == 'touch-transaction':
        subprocess.run([sys.executable, str(Path(__file__).with_name('test_touch.py'))], check=True)
        continue
    if runner == 'component-bundle':
        subprocess.run([sys.executable,str(Path(__file__).with_name('test_'+id_.replace('-','_')+'.py'))],check=True)
        continue
    if runner in ['export-command', 'restore-command', 'terminal-command']: continue
    assert runner == 'shared-patch', 'Add a dedicated runner for this implementation.'
    with tempfile.TemporaryDirectory(prefix='cmu-contract-') as directory:
        base = Path(directory); usb = base / 'usb'; usb.mkdir()
        shutil.copytree(ROOT / 'lib', usb / 'lib')
        worker = usb / 'tweaks' / id_
        shutil.copytree(ROOT / 'tweaks' / id_, worker)
        if id_ == 'ssh':
            # The real supervisor has its own fake-kernel/network suite. Here
            # only its read-only prerequisite interface is represented.
            write(worker / 'assets/service.sh', '#!/bin/sh\n[ "$1" = check ] || exit 1\nprintf "Prerequisites checked.\\n"\n')
        target = base / 'target.data'; service = base / 'service'
        version = base / 'version.ini'; lock = base / 'lock'; events = base / 'events'
        bins = base / 'bin'; bins.mkdir()
        # A status query, blocked action or help must never reach these commands.
        for name in ['mount', 'sync', 'iptables', 'reboot', 'killall', 'sshd', 'ssh-keygen']:
            write(bins / name, '#!/bin/sh\nprintf "%s\\n" ' + name + ' >> ' + shlex.quote(bp(events)) + '\nexit 90\n')
        if id_ == 'hud-street-name':
            write(bins / 'dbus-send', '''#!/bin/sh
case "${TEST_HUD:-whud}:$*" in
    none:*byte:13*) printf '   byte 0\\n' ;;
    unknown:*) exit 1 ;;
    mono:*byte:13*|combiner:*byte:13*) printf '   byte 1\\n' ;;
    mono:*byte:26*) printf '   byte 0\\n' ;;
    combiner:*byte:26*) printf '   byte 1\\n' ;;
    *byte:13*) printf '   byte 1\\n' ;;
    *byte:26*) printf '   byte 2\\n' ;;
    *) exit 1 ;;
esac
''')
        if os.environ.get('CMU_TEST_BUSYBOX'):
            busybox = shutil.which('busybox')
            assert busybox, 'BusyBox requested but missing.'
            for name in ['awk', 'patch', 'diff', 'cp', 'cmp', 'md5sum', 'cut', 'readlink', 'dirname', 'mktemp', 'mkdir', 'rm', 'cat', 'grep']:
                os.symlink(busybox, bins / name)
        # Deliberately reject grep -x even when the host BusyBox supports it.
        grep = bins / 'grep'
        if grep.exists(): grep.unlink()
        command = shlex.quote(shutil.which('busybox')) + ' grep' if os.environ.get('CMU_TEST_BUSYBOX') else '/usr/bin/grep'
        write(grep, '#!/bin/sh\nfor arg in "$@"; do case "$arg" in -*x*) exit 90 ;; esac; done\nexec ' + command + ' "$@"\n')
        patch = (worker / 'assets/change.patch').read_text(encoding='utf-8')
        original = fixture(patch)
        write(target, original)
        write(version, 'JCI_SW_VER="MAZ_CMU-150_74.00.324"\n')
        p = worker / 'run.sh'; source = p.read_text(encoding='utf-8')
        source = source.replace('#!/bin/sh\n', '#!/bin/sh\nPATH=' + shlex.quote(bp(bins) + ':/usr/bin:/bin') + '\nexport PATH\n', 1)
        manifest_path = worker / 'manifest.conf'
        manifest_source = manifest_path.read_text(encoding='utf-8')
        manifest_source = re.sub(r'^target=.*$', 'target=' + bp(target), manifest_source, flags=re.M)
        manifest_source = re.sub(r'^oem_backup_md5=.*$', 'oem_backup_md5=' + hashlib.md5(original.encode()).hexdigest(), manifest_source, flags=re.M)
        write(manifest_path, manifest_source)
        source = source.replace('mzd_manifest_load "$HERE/manifest.conf" || exit 1',
            'mzd_manifest_load "$HERE/manifest.conf" || exit 1\nLOCK=' + shlex.quote(bp(lock)))
        source = re.sub(r'^SERVICE=.*$', 'SERVICE=' + shlex.quote(bp(service)), source, flags=re.M)
        write(p, source)
        for lib in (usb / 'lib').glob('*.sh'):
            text = lib.read_text(encoding='utf-8').replace('/jci/version.ini', bp(version))
            if lib.name == 'status.sh':
                # Keep sandbox probe diagnostics only for an actionable CI failure.
                text = text.replace('trap \'rm -rf "$MZD_REPORT"\' 0',
                    'trap \'mkdir -p ' + shlex.quote(bp(base / 'probe-debug')) + ' && cp "$MZD_REPORT"/*.log ' + shlex.quote(bp(base / 'probe-debug')) + '/ 2>/dev/null || :; rm -rf "$MZD_REPORT"\' 0')
            write(lib, text)
        env = dict(os.environ, MZD_WORKER_DIRECT="1", PATH=bp(bins) + ':/usr/bin:/bin')
        before_usb = lambda: {q.relative_to(usb).as_posix(): q.read_bytes() for q in usb.rglob('*') if q.is_file()}
        def run(action, state=None, code=0, reason=False):
            global checks
            snapshot = before_usb(); data = target.read_bytes(); v = version.read_bytes()
            backup_path = Path(str(target) + '.org')
            backup_data = backup_path.read_bytes() if backup_path.exists() else None
            service_data = {q.name: q.read_bytes() for q in service.glob('*') if q.is_file()}
            result = subprocess.run([SHELL, bp(p)] + action, env=env, capture_output=True, text=True, timeout=30)
            assert result.returncode == code, (id_, action, result.returncode, result.stdout, result.stderr)
            if state is not None:
                if result.stdout != state + '\n':
                    for log in (base / 'probe-debug').rglob('*.log'):
                        print(log.relative_to(base), log.read_text(errors='replace'), flush=True)
                assert result.stdout == state + '\n', (id_, action, result.stdout, result.stderr)
                if reason: assert result.stderr.strip(), (id_, state, 'missing reason')
            elif code:
                assert result.stdout == '' and result.stderr.strip(), (id_, action, result.stdout, result.stderr)
            assert before_usb() == snapshot, 'Query/refusal wrote to USB.'
            assert target.read_bytes() == data and version.read_bytes() == v, 'Query/refusal changed target.'
            assert (backup_path.read_bytes() if backup_path.exists() else None) == backup_data, 'Query/refusal changed backup.'
            assert {q.name: q.read_bytes() for q in service.glob('*') if q.is_file()} == service_data, 'Query/refusal changed service.'
            assert not events.exists(), 'Query/refusal reached a modifying command.'
            checks += 1
            print('PASS', id_, ' '.join(action) or 'usage', state or code, flush=True)
            return result
        run(['status'], 'uninstalled')
        if id_ == 'hud-street-name':
            for hud in ['mono', 'combiner', 'none', 'unknown']:
                env['TEST_HUD'] = hud
                run(['status'], 'unavailable', reason=True)
                run(['install'], code=1)
            env['TEST_HUD'] = 'whud'
            run(['status'], 'uninstalled')
        for action in [[], ['--help'], ['-h']]:
            assert 'Usage:' in run(action).stdout
        run(['unknown'], code=1); run(['status', 'extra'], code=1)
        # Build the installed fixture using the actual patch command, preserving offsets.
        subprocess.run([SHELL, '-c', 'cd "$1" && patch -N -p0 -i "$2"', '--', bp(base), bp(worker / 'assets/change.patch')], env=env, check=True, capture_output=True)
        backup = Path(str(target) + '.org')
        write(backup, original)
        if id_ == 'ssh':
            service.mkdir()
            for name in ['service.sh', 'sshd_config', 'password.hash']:
                shutil.copyfile(worker / 'assets' / name, service / name)
            write(service / 'enabled', 'enabled\n')
        run(['status'], 'installed')
        if id_ == 'hud-street-name':
            env['TEST_HUD'] = 'mono'
            run(['status'], 'broken', reason=True)
            env['TEST_HUD'] = 'whud'
            result = run(['status'], 'installed')
            assert 'Detected compatible color windshield HUD.' not in result.stderr
            for hud in ['mono', 'combiner', 'none', 'unknown']:
                env['TEST_HUD'] = hud
                run(['status'], 'broken', reason=True)
                run(['install'], code=1)
            env['TEST_HUD'] = 'whud'
            run(['status'], 'installed')
        write(backup, 'corrupt original backup\n')
        run(['status'], 'broken', reason=True)
        write(backup, original)
        # Installed state plus a failed worker-owned prerequisite is broken.
        injected = 'mzd_check_prerequisites() { printf "Required component missing.\\n" >&2; return 1; }\n'
        write(p, source.replace('if [ "$ACTION" = status ]; then', injected + 'if [ "$ACTION" = status ]; then', 1))
        run(['status'], 'broken', reason=True)
        write(p, source)
        if id_ == 'ssh':
            saved = target.read_text()
            additions = ''.join(line[1:] for line in patch.splitlines(keepends=True) if line.startswith('+') and not line.startswith('+++'))
            write(target, saved + additions)
            run(['status'], 'broken', reason=True)
            run(['install'], code=1); run(['uninstall'], code=1)
            write(target, saved)
            (service / 'enabled').unlink(); run(['status'], 'broken', reason=True)
            write(service / 'enabled', 'enabled\n')
            (service / 'service.sh').unlink(); run(['status'], 'broken', reason=True)
            shutil.copyfile(worker / 'assets/service.sh', service / 'service.sh')
        else:
            # Keep one applied hunk and damage another. Single-hunk patches use
            # a changed context and correctly return unavailable without guessing.
            installed = target.read_text(encoding='utf-8')
            hunks = patch.count('\n@@ ')
            match = list(re.finditer(r'^@@ .*\n', patch, re.M))[-1]
            context = next(line[1:] for line in patch[match.end():].splitlines() if line.startswith('+') and line[1:].strip())
            position = installed.rfind(context)
            assert position >= 0, (id_, 'last patch context not found')
            write(target, installed[:position] + installed[position:].replace(context, context + ' // damaged', 1))
            run(['status'], 'broken' if hunks > 1 else 'unavailable', reason=True)
        write(target, 'unsupported target content\n')
        if service.exists(): shutil.rmtree(service)
        run(['status'], 'unavailable', reason=True)
        run(['install'], code=1); run(['uninstall'], code=1)
        write(target, original)
        write(version, 'JCI_SW_VER="MAZ_CMU-150_99.00.000"\n')
        run(['status'], 'unavailable', reason=True)
        version.unlink()
        # Version is deliberately absent: capture manually, retaining mutation guards.
        r = subprocess.run([SHELL, bp(p), 'status'], env=env, capture_output=True, text=True, timeout=30)
        assert r.returncode == 1 and r.stdout == '' and r.stderr.strip(); checks += 1
        write(version, 'JCI_SW_VER="MAZ_CMU-150_74.00.324"\n')
        lock.mkdir(); run(['status'], code=1); lock.rmdir()
        # Real worker dependency checks: missing requirement, conflict and cycle.
        for setting, value in [('REQUIRES', 'missing'), ('CONFLICTS', 'missing'), ('REQUIRES', id_)]:
            write(manifest_path, re.sub(r'^' + setting.lower() + '=.*$', setting.lower() + '=' + value, manifest_source, flags=re.M))
            run(['status'], 'unavailable', reason=True)
        write(manifest_path, manifest_source)
        write(p, source)
        # Add a worker-owned component check without changing the status helper.
        injected = 'mzd_check_prerequisites() { printf "Required component missing.\\n" >&2; return 1; }\n'
        write(p, source.replace('if [ "$ACTION" = status ]; then', injected + 'if [ "$ACTION" = status ]; then', 1))
        run(['status'], 'unavailable', reason=True)
        write(p, source)
        patch_path = worker / 'assets/change.patch'
        write(patch_path, patch.replace('--- target.data', '--- forbidden.data'))
        run(['status'], code=1)
        write(patch_path, patch)
        # An unavailable/crashed probe tool is an inspection failure, not an
        # assertion that this target is incompatible.
        write(bins / 'patch', '#!/bin/sh\nprintf "patch: applet not found\\n" >&2\nexit 127\n')
        # OEM identity establishes absence without running the patch applet.
        run(['status'], 'uninstalled')
        write(target, 'unsupported target content\n')
        run(['status'], code=1)
        (bins / 'patch').unlink()
        if os.environ.get('CMU_TEST_BUSYBOX'): os.symlink(busybox, bins / 'patch')
        # Exercise successful changes and rollback through the same entrypoint.
        # Only mount/watchdog/service effects are simulated; real patching,
        # backup checks, reports, locks and result cleanup still execute.
        write(target, original)
        resources = base / 'resources'; resources.mkdir()
        mounts = base / 'mounts'; gpio = base / 'gpio'
        write(gpio, '0\n')
        mount_text = 'mock %s vfat rw 0 0\nroot / relfs ro 0 0\nmock %s relfs ro 0 0\n' % (bp(usb), bp(resources))
        write(mounts, mount_text)
        for lib in (usb / 'lib').glob('*.sh'):
            text = lib.read_text(encoding='utf-8').replace('/proc/mounts', bp(mounts))
            text = text.replace('/sys/class/gpio/Watchdog\\ Disable/value', bp(gpio))
            write(lib, text)
        modified = source
        modified = modified.replace('mzd_system_remount_rw /tmp/mnt/resources', 'mzd_system_remount_rw ' + bp(resources))
        write(p, modified)
        write(bins / 'sync', '#!/bin/sh\nprintf "sync\\n" >> ' + shlex.quote(bp(events)) + '\n')
        write(bins / 'mount', '''#!/bin/sh
printf 'mount\\n' >> EVENTS
if [ "$3" = / ] && [ "$2" = ro,remount ] && [ -f FAIL ]; then exit 1; fi
awk -v target="$3" -v option="$2" '$2==target {$4=(option=="rw,remount"?"rw":"ro")} {print}' MOUNTS > NEXT
mv NEXT MOUNTS
'''.replace('EVENTS', shlex.quote(bp(events))).replace('FAIL', shlex.quote(bp(base / 'fail-cleanup')))
              .replace('MOUNTS', shlex.quote(bp(mounts))).replace('NEXT', shlex.quote(bp(base / 'mounts.next'))))
        write(bins / 'cat', '''#!/bin/sh
case "$1" in
 */install/target.data|*/uninstall/target.data) if [ -f FAIL ]; then printf corrupt; exit 0; fi ;;
 */before.data) if [ -f BAD_ROLLBACK ]; then printf corrupt; exit 0; fi ;;
esac
exec /bin/cat "$@"
'''.replace('BAD_ROLLBACK', shlex.quote(bp(base / 'fail-rollback'))).replace('FAIL', shlex.quote(bp(base / 'fail-write'))))
        if id_ == 'ssh':
            write(worker / 'assets/service.sh', '''#!/bin/sh
case "$1" in
 check) exit 0 ;;
 boot) [ ! -f FAIL_START ] || exit 1; : > RUNNING ;;
 status) [ -f RUNNING ] ;;
 stop) [ ! -f FAIL_STOP ] || exit 1; rm -f RUNNING ;;
 *) exit 1 ;;
esac
'''.replace('FAIL_START', shlex.quote(bp(base / 'fail-start'))).replace('FAIL_STOP', shlex.quote(bp(base / 'fail-stop')))
                  .replace('RUNNING', shlex.quote(bp(base / 'running'))))
        def mutate(action, code=0):
            global checks
            previous_reports = set((usb / "reports" / id_).glob(action + "-*"))
            r = subprocess.run([SHELL, bp(p), action], env=env, capture_output=True, text=True, timeout=30)
            if r.returncode != code:
                print('TARGET_ON_FAILURE', repr(target.read_text()), flush=True)
                logs = sorted((base / 'probe-debug').rglob('*.log'), key=lambda x: x.stat().st_mtime_ns)
                for log in logs[-10:]: print(log.relative_to(base), log.read_text(errors='replace'), flush=True)
            assert r.returncode == code, (id_, action, code, r.returncode, r.stdout, r.stderr)
            assert 'in progress' not in r.stdout, 'Stale progress leaked into final GUI output.'
            created = set((usb / "reports" / id_).glob(action + "-*")) - previous_reports
            assert len(created) == 1, (id_, action, created)
            report = created.pop()
            assert (report / "run.log").is_file() and (report / "status.txt").is_file()
            assert bp(report) in r.stdout + r.stderr, "Displayed report path does not match output directory."
            assert not (usb / "reports/diffpatch").exists()
            assert not lock.exists() and gpio.read_text().strip() == '0'
            if code == 2: assert 'Do NOT reboot' in r.stderr, (id_, r.stderr)
            elif code: assert 'completed.' not in r.stdout
            if code != 2: assert 'root / relfs ro ' in mounts.read_text()
            if events.exists(): events.unlink()
            checks += 1
            print('PASS', id_, action, 'exit', code, flush=True)
            return r
        mutate('install'); run(['status'], 'installed')
        mutate('install')
        # Preserve an unrelated edit through uninstall and reinstall.
        target.write_text(target.read_text() + '// unrelated sentinel\n', encoding='utf-8', newline='\n')
        if id_ == 'hud-street-name': env['TEST_HUD'] = 'combiner'
        mutate('uninstall'); assert target.read_text() == original + '// unrelated sentinel\n'
        if id_ == 'hud-street-name': env['TEST_HUD'] = 'whud'
        run(['status'], 'uninstalled')
        mutate('uninstall')
        write(base / 'fail-write', 'yes')
        mutate('install', 1); assert target.read_text() == original + '// unrelated sentinel\n'
        write(base / 'fail-rollback', 'yes')
        mutate('install', 2)
        (base / 'fail-write').unlink(); (base / 'fail-rollback').unlink()
        write(target, original + '// unrelated sentinel\n')
        write(base / 'fail-cleanup', 'yes')
        mutate('install', 2)
        (base / 'fail-cleanup').unlink(); write(mounts, mount_text)
        mutate('uninstall')
        if id_ == 'ssh':
            write(base / 'fail-start', 'yes')
            mutate('install', 1)
            assert target.read_text() == original + '// unrelated sentinel\n'
            (base / 'fail-start').unlink(); mutate('uninstall')
            mutate('install'); write(base / 'fail-stop', 'yes'); mutate('uninstall', 2)
            (base / 'fail-stop').unlink(); mutate('uninstall')
        if id_ in ['list-beep', 'ssh', 'hud-street-name']:
            # The real worker must also work from its persistent package with
            # its own helpers and reports still written to the originating USB.
            persist=base/'persist';persist.mkdir()
            mounts.write_text(mounts.read_text()+'mock '+bp(persist)+' relfs rw 0 0\n',encoding='utf-8',newline='\n')
            package_lib=usb/'lib/packages.sh'
            package_source=package_lib.read_text().replace('MZD_PACKAGE_STORE=/tmp/mnt/data_persist/mzd-tweaks/installed','MZD_PACKAGE_STORE='+shlex.quote(bp(persist/'installed'))).replace('MZD_PACKAGE_MOUNT=/tmp/mnt/data_persist','MZD_PACKAGE_MOUNT='+shlex.quote(bp(persist))).replace('MZD_PACKAGE_LOCK=/tmp/mzd-packages.lock','MZD_PACKAGE_LOCK='+shlex.quote(bp(base/'packages.lock')))
            write(package_lib,package_source)
            if id_=='ssh':
                paths=worker/'managed-paths.tsv'
                write(paths,paths.read_text().replace('/tmp/mnt/resources/mzd-tweaks/ssh',bp(service)))
            adapter=usb/'installer.sh'
            write(adapter,(ROOT/'installer.sh').read_text().replace('#!/bin/sh\n','#!/bin/sh\nPATH='+shlex.quote(bp(bins)+':/usr/bin:/bin')+'\nexport PATH\n',1))
            def managed(action, expected=None):
                global checks
                r=subprocess.run([SHELL,bp(adapter),'action',id_,action],env=env,capture_output=True,text=True,timeout=45)
                assert r.returncode==0,(id_,action,r.returncode,r.stdout,r.stderr)
                if expected is not None:assert r.stdout==expected+'\n',(id_,r.stdout,r.stderr)
                checks+=1
            if id_ == 'hud-street-name':
                for bad_hud in ['combiner', 'unknown']:
                    env['TEST_HUD'] = 'whud'
                    managed('install'); managed('status', 'installed')
                    env['TEST_HUD'] = bad_hud
                    if bad_hud == 'unknown':
                        write(worker / 'assets/change.patch', 'new incompatible USB payload\n')
                    managed('uninstall')
                    assert target.read_text() == original + '// unrelated sentinel\n'
                    assert not (persist / 'installed' / id_).exists()
                env['TEST_HUD'] = 'whud'
            else:
                managed('install');managed('status','installed')
                # A newer USB payload/patch must not be used for the saved uninstall.
                if id_=='ssh':write(worker/'assets/service.sh','#!/bin/sh\nexit 97\n')
                else:write(worker/'assets/change.patch','new incompatible USB payload\n')
                managed('status','installed');managed('uninstall')
                assert target.read_text()==original+'// unrelated sentinel\n'
                assert not (persist/'installed'/id_).exists()
print('WORKER_CONTRACT_PASSED:', checks, 'real-entrypoint checks.')
