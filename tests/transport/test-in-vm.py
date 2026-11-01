"""Private offline test of original CMU Lua/modules inside the existing Linux appliance.
No vehicle connection, physical USB, original filesystem edits or private files in Git.
"""
from pathlib import Path
import argparse
import stat
import subprocess
import tempfile
import shutil
import sys

HERE=Path(__file__).resolve().parent
REPO=HERE.parents[1]
WORKSPACE=REPO.parent
CACHE=HERE/'.test-cache'
EMU=WORKSPACE/'mzd-cmu-emulator'

def main():
 parser=argparse.ArgumentParser()
 mode=parser.add_mutually_exclusive_group()
 mode.add_argument('--cluster',action='store_true',help='Install/remove the real cluster-language package using original CMU workers/tools on isolated targets')
 mode.add_argument('--shims',action='store_true',help='Exercise shim loader/ELF guards with original CMU tools')
 mode.add_argument('--settings',action='store_true',help='Run only settings validation with the original CMU shell/awk')
 mode.add_argument('--recovery',action='store_true',help='Reproduce pre-persistence List Beep recovery with original CMU tools')
 mode.add_argument('--probe',action='store_true')
 mode.add_argument('--packages',action='store_true',help='Run only persistent packages with the original CMU shell')
 mode.add_argument('--transport',action='store_true',help='Run HTTP/process checks without repeating the saved-package roundtrip')
 args=parser.parse_args()
 sys.path.insert(0,str(EMU));import appliance
 CACHE.mkdir(exist_ok=True)
 run=Path(tempfile.mkdtemp(prefix="run-",dir=CACHE))
 basefile=CACHE/'base.cpio.gz'
 if not basefile.exists():
  entries=appliance.tar_entries(EMU/'cache/minirootfs.tar.gz')
  entries.update(appliance.tar_entries(EMU/'cache/qemu-arm-10.0.0-r1.apk'))
  modules=appliance.cpio_entries((EMU/'cache/initramfs-virt').read_bytes())
  entries.update({n:v for n,v in modules.items() if n.startswith('lib/modules/')})
  private=appliance.tar_entries(WORKSPACE/'mcu_backup_20261021_203342/03_root_system.tar.gz')
  for n,v in private.items():
   if (n.startswith('lib/') and ('.so' in n or '/ld-' in n)) or n in ['usr/bin/lua','usr/bin/luac'] or n.startswith(('usr/share/lua/5.1/','usr/lib/lua/5.1/','usr/lib/liblua','usr/lib/libreadline','usr/lib/libhistory','usr/lib/libncurses','usr/lib/libtinfo')):
    entries['cmu/'+n]=v
  appliance.write_cpio(entries,basefile)
 overlay={}
 def add(name,data,mode=0o644):overlay[name]=(stat.S_IFREG|mode,data.encode() if isinstance(data,str) else data)
 for path in (REPO/'usb/lib/lua-bridge').glob('*.lua'):add('experiment/'+path.name,path.read_bytes())
 for path in [HERE/name for name in ["backend.lua", "demo.sh", "start-helper.sh", "package-test.sh", "recovery-test.sh", "settings-test.sh", "shim-test.sh", "cluster-test.sh"]]:
  if path.is_file():add('experiment/tests/'+path.name,path.read_bytes(),0o755 if path.suffix=='.sh' else 0o644)
 for name in ['VERSION','installer.sh','lib/defines.sh','lib/version.sh','lib/manifest.sh','lib/jobs.sh','lib/transport.sh','ui/transport.html']:
  target='experiment/transport.html' if name=='ui/transport.html' else 'experiment/package/'+name
  add(target,(REPO/'usb'/name).read_bytes(),0o755 if name.endswith('.sh') else 0o644)
 add('experiment/package/tweaks/demo/run.sh',(HERE/'demo.sh').read_bytes(),0o755)
 add('experiment/package/tweaks/demo/manifest.conf',"""contract_version=1
id=demo
name=Synthetic test
description=Read-only synthetic command
version=0.8.0
type=command
group=system
firmware=74.00.324
entrypoint=run.sh
actions=run status
status_scope=configuration
reboot_required=false
requires=
conflicts=
progress=true
""")
 import tarfile
 with tarfile.open(WORKSPACE/'mcu_backup_20261021_203342/03_root_system.tar.gz') as archive:
  add('cmu/bin/busybox',archive.extractfile('bin/busybox').read(),0o755)
 for path in (REPO/'development/examples/settings').rglob('*'):
  if path.is_file():add('experiment/package/tweaks/settings-example/'+path.relative_to(REPO/'development/examples/settings').as_posix(),path.read_bytes(),0o755 if path.suffix=='.sh' else 0o644)
 for path in (REPO/'development/examples/shim').rglob('*'):
  if path.is_file():add('experiment/package/tweaks/shim-example/'+path.relative_to(REPO/'development/examples/shim').as_posix(),path.read_bytes(),0o755 if path.suffix=='.sh' else 0o644)
 for path in (REPO/'development/examples/bundle').rglob('*'):
  if path.is_file():add('experiment/package/tweaks/bundle-example/'+path.relative_to(REPO/'development/examples/bundle').as_posix(),path.read_bytes(),0o755 if path.suffix=='.sh' else 0o644)
 for name in ['lib/export.sh','tweaks/backup-jci/run.sh','tweaks/backup-jci/manifest.conf']:
  add('experiment/package/'+name,(REPO/'usb'/name).read_bytes(),0o755 if name.endswith('.sh') else 0o644)
 for folder in ['lib','tweaks']:
  for path in (REPO/'usb'/folder).rglob('*'):
   if path.is_file():add('experiment/package/'+path.relative_to(REPO/'usb').as_posix(),path.read_bytes(),0o755 if path.suffix=='.sh' else 0o644)
 import re
 # Synthetic full-context fixture, with the original shell and patch applet.
 lines=[];active=False
 for line in (REPO/'usb/tweaks/list-loop/assets/change.patch').read_text().splitlines():
  if line.startswith('@@ '):
   at=int(re.match(r'@@ -(\d+)',line).group(1))
   while len(lines)<at-1:lines.append('// synthetic gap')
   active=True
  elif active and line[:1] in [' ','-']:lines.append(line[1:])
 add('jci/gui/common/controls/List2/js/List2Ctrl.js','\n'.join(lines)+'\n')
 if args.recovery:
  with tarfile.open(WORKSPACE/'mcu_backup_20261021_203342/02_jci_complete.tar.gz') as archive:
   add('experiment/original-list.js',archive.extractfile('jci/gui/common/controls/List2/js/List2Ctrl.js').read())
  add('experiment/fixed-recovery.sh',(REPO/'usb/lib/recovery.sh').read_bytes())
  add('experiment/baseline-recovery.sh',subprocess.check_output(['git','show','f88e9db:usb/lib/recovery.sh'],cwd=REPO))
  add('experiment/old-beep.patch',subprocess.check_output(['git','show','4682605^:usb/tweaks/list-beep/assets/change.patch'],cwd=REPO))
 if args.shims:
  with tarfile.open(WORKSPACE/'mcu_backup_20261021_203342/02_jci_complete.tar.gz') as a:
   for name in ['sm.conf','sm_WCP.conf']:add('experiment/oem-'+name,a.extractfile('jci/sm/'+name).read())
  header=bytearray(52);header[:7]=b'\x7fELF\x01\x01\x01';header[16:20]=b'\x03\x00\x28\x00';header[37]=2;header[39]=5
  add('experiment/fixture-arm.so',bytes(header))
 if args.cluster:
  import hashlib
  stock='<services>\n<service name="jciMMUI" path="/jci/mmui/example.so">\n<dependency value="other"/>\n</service>\n<service name="jciBLMSettings" path="/jci/settings/svcjciblmsettings.so">\n<dependency value="other"/>\n</service>\n</services>\n'
  with tarfile.open(WORKSPACE/'mcu_backup_20261021_203342/02_jci_complete.tar.gz') as a:
   configs={n:a.extractfile('jci/sm/'+n).read() for n in ['sm.conf','sm_WCP.conf']}
  digests={n:hashlib.md5(data).hexdigest() for n,data in configs.items()}
  replacements={'/tmp/mnt/data_persist':'/fixture/persist','/proc/mounts':'/fixture/mounts','/jci/version.ini':'/fixture/version','/sys/class/gpio/Watchdog\\ Disable/value':'/fixture/watchdog','/jci/sm/sm.conf':'/fixture/internal/sm.conf','/jci/sm/sm_WCP.conf':'/fixture/internal/sm_WCP.conf','74d9fc389b74fb01d0cfc2615a82c782':digests['sm.conf'],'030e918f5d6edcd62d196ee37b86fe99':digests['sm_WCP.conf'],'/jci/settings/svcjciblmsettings.so':'/fixture/internal/settings.so','/jci/lib/libjcivbssettingsclient.so':'/fixture/internal/client.so','44c28a25cfdf2e26777e497aa6a84f80':hashlib.md5(b'settings fixture\n').hexdigest(),'66dc19a8be330a8a50f919dc36f6245e':hashlib.md5(b'client fixture\n').hexdigest(),'MZD_SHIM_ROOT=/':'MZD_SHIM_ROOT=/fixture/internal'}
  for path in (REPO/'usb/lib').glob('*'):
   if not path.is_file():continue
   data=path.read_text()
   for old,new in replacements.items():data=data.replace(old,new)
   add('fixture/usb/lib/'+path.name,data,0o755 if path.suffix=='.sh' else 0o644)
  for path in (REPO/'usb/tweaks/cluster-language').rglob('*'):
   if not path.is_file():continue
   data=path.read_bytes()
   if path.suffix in ('.conf','.tsv','.sh'):
    data=data.decode()
    for old,new in replacements.items():data=data.replace(old,new)
   add('fixture/usb/tweaks/cluster-language/'+path.relative_to(REPO/'usb/tweaks/cluster-language').as_posix(),data,0o755 if path.suffix=='.sh' else 0o644)
  for name,data in configs.items():
   add('fixture/internal/'+name,data);add('fixture/original-'+name,data)
  add('fixture/internal/settings.so','settings fixture\n');add('fixture/internal/client.so','client fixture\n')
  add('fixture/version','JCI_SW_VER="MAZ_CMU-150_74.00.324"\n');add('fixture/watchdog','0\n')
  add('fixture/mounts','mock /fixture/internal relfs ro 0 0\nmock /fixture/persist relfs rw 0 0\nmock /fixture/usb vfat rw 0 0\n')
  add('fixture/bin/mount','#!/bin/sh\nexit 0\n',0o755)
  add('fixture/bin/dbus-send','#!/bin/sh\ncase "$*" in *byte:13*) printf "   byte 1\\n" ;; *byte:26*) printf "   byte 2\\n" ;; *) exit 1 ;; esac\n',0o755)
 applets=['patch','diff','awk']
 if args.shims or args.cluster:applets += ['od','dd']
 if args.cluster:applets += ['sh','cat','cp','cmp','chmod','md5sum','cut','mktemp','readlink','dirname','rm','grep','mkdir','mv','rmdir','sync','date','du','df','sort','tr','find']
 if args.recovery:
  applets += ['readlink','md5sum','cut','cmp','mktemp']
 for applet in applets:
  add('experiment/bin/'+applet,'#!/bin/sh\nexec /usr/bin/qemu-arm -L /cmu /cmu/lib/ld-linux.so.3 --library-path /cmu/lib:/cmu/usr/lib /cmu/bin/busybox '+applet+' "$@"\n',0o755)
 add('jci/version.ini','JCI_SW_VER="MAZ_CMU-150_74.00.324"\n')
 for path in (REPO/'usb/lib/lua-bridge').glob('*.lua'):add('experiment/package/lib/lua-bridge/'+path.name,path.read_bytes())
 add('experiment/package/ui/transport.html',(REPO/'usb/ui/transport.html').read_bytes())
 add('experiment/bin/lua','#!/bin/sh\nexec /usr/bin/qemu-arm -L /cmu /cmu/lib/ld-linux.so.3 --library-path /cmu/lib:/cmu/usr/lib /cmu/usr/bin/lua "$@"\n',0o755)
 add('probe.lua',"""print(_VERSION)
local p=require('posix');print(p.version)
local s=require('socket');print(s._VERSION)
for _,k in ipairs({'fork','exec','pipe','dup2','poll','read','write','wait','fcntl','F_SETFD','FD_CLOEXEC','SIGTERM','SIGPIPE'}) do print(k,type(p[k]),tostring(p[k])) end
local a,b=p.pipe();print('pipe',a,b);p.close(a);p.close(b)
local pid=p.fork()
if pid==0 then p.exec('/bin/sh','-c','echo child-started; exit 7');p._exit(99) end
print('wait',p.wait(pid))
""")
 add('init',"""#!/bin/sh
export CMU_TRANSPORT_ONLY="""+('1' if args.transport else '0')+"""
export PATH=/experiment/bin:/bin:/usr/bin:/sbin:/usr/sbin
mount -t proc proc /proc
mount -t devtmpfs devtmpfs /dev
ip link set lo up
export LUA_PATH='/experiment/?.lua;/cmu/usr/share/lua/5.1/?.lua;/cmu/usr/share/lua/5.1/?/init.lua'
export LUA_CPATH='/cmu/usr/lib/lua/5.1/?.so'
mkdir -p /tmp/lua-session /tmp/lua-logs
export INSTALLER_STATE=/tmp/lua-session
export INSTALLER_LOG=/tmp/lua-logs
lua() { /usr/bin/qemu-arm -L /cmu /cmu/lib/ld-linux.so.3 --library-path /cmu/lib:/cmu/usr/lib /cmu/usr/bin/lua "$@"; }
cmush() { /usr/bin/qemu-arm -L /cmu /cmu/lib/ld-linux.so.3 --library-path /cmu/lib:/cmu/usr/lib /cmu/bin/busybox sh "$@"; }
echo LUA_TEST_START
"""+('lua /probe.lua\n' if args.probe else 'cmush /experiment/tests/cluster-test.sh\n' if args.cluster else 'cmush /experiment/tests/shim-test.sh\n' if args.shims else 'cmush -x /experiment/tests/settings-test.sh\n' if args.settings else 'cmush /experiment/tests/recovery-test.sh\n' if args.recovery else 'cmush /experiment/tests/package-test.sh\n' if args.packages else 'cd /experiment\nlua /experiment/tests/backend.lua\n')+"""result=$?
echo "LUA_TEST_RESULT=$result"
sync
poweroff -f
""",0o755)
 appliance.write_cpio(overlay,run/'overlay.cpio.gz')
 (run/'test.cpio.gz').write_bytes(basefile.read_bytes()+(run/'overlay.cpio.gz').read_bytes())
 command=[str(EMU/'runtime/qemu/qemu-system-x86_64.exe'),'-machine','q35','-accel','tcg,thread=multi','-m','512','-smp','1','-display','none','-monitor','none','-no-reboot','-kernel',str(EMU/'cache/vmlinuz-virt'),'-initrd',str(run/'test.cpio.gz'),'-append','console=ttyS0 quiet noapic pci=nomsi panic=-1 rdinit=/init','-serial','file:'+str(run/'test.log'),'-nic','none']
 # The host emulates an x86 VM which itself emulates ARM. This overall budget
 # is independent of the production worker deadlines asserted by backend.lua.
 result=subprocess.run(command,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=1800 if args.cluster else 600,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
 log=(run/'test.log').read_text(errors='replace');shutil.copyfile(run/'test.log',CACHE/'test.log');print(log[-12000:])
 assert result.returncode==0 and 'LUA_TEST_RESULT=0' in log,(result.returncode,result.stdout)
if __name__=='__main__':main()
