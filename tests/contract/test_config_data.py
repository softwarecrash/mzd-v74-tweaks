"""Mutable config helper on private paths, without mounts or native workers."""
from pathlib import Path
import os,re,shutil,subprocess,tempfile,shlex
ROOT=Path(__file__).resolve().parents[2]
SHELL='C:/Program Files/Git/bin/bash.exe' if os.name=='nt' else '/bin/sh'
def bp(p):
 s=Path(p).resolve().as_posix();return '/'+s[0].lower()+s[2:] if len(s)>1 and s[1]==':' else s
def write(p,s):p.parent.mkdir(parents=True,exist_ok=True);p.write_text(s,encoding='utf-8',newline='\n')
with tempfile.TemporaryDirectory(prefix='cmu-config-data-') as temporary:
 b=Path(temporary);usb=b/'usb';persist=b/'persist';persist.mkdir();shutil.copytree(ROOT/'usb/lib',usb/'lib')
 folder=usb/'tweaks/demo';manifest=(ROOT/'development/examples/patch/manifest.conf').read_text()
 manifest=re.sub('^id=.*$','id=demo',manifest,flags=re.M)
 write(folder/'manifest.conf',manifest)
 one=persist/'preferences.conf';directory=persist/'mzd-tweaks/data/demo'
 table='config.prefs.path='+bp(one)+'\nconfig.prefs.source=assets/prefs.conf\nconfig.state.path='+bp(directory)+'/\nconfig.state.source=assets/defaults\n'
 write(folder/'manifest.conf',manifest+table);write(folder/'assets/prefs.conf','key=default\n');write(folder/'assets/defaults/nested/value.conf','value=default\n')
 prefix='. '+shlex.quote(bp(usb/'lib/manifest.sh'))+'; . '+shlex.quote(bp(usb/'lib/config-data.sh'))+'; MZD_PACKAGE_MOUNT='+shlex.quote(bp(persist))+'; '
 checks=0
 def call(action,code=0):
  global checks
  r=subprocess.run([SHELL,'-c',prefix+'mzd_config_'+action+' '+shlex.quote(bp(folder))],capture_output=True,text=True,timeout=20)
  assert r.returncode==code,(action,r.returncode,r.stdout,r.stderr);checks+=1;return r
 call('seed');assert one.read_text()=='key=default\n' and (directory/'nested/value.conf').exists()
 write(one,'key=changed\n');write(directory/'created-at-runtime','user data')
 write(folder/'assets/defaults/added.conf','new=default\n');call('seed');assert one.read_text()=='key=changed\n' and (directory/'added.conf').exists()
 (directory/'nested/value.conf').unlink();call('preflight');call('seed');assert (directory/'nested/value.conf').exists()
 # Explicitly owned folders include runtime-created files on full removal.
 call('remove');assert not one.exists() and not directory.exists()
 # Other tweaks cannot claim retained paths.
 call('seed');owner=persist/'mzd-tweaks/config-owners/demo.tsv';write(owner.with_name('other.tsv'),owner.read_text());call('preflight',1);owner.with_name('other.tsv').unlink()
 # Never follow user-created symlinks or hard links during deletion.
 linked=directory/'link';linked.symlink_to(b,target_is_directory=True);call('remove',1);assert one.exists();linked.unlink()
 # Invalid/overlapping declarations are refused before mutation.
 for bad in [table+'config.unknown.type=file\n',table.replace(bp(one),bp(persist)+'/../escape'),table+'config.prefs.type=invalid\n']:
  write(folder/'manifest.conf',manifest+bad);call('preflight',1)
 # A directory typo cannot claim the storage root, shared logs or other apps.
 for target in [persist,persist/'log',persist/'mzd-tweaks/data',persist/'mzd-tweaks/data/other',persist/'mzd-tweaks/data/demo-other']:
  write(folder/'manifest.conf',manifest+'config.bad.path='+bp(target)+'/\n')
  call('remove',1);assert one.exists() and (directory/'nested/value.conf').exists()
 write(folder/'manifest.conf',manifest+table);call('remove')
 print('CONFIG_DATA_PASSED:',checks,'checks; file/directory defaults, preservation, runtime files, missing config, retained ownership, links and invalid paths.')
