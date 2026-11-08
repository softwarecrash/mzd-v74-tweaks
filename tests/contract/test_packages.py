"""Real installer/package controller on private fixtures, no vehicle writes."""
import re
from pathlib import Path
import os
import json
import shlex
import shutil
import subprocess
import tempfile

ROOT=Path(__file__).resolve().parents[2]
SHELL='C:/Program Files/Git/bin/bash.exe' if os.name=='nt' else '/bin/sh'
def bp(p):
    s=Path(p).resolve().as_posix()
    return '/'+s[0].lower()+s[2:] if len(s)>1 and s[1]==':' else s
def write(p,s):
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(s,encoding='utf-8',newline='\n');p.chmod(0o755)
checks=0
with tempfile.TemporaryDirectory(prefix='cmu-packages-') as directory:
    base=Path(directory);usb=base/'usb';persist=base/'persist';store=persist/'installed'
    bins=base/'bin';mounts=base/'mounts';lock=base/'lock';events=base/'events';version=base/'version'
    write(version,'JCI_SW_VER="MAZ_CMU-150_74.00.324"\n')
    persist.mkdir();bins.mkdir()
    shutil.copytree(ROOT/'usb/lib',usb/'lib')
    write(usb/'installer.sh',(ROOT/'usb/installer.sh').read_text().replace('#!/bin/sh\n','#!/bin/sh\nPATH='+shlex.quote(bp(bins)+':/usr/bin:/bin')+'\nexport PATH\n',1))
    pkg=usb/'lib/packages.sh'
    source=pkg.read_text().replace('MZD_PACKAGE_STORE=/tmp/mnt/data_persist/mzd-tweaks/installed','MZD_PACKAGE_STORE='+shlex.quote(bp(store))).replace('MZD_PACKAGE_MOUNT=/tmp/mnt/data_persist','MZD_PACKAGE_MOUNT='+shlex.quote(bp(persist))).replace('MZD_PACKAGE_MOUNTS=/proc/mounts','MZD_PACKAGE_MOUNTS='+shlex.quote(bp(mounts))).replace('MZD_PACKAGE_LOCK=/tmp/mzd-packages.lock','MZD_PACKAGE_LOCK='+shlex.quote(bp(lock)))
    write(pkg,source.replace('/jci/version.ini',bp(version)))
    write(mounts,f'/dev/mmcblk0p2 {bp(persist)} relfs rw 0 0\n/dev/sdb1 {bp(usb)} vfat rw 0 0\n')
    write(bins/'sync','#!/bin/sh\nexit 0\n')
    write(bins/'df','#!/bin/sh\nif [ -f '+shlex.quote(bp(base/'no-space'))+' ]; then free=1; elif [ -f '+shlex.quote(bp(base/'custom-free'))+' ]; then free=$(cat '+shlex.quote(bp(base/'custom-free'))+'); else free=900000; fi\nprintf "Filesystem 1024-blocks Used Available Capacity Mounted\\nfixture 1000000 100000 %s 10%% persist\\n" "$free"\n')
    # The factory BusyBox awk does not decode backslash-t in the -F argument.
    # A literal ASCII tab is required; fail explicitly if this regression returns.
    write(bins/'awk', r'''#!/bin/sh
previous=''
for argument do
    if [ "$previous" = -F ] && [ "$argument" = '\t' ]; then
        echo 'Factory awk requires a literal tab field separator.' >&2
        exit 90
    fi
    previous=$argument
done
exec /usr/bin/awk "$@"
''')
    env=dict(os.environ,PATH=bp(bins)+':/usr/bin:/bin')
    def make(id_,version='1.0.0',target=None,extra='',requires=''):
        target=target or base/(id_+'.target')
        folder=usb/'tweaks'/id_
        manifest=(ROOT/'usb/tweaks/list-beep/manifest.conf').read_text()
        import re
        for key,value in dict(id=id_,version=version,target=bp(target),requires=requires).items():
            manifest=re.sub('^'+key+'=.*$',key+'='+value,manifest,flags=re.M)
        write(folder/'manifest.conf',manifest)
        write(folder/'run.sh',f'''#!/bin/sh
set -eu
HERE=$(CDPATH= cd "$(dirname "$0")" && pwd)
ROOT=$(CDPATH= cd "$HERE/../.." && pwd)
. "$ROOT/lib/test-helper.sh"
TARGET={shlex.quote(bp(target))}
EVENTS={shlex.quote(bp(events))}
FAIL={shlex.quote(bp(base/'fail-uninstall'))}
case "$1" in
status)
    # Event proves that registered menu status does not execute worker probes.
    printf 'probe {id_} {version}\\n' >> "$EVENTS"
    if [ -e "$TARGET" ] && [ ! -f {shlex.quote(bp(base/"fail-verification"))} ]; then printf 'installed\\n'; else printf 'uninstalled\\n'; fi ;;
install)
    printf 'install {id_} {version} %s %s\\n' "$HELPER" "$ROOT" >> "$EVENTS"
    [ ! -f {shlex.quote(bp(base/'fail-install'))} ] || {{ printf 'fixture installation failed: permission denied\\n' >&2; exit 1; }}
    printf '{version}\\n' > "$TARGET" ;;
uninstall)
    printf 'uninstall {id_} {version} %s\\n' "$HELPER" >> "$EVENTS"
    [ ! -f "$FAIL" ] || exit 1
    rm -f "$TARGET" ;;
*) exit 1 ;;
esac
''')
        write(usb/'lib/test-helper.sh','HELPER='+version+'\n')
        if extra:write(folder/'managed-paths.tsv',extra)
        elif (folder/'managed-paths.tsv').exists():(folder/'managed-paths.tsv').unlink()
        return folder,target
    def call(args,code=0,output=None):
        global checks
        r=subprocess.run([SHELL,bp(usb/'installer.sh'),*args],env=env,capture_output=True,text=True,timeout=30)
        assert r.returncode==code,(args,r.returncode,r.stdout,r.stderr)
        if output is not None:assert r.stdout==output,(args,r.stdout,r.stderr)
        checks+=1;return r
    def action(id_,name,code=0,output=None):return call(['action',id_,name],code,output)
    def text():return events.read_text() if events.exists() else ''
    # A stdout-only preflight refusal must survive staging diagnostics, with
    # its rejected override and scratch snapshot removed before publication.
    rejected, rejected_target = make('rejected')
    write(rejected/'manifest.conf', (rejected/'manifest.conf').read_text()+'preflight=true\n')
    write(rejected/'run.sh', (rejected/'run.sh').read_text().replace('case "$1" in',
        'case "$1" in\npreflight) printf "block\\tSupplied key is invalid.\\n"; exit 1 ;;'))
    write(rejected/'assets/authorized_keys.conf', '')
    write(usb/'user/rejected/authorized_keys.conf', '-----BEGIN PRIVATE KEY-----\nfixture only\n')
    refused = action('rejected','install',1)
    assert 'Supplied key is invalid.' in refused.stderr, refused
    assert not rejected_target.exists() and not (store/'rejected').exists()
    assert not list(store.glob('.stage-rejected-*')), 'Rejected overrides must not remain in persistent scratch.'
    shutil.rmtree(rejected); shutil.rmtree(usb/'user/rejected'); store.rmdir(); events.unlink(missing_ok=True)
    # Manifest-declared optional files are excluded, not just disabled at runtime.
    conditional, conditional_target=make('conditional')
    write(conditional/'manifest.conf',(conditional/'manifest.conf').read_text()+
          'settings=keymode\nsetting.keymode.type=choice\nsetting.keymode.label=Public key\n'
          'setting.keymode.default=ignore\nsetting.keymode.options=ignore install\n'
          'setting.keymode.asset=authorized_keys.conf\nsetting.keymode.asset_source=public.key\nsetting.keymode.asset_when=install\n')
    write(conditional/'run.sh',(conditional/'run.sh').read_text().replace(
        '    # Event proves',
        '    if grep -q "^keymode=install$" "${MZD_SETTINGS_FILE:-$ROOT/settings.conf}" 2>/dev/null && [ ! -s "$HERE/assets/authorized_keys.conf" ]; then printf \"unavailable\\n\"; exit 0; fi\n    # Event proves'))
    write(conditional/'assets/authorized_keys.conf','')
    write(usb/'user/conditional/public.key','unsupported-key fixture\n')
    write(usb/'user/conditional/authorized_keys.conf','same-name override must not bypass the setting\n')
    (conditional/'assets/authorized_keys.conf').unlink()
    action('conditional','install',1)
    assert not conditional_target.exists() and not (store/'conditional').exists()
    write(conditional/'assets/authorized_keys.conf','')
    action('conditional','install')
    assert not (store/'conditional/package/tweaks/conditional/assets/authorized_keys.conf').read_bytes()
    assert not list((store/'conditional/package').rglob('public.key'))
    write(conditional/'manifest.conf',re.sub(r'^version=.*$', 'version=99.0.0', (conditional/'manifest.conf').read_text(), flags=re.M))
    action('conditional','update')
    assert not (store/'conditional/package/tweaks/conditional/assets/authorized_keys.conf').read_bytes()
    action('conditional','uninstall')
    write(usb/'user/conditional/public.key','ssh-rsa public-fixture\n')
    call(['action','conditional','install','keymode=install'])
    assert (store/'conditional/package/tweaks/conditional/assets/authorized_keys.conf').read_text()=='ssh-rsa public-fixture\n'
    action('conditional','uninstall')
    shutil.rmtree(conditional);shutil.rmtree(usb/'user/conditional');store.rmdir();events.unlink(missing_ok=True)
    folder,target=make('alpha')
    call(['uninstall-check','alpha'],1)
    # No receipt means uninstalled even if a target exists. No old patch/hash
    # probing and no command worker may run during menu status collection.
    write(target,'unmanaged content\n')
    write(bins/'md5sum','#!/bin/sh\necho status-must-not-hash >&2\nexit 91\n')
    shutil.copytree(ROOT/'development/examples/hello',usb/'tweaks/hello')
    write(usb/'tweaks/hello/run.sh','#!/bin/sh\necho command-must-not-run >> '+shlex.quote(bp(events))+'\nexit 91\n')
    action('alpha','status',output='uninstalled\n')
    action('hello','status',output='uninstalled\n')
    call(['statuses','alpha hello'],output='alpha\tuninstalled\t\nhello\tuninstalled\t\n')
    assert not events.exists() and not store.exists()
    (bins/'md5sum').unlink();target.unlink()
    # Asset override replaces bundled version entirely (not merged)
    write(folder/'assets/custom.conf', 'release=default\nbundled_extra=123\n')
    write(usb/'user/alpha/custom.conf', 'user=custom\n')
    action('alpha','install')
    entry=store/'alpha'
    assert 'state=installed' in (entry/'state.conf').read_text()
    installed_custom = (entry/'package/tweaks/alpha/assets/custom.conf').read_text()
    assert installed_custom == 'user=custom\n'
    assert 'bundled_extra' not in installed_custom
    # Aggregate discovery preserves literal text and isolates invalid tweaks.
    write(usb/'tweaks/invalid/manifest.conf','id=invalid\n')
    rows={r['key']:r for r in map(json.loads,call(['manifests']).stdout.splitlines())}
    assert rows['alpha']['exitCode']==0 and rows['alpha']['stdout']==(folder/'manifest.conf').read_text()
    assert rows['invalid']['exitCode']==1 and rows['invalid']['stderr']
    shutil.rmtree(usb/'tweaks/invalid')
    # Read-only details verify sections independently without owning a global lock.
    manifest_before=(folder/'manifest.conf').read_text()
    write(folder/'manifest.conf',manifest_before.replace('version=1.0.0','version=2.0.0'))
    pkg_before=pkg.read_text();detail_counter=base/'detail-check-count'
    write(pkg,pkg_before.replace('mzd_package_check_full() (\n','mzd_package_check_full() (\n    printf "check\\n" >> '+shlex.quote(bp(detail_counter))+'\n',1))
    rows={r['key']:r for r in map(json.loads,call(['details','alpha','package-info settings-info update-info']).stdout.splitlines())}
    assert rows['package-info']['stdout']=='1.0.0\tinstalled\n'
    assert rows['update-info']['stdout']=='available\t1.0.0\t2.0.0\n'
    assert rows['settings-info']['exitCode']==0
    assert detail_counter.read_text().splitlines()==['check']*3 and not lock.exists()
    write(pkg,pkg_before);write(folder/'manifest.conf',manifest_before)
    call(['details','alpha','action'],1)
    call(['details','alpha','settings-info settings-info'],1)
    lock.mkdir();call(['details','alpha','settings-info']);assert lock.exists();lock.rmdir()
    # Forced termination of a blocked read-only check cannot leave a mutation lock.
    if os.name!='nt':
        import signal,time
        ready=base/'hash-blocked';real_hash=shutil.which('md5sum');assert real_hash
        write(bins/'md5sum','#!/bin/sh\nprintf ready > '+shlex.quote(str(ready))+'\nsleep 30\nexec '+shlex.quote(real_hash)+' "$@"\n')
        reader=subprocess.Popen([SHELL,str(usb/'installer.sh'),'details','alpha','settings-info'],env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,start_new_session=True)
        try:
            deadline=time.monotonic()+5
            while not ready.exists() and time.monotonic()<deadline:time.sleep(0.01)
            assert ready.exists() and not lock.exists()
        finally:
            os.killpg(reader.pid,signal.SIGKILL);reader.communicate(timeout=5)
            (bins/'md5sum').unlink()
        assert not lock.exists()
        checks+=1
    # Glob expansion must remain enabled for dependent and unknown-file checks.
    write(folder/'manifest.conf',manifest_before.replace('version=1.0.0','version=2.0.0'))
    make('beta',requires='alpha');action('beta','install')
    for command in ['uninstall-check','update-info']:
        direct=call([command,'alpha'],1)
        bundled=json.loads(call(['details','alpha',command]).stdout)
        assert bundled['exitCode']==1 and 'Required by installed tweak: beta' in bundled['stderr'],bundled
    action('beta','uninstall');shutil.rmtree(usb/'tweaks/beta')
    write(entry/'unexpected.txt','keep foreign data\n')
    for command in ['settings-info','update-info','uninstall-check']:
        bundled=json.loads(call(['details','alpha',command]).stdout)
        assert bundled['exitCode']==1 and 'Unexpected files' in bundled['stderr'],bundled
    (entry/'unexpected.txt').unlink()
    # Reject a changed saved schema before any saved code can execute.
    saved_manifest=entry/'package/tweaks/alpha/manifest.conf'
    saved_schema=entry/'package/lib/settings.awk'
    manifest_bytes=saved_manifest.read_bytes();schema_bytes=saved_schema.read_bytes()
    marker=base/'unverified-code-ran'
    write(saved_manifest,saved_manifest.read_text()+'settings=flag\nsetting.flag.type=boolean\nsetting.flag.label=Flag\nsetting.flag.default=false\n')
    write(saved_schema,'BEGIN {system("touch '+str(marker)+'"); exit 0}\n')
    call(['update-info','alpha'],1);call(['package-info','alpha'],1)
    assert not marker.exists()
    saved_manifest.write_bytes(manifest_bytes);saved_schema.write_bytes(schema_bytes)
    # Encoding must preserve NUL, SOH at a line end and valid UTF-8 exactly.
    payload=base/'json-bytes';payload.write_bytes(bytes(range(32))+b'\nline\x01\nlast\x01'+ ' \u00e4\u65e5'.encode())
    encoded=subprocess.run([SHELL,'-c','. "$1"; mzd_info_json_string "$2"','json',str(usb/'lib/installer-info.sh'),str(payload)],capture_output=True,text=True,check=True)
    assert json.loads(encoded.stdout).encode()==payload.read_bytes()
    checks+=1
    # Cache cleanup must never demote a critical worker result.
    critical_worker=base/'critical-worker.sh';write(critical_worker,'#!/bin/sh\nexit 2\n')
    critical_script='. '+shlex.quote(str(pkg))+'; calls=0; mzd_package_cache_clear() { calls=$((calls+1)); [ "$calls" = 1 ]; }; mzd_package_exec_worker '+shlex.quote(str(critical_worker))
    critical_result=subprocess.run([SHELL,'-c',critical_script],capture_output=True,text=True)
    assert critical_result.returncode==2,critical_result
    checks+=1
    write(folder/'manifest.conf',manifest_before)
    # Real saved-package verification is reused only inside one mutation-free phase.
    counter=base/'full-check-count';probe=base/'cache-probe.sh'
    probe_source=pkg.read_text().replace('mzd_package_check_full() (\n', 'mzd_package_check_full() (\n    printf "check\\n" >> '+shlex.quote(bp(counter))+'\n',1)
    write(probe,probe_source)
    checked_file=entry/'package/lib/test-helper.sh';original_bytes=checked_file.read_bytes()
    saved_copy=base/'original-helper';saved_copy.write_bytes(original_bytes)
    no_cache_export=base/'no-cache-export.sh';write(no_cache_export,'#!/bin/sh\n[ "${MZD_PACKAGE_CACHE+set}" != set ]\n')
    common='. '+shlex.quote(bp(usb/'lib/manifest.sh'))+'; . '+shlex.quote(bp(probe))+'; entry='+shlex.quote(bp(entry))+'; checked='+shlex.quote(bp(checked_file))+'; '
    setup='mzd_package_cache_begin || exit 1; trap \'rm -rf "$MZD_PACKAGE_CACHE"\' 0; '
    tamper='printf "changed\\n" >> "$checked"; '
    scenarios=[
        (setup+'mzd_package_check "$entry" && mzd_package_check "$entry"',1),
        (setup+'mzd_package_check "$entry" || exit 1; '+tamper+'mzd_package_set_state "$entry" installed || exit 1; ! mzd_package_check "$entry"',2),
        (setup+'mzd_package_check "$entry" || exit 1; mzd_package_worker "$entry" status >/dev/null || exit 1; '+tamper+'! mzd_package_check "$entry"',2),
        (setup+tamper+'if mzd_package_check "$entry"; then exit 1; fi; cp '+shlex.quote(bp(saved_copy))+' "$checked"; mzd_package_check "$entry"',2),
        (setup+'mzd_package_check "$entry" || exit 1; mzd_package_cache_clear; '+tamper+'! mzd_package_check "$entry"',2),
        (setup+'mzd_package_check "$entry" || exit 1; mzd_package_exec_worker "$entry/package/tweaks/alpha/run.sh" status >/dev/null || exit 1; '+tamper+'! mzd_package_check "$entry"',2),
        (setup+'mzd_package_check "$entry" || exit 1; mzd_package_exec_worker '+shlex.quote(bp(no_cache_export))+' || exit 1; mzd_package_check "$entry"',2),
    ]
    for script,expected_checks in scenarios:
        checked_file.write_bytes(original_bytes)
        if counter.exists():counter.unlink()
        result=subprocess.run([SHELL,'-c',common+script],env=dict(env,MZD_PACKAGE_CACHE='/untrusted-caller-cache'),capture_output=True,text=True,timeout=30)
        assert result.returncode==0,(result.stdout,result.stderr)
        assert len(counter.read_text().splitlines())==expected_checks
        checks+=1
    checked_file.write_bytes(original_bytes)
    shutil.rmtree(usb/'user/alpha')
    action('alpha','uninstall')

    # Size limit on configuration overrides (exceeding 64 KB is rejected)
    write(usb/'user/alpha/custom.conf', 'x' * 65537)
    r = action('alpha', 'install', 1)
    assert 'Configuration override exceeds size limit of 64 KB: custom.conf' in r.stderr
    assert not entry.exists() and not target.exists()
    shutil.rmtree(usb/'user/alpha')

    # Unsupported configuration override file
    write(usb/'user/alpha/override.txt', 'notes\n')
    r = action('alpha', 'install', 1)
    assert 'Unsupported configuration override: override.txt' in r.stderr
    assert not entry.exists() and not target.exists()
    shutil.rmtree(usb/'user/alpha')

    # Subdirectory in user dir is rejected
    write(usb/'user/alpha/sub/nested.conf', 'nested\n')
    r = action('alpha', 'install', 1)
    assert 'Configuration override must be a regular file.' in r.stderr
    assert not entry.exists() and not target.exists()
    shutil.rmtree(usb/'user/alpha')

    # User configuration size is included in the persistent free-space calculation
    base_sizes = subprocess.run([SHELL, '-c', f'du -sk {shlex.quote(bp(folder))} {shlex.quote(bp(usb/"lib"))}'], capture_output=True, text=True, check=True).stdout
    base_needed = sum(int(line.split()[0]) for line in base_sizes.splitlines()) + 1024
    write(base/'custom-free', str(100000 + base_needed + 5))
    action('alpha', 'install')
    action('alpha', 'uninstall')
    write(usb/'user/alpha/custom.conf', 'k=' + ('v' * 20000) + '\n')
    r = action('alpha', 'install', 1)
    assert 'Not enough persistent space; installation has not started.' in r.stderr
    assert not entry.exists() and not target.exists()
    shutil.rmtree(usb/'user/alpha')
    (base/'custom-free').unlink()

    write(usb/'user/alpha/custom.conf', 'user=custom\n')
    action('alpha','install')
    shutil.rmtree(usb/'user/alpha')
    assert 'install alpha 1.0.0 1.0.0 '+bp(entry/'package') in text()
    before=text();snapshot={p.relative_to(store):p.read_bytes() for p in store.rglob('*') if p.is_file()}
    action('alpha','status',output='installed\n')
    write(bins/'md5sum','#!/bin/sh\nexit 91\n')
    call(['statuses','alpha hello'],output='alpha\tinstalled\t\nhello\tuninstalled\t\n')
    (bins/'md5sum').unlink()
    assert text()==before and snapshot=={p.relative_to(store):p.read_bytes() for p in store.rglob('*') if p.is_file()}
    # New USB code and helpers must never handle the old uninstall.
    make('alpha','2.0.0')
    call(['package-info','alpha'],output='1.0.0\tinstalled\n')
    action('alpha','uninstall')
    assert 'uninstall alpha 1.0.0 1.0.0' in text() and not entry.exists() and not target.exists()
    action('alpha','install');assert target.read_text()=='2.0.0\n'
    # Version replacement stages first and uses the saved runtime before publishing.
    make('alpha','3.0.0');write(base/'no-space','yes')
    before=text();action('alpha','install',1)
    assert target.read_text()=='2.0.0\n' and text()==before
    (base/'no-space').unlink();action('alpha','install')
    assert 'uninstall alpha 2.0.0 2.0.0' in text() and target.read_text()=='3.0.0\n'
    # Explicit updates require a newer version and preserve a verified old snapshot.
    before=text();call(['update-info','alpha'],1);action('alpha','update',1);assert text()==before
    make('alpha','3.1.0');call(['update-info','alpha'],output='available\t3.0.0\t3.1.0\n')
    call(['action','alpha','update','9.0.0'],1);assert target.read_text()=='3.0.0\n'
    call(['action','alpha','update','3.1.0']);assert target.read_text()=='3.1.0\n'
    assert not list(store.glob('.update-*'))
    make('alpha','3.2.0');write(base/'fail-install','yes')
    r=action('alpha','update',1);assert 'Previous version recovery snapshot retained:' in r.stderr
    archives=list(store.glob('.update-*/alpha'));assert len(archives)==1
    assert 'version=3.1.0' in (archives[0]/'package/tweaks/alpha/manifest.conf').read_text()
    assert 'state=installed' in (archives[0]/'state.conf').read_text()
    (base/'fail-install').unlink();action('alpha','uninstall')
    for archive in store.glob('.update-*'):shutil.rmtree(archive)
    make('alpha','3.0.0');action('alpha','install')
    # Saved packages remain discoverable/removable without a USB tweak folder.
    shutil.rmtree(folder)
    assert 'alpha\n' in call(['list']).stdout
    assert 'version=3.0.0' in call(['manifest','alpha']).stdout
    action('alpha','status',output='installed\n');action('alpha','uninstall')
    # Failed uninstall never loses the matching uninstaller or installs a replacement.
    make('alpha');action('alpha','install');make('alpha','2.0.0')
    write(base/'fail-uninstall','yes');action('alpha','install',1)
    assert target.read_text()=='1.0.0\n' and entry.exists()
    assert 'state=failed' in (entry/'state.conf').read_text()
    action('alpha','status',output='broken\n');(base/'fail-uninstall').unlink()
    action('alpha','uninstall')
    # Interrupted states and incomplete immutable payloads cannot look complete.
    action('alpha','install');write(entry/'state.conf','format=1\nstate=installing\n')
    action('alpha','status',output='broken\n');action('alpha','install',1)
    write(entry/'state.conf','format=1\nstate=installed\n')
    saved=entry/'package/lib/test-helper.sh';original=saved.read_text();write(saved,'HELPER=tampered\n')
    before=text();action('alpha','uninstall',1);assert text()==before
    saved.unlink();r=action('alpha','status',output='broken\n');assert bp(saved) in r.stderr
    rows=call(['statuses','alpha']).stdout
    assert 'alpha\tbroken\t' in rows and bp(saved) in rows
    write(saved,original);action('alpha','uninstall')
    # Copy failure/space failure occurs before changing the target.
    write(base/'no-space','yes');action('alpha','install',1)
    assert not entry.exists() and not target.exists();(base/'no-space').unlink()
    write(base/'fail-install','yes');action('alpha','install',1)
    assert entry.exists() and 'state=failed' in (entry/'state.conf').read_text()
    r=call(['statuses','alpha']);assert 'alpha\tbroken\t' in r.stdout and 'state: failed' in r.stdout
    assert 'phase=install' in r.stdout and 'exit_code=1' in r.stdout and 'fixture installation failed: permission denied' in r.stdout
    assert 'permission denied' in (entry/'failure.log').read_text()
    snapshot={p.relative_to(entry):p.read_bytes() for p in entry.rglob('*') if p.is_file()}
    before=text();r=call(['uninstall-check','alpha']);assert r.stdout.startswith('available\t') and r.stdout.endswith('\tfailed\n')
    assert text()==before and snapshot=={p.relative_to(entry):p.read_bytes() for p in entry.rglob('*') if p.is_file()}
    saved_manifest=entry/'package/tweaks/alpha/manifest.conf';saved_manifest.write_text(saved_manifest.read_text()+'# tampered\n')
    call(['uninstall-check','alpha'],1)
    saved_manifest.write_bytes(snapshot[Path('package/tweaks/alpha/manifest.conf')])
    lock.mkdir();call(['uninstall-check','alpha'],1);lock.rmdir()
    (base/'fail-install').unlink();action('alpha','uninstall')
    write(base/'fail-verification','yes');action('alpha','install',2)
    r=call(['statuses','alpha']);assert 'installed-verification' in r.stdout and 'expected state=installed' in r.stdout and 'actual state=uninstalled' in r.stdout
    (base/'fail-verification').unlink();action('alpha','uninstall')
    # Generic path ownership: consumer of another tweak's created file blocks removal.
    shared=base/'shared'
    make('alpha',extra='create\t'+bp(shared)+'\n');action('alpha','install')
    make('beta',target=shared);action('beta','install')
    order=subprocess.run([SHELL,'-c','. '+shlex.quote(bp(usb/'lib/manifest.sh'))+'; . '+shlex.quote(bp(pkg))+'; mzd_package_removal_order'],capture_output=True,text=True,timeout=20)
    assert order.returncode==0 and order.stdout.splitlines()==['beta','alpha'],(order.stdout,order.stderr)
    before=text();action('alpha','uninstall',1);assert text()==before
    action('beta','uninstall');action('alpha','uninstall')
    # Ownership of a created directory also protects registered descendants.
    shared_dir=base/'shared-directory';shared_dir.mkdir()
    make('alpha',extra='create\t'+bp(shared_dir)+'\n');action('alpha','install')
    make('beta',target=shared_dir/'child');action('beta','install')
    call(['uninstall-check','alpha'],1)
    action('alpha','uninstall',1);action('beta','uninstall');action('alpha','uninstall')
    # A new owner cannot take over a path already patched by another tweak.
    make('alpha');action('alpha','install')
    make('beta',extra='create\t'+bp(target)+'\n');action('beta','install',1)
    action('alpha','uninstall')
    # Declared requirements are checked against installed receipts, not USB versions.
    make('alpha');action('alpha','install');make('beta',requires='alpha');action('beta','install')
    action('alpha','uninstall',1);action('beta','uninstall');action('alpha','uninstall')
    make('beta',requires='alpha');action('beta','install',1)
    # The global operation lock also coordinates with Restore.
    lock.mkdir();before=text();action('alpha','install',1);assert text()==before;lock.rmdir()
    # Mutable configs are outside the inventory: edited values survive Update/keep.
    make('alpha');config=base/'persist/mzd-tweaks/data/alpha';config_file=config/'settings.conf'
    p=folder/'manifest.conf';write(p,p.read_text()+'config.prefs.path='+bp(config)+'/\nconfig.prefs.source=assets/defaults\n')
    write(folder/'assets/defaults/settings.conf','value=default\n')
    action('alpha','install');assert config_file.read_text()=='value=default\n'
    write(config_file,'value=edited\n');write(config/'runtime-created.conf','runtime=yes\n')
    action('alpha','status',output='installed\n')
    write(p,p.read_text().replace('version=1.0.0','version=2.0.0'))
    write(folder/'assets/defaults/settings.conf','value=new-default\n');write(folder/'assets/defaults/added.conf','new=yes\n')
    call(['action','alpha','update','2.0.0']);assert config_file.read_text()=='value=edited\n'
    assert (config/'runtime-created.conf').exists() and (config/'added.conf').read_text()=='new=yes\n'
    write(p,p.read_text().replace('version=2.0.0','version=3.0.0'));action('alpha','install');assert config_file.read_text()=='value=edited\n'
    call(['action','alpha','uninstall','--preserve-config']);assert config_file.exists() and not entry.exists()
    action('alpha','install');assert config_file.read_text()=='value=edited\n'
    action('alpha','uninstall');assert not config.exists()
    # Config default files are optional after installation; links are never adopted.
    action('alpha','install');shutil.rmtree(config);action('alpha','status',output='installed\n');action('alpha','uninstall')
    config.symlink_to(base,target_is_directory=True);action('alpha','install',1);config.unlink()
    # Return to a fixture without config declarations for the unmanaged-target test.
    make('alpha')
    # Deliberately no adoption of pre-receipt installations.
    write(target,'unmanaged\n');action('alpha','install',1);action('alpha','uninstall',1)
    assert target.read_text()=='unmanaged\n' and not entry.exists()
    assert not list(store.glob('.stage-*')) and not lock.exists()
print('PERSISTENT_PACKAGES_PASSED:',checks,'real adapter checks; snapshots, fast status, versions, failures, space, ownership, requirements and no legacy adoption.')
