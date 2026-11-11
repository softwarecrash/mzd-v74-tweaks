"""Single-file recovery through the real adapter; private synthetic files only."""
from pathlib import Path
import hashlib
import os
import re
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
    if p.is_symlink():p.unlink()
    p.write_text(s,encoding='utf-8',newline='\n');p.chmod(0o755)
def md5(s):return hashlib.md5(s.encode()).hexdigest()

checks=0
with tempfile.TemporaryDirectory(prefix='cmu-recovery-') as directory:
    base=Path(directory);usb=base/'usb';internal=base/'internal';persist=base/'persist';store=persist/'installed'
    bins=base/'bin';locks=base/'locks';events=base/'events';mounts=base/'mounts';version=base/'version';gpio=base/'watchdog'
    for folder in [usb,internal,persist,bins,locks]:folder.mkdir()
    target=internal/'target.js';backup=internal/'target.js.org';other=internal/'other.js'
    original='heading\nvalue=stock\nfooter\n';foreign='heading\nvalue=foreign\nfooter\n'
    patched='heading\nvalue=tweaked\nfooter\n'
    shutil.copytree(ROOT/'usb/lib',usb/'lib')
    for lib in (usb/'lib').glob('*.sh'):
        text=lib.read_text().replace('/proc/mounts',bp(mounts)).replace('/jci/version.ini',bp(version))
        text=text.replace('/sys/class/gpio/Watchdog\\ Disable/value',shlex.quote(bp(gpio)))
        text=text.replace('/tmp/mnt/sd[a-z][0-9]*|/mnt/sd[a-z][0-9]*',shlex.quote(bp(usb)))
        text=text.replace('LOCK="/tmp/mzd-$LOCK_GROUP-tweak.lock"','LOCK="'+bp(locks)+'/$LOCK_GROUP.lock"')
        text=text.replace('MZD_PACKAGE_STORE=/tmp/mnt/data_persist/mzd-tweaks/installed','MZD_PACKAGE_STORE='+shlex.quote(bp(store)))
        text=text.replace('MZD_PACKAGE_MOUNT=/tmp/mnt/data_persist','MZD_PACKAGE_MOUNT='+shlex.quote(bp(persist)))
        text=text.replace('/tmp/mzd-packages.lock',bp(locks/'packages.lock')).replace('/tmp/mzd-restore-originals.lock',bp(locks/'restore.lock'))
        text=text.replace('MZD_RECOVERY_ROOT=/','MZD_RECOVERY_ROOT='+shlex.quote(bp(internal)))
        text=text.replace('MZD_RECOVERY_DATA=/tmp/mnt/data_persist','MZD_RECOVERY_DATA='+shlex.quote(bp(persist)))
        write(lib,text)
    write(usb/'installer.sh',(ROOT/'usb/installer.sh').read_text().replace('#!/bin/sh\n','#!/bin/sh\nPATH='+shlex.quote(bp(bins)+':/usr/bin:/bin')+'\nexport PATH\n',1))
    template=(ROOT/'usb/tweaks/list-beep/manifest.conf').read_text()
    template=re.sub('^id=.*$','id=fixture',template,flags=re.M)
    template=re.sub('^target=.*$','target='+bp(target),template,flags=re.M)
    template=re.sub('^oem_backup_md5=.*$','oem_backup_md5='+md5(original),template,flags=re.M)
    fixture=usb/'tweaks/fixture'
    write(fixture/'run.sh','#!/bin/sh\necho forbidden-worker >> '+shlex.quote(bp(events))+'\nexit 91\n')
    patch='--- target.data\n+++ target.data\n@@ -1,3 +1,3 @@\n heading\n-value=stock\n+value=tweaked\n footer\n'
    write(bins/'sync','#!/bin/sh\necho sync >> '+shlex.quote(bp(events))+'\n')
    write(bins/'df','#!/bin/sh\nfree=999999; [ ! -e '+shlex.quote(bp(base/'no-space'))+' ] || free=1\nprintf "Filesystem 1024-blocks Used Available Capacity Mounted\\nfixture 1000000 1 %s 1%% fixture\\n" "$free"\n')
    write(bins/'mount','''#!/bin/sh
[ "$1" = -o ] || exit 90
echo "mount $2 $3" >> EVENTS
if [ "$2" = ro,remount ] && [ "$3" = USB ] && [ -e USB_FAIL ]; then exit 1; fi
awk -v p="$3" -v mode="$2" '{$4=($2==p?(mode=="rw,remount"?"rw":"ro"):$4);print}' MOUNTS > NEXT
/usr/bin/mv NEXT MOUNTS
'''.replace('EVENTS',shlex.quote(bp(events))).replace('USB_FAIL',shlex.quote(bp(base/'usb-fail'))).replace('USB',shlex.quote(bp(usb))).replace('MOUNTS',shlex.quote(bp(mounts))).replace('NEXT',shlex.quote(bp(base/'mounts.next'))))
    def prepare():
        if store.exists():
            assert store.resolve().is_relative_to(base.resolve());shutil.rmtree(store)
        for name in ['cp','mv','rm','patch','md5sum']:(bins/name).unlink(missing_ok=True)
        # FAT archives cannot be assumed to support cp -a metadata operations.
        write(bins/'cp','#!/bin/sh\nif [ "$1" = -a ]; then case "$*" in *before.data*|*original.data*) exit 91 ;; esac; fi\n/usr/bin/cp "$@"\n')
        for name in ['no-space','usb-fail','restore-written']: (base/name).unlink(missing_ok=True)
        for child in locks.iterdir():child.rmdir()
        write(fixture/'manifest.conf',template);(fixture/'managed-paths.tsv').unlink(missing_ok=True)
        write(fixture/'assets/change.patch',patch)
        write(target,foreign);write(backup,original);write(other,'do not touch\n')
        write(version,'JCI_SW_VER="MAZ_CMU-150_74.00.324"\n');write(gpio,'0\n')
        write(mounts,f'/dev/sdb1 {bp(usb)} vfat ro 0 0\n/dev/ffx01p1 {bp(internal)} relfs ro 0 0\n/dev/mmcblk0p2 {bp(persist)} relfs rw 0 0\n')
        events.unlink(missing_ok=True)
    def call(*args,code=0):
        global checks
        r=subprocess.run([SHELL,bp(usb/'installer.sh'),*args],capture_output=True,text=True,timeout=45)
        assert r.returncode==code,(args,r.returncode,r.stdout,r.stderr)
        checks+=1;return r
    def check(code=0):return call('restore-check','fixture',code=code)
    def restore(code=0,token=None):return call('restore-original','fixture',token or BASE_TOKEN,code=code)
    def unchanged_check(code=0):
        before={p:p.read_bytes() for p in base.rglob('*') if p.is_file()}
        r=check(code)
        assert before=={p:p.read_bytes() for p in base.rglob('*') if p.is_file()},'Read-only recovery check wrote files'
        return r
    def clean():
        assert not list(locks.iterdir())
        assert gpio.read_text()=='0\n' and other.read_text()=='do not touch\n'
        assert 'forbidden-worker' not in (events.read_text() if events.exists() else '')
        assert ' ro ' in mounts.read_text().splitlines()[1], 'Internal mount mode not restored.'
        assert 'mount ro,remount '+bp(usb) not in (events.read_text() if events.exists() else '')
    prepare()
    offered=unchanged_check().stdout.split('\t')
    assert offered[0]=='available' and re.fullmatch('[0-9a-f]{32}',offered[1]) and offered[2]==bp(target)+'\n'
    BASE_TOKEN=offered[1]
    restore();assert target.read_text()==original and not backup.exists();clean()
    archives=list(usb.glob('reports/restore-file-fixture/restore-original-*/files/1'))
    assert len(archives)==1 and (archives[0]/'before.data').read_text()==foreign and (archives[0]/'original.data').read_text()==original
    prepare();write(mounts,mounts.read_text().replace('/dev/ffx01p1','/dev/mmcblk0p1'))
    unchanged_check();restore();assert target.read_text()==original and not backup.exists();clean()
    for stock_backup in ['present','absent']:
        prepare();write(target,original)
        if stock_backup=='absent':backup.unlink()
        result=unchanged_check()
        assert result.stdout=='original\n' and not result.stderr
        restore(1);assert target.read_text()==original;clean()
    for scenario in ['missing-backup','bad-backup','service','extra-path','unsupported','external-target','ram-target','busy','stale','retarget','backup-retarget','version-change']:
        prepare()
        if scenario=='missing-backup':backup.unlink()
        if scenario=='bad-backup':write(backup,'wrong original\n')
        if scenario=='oem-target':write(target,original)
        if scenario=='service':write(fixture/'manifest.conf',template.replace('type=patch','type=service'))
        if scenario=='extra-path':write(fixture/'managed-paths.tsv','create\t'+bp(other)+'\n')
        if scenario=='unsupported':write(version,'JCI_SW_VER="MAZ_CMU-150_70.00.100"\n')
        if scenario=='external-target':write(mounts,mounts.read_text()+'/dev/external '+bp(target)+' ext4 ro 0 0\n')
        if scenario=='ram-target':write(mounts,mounts.read_text().replace(bp(internal)+' relfs ',bp(internal)+' tmpfs '))
        if scenario=='busy':(locks/'packages.lock').mkdir()
        if scenario=='stale':
            unchanged_check();write(target,'new foreign edit\n')
        if scenario=='retarget':
            unchanged_check();alternate=internal/'alternate.js';write(alternate,foreign);write(internal/'alternate.js.org',original)
            write(fixture/'manifest.conf',template.replace(bp(target),bp(alternate)))
        if scenario=='backup-retarget':
            unchanged_check();write(backup,original+'extra OEM line\n')
            write(fixture/'manifest.conf',re.sub('^oem_backup_md5=.*$','oem_backup_md5='+md5(original+'extra OEM line\n'),template,flags=re.M))
        if scenario=='version-change':
            unchanged_check();write(fixture/'manifest.conf',re.sub('^version=.*$','version=0.8.999',template,flags=re.M))
        before=target.read_bytes();backup_before=backup.read_bytes() if backup.exists() else None
        if scenario not in ['stale','retarget','backup-retarget','version-change']:
            refused=unchanged_check(1)
            if scenario=='bad-backup':
                assert 'unexpected MD5' in refused.stderr
                assert 'Expected MD5: '+md5(original) in refused.stderr
                assert 'Actual MD5: '+md5('wrong original\n') in refused.stderr
        restore(1)
        assert target.read_bytes()==before and (backup.read_bytes() if backup.exists() else None)==backup_before,scenario
        if scenario=='retarget':assert alternate.read_text()==foreign and (internal/'alternate.js.org').read_text()==original
        if scenario=='busy':(locks/'packages.lock').rmdir()
        clean();print('PASS recovery refusal:',scenario,flush=True)
    prepare();write(target,patched);token=unchanged_check().stdout.split('\t')[1];restore(token=token);assert target.read_text()==original;clean()
    # Restoration depends on verified OEM bytes, not recognition of an old patch.
    for scenario in ['compatible-target','bad-patch','missing-patch','patch-tool-failure','old-unrelated-patch']:
        prepare()
        if scenario=='compatible-target':write(target,original+'unrelated addition\n')
        if scenario=='bad-patch':write(fixture/'assets/change.patch','unusable newer patch\n')
        if scenario=='missing-patch':(fixture/'assets/change.patch').unlink()
        if scenario=='patch-tool-failure':write(bins/'patch','#!/bin/sh\nexit 2\n')
        if scenario=='old-unrelated-patch':write(target,'old unknown patch content\n')
        token=unchanged_check().stdout.split('\t')[1]
        restore(token=token);assert target.read_text()==original and not backup.exists();clean()
        print('PASS patch-independent recovery:',scenario,flush=True)
    # Valid saved receipts using this file, a parent container, or this ID block recovery.
    for owner_mode in ['same-file','parent-container','own-id','corrupt-record','unrelated','alias-target']:
        prepare()
        if owner_mode=='alias-target':
            alias=base/'internal-alias'
            try:alias.symlink_to(internal,target_is_directory=True)
            except OSError:
                print('SKIP managed alias fixture: host does not permit symlink creation',flush=True);continue
        if owner_mode=='corrupt-record':write(store/'other/state.conf','broken record\n')
        else:
            owner='fixture' if owner_mode=='own-id' else 'other'
            owned=usb/'tweaks'/owner
            write(owned/'manifest.conf',template.replace('id=fixture','id='+owner))
            if owner_mode=='unrelated':write(owned/'manifest.conf',(owned/'manifest.conf').read_text().replace(bp(target),bp(other)))
            if owner_mode=='alias-target':write(owned/'manifest.conf',(owned/'manifest.conf').read_text().replace(bp(target),bp(base)+'/internal-alias/target.js'))
            write(owned/'run.sh','#!/bin/sh\nexit 91\n')
            (owned/'managed-paths.tsv').unlink(missing_ok=True)
            if owner_mode=='parent-container':write(owned/'managed-paths.tsv','create\t'+bp(internal)+'\n')
            driver=base/'register.sh';stage=store/('.stage-'+owner)
            write(driver,'#!/bin/sh\nPATH='+shlex.quote(bp(bins)+':/usr/bin:/bin')+'\nexport PATH\n. '+shlex.quote(bp(usb/'lib/manifest.sh'))+'\n. '+shlex.quote(bp(usb/'lib/packages.sh'))+'\nmkdir -p '+shlex.quote(bp(store))+'\nmzd_package_stage '+shlex.quote(bp(usb))+' '+shlex.quote(bp(stage))+' '+owner+' || exit 1\nmv '+shlex.quote(bp(stage))+' '+shlex.quote(bp(store/owner))+'\n')
            r=subprocess.run([SHELL,bp(driver)],capture_output=True,text=True,timeout=45);assert r.returncode==0,(r.stdout,r.stderr)
        if owner_mode=='unrelated':
            saved={p:p.read_bytes() for p in store.rglob('*') if p.is_file()}
            unchanged_check();restore();assert target.read_text()==original and not backup.exists()
            assert saved=={p:p.read_bytes() for p in store.rglob('*') if p.is_file()}
        else:
            unchanged_check(1);restore(1);assert target.read_text()==foreign and backup.exists()
        clean()
        print('PASS managed recovery guard:',owner_mode,flush=True)
    for scenario in ['no-space','archive-failure','write-failure','unknown-write','late-target-change','late-backup-change','delete-failure','usb-cleanup-failure']:
        prepare()
        if scenario=='no-space':write(base/'no-space','yes')
        if scenario=='archive-failure':write(bins/'cp','#!/bin/sh\ncase "$*" in *original.data*) exit 1 ;; esac\n/usr/bin/cp "$@"\n')
        if scenario=='write-failure':write(bins/'mv','#!/bin/sh\ncase "$*" in *mzd-restore-*) exit 1 ;; esac\n/usr/bin/mv "$@"\n')
        if scenario=='unknown-write':write(bins/'mv','#!/bin/sh\ncase "$*" in *mzd-restore-*) /usr/bin/mv "$@"; echo concurrent-change > '+shlex.quote(bp(target))+'; exit 1 ;; esac\n/usr/bin/mv "$@"\n')
        if scenario in ['late-target-change','late-backup-change']:
            marker=shlex.quote(bp(base/'restore-written'))
            write(bins/'mv','#!/bin/sh\n/usr/bin/mv "$@" || exit 1\ncase "$*" in *mzd-restore-*) : > '+marker+' ;; esac\n')
            changed=target if scenario=='late-target-change' else backup
            write(bins/'md5sum','#!/bin/sh\n/usr/bin/md5sum "$@" || exit 1\nif [ "$1" = '+shlex.quote(bp(target))+' ] && [ -e '+marker+' ]; then /usr/bin/rm -f '+marker+'; echo late-change > '+shlex.quote(bp(changed))+'; fi\n')
        if scenario=='delete-failure':write(bins/'rm','#!/bin/sh\ncase "$*" in *target.js.org*) exit 1 ;; esac\n/usr/bin/rm "$@"\n')
        if scenario=='usb-cleanup-failure':write(base/'usb-fail','yes')
        critical=scenario in ['unknown-write','late-target-change','late-backup-change']
        r=restore(0 if scenario=='usb-cleanup-failure' else (2 if critical else 1))
        if scenario=='usb-cleanup-failure':
            assert 'Original file restored.' in r.stdout and 'Do NOT reboot' not in r.stderr
        else:
            assert not r.stdout and ('Do NOT reboot' in r.stderr if critical else True)
        if scenario in ['no-space','archive-failure','write-failure']:assert target.read_text()==foreign and backup.exists()
        if scenario=='delete-failure':assert target.read_text()==original and backup.exists()
        if scenario=='unknown-write':assert target.read_text()=='concurrent-change\n' and backup.exists()
        if scenario=='late-target-change':assert target.read_text()=='late-change\n' and backup.exists()
        if scenario=='late-backup-change':assert target.read_text()==original and backup.read_text()=='late-change\n'
        if scenario=='usb-cleanup-failure':assert target.read_text()==original and not backup.exists()
        clean()
        print('PASS recovery failure handling:',scenario,flush=True)
    for state,expected_hint in [('unavailable',True),('broken',True),('installed',True),('inspection-error',False),('missing-dependency',False)]:
        prepare()
        reported='unavailable' if state=='missing-dependency' else state
        write(fixture/'run.sh','#!/bin/sh\n[ "$1" = status ] || exit 91\n'+('exit 1\n' if state=='inspection-error' else 'echo '+reported+'\n'))
        if state=='missing-dependency':write(fixture/'manifest.conf',template.replace('requires=','requires=absent-provider'))
        r=call('action','fixture','install',code=1)
        assert ('MZD_RECOVERY_CANDIDATE\n' in r.stdout)==expected_hint,(state,r.stdout,r.stderr)
        assert target.read_text()==foreign and backup.exists();clean()
    # A reset clock and reused PID must never overwrite previous USB archives.
    prepare()
    write(bins/'date','#!/bin/sh\necho 20000101-000000\n')
    restore();reports=list(usb.glob('reports/restore-file-fixture/restore-original-20000101-000000-*'))
    assert len(reports)==1;folder=reports[0]/'files/1'
    saved={p:p.read_bytes() for p in folder.iterdir() if p.is_file()}
    prepare();write(target,'another foreign edit\n');token=unchanged_check().stdout.split('\t')[1];restore(token=token)
    assert target.read_text()==original and not backup.exists()
    assert len(list(usb.glob('reports/restore-file-fixture/restore-original-20000101-000000-*')))==2
    assert saved=={p:p.read_bytes() for p in folder.iterdir() if p.is_file()};clean()
    (bins/'date').unlink()
    # Symlinks are refused where the host supports creating them.
    prepare()
    try:
        original_source=base/'original-source';write(original_source,original)
        backup.unlink();backup.symlink_to(original_source)
    except OSError:
        print('SKIP symlink fixture: host does not permit symlink creation',flush=True)
    else:
        unchanged_check(1);restore(1);assert original_source.read_text()==original and other.read_text()=='do not touch\n'
print('TARGET_RECOVERY_PASSED:',checks,'adapter checks; confirmation, OEM validation, managed ownership, archives, rollback and cleanup.')
