"""Real installer/package controller on private fixtures, no vehicle writes."""
from pathlib import Path
import os
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
    # Deliberately no adoption of pre-receipt installations.
    write(target,'unmanaged\n');action('alpha','install',1);action('alpha','uninstall',1)
    assert target.read_text()=='unmanaged\n' and not entry.exists()
    assert not list(store.glob('.stage-*')) and not lock.exists()
print('PERSISTENT_PACKAGES_PASSED:',checks,'real adapter checks; snapshots, fast status, versions, failures, space, ownership, requirements and no legacy adoption.')
