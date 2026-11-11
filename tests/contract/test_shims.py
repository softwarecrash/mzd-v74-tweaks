"""Generic loader and saved shim lifecycle on synthetic files; no CMU execution."""
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
    p.write_text(s,encoding='utf-8',newline='\n');p.chmod(0o755)

def md5(b):return hashlib.md5(b).hexdigest()

checks=0
with tempfile.TemporaryDirectory(prefix='cmu-shims-') as temporary:
    base=Path(temporary);usb=base/'usb';internal=base/'internal';persist=base/'persist'
    bins=base/'bin';mounts=base/'mounts';version=base/'version';gpio=base/'watchdog';lock=base/'packages.lock'
    for d in [usb,internal,persist,bins,base/'locks']:d.mkdir()
    store=persist/'mzd-tweaks/installed'
    config=internal/'sm.conf';second=internal/'sm_WCP.conf'
    stock='<services>\n    <service name="jciMMUI" path="/jci/mmui/example.so">\n        <dependency value="other"/>\n    </service>\n</services>\n'
    shutil.copytree(ROOT/'usb/lib',usb/'lib')
    write(usb/'installer.sh',(ROOT/'usb/installer.sh').read_text().replace('#!/bin/sh\n','#!/bin/sh\nPATH='+shlex.quote(bp(bins)+':/usr/bin:/bin')+'\nexport PATH\n',1))
    for p in (usb/'lib').glob('*.sh'):
        s=p.read_text().replace('/tmp/mnt/data_persist',bp(persist)).replace('/proc/mounts',bp(mounts)).replace('/jci/version.ini',bp(version))
        s=s.replace('MZD_SHIM_ROOT=/','MZD_SHIM_ROOT='+shlex.quote(bp(internal)))
        s=s.replace('/tmp/mzd-packages.lock',bp(lock))
        s=s.replace('/sys/class/gpio/Watchdog\\ Disable/value',shlex.quote(bp(gpio)))
        s=s.replace('LOCK="/tmp/mzd-$LOCK_GROUP-tweak.lock"','LOCK="'+bp(base/'locks')+'/$LOCK_GROUP.lock"')
        write(p,s)
    write(version,'JCI_SW_VER="MAZ_CMU-150_74.00.324"\n');write(gpio,'0\n')
    write(mounts,f'/dev/root {bp(internal)} relfs ro 0 0\n/dev/data {bp(persist)} relfs rw 0 0\n/dev/usb {bp(usb)} vfat rw 0 0\n')
    write(bins/'sync','#!/bin/sh\nexit 0\n')
    write(bins/'df','#!/bin/sh\nprintf "Filesystem 1024-blocks Used Available Capacity Mounted\\nfixture 1000000 1 900000 1%% internal\\n"\n')
    write(bins/'mount','#!/bin/sh\nexit 0\n')
    write(config,stock);write(second,stock)
    env=dict(os.environ,PATH=bp(bins)+':/usr/bin:/bin')
    # Header-only fixtures exercise placement and rollback, not a real ELF loader.
    elf=bytearray(52);elf[:7]=b'\x7fELF\x01\x01\x01';elf[16:20]=b'\x03\x00\x28\x00';elf[37]=2;elf[39]=5

    def make(id_):
        folder=usb/'tweaks'/id_
        shutil.copytree(ROOT/'development/examples/shim',folder)
        m=(folder/'manifest.conf').read_text()
        dest=bp(persist)+'/mzd-tweaks/shims/'+id_+'/shim.so'
        for key,value in {'id':id_,'target':bp(config),'oem_backup_md5':md5(stock.encode()),'shim_path':dest,'shim_extra_targets':bp(second)+':'+md5(stock.encode())}.items():
            m=re.sub('^'+key+'=.*$',key+'='+value,m,flags=re.M)
        write(folder/'manifest.conf',m)
        (folder/'assets').mkdir(exist_ok=True)
        (folder/'assets/shim-example.so').write_bytes(bytes(elf)+id_.encode())
        return folder

    def call(args,code=0):
        global checks
        command='exec /bin/sh '+' '.join(shlex.quote(a) for a in [bp(usb/'installer.sh'),*args])
        r=subprocess.run([SHELL,'-c',command],env=env,capture_output=True,text=True,timeout=60)
        assert r.returncode==code,(args,r.returncode,r.stdout,r.stderr)
        checks+=1;return r

    alpha=make('shim-alpha');beta=make('shim-beta')
    payload=persist/'mzd-tweaks/shims/shim-alpha/shim.so'
    call(['action','shim-alpha','install'])
    assert payload.read_bytes()==(alpha/'assets/shim-example.so').read_bytes()
    assert 'shim-alpha/shim.so' in config.read_text() and 'shim-alpha/shim.so' in second.read_text()
    assert config.with_name(config.name+'.org').read_text()==stock
    first=config.read_text()
    incoming=base/'incoming-paths';write(incoming,'patch\t'+bp(payload)+'\n')
    guard=base/'guard.sh';write(guard,'. '+shlex.quote(bp(usb/'lib/manifest.sh'))+'\n. '+shlex.quote(bp(usb/'lib/packages.sh'))+'\nmzd_package_install_paths "$1"\n')
    r=subprocess.run([SHELL,bp(guard),bp(incoming)],env=env,capture_output=True,text=True,timeout=30)
    assert r.returncode==1 and payload.exists();checks+=1
    call(['action','shim-beta','install'])
    assert 'shim-alpha/shim.so' in config.read_text() and 'shim-beta/shim.so' in config.read_text()
    call(['action','shim-alpha','status']);call(['action','shim-alpha','uninstall'])
    assert 'shim-alpha/shim.so' not in config.read_text() and 'shim-beta/shim.so' in config.read_text()
    assert not payload.exists()
    # New USB code/asset must not replace the saved code used to remove Beta.
    (beta/'assets/shim-example.so').write_bytes(b'not-the-old-shim')
    call(['action','shim-beta','uninstall'])
    assert config.read_text()==stock and second.read_text()==stock
    assert not config.with_name(config.name+'.org').exists()
    assert not second.with_name(second.name+'.org').exists()
    assert gpio.read_text()=='0\n'
    print('SHIM_LIFECYCLE_PASSED:',checks,'real controller operations, two shared-config shims, saved removal and OEM backups.')

    # A failed second loader write rolls the first one back and removes our payload.
    write(bins/'mv', '#!/bin/sh\nfor value do case "$value" in '+shlex.quote(bp(second))+'.mzd-restore-*) exit 1 ;; esac; done\nexec /usr/bin/mv "$@"\n')
    call(['action','shim-alpha','install'],1)
    assert config.read_text()==stock and second.read_text()==stock and not payload.exists()
    assert not list(internal.glob('*.mzd-restore-*'))
    assert gpio.read_text()=='0\n' and not lock.exists()
    (bins/'mv').unlink()
    call(['action','shim-alpha','uninstall'])
    # Wrong OEM snapshots and unsupported library headers are refused before writes.
    backup=config.with_name(config.name+'.org');assert not backup.exists();backup.write_bytes(b'foreign backup')
    call(['action','shim-alpha','install'],1);assert config.read_text()==stock and not payload.exists()
    backup.unlink()
    asset=alpha/'assets/shim-example.so';original_asset=asset.read_bytes();asset.write_bytes(b'not ARM')
    call(['action','shim-alpha','install'],1);assert config.read_text()==stock and not payload.exists()
    asset.write_bytes(original_asset)
    # Reset cannot remove unknown payloads, or unlink a library still referenced.
    call(['action','shim-alpha','install'])
    entry=store/'shim-alpha';hook=entry/'package/tweaks/shim-alpha/reset.sh'
    r=subprocess.run([SHELL,bp(hook),'check'],env=env,capture_output=True,text=True,timeout=30)
    assert r.returncode==0,r.stderr;checks+=1
    saved_payload=payload.read_bytes();payload.write_bytes(b'foreign payload')
    r=subprocess.run([SHELL,bp(hook),'check'],env=env,capture_output=True,text=True,timeout=30)
    assert r.returncode==1 and payload.read_bytes()==b'foreign payload';checks+=1
    payload.write_bytes(saved_payload)
    # Exercise prepare/finish through the shared export context; System Restore
    # owns publication of verified original configs between the hook phases.
    report=base/'reset-report';reset=report/'reset-hooks';system=report/'system'
    reset.mkdir(parents=True);system.mkdir();write(system/'mounts','');write(system/'locks','')
    reset_env=dict(env,ACTION='run',MZD_REPORT=bp(report),MZD_RESET_DIR=bp(reset),MZD_SYSTEM=bp(system))
    r=subprocess.run([SHELL,bp(hook),'prepare'],env=reset_env,capture_output=True,text=True,timeout=30)
    assert r.returncode==0 and (reset/'shim.so').read_bytes()==saved_payload;checks+=1
    r=subprocess.run([SHELL,'-e',bp(hook),'finish'],env=reset_env,capture_output=True,text=True,timeout=30)
    assert r.returncode==1 and payload.exists();checks+=1
    write(config,stock);write(second,stock)
    r=subprocess.run([SHELL,'-e',bp(hook),'finish'],env=reset_env,capture_output=True,text=True,timeout=30)
    assert r.returncode==0 and not payload.exists();checks+=1
    call(['action','shim-alpha','uninstall'])

    # Native compatibility guards block a new install, but do not strand a saved
    # uninstaller after an unrelated native module has changed.
    native=internal/'native.so';write(native,'OEM native module\n')
    metadata=alpha/'manifest.conf'
    write(metadata,metadata.read_text().replace('shim_checks=','shim_checks='+bp(native)+':'+md5(native.read_bytes())))
    call(['action','shim-alpha','install'])
    write(native,'changed native module\n')
    write(metadata,re.sub('^version=.*$','version=0.2.0',metadata.read_text(),flags=re.M))
    call(['action','shim-alpha','install'],1)
    assert payload.exists() and 'state=installed' in (store/'shim-alpha/state.conf').read_text()
    call(['action','shim-alpha','uninstall'])
    call(['action','shim-alpha','install'],1)
    assert not payload.exists() and config.read_text()==stock

    # System Restore catalogs every declared loader file, not only target=.
    catalog=base/'catalog';catalog.mkdir();write(catalog/'manifests',bp(alpha/'manifest.conf')+'\n')
    catalog_driver=base/'catalog.sh'
    write(catalog_driver,'. '+shlex.quote(bp(usb/'lib/manifest.sh'))+'\n. '+shlex.quote(bp(usb/'lib/restore.sh'))+'\nMZD_REPORT='+shlex.quote(bp(catalog))+'\nRESTORE_FIRMWARE=74.00.324\nmzd_restore_catalog\n')
    r=subprocess.run([SHELL,bp(catalog_driver)],env=env,capture_output=True,text=True,timeout=30)
    assert r.returncode==0 and bp(config) in r.stdout and bp(second) in r.stdout,(r.stdout,r.stderr)
    checks+=1

    # Exact transform inverses, including pre-existing foreign preloads/colon lists.
    runner=base/'transform.sh'
    write(runner,'. '+shlex.quote(bp(usb/'lib/shim.sh'))+'\nROOT='+shlex.quote(bp(usb))+'\nSHIM_SERVICE=jciMMUI\nSHIM_PATH=/tmp/owned.so\nmzd_shim_transform "$1" "$2"\n')
    variants=[stock.replace('<services>', '<services>\n<service name="external" external="True"/>\n<!-- <service name="commented">\n<service name="jciMMUI">\n</service> -->'),stock,stock+'\n',stock.replace('        <dependency','        <environ_var env_name="LD_PRELOAD" env_value="/other/a.so:/other/b.so"/>\n        <dependency'),stock.replace('        <dependency','        <environ_var env_name="LD_PRELOAD" env_value=""/>\n        <dependency')]
    for text in variants:
        inp=base/'before';after=base/'after';write(inp,text)
        r=subprocess.run([SHELL,bp(runner),bp(inp),'install'],env=env,capture_output=True,timeout=20)
        assert r.returncode==0,r.stderr
        after.write_bytes(r.stdout)
        r=subprocess.run([SHELL,bp(runner),bp(after),'uninstall'],env=env,capture_output=True,timeout=20)
        assert r.returncode==0 and r.stdout==text.encode(),(text,r.stdout,r.stderr)
        checks+=1
    # Ambiguous/unsupported XML is rejected without emitting modified data.
    for text in [stock.replace('name="jciMMUI"','display_name="jciMMUI"'), stock.replace('</services>',stock+'</services>'), stock.replace('name="jciMMUI"','name="jciMMUI" name="other"')]:
        inp=base/'ambiguous';write(inp,text)
        r=subprocess.run([SHELL,bp(runner),bp(inp),'install'],env=env,capture_output=True,timeout=20)
        assert r.returncode==1 and b'Shim:' in r.stderr and not r.stdout,(r.stdout,r.stderr)
        checks+=1
    print('SHIM_TRANSFORMS_PASSED:',checks,'checks including exact preservation of unrelated preload tokens and trailing newlines.')
