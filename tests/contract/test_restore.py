"""Real reset worker/hooks on isolated filesystems; no vehicle writes/services."""
from pathlib import Path
import hashlib
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
    p.parent.mkdir(parents=True,exist_ok=True);p.write_text(s,encoding='utf-8',newline='\n');p.chmod(0o755)
def md5(s):return hashlib.md5(s.encode()).hexdigest()
checks=0
for scenario in ['success','invalid-path','hook-stop-failure','bad-oem','unknown-extra','changed-payload','missing-payload-file','missing-target','write-failure','rollback-failure','delete-failure','archive-failure','no-backups','unsupported','success-managed']:
  managed=scenario=='success-managed'
  if managed:scenario='success'
  with tempfile.TemporaryDirectory(prefix='cmu-restore-') as directory:
    base=Path(directory);usb=base/'usb';internal=base/'internal';resources=base/'resources';nav=base/'nav';bins=base/'bin';locks=base/'locks'
    for p in [internal,resources,nav,bins,locks]:p.mkdir()
    shutil.copytree(ROOT/'usb/lib',usb/'lib')
    for id_ in ['restore-originals','ssh','cluster-language']:shutil.copytree(ROOT/'usb/tweaks'/id_,usb/'tweaks'/id_)
    worker=usb/'tweaks/restore-originals/run.sh';hook=usb/'tweaks/ssh/reset.sh';service=resources/'managed/ssh';runtime=base/'runtime'
    version=base/'version';mounts=base/'mounts';gpio=base/'watchdog';events=base/'events'
    write(version,'JCI_SW_VER="MAZ_CMU-150_74.00.324"\n');write(gpio,'0\n')
    write(mounts,f'/dev/sdb1 {bp(usb)} vfat rw 0 0\n/dev/mmcblk0p1 {bp(internal)} ext3 ro 0 0\n/dev/mmcblk0p2 {bp(resources)} ext3 ro 0 0\n/dev/mmcblk1p1 {bp(nav)} vfat rw 0 0\n')
    first=internal/'first.js';second=internal/'stage.sh';unknown=internal/'other file.js'
    values={first:('OEM first\n','changed first\n'),second:('#!/bin/sh\n# OEM boot\n','#!/bin/sh\n# MZD v74 SSH\n'),unknown:('saved old tweak original\n','modified third-party tweak\n')}
    for path,(original,changed) in values.items():write(path,changed);write(Path(str(path)+'.org'),original)
    write(nav/'nav.js.org','do not touch navigation\n');write(nav/'nav.js','navigation stays modified\n')
    # Register known OEM targets; the third backup is deliberately uncatalogued.
    fixture_manifest=(ROOT/'usb/tweaks/list-beep/manifest.conf').read_text()
    for id_,target in [('fixture',first),('ssh',second)]:
      manifest=usb/'tweaks'/id_/'manifest.conf'
      text=fixture_manifest.replace('id=list-beep','id='+id_).replace('target=/jci/gui/common/controls/List2/js/List2Ctrl.js','target='+bp(target))
      import re
      text=re.sub(r'^oem_backup_md5=.*$', 'oem_backup_md5='+md5(values[target][0]),text,flags=re.M)
      text=re.sub(r'^lock_group=.*$', 'lock_group='+id_,text,flags=re.M)
      if id_=='ssh':text+='reset_entrypoint=reset.sh\n'
      write(manifest,text)
    assets=usb/'tweaks/ssh/assets'
    # Service stop is stubbed here; the actual supervisor has its own behavior suite.
    stop='#!/bin/sh\n[ "$1" = stop ] || exit 1\necho service-stop >> '+shlex.quote(bp(events))+'\nrm -f '+shlex.quote(bp(runtime/'owned'))+'\nrmdir '+shlex.quote(bp(runtime))+'\n'
    if scenario=='hook-stop-failure':stop='#!/bin/sh\nexit 1\n'
    write(assets/'service.sh',stop)
    service.mkdir(parents=True)
    for name in ['service.sh','sshd_config','password.hash']:shutil.copyfile(assets/name,service/name)
    write(service/'enabled','enabled\n');write(runtime/'owned','fixture\n')
    shutil.copyfile(assets/'usb-log-marker.txt',usb/'mzd-ssh-log-marker.txt')
    write(hook,hook.read_text().replace('SERVICE=/tmp/mnt/resources/mzd-tweaks/ssh','SERVICE='+shlex.quote(bp(service))).replace('RAM=/tmp/mzd-aio-ssh','RAM='+shlex.quote(bp(runtime))).replace('TARGET=/jci/scripts/stage_wifi.sh','TARGET='+shlex.quote(bp(second))).replace('mzd_system_remount_rw /tmp/mnt/resources','mzd_system_remount_rw '+shlex.quote(bp(resources))))
    manifest=usb/'tweaks/restore-originals/manifest.conf';write(manifest,manifest.read_text().replace('target=/jci','target='+bp(internal)))
    # A real component bundle on the USB that was never installed: its reset hook
    # runs too, without saved settings, and must neither block nor change anything.
    # An older installer may have changed the SM configs and left no .org backup.
    stock_sm='<services>\n<service name="jciBLMSettings" path="/jci/settings/example.so">\n<dependency value="other"/>\n</service>\n</services>\n'
    old_sm=stock_sm.replace('<dependency value="other"/>','<environ_var env_name="LD_PRELOAD" env_value="/data_persist/oem-aa-mod/libpatch-svcjciblmsettings.so"/>')
    for name in ['sm.conf','sm_WCP.conf']:write(internal/name,old_sm)
    old_payload=internal/'mzd-tweaks/shims/cluster-language/libpatch.conf';write(old_payload,'not from this tweak\n')
    for name in ['manifest.conf','components.tsv']:
      path=usb/'tweaks/cluster-language'/name;text=path.read_text()
      for old,new in {'/jci/sm/':bp(internal)+'/','74d9fc389b74fb01d0cfc2615a82c782':md5(stock_sm),'030e918f5d6edcd62d196ee37b86fe99':md5(stock_sm),'/tmp/mnt/data_persist':bp(internal)}.items():text=text.replace(old,new)
      write(path,text)
    for lib in (usb/'lib').glob('*.sh'):
      text=lib.read_text().replace('/jci/version.ini',bp(version)).replace('/proc/mounts',bp(mounts)).replace('/sys/class/gpio/Watchdog\\ Disable/value',shlex.quote(bp(gpio)))
      text=text.replace('/tmp/mnt/sd[a-z][0-9]*|/mnt/sd[a-z][0-9]*',shlex.quote(bp(usb)))
      text=text.replace('LOCK="/tmp/mzd-$LOCK_GROUP-tweak.lock"','LOCK="'+bp(locks)+'/$LOCK_GROUP.lock"')
      text=text.replace('MZD_COMPONENT_STORAGE=/tmp/mnt/data_persist','MZD_COMPONENT_STORAGE='+shlex.quote(bp(internal))).replace('MZD_SHIM_ROOT=/','MZD_SHIM_ROOT='+shlex.quote(bp(internal)))
      write(lib,text)
    source=worker.read_text().replace('#!/bin/sh\n','#!/bin/sh\nPATH='+shlex.quote(bp(bins)+':/usr/bin:/bin')+'\nexport PATH\n',1).replace('/tmp/mzd-restore-originals.lock',bp(locks/'restore.lock'))
    write(worker,source)
    write(bins/'df','#!/bin/sh\nprintf "Filesystem 1024-blocks Used Available Capacity Mounted\nmock 99999999 1 99999998 1%% usb\n"\n')
    write(bins/'sync','#!/bin/sh\necho sync >> '+shlex.quote(bp(events))+'\n')
    write(bins/'mount',f'''#!/bin/sh
[ "$1" = -o ] || exit 90
echo "mount $2 $3" >> {shlex.quote(bp(events))}
awk -v p="$3" -v mode="$2" '{{$4=($2==p?(mode=="rw,remount"?"rw":"ro"):$4);print}}' {shlex.quote(bp(mounts))} > {shlex.quote(bp(base/'mounts.next'))}
/usr/bin/mv {shlex.quote(bp(base/'mounts.next'))} {shlex.quote(bp(mounts))}
''')
    for forbidden in ['reboot','killall','iptables','sshd']:
      write(bins/forbidden,'#!/bin/sh\necho forbidden >> '+shlex.quote(bp(events))+'\nexit 90\n')
    if scenario in ['write-failure','rollback-failure']:
      write(bins/'mv',f'''#!/bin/sh
case "$*" in
*{bp(second)}*) exit 1 ;;
esac
'''+(f'case "$*" in *{bp(first)}*) grep -q "changed first" "$2" && exit 1 ;; esac\n' if scenario=='rollback-failure' else '')+'/usr/bin/mv "$@"\n')
    if scenario=='delete-failure':
      write(bins/'rm','#!/bin/sh\ncase "$*" in *'+bp(second)+'.org*) exit 1 ;; esac\n/usr/bin/rm "$@"\n')
    if scenario=='archive-failure':
      write(bins/'cp','#!/bin/sh\ncase "$*" in *original.data*) exit 1 ;; esac\n/usr/bin/cp "$@"\n')
    if scenario=='invalid-path':
      if os.name=='nt':
        # Windows cannot create newline filenames; exercise the refusal marker.
        write(bins/'find','#!/bin/sh\nprintf "__INVALID_BACKUP_PATH__\\n"\n')
      else:write(internal/'bad\nname.org','unsupported name\n')
    if scenario=='missing-target':first.unlink()
    if scenario=='bad-oem':write(Path(str(first)+'.org'),'not OEM\n')
    if scenario=='unknown-extra':write(service/'foreign.txt','leave me alone\n')
    if scenario=='changed-payload':write(service/'sshd_config','foreign config\n')
    if scenario=='missing-payload-file':(service/'password.hash').unlink()
    if scenario=='no-backups':
      for path in values:Path(str(path)+'.org').unlink()
      shutil.rmtree(service);shutil.rmtree(runtime);write(second,'#!/bin/sh\n# no managed hook\n')
    if scenario=='unsupported':write(version,'JCI_SW_VER="MAZ_CMU-150_70.00.100"\n')
    if managed:
      store=internal/'package-records'
      package_lib=usb/'lib/packages.sh'
      write(package_lib,package_lib.read_text().replace('MZD_PACKAGE_STORE=/tmp/mnt/data_persist/mzd-tweaks/installed','MZD_PACKAGE_STORE='+shlex.quote(bp(store))))
      # Represent a completed saved version. The actual SSH worker itself is
      # covered separately; here its reset hook and the real Restore execute.
      write(usb/'tweaks/ssh/run.sh','#!/bin/sh\n[ "$1" = status ] || exit 1\nif grep -qF "# MZD v74 SSH" '+shlex.quote(bp(second))+'; then echo installed; else echo uninstalled; fi\n')
      write(usb/'tweaks/ssh/assets/must-not-restore.org','package asset, not a system backup\n')
      entry=store/'ssh';store.mkdir()
      driver=base/'register.sh'
      write(driver,'#!/bin/sh\nPATH='+shlex.quote(bp(bins)+':/usr/bin:/bin')+'\nexport PATH\n. '+shlex.quote(bp(usb/'lib/manifest.sh'))+'\n. '+shlex.quote(bp(package_lib))+'\nmzd_package_stage '+shlex.quote(bp(usb))+' '+shlex.quote(bp(entry))+' ssh || exit 1\nmzd_package_inventory '+shlex.quote(bp(entry))+' > '+shlex.quote(bp(entry/'package.files'))+' || exit 1\nmzd_package_set_state '+shlex.quote(bp(entry))+' installed\n')
      setup=subprocess.run([SHELL,bp(driver)],capture_output=True,text=True,timeout=25)
      assert setup.returncode==0,(setup.stdout,setup.stderr)
      # The new USB reset payload deliberately no longer matches the installation.
      write(usb/'tweaks/ssh/assets/service.sh','#!/bin/sh\nexit 97\n')
    def run(*args):return subprocess.run([SHELL,bp(worker),*args],capture_output=True,text=True,timeout=25)
    assert run('--help').returncode==0
    assert run('invalid').returncode==1
    assert run('status','extra').returncode==1
    direct=subprocess.run([SHELL,bp(hook),'finish'],capture_output=True,text=True,timeout=10)
    assert direct.returncode!=0
    if scenario!='no-backups':assert (service/'enabled').exists()
    initial={p:p.read_bytes() for p in base.rglob('*') if p.is_file()}
    status=run('status');assert status.returncode==0,(scenario,status.stdout,status.stderr)
    assert status.stdout==('unavailable\n' if scenario=='unsupported' else 'uninstalled\n')
    assert {p:p.read_bytes() for p in base.rglob('*') if p.is_file()}==initial,'Status wrote files'
    result=run('run')
    expected=0 if scenario in ['success','missing-payload-file','missing-target','no-backups'] else 2 if scenario in ['rollback-failure','hook-stop-failure'] else 1
    assert result.returncode==expected,(scenario,result.returncode,result.stdout,result.stderr,[(str(p),p.read_text(errors='replace')) for p in usb.glob('reports/**/run.log')])
    checks+=1
    assert (nav/'nav.js').read_text()=='navigation stays modified\n'
    assert (nav/'nav.js.org').exists()
    assert (internal/'sm.conf').read_text()==old_sm and (internal/'sm_WCP.conf').read_text()==old_sm
    assert old_payload.read_text()=='not from this tweak\n'
    assert gpio.read_text()=='0\n'
    assert not list(locks.iterdir()),(scenario,list(locks.iterdir()))
    assert 'forbidden' not in (events.read_text() if events.exists() else '')
    if scenario in ['success','missing-payload-file','missing-target','delete-failure']:
      for path,(original,_) in values.items():assert path.read_text()==original,(scenario,path)
      assert not service.exists() and not runtime.exists()
      assert not (usb/'mzd-ssh-log-marker.txt').exists()
      if scenario!='delete-failure':assert all(not Path(str(p)+'.org').exists() for p in values)
      archives=list(usb.glob('reports/restore-originals/run-*/files'))
      assert len(archives)==1
      if managed:
        assert not entry.exists()
        assert not list(archives[0].parent.glob('files/*/target.path'))==[]
        saved=archives[0].parent/'reset-hooks/package-ssh'
        assert (saved/'package/tweaks/ssh/assets/must-not-restore.org').read_text()=='package asset, not a system backup\n'
      for folder in archives[0].iterdir():
        target=next(p for p in values if bp(p)==(folder/'target.path').read_text().strip())
        if scenario=='missing-target' and target==first:assert (folder/'before.absent').exists()
        else:assert (folder/'before.data').read_text()==values[target][1]
        assert (folder/'original.data').read_text()==values[target][0]
    elif scenario not in ['no-backups','rollback-failure']:
      for path,(_,changed) in values.items():assert path.read_text()==changed,(scenario,path)
      assert all(Path(str(p)+'.org').exists() for p in values)
    if scenario in ['write-failure','rollback-failure']:
      assert all(Path(str(p)+'.org').exists() for p in values)
    if scenario in ['rollback-failure','hook-stop-failure']:assert 'Do NOT reboot' in result.stderr
    if scenario in ['bad-oem','unknown-extra','changed-payload','archive-failure','unsupported','invalid-path']:
      assert (service/'enabled').exists() and runtime.exists()
    if scenario!='unsupported':
      modes=mounts.read_text();assert f'{bp(internal)} ext3 ro' in modes and f'{bp(resources)} ext3 ro' in modes,modes
print('RESTORE_COMMAND_PASSED:',checks,'isolated entrypoint scenarios; archives, .org deletion, rollback, internal mount filtering, SSH hooks and failures.')
