"""Restore real saved SSH/patch workers while retaining all operation locks."""
from pathlib import Path
import hashlib,os,re,shlex,shutil,subprocess,tempfile

ROOT=Path(__file__).resolve().parents[2]
checks=0

def write(path,text):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(text,encoding='utf-8',newline='\n');path.chmod(0o755)

def patch_original(text):
    lines=[];in_hunk=False
    for line in text.splitlines(keepends=True):
        if line.startswith('@@ '):
            start=int(re.match(r'@@ -(\d+)',line).group(1))
            while len(lines)<start-1:lines.append('// fixture gap\n')
            in_hunk=True
        elif in_hunk and line[:1] in [' ','-']:lines.append(line[1:])
    return ''.join(lines)

for scenario in ['current','saved-old-status','saved-old-status-warning','mixed-gui','mixed-gui-extra-edit','mixed-gui-all','remaining-payload','changed-target']:
 with tempfile.TemporaryDirectory(prefix='mzd-restore-locks-') as temporary:
    base=Path(temporary);usb=base/'usb';internal=base/'internal';persist=internal/'persist';resources=internal/'resources';bins=base/'bin';locks=base/'locks'
    for folder in [internal,persist,resources,bins,locks]:folder.mkdir(parents=True,exist_ok=True)
    shutil.copytree(ROOT/'usb/lib',usb/'lib')
    for id_ in ['ssh','restore-originals']+(['tetris'] if scenario.startswith('mixed-gui') else []):shutil.copytree(ROOT/'usb/tweaks'/id_,usb/'tweaks'/id_)
    shutil.copytree(ROOT/'development/examples/patch',usb/'tweaks/patch-example')
    if scenario=='mixed-gui-all':
        shutil.copytree(ROOT/'usb/tweaks/wallpaper-manager',usb/'tweaks/wallpaper-manager')
        shutil.copytree(ROOT/'development/examples/shim',usb/'tweaks/shim-example')
    write(usb/'installer.sh',(ROOT/'usb/installer.sh').read_text())
    startup=internal/'stage_wifi.sh';list_target=internal/'List2Ctrl.js';version=base/'version';mounts=base/'mounts';watchdog=base/'watchdog';running=internal/'ssh-runtime';events=base/'events'
    originals={startup:'#!/bin/sh\n\n',list_target:patch_original((usb/'tweaks/patch-example/assets/change.patch').read_text())}
    if scenario=='mixed-gui-all':
        stock='<services>\n    <service name="jciMMUI" path="/jci/mmui/example.so">\n        <dependency value="other"/>\n    </service>\n</services>\n'
        originals.update({internal/'sm.conf':stock,internal/'sm_WCP.conf':stock})
        elf=bytearray(52);elf[:7]=b'\x7fELF\x01\x01\x01';elf[16:20]=b'\x03\x00\x28\x00';elf[37]=2;elf[39]=5
        asset=usb/'tweaks/shim-example/assets/shim-example.so';asset.parent.mkdir(exist_ok=True);asset.write_bytes(elf)
    for path,content in originals.items():write(path,content)
    write(version,'JCI_SW_VER="MAZ_CMU-150_74.00.324"\n');write(watchdog,'1\n')
    write(mounts,f'/dev/sdb1 {usb} vfat rw 0 0\n/dev/mmcblk0p1 {internal} ext3 rw 0 0\n/dev/mmcblk0p2 {resources} ext3 rw 0 0\n/dev/mmcblk0p3 {persist} ext3 rw 0 0\n')
    replacements={'MZD_SHIM_ROOT=/':'MZD_SHIM_ROOT='+str(internal),'/jci/version.ini':str(version),'/jci/scripts/stage_wifi.sh':str(startup),'/tmp/mnt/resources':str(resources),'/tmp/mnt/data_persist':str(persist),'/tmp/mnt/data':str(internal/'data'),'MZD_GUI_STARTUP_MOUNT=/':'MZD_GUI_STARTUP_MOUNT='+str(internal),'/tmp/mzd-ssh':str(running),'/proc/mounts':str(mounts),'/sys/class/gpio/Watchdog\\ Disable/value':str(watchdog),'/tmp/mzd-restore-originals.lock':str(locks/'restore'),'/tmp/mzd-packages.lock':str(locks/'packages')}
    for path in usb.rglob('*.sh'):
        source=path.read_text()
        for old,new in replacements.items():source=source.replace(old,new)
        source=source.replace('LOCK="/tmp/mzd-$LOCK_GROUP-tweak.lock"','LOCK="'+str(locks)+'/$LOCK_GROUP"')
        source=source.replace('mzd_system_remount_rw / ||','mzd_system_remount_rw '+str(internal)+' ||')
        source=source.replace('/tmp/mnt/sd[a-z][0-9]*|/mnt/sd[a-z][0-9]*',shlex.quote(str(usb)))
        write(path,source.replace('#!/bin/sh\n','#!/bin/sh\nPATH='+shlex.quote(str(bins)+':/usr/bin:/bin')+'\nexport PATH\n',1))
    for id_,target in [('ssh',startup),('patch-example',list_target)]:
        path=usb/'tweaks'/id_/'manifest.conf';text=path.read_text()
        text=re.sub(r'^target=.*$','target='+str(target),text,flags=re.M)
        text=re.sub(r'^oem_backup_md5=.*$','oem_backup_md5='+hashlib.md5(originals[target].encode()).hexdigest(),text,flags=re.M)
        write(path,text)
    if scenario=='mixed-gui-all':
        path=usb/'tweaks/shim-example/manifest.conf';text=path.read_text()
        for key,value in {'target':str(internal/'sm.conf'),'oem_backup_md5':hashlib.md5(stock.encode()).hexdigest(),'shim_extra_targets':str(internal/'sm_WCP.conf')+':'+hashlib.md5(stock.encode()).hexdigest()}.items():text=re.sub('^'+key+'=.*$',key+'='+value,text,flags=re.M)
        write(path,text)
    path=usb/'tweaks/ssh/managed-paths.tsv';write(path,path.read_text().replace('/tmp/mnt/resources',str(resources)))
    path=usb/'tweaks/restore-originals/manifest.conf';write(path,path.read_text().replace('target=/jci','target='+str(internal)))
    write(usb/'tweaks/ssh/assets/service.sh',f'''#!/bin/sh
case "$1" in
 check|check-auth) exit 0;;
 boot) mkdir -p {running};touch {running}/owned;;
 status) [ -f {running}/owned ];;
 stop) rm -f {running}/owned;rmdir {running};;
 *) exit 1;;
esac
''')
    for name in ['mount','sync','lua','setsid']:write(bins/name,'#!/bin/sh\nexit 0\n')
    write(bins/'df','#!/bin/sh\nprintf "Filesystem 1024-blocks Used Available Capacity Mounted\\nfixture 1000000 1000 999000 1%% fixture\\n"\n')
    for name in ['reboot','sshd','killall','iptables']:write(bins/name,'#!/bin/sh\nexit 91\n')
    if scenario.startswith('mixed-gui'):
        (internal/'data/integration').mkdir(parents=True)
        write(mounts,mounts.read_text()+f'/dev/mmcblk0p4 {internal}/data ext3 rw 0 0\n')
        for path in usb.rglob('manifest.conf'):write(path,path.read_text().replace('/tmp/mnt/data_persist',str(persist)))
        path=usb/'lib/gui-services.sh'
        write(path,path.read_text()+'\nmzd_gui_services_stop() { :; }\nmzd_gui_services_start() { :; }\n')
    def call(*args,code=0):
        global checks
        result=subprocess.run(['/bin/sh',str(usb/'installer.sh'),*args],capture_output=True,text=True,timeout=60)
        assert result.returncode==code,(scenario,args,result.returncode,result.stdout,result.stderr,[p.read_text() for p in (usb/'reports').rglob('run.log')])
        checks+=1;return result
    call('action','ssh','install');call('action','patch-example','install')
    if scenario.startswith('mixed-gui'):call('action','tetris','install')
    if scenario=='mixed-gui-all':
        call('action','wallpaper-manager','install');call('action','shim-example','install')
        assert (persist/'mzd-tweaks/shims/shim-example/shim-example.so').is_file()
        assert 'shim-example.so' in (internal/'sm.conf').read_text()
    store=persist/'mzd-tweaks/installed'
    for path,content in originals.items():assert path.read_text()!=content and Path(str(path)+'.org').read_text()==content
    if scenario=='current':
        # Even a restoring state must reject a foreign, unrecorded lock.
        group=re.search(r'^lock_group=(.+)$',(usb/'tweaks/patch-example/manifest.conf').read_text(),re.M).group(1)
        foreign_lock=locks/group;foreign_lock.mkdir()
        report=base/'foreign-report';write(report/'system/locks','')
        env=dict(os.environ,MZD_WORKER_DIRECT='1',MZD_PACKAGE_STATE='restoring',MZD_REPORT=str(report),MZD_SYSTEM=str(report/'system'))
        refused=subprocess.run(['/bin/sh',str(usb/'tweaks/patch-example/run.sh'),'status'],env=env,capture_output=True,text=True)
        assert refused.returncode==1 and 'Target is busy' in refused.stderr
        assert foreign_lock.is_dir();foreign_lock.rmdir();checks+=1
    if scenario not in ['current','mixed-gui','mixed-gui-extra-edit','mixed-gui-all']:
        # A real saved status implementation with the historical unconditional
        # busy refusal: worker, patch inspection and reset hooks remain real.
        for id_ in ['ssh','patch-example']:
            path=store/id_/'package/lib/status.sh'
            legacy=path.read_text()
            start=legacy.index('# Restore retains its own target locks')
            end=legacy.index('mzd_read_status() (',start)
            legacy=legacy[:start]+legacy[end:]
            legacy=legacy.replace('    status_restore_report=${MZD_REPORT:-}; status_restore_system=${MZD_SYSTEM:-}\n','')
            legacy=legacy.replace('mzd_status_lock_available ||','[ ! -e "$LOCK" ] ||')
            if scenario=='saved-old-status-warning':legacy+='\nprintf "Saved helper diagnostic.\\n" >&2\n'
            write(path,legacy)
        if scenario in ['remaining-payload','changed-target']:
            path=store/'ssh/package/tweaks/ssh/reset.sh'
            mutation=('mkdir -p '+str(resources/'mzd-tweaks/ssh')+';echo leftover > '+str(resources/'mzd-tweaks/ssh/foreign')) if scenario=='remaining-payload' else 'echo changed > '+str(list_target)
            write(path,path.read_text()+'\nif [ "$1" = finish ];then '+mutation+';fi\n')
        # Record these as a legitimately installed old package, not corruption.
        for entry in store.iterdir():
            command='. "$1";mzd_package_inventory "$2" > "$2/package.files"'
            subprocess.run(['/bin/sh','-c',command,'inventory',str(usb/'lib/packages.sh'),str(entry)],check=True)
    if scenario=='mixed-gui-extra-edit':
        path=store/'tetris/package/tweaks/tetris/reset.sh'
        write(path,path.read_text()+'\nif [ "$1" = prepare ];then printf "# foreign edit\\n" >> '+str(startup)+';fi\n')
        entry=store/'tetris'
        subprocess.run(['/bin/sh','-c','. "$1";mzd_package_inventory "$2" > "$2/package.files"','inventory',str(usb/'lib/packages.sh'),str(entry)],check=True)
    result=call('action','restore-originals','run',code=0 if scenario in ['current','saved-old-status','saved-old-status-warning','mixed-gui','mixed-gui-all'] else 1 if scenario=='mixed-gui-extra-edit' else 2)
    assert not list(locks.iterdir()),(scenario,list(locks.iterdir()))
    if scenario in ['current','saved-old-status','saved-old-status-warning','mixed-gui','mixed-gui-all']:
        assert not list(store.iterdir()) and not running.exists() and not (resources/'mzd-tweaks/ssh').exists()
        if scenario=='mixed-gui-all':
            assert not (persist/'mzd-tweaks/shims/shim-example').exists()
            assert not (internal/'data/integration/mzd-gui-runtime').exists()
            assert not (internal/'data/integration/developer_mode_GuiConfig.js').exists()
            assert not (persist/'mzd-tweaks/gui-provider').exists()
        for path,content in originals.items():assert path.read_text()==content and not Path(str(path)+'.org').exists()
        if scenario in ['saved-old-status','saved-old-status-warning']:assert any('Verified restored paths for saved worker' in p.read_text() for p in (usb/'reports').rglob('run.log'))
    else:
        assert list(store.iterdir()) and all(Path(str(path)+'.org').exists() for path in originals)
        if scenario=='mixed-gui-extra-edit':assert 'A target or backup changed after preflight' in result.stderr
        else:assert 'Do NOT reboot' in result.stderr
print('RESTORE_OWN_LOCKS_PASSED:',checks,'real actions; SSH/List2, current and saved-old status, mixed game/wallpaper/shim cleanup, retained locks and rejection of incomplete cleanup.')
