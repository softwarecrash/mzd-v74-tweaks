"""Real saved GUI workers: automatic shared support, reuse, rollback and cleanup."""
from pathlib import Path
import os,shutil,subprocess,tempfile,shlex,json,sys,hashlib
ROOT=Path(__file__).resolve().parents[2]
SHELL='C:/Program Files/Git/bin/bash.exe' if os.name=='nt' else '/bin/sh'
def bp(p):
 s=Path(p).resolve().as_posix();return '/'+s[0].lower()+s[2:] if len(s)>1 and s[1]==':' else s
def write(p,s):
 p.parent.mkdir(parents=True,exist_ok=True);p.write_text(s,encoding='utf-8',newline='\n');p.chmod(0o755)
# Upper limit for one installer action. The CMU-like BusyBox is a 32-bit ARM program: on an x86 PC or a Mac it runs
# through qemu, where an action can take several times longer than on the ARM CI runner.
ACTION_TIMEOUT=600 if os.environ.get('CMU_TEST_BUSYBOX') else 180 if os.name=='nt' else 60
# Resolve real commands before installing failure-injection wrappers. Alpine keeps
# these applets outside /usr/bin; the BusyBox job must use its supplied binary.
def real_command(name):
 if os.environ.get('CMU_TEST_BUSYBOX'):
  busybox=shutil.which('busybox')
  assert busybox, 'BusyBox requested but missing.'
  return shlex.quote(bp(busybox))+' '+name
 result=subprocess.run([SHELL,'-c','command -v '+name],capture_output=True,text=True,check=True)
 command=result.stdout.strip()
 assert command.startswith('/'), 'Expected an absolute command path: '+command
 return shlex.quote(command)
copy_command=real_command('cp');remove_command=real_command('rm');awk_command=real_command('awk')
checks=0
traffic_profile=any(flag in sys.argv for flag in ['--traffic-jam-only','--snake-only','--minesweeper-only'])
with tempfile.TemporaryDirectory(prefix='cmu-gui-') as folder:
 b=Path(folder);usb=b/'usb';data=b/'data';base=data/'integration';persist=b/'persist';provider=persist/'mzd-tweaks/gui-provider';bins=b/'bin';version=b/'version';mounts=b/'mounts';events=b/'events'
 for p in [base,bins,persist]:p.mkdir(parents=True)
 shutil.copytree(ROOT/'usb/lib',usb/'lib')
 write(usb/'installer.sh',(ROOT/'usb/installer.sh').read_text())
 for id_,parent in [('gui-example',''),('second-example','Games')]:
  dest=usb/'tweaks'/id_;shutil.copytree(ROOT/'development/examples/gui-extension',dest)
  p=dest/'manifest.conf';s=p.read_text().replace('id=gui-example','id='+id_).replace('gui_menu_path=','gui_menu_path='+parent)
  if id_=='second-example':s=s.replace('gui_label=Example GUI page','gui_label=Second "page" </script>')
  write(p,s)
 shutil.copytree(ROOT/'usb/tweaks/tetris',usb/'tweaks/tetris')
 shutil.copytree(ROOT/'usb/tweaks/drivedash',usb/'tweaks/drivedash')
 for game_id in ['snake','minesweeper']:shutil.copytree(ROOT/'usb/tweaks'/game_id,usb/'tweaks'/game_id)
 shutil.copytree(ROOT/'usb/tweaks/wallpaper-manager',usb/'tweaks/wallpaper-manager')
 shutil.copytree(ROOT/'development/examples/gui-hello-world',usb/'tweaks/gui-hello-world')
 shutil.copytree(ROOT/'development/examples/config-data',usb/'tweaks/config-example')
 shutil.copytree(ROOT/'usb/tweaks/restore-originals',usb/'tweaks/restore-originals')
 if '--ssh-coexist-only' in sys.argv:
  shutil.copytree(ROOT/'usb/tweaks/ssh',usb/'tweaks/ssh')
  write(b/'startup','#!/bin/sh\n\n');write(b/'watchdog','1\n');(b/'resources').mkdir()
 if '--services-only' in sys.argv or '--wallpaper-only' in sys.argv:
  for id_ in ['gui-example','second-example']:
   dest=usb/'tweaks'/id_
   with (dest/'manifest.conf').open('a',encoding='utf-8') as f:f.write('\ngui_resident=assets/resident.js\ngui_service=assets/service.lua\n')
   write(dest/'assets/resident.js','window.MzdGuiResidents.register("'+id_+'",function () {});\n')
   write(dest/'assets/service.lua','return function() return {request=function()return {}end}end\n')
  write(b/'startup','#!/bin/sh\n# unrelated SSH hook\necho original\n')
 if '--drivedash-only' in sys.argv or '--tetris-only' in sys.argv or '--tetris-config-only' in sys.argv or '--helper-compat-only' in sys.argv or traffic_profile:
  write(b/'startup','#!/bin/sh\necho original\n')
 p=usb/'tweaks/restore-originals/manifest.conf';write(p,p.read_text().replace('target=/jci','target='+bp(data)))
 write(version,'JCI_SW_VER="MAZ_CMU-150_74.00.324"\n');write(mounts,'mock '+bp(usb)+' vfat rw 0 0\n/dev/mmcblk0p1 '+bp(data)+' relfs rw 0 0\nmock '+bp(persist)+' relfs rw 0 0\nmock '+bp(b)+' relfs rw 0 0\n')
 write(b/'watchdog','0\n')
 replacements={'MZD_SHIM_ROOT=/':'MZD_SHIM_ROOT='+bp(b),'MZD_GUI_STARTUP_MOUNT=/':'MZD_GUI_STARTUP_MOUNT='+bp(b),'/jci/scripts/stage_wifi.sh':bp(b/'startup'),'/tmp/mzd-stage_wifi-tweak.lock':bp(b/'startup.lock'),'/tmp/mnt/data_persist':bp(persist),'/tmp/mnt/data':bp(data),'/tmp/mzd-packages.lock':bp(b/'packages.lock'),'/tmp/mzd-gui-extension.lock':bp(b/'gui.lock'),'/tmp/mzd-restore-originals.lock':bp(b/'restore.lock'),'/jci/version.ini':bp(version),'/proc/mounts':bp(mounts),'/sys/class/gpio/Watchdog\\ Disable/value':bp(b/'watchdog')}
 if '--ssh-coexist-only' in sys.argv:
  replacements['/tmp/mnt/resources']=bp(b/'resources')
  replacements['/sys/class/gpio/Watchdog\\ Disable/value']=bp(b/'watchdog')
 for p in usb.rglob('*.sh'):
  s=p.read_text()
  for x,y in replacements.items():s=s.replace(x,y)
  s=s.replace('/tmp/mnt/sd[a-z][0-9]*|/mnt/sd[a-z][0-9]*',shlex.quote(bp(usb)))
  s=s.replace('#!/bin/sh\n','#!/bin/sh\nPATH='+shlex.quote(bp(bins)+':/usr/bin:/bin')+'\nexport PATH\n',1);write(p,s)
 for p in usb.rglob('manifest.conf'):
  write(p,p.read_text().replace('/tmp/mnt/data_persist',bp(persist)))
 if '--ssh-coexist-only' in sys.argv:
  p=usb/'tweaks/ssh/manifest.conf';write(p,p.read_text().replace('/jci/scripts/stage_wifi.sh',bp(b/'startup')))
  p=usb/'tweaks/ssh/managed-paths.tsv';write(p,p.read_text().replace('/tmp/mnt/resources',bp(b/'resources')))
  with mounts.open('a') as f:f.write('root / relfs rw 0 0\nmock '+bp(b/'resources')+' relfs rw 0 0\n')
  write(usb/'tweaks/ssh/assets/service.sh',"#!/bin/sh\ncase \"$1\" in check|check-auth) exit 0;;boot) touch "+shlex.quote(bp(b/'ssh-running'))+";;status) [ -f "+shlex.quote(bp(b/'ssh-running'))+" ];;stop) rm -f "+shlex.quote(bp(b/'ssh-running'))+";;*) exit 1;;esac\n")
 for name in ['mount','sync']:write(bins/name,'#!/bin/sh\nprintf "'+name+'\\n" >> '+shlex.quote(bp(events))+'\n')
 write(bins/'df','#!/bin/sh\nprintf "Filesystem 1024-blocks Used Available Capacity Mounted\\nmock 1000000 1000 999000 1%% persist\\n"\n')
 # Simulate an install-time boot-hook copy failure without touching any real CMU file.
 write(bins/'cp','''#!/bin/sh
for arg do destination=$arg; done
if [ "$destination" = '''+shlex.quote(bp(base/'developer_mode_GuiConfig.js'))+''' ] && [ -f '''+shlex.quote(bp(b/'fail-hook'))+''' ]; then exit 1; fi
if [ "$destination" = '''+shlex.quote(bp(base/'developer_mode_GuiConfig.js'))+''' ] && [ -f '''+shlex.quote(bp(b/'fail-signal'))+''' ]; then kill -TERM "$PPID"; exit 1; fi
if [ "$destination" = '''+shlex.quote(bp(base/'mzd-gui-runtime'))+''' ] && [ -f '''+shlex.quote(bp(b/'fail-rollback-runtime'))+''' ]; then exit 1; fi
exec '''+copy_command+''' "$@"
''')
 write(bins/'rm','#!/bin/sh\nfor arg do destination=$arg; done\nif [ "$destination" = '+shlex.quote(bp(base/'mzd-gui-runtime'))+' ] && [ -f '+shlex.quote(bp(b/'fail-remove'))+' ]; then '+remove_command+' -f '+shlex.quote(bp(b/'fail-remove'))+'; exit 1; fi\nexec '+remove_command+' "$@"\n')
 if traffic_profile or any(flag in sys.argv for flag in ['--drivedash-only','--services-only','--wallpaper-only','--tetris-only','--tetris-config-only','--ssh-coexist-only','--helper-compat-only']):
  # CMU BusyBox does not decode the literal backslash-t passed through -F.
  # Reject that nonportable form even when the host awk would accept it.
  write(bins/'awk','#!/bin/sh\nif [ \"$1\" = -F ] && [ \"$2\" = '+shlex.quote(r'\t')+' ]; then printf \"Unsupported CMU awk field separator.\\n\" >&2; exit 1; fi\nexec '+awk_command+' \"$@\"\n')
  for name in ['lua','setsid']:write(bins/name,'#!/bin/sh\nexit 0\n')
  # Daemon transport has a separate original-ARM integration test. Here observe
  # worker ordering without creating a host listener or starting a CMU service.
  with (usb/'lib/gui-services.sh').open('a',encoding='utf-8') as f:
   f.write('\nmzd_gui_services_stop() { printf "stop\\n" >> '+shlex.quote(bp(events))+'; }\n')
   f.write('mzd_gui_services_start() { printf "start\\n" >> '+shlex.quote(bp(events))+'; }\n')
 def call(id_,action,code=0,out=None,extra=()):
  global checks
  r=subprocess.run([SHELL,bp(usb/'installer.sh'),'action',id_,action,*extra],capture_output=True,text=True,timeout=ACTION_TIMEOUT)
  detail=''
  if r.returncode!=code:
   logs=sorted((usb/'reports'/id_).rglob('run.log'),key=lambda p:p.stat().st_mtime)
   detail='\n'.join(p.read_text(encoding='utf-8',errors='replace')[-16000:] for p in logs[-2:])
  assert r.returncode==code,(id_,action,code,r.returncode,r.stdout,r.stderr,detail)
  if out is not None:assert r.stdout==out+'\n',(r.stdout,r.stderr)
  checks+=1;return r
 def deep(id_,expected):
  global checks
  p=usb/'tweaks'/id_/'run.sh';before={x.relative_to(b):x.read_bytes() for x in b.rglob('*') if x.is_file()}
  r=subprocess.run([SHELL,bp(p),'status'],env=dict(os.environ,MZD_WORKER_DIRECT='1'),capture_output=True,text=True,timeout=30)
  assert r.returncode==0 and r.stdout==expected+'\n',(r.stdout,r.stderr)
  assert before=={x.relative_to(b):x.read_bytes() for x in b.rglob('*') if x.is_file()},'Status mutated state'
  if expected in ['broken','unavailable']:assert r.stderr
  checks+=1
 hook=base/'developer_mode_GuiConfig.js';runtime=base/'mzd-gui-runtime';registry=base/'mzd-gui-registry.js';modules=base/'mzd-gui-modules'
 def absent():assert not hook.exists() and not runtime.exists() and not registry.exists() and not provider.exists() and not modules.exists()
 if '--helper-compat-only' in sys.argv:
  api=usb/'lib/gui-runtime/api.conf';current=api.read_text()
  write(api,current.replace('view-lifecycle=1\n','').replace('version=0.5.0','version=0.4.0'))
  call('gui-example','install')
  write(api,current)
  receipt=persist/'mzd-tweaks/installed/gui-example'
  before={str(p.relative_to(persist)):p.read_bytes() for p in persist.rglob('*') if p.is_file()}
  p=usb/'tweaks/gui-example/manifest.conf';write(p,p.read_text().replace('version=0.1.0','version=0.1.1'))
  for id_,action in [('gui-example','update'),('gui-example','install'),('second-example','install')]:
   r=call(id_,action,1)
   assert 'Uninstall ALL GUI tweaks' in r.stdout+r.stderr,(r.stdout,r.stderr)
   assert before=={str(p.relative_to(persist)):p.read_bytes() for p in persist.rglob('*') if p.is_file()},'Rejected action changed saved installation'
  call('gui-example','uninstall');absent()
  call('gui-example','install');call('second-example','install')
  assert 'view-lifecycle=1' in (provider/'package/lib/gui-runtime/api.conf').read_text()
  call('second-example','uninstall');call('gui-example','uninstall');absent()
  # A phone-capable provider still needs replacement for parking support.
  write(api,current.replace('parking-lifecycle=1\n',''))
  call('gui-example','install');write(api,current)
  before={str(p.relative_to(persist)):p.read_bytes() for p in persist.rglob('*') if p.is_file()}
  r=call('second-example','install',1);assert 'Uninstall ALL GUI tweaks' in r.stdout+r.stderr
  assert before=={str(p.relative_to(persist)):p.read_bytes() for p in persist.rglob('*') if p.is_file()}
  call('gui-example','uninstall');absent()
  # A 0.5.3 helper still needs replacement for native-menu and service-request support.
  helper_053=current.replace('native-menu=1\n','').replace('service-request=1\n','').replace('version=0.6.0','version=0.5.3')
  write(api,helper_053)
  call('gui-example','install');write(api,current)
  before={str(p.relative_to(persist)):p.read_bytes() for p in persist.rglob('*') if p.is_file()}
  r=call('wallpaper-manager','install',1)
  assert 'Uninstall ALL GUI tweaks' in r.stdout+r.stderr,(r.stdout,r.stderr)
  assert before=={str(p.relative_to(persist)):p.read_bytes() for p in persist.rglob('*') if p.is_file()},'Rejected install changed saved installation'
  call('gui-example','uninstall');absent()
  # Updating a consumer installed with 0.5.3 helper also refuses before removing the old version.
  write(api,helper_053)
  call('wallpaper-manager','install');write(api,current)
  before={str(p.relative_to(persist)):p.read_bytes() for p in persist.rglob('*') if p.is_file()}
  p=usb/'tweaks/wallpaper-manager/manifest.conf';p_orig=p.read_text();write(p,p_orig.replace('version=0.4.3','version=0.4.4'))
  for id_,action in [('wallpaper-manager','update'),('second-example','install')]:
   r=call(id_,action,1)
   assert 'Uninstall ALL GUI tweaks' in r.stdout+r.stderr,(r.stdout,r.stderr)
   assert before=={str(p.relative_to(persist)):p.read_bytes() for p in persist.rglob('*') if p.is_file()},'Rejected action changed saved installation'
  write(p,p_orig)
  call('wallpaper-manager','uninstall');absent()
  call('wallpaper-manager','install');call('second-example','install')
  assert 'native-menu=1' in (provider/'package/lib/gui-runtime/api.conf').read_text()
  assert 'service-request=1' in (provider/'package/lib/gui-runtime/api.conf').read_text()
  call('second-example','uninstall');call('wallpaper-manager','uninstall');absent()
  print('GUI_HELPER_COMPAT_PASSED:',checks,'real actions; old helper blocks install/update before mutation, saved uninstall and current reuse work.')
  raise SystemExit(0)
 if '--ssh-coexist-only' in sys.argv:
  startup=b/'startup';original=startup.read_bytes();backup=Path(str(startup)+'.org')
  expected_hash=hashlib.md5(original).hexdigest()
  assert 'oem_backup_md5='+expected_hash in (usb/'tweaks/ssh/manifest.conf').read_text()
  gui_block=b'# MZD shared GUI services\nsh /data/integration/mzd-gui-runtime/service/supervisor.sh boot >/dev/null 2>&1 &\n'
  # Both install orders and both removal orders, with real saved SSH/GUI workers.
  for gui_id in ['tetris','wallpaper-manager']:
   for gui_first in [True,False]:
    for gui_remove_first in [True,False]:
     assert startup.read_bytes()==original and not backup.exists()
     order=[gui_id,'ssh'] if gui_first else ['ssh',gui_id]
     for id_ in order:
      call(id_,'install')
      if id_==gui_id and gui_first:assert not backup.exists()
     assert backup.read_bytes()==original
     assert startup.read_bytes().count(gui_block)==1
     assert startup.read_bytes().count(b'# MZD v74 SSH\n')==1
     deep('ssh','installed');deep(gui_id,'installed')
     removal=[gui_id,'ssh'] if gui_remove_first else ['ssh',gui_id]
     for index,id_ in enumerate(removal):
      call(id_,'uninstall')
      if index==0:
       remaining=removal[1];deep(remaining,'installed')
       assert (gui_block in startup.read_bytes())==(remaining==gui_id)
       assert (b'# MZD v74 SSH\n' in startup.read_bytes())==(remaining=='ssh')
       if remaining=='ssh':
        for container in ['config-owners','data','gui-data']:
         assert not (persist/'mzd-tweaks'/container).exists(), 'unused data container retained alongside SSH'
     absent();assert startup.read_bytes()==original and not backup.exists()
     assert not (persist/'mzd-tweaks').exists(), 'empty framework containers left after final uninstall'
     # The last managed consumer removes its own shared OEM backup.
  call('ssh','uninstall');assert not (persist/'mzd-tweaks').exists(), 'no-op uninstall recreated storage'
  # Legacy GUI receipts lacked both original snapshots and startup ownership.
  package_source=(usb/'lib/packages.sh').read_text();paths_source=(usb/'lib/gui-extension.sh').read_text()
  write(usb/'lib/packages.sh',package_source.replace('. "$stage/package/lib/originals.sh" && mzd_originals_capture "$stage" || exit 1',''))
  write(usb/'lib/gui-extension.sh','\n'.join(line for line in paths_source.splitlines() if '${MZD_GUI_STARTUP:-' not in line)+'\n')
  call('tetris','install');before=startup.read_bytes();assert not backup.exists()
  write(usb/'lib/packages.sh',package_source);write(usb/'lib/gui-extension.sh',paths_source)
  refused=call('ssh','install',1)
  assert 'Uninstall the older tweak first' in refused.stderr and startup.read_bytes()==before
  assert not (persist/'mzd-tweaks/installed/ssh').exists() and not backup.exists()
  call('tetris','uninstall');absent();assert startup.read_bytes()==original
  # Read-only checks must reject unknown, duplicate, partial or altered GUI data.
  valid=original.replace(b'#!/bin/sh\n',b'#!/bin/sh\n'+gui_block,1)
  malformed=[valid+b'# unrelated edit\n',valid.replace(gui_block,gui_block*2),valid.replace(b'supervisor.sh boot',b'supervisor.sh other'),valid.rstrip(b'\n')]
  for content in malformed:
   startup.write_bytes(content);deep('ssh','unavailable');call('ssh','install',1)
   assert startup.read_bytes()==content and not backup.exists()
  startup.write_bytes(valid);write(backup,'corrupt backup\n');deep('ssh','unavailable');call('ssh','install',1)
  assert backup.read_text()=='corrupt backup\n' and startup.read_bytes()==valid
  backup.unlink();startup.write_bytes(original)
  print('SSH_GUI_COEXIST_PASSED:',checks,'real actions/checks; both GUI consumers, both install/removal orders, exact OEM backup and unmanaged-change refusal.')
  raise SystemExit(0)
 if '--services-only' in sys.argv:
  write(mounts,mounts.read_text().replace(bp(data)+' relfs rw',bp(data)+' relfs ro'))
  write(bins/'mount','''#!/bin/sh
awk -v p="$3" -v mode="$2" '{$4=($2==p?(mode=="rw,remount"?"rw":"ro"):$4);print}' '''+shlex.quote(bp(mounts))+''' > '''+shlex.quote(bp(mounts))+'''.next && mv '''+shlex.quote(bp(mounts))+'''.next '''+shlex.quote(bp(mounts))+'''
''')
  def data_readonly():
   assert any(row.split()[1:4]==[bp(data),'relfs','ro'] for row in mounts.read_text().splitlines())
  startup=b/'startup';original=startup.read_bytes()
  call('gui-hello-world','install')
  call('gui-example','install');deep('gui-example','installed')
  assert b'resident:' in registry.read_bytes() and 'gui-example' in (base/'mzd-gui-services.tsv').read_text()
  assert startup.read_text().count('# MZD shared GUI services')==1
  user_data=persist/'mzd-tweaks/gui-data/gui-example'
  owner_bytes=(user_data/'owner').read_bytes();(user_data/'owner').write_bytes(owner_bytes.rstrip(b'\n'));deep('gui-example','broken');(user_data/'owner').write_bytes(owner_bytes);deep('gui-example','installed')
  write(user_data/'user-file','keep user data\n')
  call('second-example','install');assert startup.read_text().count('# MZD shared GUI services')==1
  hook_before=hook.read_bytes();hook.unlink()
  call('gui-example','uninstall');assert hook.exists() and startup.read_bytes()!=original and not user_data.exists()
  assert hook.read_bytes()==hook_before and modules.is_dir() and (modules/'second-example').is_dir()
  data_readonly()
  call('second-example','uninstall');assert hook.exists() and startup.read_bytes()==original and not (base/'mzd-gui-services.tsv').read_text()
  call('gui-hello-world','uninstall');absent();assert not (base/'mzd-gui-services.tsv').exists()
  assert not modules.exists();data_readonly()
  # Old immutable providers and saved uninstallers must be removed explicitly.
  call('gui-hello-world','install')
  for q in [provider/'package/lib/gui-runtime/api.conf',runtime/'api.conf',persist/'mzd-tweaks/installed/gui-hello-world/package/lib/gui-runtime/api.conf']:
   write(q,'api=1\nversion=0.1.0\n')
  for folder,inventory in [(provider,'provider.files'),(persist/'mzd-tweaks/installed/gui-hello-world','package.files')]:
   subprocess.run([SHELL,'-c','. '+shlex.quote(bp(usb/'lib/packages.sh'))+'; mzd_package_inventory '+shlex.quote(bp(folder))+' > '+shlex.quote(bp(folder/inventory))],check=True)
  failed=call('gui-example','install',1)
  diagnostics=failed.stdout+failed.stderr+'\n'.join(p.read_text() for p in (usb/'reports/gui-example').glob('install-*/run.log'))
  assert 'predates resident services' in diagnostics,diagnostics
  assert startup.read_bytes()==original and not (modules/'gui-example').exists() and not (persist/'mzd-tweaks/installed/gui-example').exists()
  call('gui-hello-world','uninstall');absent()
  print('GUI_SERVICES_PACKAGES_PASSED:',checks,'real entrypoint checks; shared startup, both service consumers, last cleanup, owned data removal and old-provider refusal.')
  raise SystemExit(0)
 if traffic_profile:
  startup=b/'startup';original=startup.read_bytes()
  call('tetris','install');call('snake','install');call('minesweeper','install')
  assert registry.read_text().count('menuPath:"Traffic Jam"')==3
  selected=['snake','minesweeper'] if '--traffic-jam-only' in sys.argv else ['snake' if '--snake-only' in sys.argv else 'minesweeper']
  for game_id in selected:
   deep(game_id,'installed')
   user_data=persist/'mzd-tweaks/gui-data'/game_id
   owner=(user_data/'owner').read_bytes();write(user_data/'record.conf','best=42\n')
   assert (user_data/'record.conf').read_text()=='best=42\n'
   p=usb/'tweaks'/game_id/'manifest.conf';write(p,p.read_text().replace('version=0.1.2','version=0.1.3'))
   call(game_id,'update');assert (user_data/'record.conf').read_text()=='best=42\n' and (user_data/'owner').read_bytes()==owner
   call(game_id,'uninstall',extra=['--preserve-config']);assert (user_data/'record.conf').exists() and hook.exists()
   call(game_id,'install');assert (user_data/'record.conf').read_text()=='best=42\n'
   call(game_id,'uninstall');assert not user_data.exists() and hook.exists()
   assert not (persist/'mzd-tweaks/config-owners'/(game_id+'.tsv')).exists()
   call(game_id,'install');assert not (user_data/'record.conf').exists()
   call(game_id,'uninstall');assert not user_data.exists()
  for game_id in ['snake','minesweeper']:
   if game_id not in selected:call(game_id,'uninstall')
  assert registry.read_text().count('menuPath:"Traffic Jam"')==1
  call('tetris','uninstall');absent();assert startup.read_bytes()==original
  print('TRAFFIC_JAM_PACKAGES_PASSED:',checks,'real actions; three Games consumers, separate records, Update, keep/reinstall, full data removal and original startup.')
  raise SystemExit(0)
 if '--wallpaper-only' in sys.argv:
  startup=b/'startup';original=startup.read_bytes()
  assert not list((usb/'tweaks/wallpaper-manager').rglob('*.png'))
  deep('wallpaper-manager','uninstalled')
  call('tetris','install');call('wallpaper-manager','install');deep('wallpaper-manager','installed')
  assert 'resident:' in registry.read_text() and 'translations:' in registry.read_text()
  user_data=persist/'mzd-tweaks/gui-data/wallpaper-manager'
  write(user_data/'test-image.png','synthetic user data\n')
  write(user_data/'gallery/gallery.tsv','saved image and slideshow settings\n')
  saved={p.relative_to(user_data):p.read_bytes() for p in user_data.rglob('*') if p.is_file()}
  p=usb/'tweaks/wallpaper-manager/manifest.conf';write(p,p.read_text().replace('version=0.4.3','version=0.4.4'))
  call('wallpaper-manager','update')
  assert saved=={p.relative_to(user_data):p.read_bytes() for p in user_data.rglob('*') if p.is_file()}
  call('wallpaper-manager','uninstall',extra=['--preserve-config']);assert hook.exists() and (user_data/'test-image.png').exists()
  assert startup.read_bytes()!=original  # Tetris is also a service consumer now.
  call('tetris','uninstall');absent();assert startup.read_bytes()==original
  call('wallpaper-manager','install')
  assert saved=={p.relative_to(user_data):p.read_bytes() for p in user_data.rglob('*') if p.is_file()}
  call('tetris','install');call('tetris','uninstall');assert hook.exists()
  call('wallpaper-manager','uninstall');absent();assert startup.read_bytes()==original
  assert not user_data.exists()
  assert not (persist/'mzd-tweaks/config-owners/wallpaper-manager.tsv').exists()
  call('wallpaper-manager','install');assert not (user_data/'test-image.png').exists() and not (user_data/'gallery').exists()
  call('wallpaper-manager','uninstall');absent();assert not user_data.exists() and startup.read_bytes()==original
  print('WALLPAPER_PACKAGE_PASSED:',checks,'real actions; Update, keep/reinstall, full data removal, clean reinstall, mixed consumers and original startup restoration.')
  raise SystemExit(0)
 if '--i18n-compat-only' in sys.argv:
  call('gui-example','install')
  for folder in [provider, persist/'mzd-tweaks/installed/gui-example']:
   api=folder/'package/lib/gui-runtime/api.conf';write(api,api.read_text().replace('i18n=2\n',''))
   inventory='provider.files' if folder==provider else 'package.files'
   subprocess.run([SHELL,'-c','. '+shlex.quote(bp(usb/'lib/packages.sh'))+'; mzd_package_inventory '+shlex.quote(bp(folder))+' > '+shlex.quote(bp(folder/inventory))],check=True)
  api=runtime/'api.conf';write(api,api.read_text().replace('i18n=2\n',''))
  result=call('tetris','install',1)
  assert 'predates translations' in result.stdout+result.stderr
  assert not (persist/'mzd-tweaks/installed/tetris').exists(),'failed capability check published a receipt'
  call('gui-example','uninstall');absent()
  print('GUI_I18N_COMPAT_PASSED:',checks,'real actions; old provider refused before staging.')
  raise SystemExit(0)
 if '--restore-only' in sys.argv:
  # An uninstalled service consumer must not invoke Lua, even with retained data.
  write(bins/'lua','#!/bin/sh\nprintf \"unexpected Lua during Restore\\n\" >&2\nexit 90\n')
  retained=persist/'mzd-tweaks/gui-data/wallpaper-manager'
  write(retained/'owner','MZD_GUI_DATA_V1\nwallpaper-manager\n');write(retained/'keep','user content\n')
  call('gui-example','install');call('second-example','install');call('restore-originals','run');absent()
  assert not list((persist/'mzd-tweaks/installed').glob('*'))
  assert (retained/'keep').read_text()=='user content\n'
  assert not (b/'startup').exists(),'uninstalled service consumer changed startup'
  print('GUI_RESTORE_PASSED:',checks,'real actions; mixed GUI reset and last shared-support cleanup.')
  raise SystemExit(0)
 if '--config-example-only' in sys.argv:
  call('config-example','install')
  data=persist/'mzd-tweaks/data/config-example'
  assert (data/'preferences.conf').read_text()=='theme=default\n'
  assert (data/'state/counter.conf').read_text()=='' and not (data/'session.conf').exists()
  write(data/'preferences.conf','user=changed\n');write(data/'state/runtime.conf','runtime=yes\n');write(data/'session.conf','session=yes\n')
  call('config-example','uninstall',extra=['--preserve-config']);assert (data/'session.conf').exists();absent()
  call('config-example','install');assert (data/'preferences.conf').read_text()=='user=changed\n'
  call('config-example','uninstall');assert not (data/'preferences.conf').exists() and not (data/'state').exists() and not (data/'session.conf').exists();absent()
  print('CONFIG_EXAMPLE_PASSED:',checks,'real actions; file, folder, optional source, runtime data, keep/reinstall and removal.')
  raise SystemExit(0)
 if '--tetris-config-only' in sys.argv:
  call('tetris','install')
  score=persist/'mzd-tweaks/data/tetris/highscore.conf'
  assert score.exists() and score.read_text()==''
  write(score,'highscore=1234\n')
  p=usb/'tweaks/tetris/manifest.conf';write(p,p.read_text().replace('version=0.5.1','version=0.5.2'))
  call('tetris','update');assert score.read_text()=='highscore=1234\n'
  call('tetris','uninstall',extra=['--preserve-config']);assert score.exists();absent()
  call('tetris','install');assert score.read_text()=='highscore=1234\n'
  call('tetris','uninstall');assert not score.exists();absent()
  print('TETRIS_CONFIG_LIFECYCLE_PASSED:',checks,'real actions; template, edited highscore, Update, keep/reinstall and full removal.')
  raise SystemExit(0)
 if '--drivedash-only' in sys.argv:
  startup=b/'startup';original=startup.read_bytes()
  settings=persist/'mzd-tweaks/gui-data/drivedash/settings.conf'
  deep('drivedash','uninstalled')
  write(version,'unsupported firmware\n');deep('drivedash','unavailable');write(version,'JCI_SW_VER="MAZ_CMU-150_74.00.324"\n')
  write(hook,'foreign hook\n');deep('drivedash','unavailable');call('drivedash','install',1);assert hook.read_text()=='foreign hook\n';hook.unlink()
  call('drivedash','install');deep('drivedash','installed')
  assert 'language=auto\n' in settings.read_text()
  assert 'drivedash' in (base/'mzd-gui-services.tsv').read_text()
  edited='version=1\ndesign=oem-style\nlanguage=de_DE\nspeedUnit=mph\ntempUnit=F\nanimated=true\n'
  write(settings,edited);deep('drivedash','installed')
  manifest=usb/'tweaks/drivedash/manifest.conf';write(manifest,manifest.read_text().replace('version=0.1.6','version=0.1.7'))
  call('drivedash','update');assert settings.read_text()==edited
  call('tetris','install');call('drivedash','uninstall',extra=['--preserve-config']);assert settings.read_text()==edited and hook.exists()
  call('tetris','uninstall');absent();assert startup.read_bytes()==original and settings.read_text()==edited
  call('drivedash','install');assert settings.read_text()==edited
  call('drivedash','uninstall');absent();assert not settings.parent.exists() and startup.read_bytes()==original
  assert not (persist/'mzd-tweaks/config-owners/drivedash.tsv').exists()
  call('drivedash','install');assert 'speedUnit=auto\n' in settings.read_text()
  installed_view=modules/'drivedash/assets/view.html';original_view=installed_view.read_bytes();installed_view.unlink();deep('drivedash','broken');installed_view.write_bytes(original_view)
  # Saved removal must remain self-contained when the USB assets are gone.
  shutil.rmtree(usb/'tweaks/drivedash/assets')
  call('drivedash','uninstall');absent();assert not settings.parent.exists() and startup.read_bytes()==original
  print('DRIVEDASH_PACKAGE_PASSED:',checks,'real actions; prerequisite refusal, mutable settings, Update, mixed consumers, preserve/reinstall, full cleanup and saved removal.')
  raise SystemExit(0)
 if '--tetris-only' in sys.argv:
  deep('tetris','uninstalled');call('tetris','install');deep('tetris','installed');original_hook=hook.read_bytes()
  assert 'menuPath:"Traffic Jam"' in registry.read_text()
  call('gui-hello-world','install');assert hook.read_bytes()==original_hook
  call('tetris','uninstall');assert hook.exists() and 'Traffic Jam' not in registry.read_text()
  call('gui-hello-world','uninstall');absent()
  call('gui-hello-world','install');call('tetris','install');call('gui-hello-world','uninstall');assert hook.exists()
  write(usb/'tweaks/tetris/assets/app.js','replacement USB game\n');call('tetris','uninstall');absent()
  print('TETRIS_PACKAGE_PASSED:',checks,'real checks; public package, mixed consumers, both removal orders and saved removal.')
  raise SystemExit(0)
 if '--hello-world-only' in sys.argv:
  deep('gui-hello-world','uninstalled');call('gui-hello-world','install');deep('gui-hello-world','installed')
  core=hook.read_bytes();call('second-example','install');assert hook.read_bytes()==core
  call('gui-hello-world','uninstall');assert hook.exists();assert 'gui-hello-world' not in registry.read_text()
  call('second-example','uninstall');absent()
  print('GUI_HELLO_WORLD_PASSED:',checks,'real checks; published example, shared support and last-consumer cleanup.')
  raise SystemExit(0)
 if '--critical-only' in sys.argv:
  call('gui-example','install');write(b/'fail-remove','1');write(b/'fail-rollback-runtime','1');result=call('gui-example','uninstall',2)
  assert 'Do NOT reboot' in result.stdout+result.stderr
  assert list(usb.glob('reports/gui-example/*/critical-error')),'Critical marker missing'
  assert list(usb.glob('reports/gui-example/*/gui-transaction.*/before/runtime/runtime.js')),'Recovery archive missing'
  (b/'fail-rollback-runtime').unlink()
  # Simulate an explicit verified recovery using the retained provider snapshot.
  if runtime.exists():shutil.rmtree(runtime)
  shutil.copytree(provider/'package/lib/gui-runtime',runtime)
  call('gui-example','uninstall');absent()
  print('GUI_CRITICAL_PASSED:',checks,'real actions; failed rollback reports severity 2, retains archives and supports verified recovery.')
  raise SystemExit(0)
 if '--interrupt-only' in sys.argv:
  write(b/'fail-signal','1');call('gui-example','install',2);absent();(b/'fail-signal').unlink()
  call('gui-example','uninstall');absent()
  print('GUI_INTERRUPT_PASSED:',checks,'real actions; caught TERM rolls back first publication and saved cleanup works.')
  raise SystemExit(0)
 if '--i18n-compat-only' in sys.argv:
  call('gui-example','install')
  for folder in [provider, persist/'mzd-tweaks/installed/gui-example']:
   api=folder/'package/lib/gui-runtime/api.conf';write(api,api.read_text().replace('i18n=2\n',''))
   inventory='provider.files' if folder==provider else 'package.files'
   subprocess.run([SHELL,'-c','. '+shlex.quote(bp(usb/'lib/packages.sh'))+'; mzd_package_inventory '+shlex.quote(bp(folder))+' > '+shlex.quote(bp(folder/inventory))],check=True)
  api=runtime/'api.conf';write(api,api.read_text().replace('i18n=2\n',''))
  result=call('tetris','install',1)
  assert 'predates translations' in result.stdout+result.stderr
  assert not (persist/'mzd-tweaks/installed/tetris').exists(),'failed capability check published a receipt'
  call('gui-example','uninstall');absent()
  print('GUI_I18N_COMPAT_PASSED:',checks,'real actions; old provider refused before staging.')
  raise SystemExit(0)
 if '--restore-only' in sys.argv:
  # An uninstalled service consumer must not invoke Lua, even with retained data.
  write(bins/'lua','#!/bin/sh\nprintf \"unexpected Lua during Restore\\n\" >&2\nexit 90\n')
  retained=persist/'mzd-tweaks/gui-data/wallpaper-manager'
  write(retained/'owner','MZD_GUI_DATA_V1\nwallpaper-manager\n');write(retained/'keep','user content\n')
  call('gui-example','install');call('second-example','install');call('restore-originals','run');absent()
  assert not list((persist/'mzd-tweaks/installed').glob('*')),'Restore retained GUI receipts'
  assert len(list(usb.glob('reports/restore-originals/run-*/reset-hooks/*/gui-transaction.*/before/module/manifest.conf')))==2,'Reset hook archives missing'
  assert (retained/'keep').read_text()=='user content\n'
  assert not (b/'startup').exists(),'uninstalled service consumer changed startup'
  print('GUI_RESTORE_PASSED:',checks,'real actions; two saved consumers, shared cleanup and receipt removal.')
  raise SystemExit(0)
 if '--status-only' in sys.argv:
  write(b/'gui.lock/pid','fixture\n')
  result=subprocess.run([SHELL,bp(usb/'tweaks/gui-example/run.sh'),'status'],env=dict(os.environ,MZD_WORKER_DIRECT='1'),capture_output=True,text=True,timeout=30)
  assert result.returncode==1 and not result.stdout and 'busy' in result.stderr
  shutil.rmtree(b/'gui.lock')
  write(version,'unsupported firmware\n');deep('gui-example','unavailable');write(version,'JCI_SW_VER="MAZ_CMU-150_74.00.324"\n')
  write(modules/'gui-example/foreign.txt','foreign data\n');deep('gui-example','unavailable');shutil.rmtree(modules)
  call('gui-example','install');deep('gui-example','installed');view=modules/'gui-example/assets/view.html';view.unlink();deep('gui-example','broken')
  call('gui-example','uninstall');absent()
  call('gui-example','install');shutil.rmtree(modules/'gui-example');deep('gui-example','broken');call('gui-example','uninstall');absent()
  print('GUI_STATUS_PASSED:',checks,'real checks; unknown data, registered partial state and read-only snapshots.')
  raise SystemExit(0)
 deep('gui-example','uninstalled')
 write(hook,'foreign developer hook\n');deep('gui-example','unavailable');call('gui-example','install',1);assert hook.read_text()=='foreign developer hook\n';hook.unlink()
 # Preflight refusal has no install receipt yet; first install creates all support.
 call('gui-example','install');deep('gui-example','installed');assert hook.exists() and runtime.exists() and provider.exists()
 core={p.relative_to(runtime):p.read_bytes() for p in runtime.rglob('*') if p.is_file()};hook_before=hook.read_bytes()
 call('second-example','install');deep('second-example','installed');assert core=={p.relative_to(runtime):p.read_bytes() for p in runtime.rglob('*') if p.is_file()};assert hook.read_bytes()==hook_before
 assert 'gui-example' in registry.read_text() and 'second-example' in registry.read_text() and '\\u003c/script>' in registry.read_text()
 call('gui-example','uninstall');assert hook.exists() and runtime.exists() and provider.exists();assert not (modules/'gui-example').exists();deep('second-example','installed')
 call('second-example','uninstall');absent()
 # Partial module status is a successful, read-only broken inspection.
 call('gui-example','install');view=modules/'gui-example/assets/view.html';saved_view=view.read_bytes();view.unlink();deep('gui-example','broken');view.write_bytes(saved_view)
 # A last-consumer deletion failure restores module, hook, registry and runtime.
 before={p.relative_to(base):p.read_bytes() for p in base.rglob('*') if p.is_file()}
 write(b/'fail-remove','1');call('gui-example','uninstall',1)
 assert before=={p.relative_to(base):p.read_bytes() for p in base.rglob('*') if p.is_file()},'Failed removal did not restore deployment'
 deep('gui-example','installed');call('gui-example','uninstall');absent()
 # All GUI consumers share one modification lock; a competing action cannot publish.
 write(b/'gui.lock/pid',str(os.getpid())+'\n');call('gui-example','install',1);absent();shutil.rmtree(b/'gui.lock')
 call('gui-example','uninstall');absent()
 # Consumer replacement retains shared support and keeps other registrations.
 call('gui-example','install');call('second-example','install')
 p=usb/'tweaks/gui-example/manifest.conf';write(p,p.read_text().replace('version=0.1.0','version=0.1.1'))
 call('gui-example','update');assert 'second-example' in registry.read_text();assert hook.read_bytes()==hook_before
 call('second-example','uninstall');call('gui-example','uninstall');absent()
 # A failed first consumer rolls newly created provider/hook back completely.
 write(b/'fail-hook','1');call('gui-example','install',1);absent();(b/'fail-hook').unlink()
 call('gui-example','uninstall');absent()
 # Changed deployment is never deleted; user can resolve it and retry saved removal.
 call('gui-example','install');saved=hook.read_bytes();write(hook,'foreign replacement\n');call('gui-example','uninstall',1);assert hook.read_text()=='foreign replacement\n'
 hook.write_bytes(saved);call('gui-example','uninstall');absent()
 # The real Restore command processes saved GUI reset hooks and shared cleanup.
 call('gui-example','install');call('second-example','install');call('restore-originals','run');absent()
 assert not list((persist/'mzd-tweaks/installed').glob('*')),'Restore retained GUI receipts'
 # New USB code cannot change saved removal or the shared provider snapshot.
 call('gui-example','install');write(usb/'lib/gui-runtime/runtime.js','new incompatible USB runtime\n');write(usb/'tweaks/gui-example/assets/view.html','replacement USB view\n')
 call('gui-example','uninstall');absent()
print('GUI_EXTENSIONS_PASSED:',checks,'real entrypoint checks; first/last lifecycle, mixed parents, reuse, saved removal and rollback.')
if len(sys.argv)==1:
 subprocess.run([sys.executable,str(Path(__file__).resolve()),'--helper-compat-only'],check=True)
