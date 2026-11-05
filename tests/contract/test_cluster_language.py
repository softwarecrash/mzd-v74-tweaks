"""Cluster-language real package on synthetic CMU files; the shim is not executed (see shim/run.sh)."""
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
# The GUI list and the shim must offer the same languages, in the agreed order:
# off, English variants, then alphabetical.
source=(ROOT/'src/mazda/patches/libpatch-svcjciblmsettings/cluster_language.c').read_text()
table=re.findall(r'\{"([a-z-]+)", (\d+)\},',source)
codes=[int(code) for name,code in table]
assert len(set(codes))==len(codes) and all(1<=code<=255 for code in codes)
assert len(table)==26
manifest=(ROOT/'usb/tweaks/cluster-language/manifest.conf').read_text()
options=re.search(r'^setting\.hud_display_language\.options=(.*)$',manifest,re.M).group(1).split(' ')
assert options==['off']+[name for name,code in table]
assert options[1:4]==['en-uk','en-us','en-au'] and options[4:]==sorted(options[4:]) and len(options)<=64
with tempfile.TemporaryDirectory(prefix='cmu-cluster-') as temporary:
    base=Path(temporary);usb=base/'usb';internal=base/'internal';persist=base/'persist'
    bins=base/'bin';mounts=base/'mounts';version=base/'version';gpio=base/'watchdog';lock=base/'packages.lock'
    for d in [usb,internal,persist,bins,base/'locks']:d.mkdir()
    store=persist/'mzd-tweaks/installed'
    config=internal/'sm.conf';second=internal/'sm_WCP.conf'
    stock='<services>\n    <service name="jciMMUI" path="/jci/mmui/example.so">\n        <dependency value="other"/>\n    </service>\n</services>\n'
    stock=stock.replace('</services>', '<service name="jciBLMSettings" path="/jci/settings/example.so">\n<dependency value="other"/>\n</service>\n</services>')
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
    # The minimal CI image omits patch/diff; use the mounted full BusyBox,
    # just like the other worker fixtures, without replacing mutation guards.
    if os.environ.get('CMU_TEST_BUSYBOX'):
        busybox=shutil.which('busybox')
        assert busybox, 'BusyBox requested but missing.'
        for name in ['awk','patch','diff','cp','cmp','md5sum','cut','readlink','dirname',
                     'mktemp','mkdir','rm','cat','grep','od','dd']:
            os.symlink(busybox,bins/name)
    write(bins/'sync','#!/bin/sh\nexit 0\n')
    write(bins/'df','#!/bin/sh\nprintf "Filesystem 1024-blocks Used Available Capacity Mounted\\nfixture 1000000 1 900000 1%% internal\\n"\n')
    write(bins/'mount','#!/bin/sh\nexit 0\n')
    write(config,stock);write(second,stock)
    env=dict(os.environ,PATH=bp(bins)+':/usr/bin:/bin')
    # Header-only fixtures exercise placement and rollback, not a real ELF loader.
    elf=bytearray(52);elf[:7]=b'\x7fELF\x01\x01\x01';elf[16:20]=b'\x03\x00\x28\x00';elf[37]=2;elf[39]=5

    folder=usb/'tweaks/cluster-language'
    shutil.copytree(ROOT/'usb/tweaks/cluster-language',folder)
    payload_dir=persist/'mzd-tweaks/shims/cluster-language'
    module=internal/'svcjciblmsettings.so';client=internal/'libjcivbssettingsclient.so'
    write(module,'synthetic settings module\n');write(client,'synthetic VBS client\n')
    m=(folder/'manifest.conf').read_text().replace('/jci/sm/sm.conf',bp(config)).replace('74d9fc389b74fb01d0cfc2615a82c782',md5(stock.encode()))
    write(folder/'manifest.conf',m)
    table=(folder/'components.tsv').read_text()
    for old,new in {'/jci/sm/sm.conf':bp(config),'/jci/sm/sm_WCP.conf':bp(second),'74d9fc389b74fb01d0cfc2615a82c782':md5(stock.encode()),'030e918f5d6edcd62d196ee37b86fe99':md5(stock.encode()),'/tmp/mnt/data_persist':bp(persist),'/jci/settings/svcjciblmsettings.so':bp(module),'/jci/lib/libjcivbssettingsclient.so':bp(client),'44c28a25cfdf2e26777e497aa6a84f80':md5(module.read_bytes()),'66dc19a8be330a8a50f919dc36f6245e':md5(client.read_bytes())}.items():table=table.replace(old,new)
    write(folder/'components.tsv',table)
    write(bins/'dbus-send', '#!/bin/sh\ncase "${TEST_HUD:-whud}:$*" in none:*byte:13*) printf "   byte 0\\n" ;; unknown:*) exit 1 ;; *byte:13*) printf "   byte 1\\n" ;; *byte:26*) printf "   byte 2\\n" ;; *) exit 1 ;; esac\n')
    def call(args,code=0):
        global checks
        command='exec /bin/sh '+' '.join(shlex.quote(a) for a in [bp(usb/'installer.sh'),*args])
        r=subprocess.run([SHELL,'-c',command],env=env,capture_output=True,text=True,timeout=150)
        assert r.returncode==code,(args,r.returncode,r.stdout,r.stderr)
        checks+=1;return r
    def deep(worker, settings, state):
        global checks
        cfg=dict(env,MZD_WORKER_DIRECT='1',MZD_SETTINGS_FILE=bp(settings))
        before={p.relative_to(usb).as_posix():hashlib.md5(p.read_bytes()).hexdigest() for p in usb.rglob('*') if p.is_file()}
        r=subprocess.run([SHELL,'-c','exec /bin/sh '+shlex.quote(bp(worker))+' status'],env=cfg,capture_output=True,text=True,timeout=90)
        assert r.returncode==0 and r.stdout==state+'\n',(r.returncode,r.stdout,r.stderr)
        assert before=={p.relative_to(usb).as_posix():hashlib.md5(p.read_bytes()).hexdigest() for p in usb.rglob('*') if p.is_file()},'Status wrote to USB'
        checks+=1;return r
    settings=base/'settings.conf';write(settings,'hud_display_language=en-uk\nhud_display_code=0\n')
    deep(folder/'run.sh',settings,'uninstalled')
    config.unlink();r=deep(folder/'run.sh',settings,'unavailable');assert 'Missing target' in r.stderr;write(config,stock)
    call(['manifest','cluster-language'])
    r=call(['preflight-info','cluster-language']);assert not r.stdout
    env['TEST_HUD']='none';r=call(['preflight-info','cluster-language']);assert 'warning' in r.stdout
    env['TEST_HUD']='unknown';r=call(['preflight-info','cluster-language']);assert 'could not be read' in r.stdout
    env['TEST_HUD']='whud'
    # AA Mod already owning this hook must not be loaded a second time.
    foreign=stock.replace('<dependency value="other"/>','<environ_var env_name="LD_PRELOAD" env_value="/data_persist/oem-aa-mod/libpatch-svcjciblmsettings.so"/>',1)
    write(config,foreign);r=call(['preflight-info','cluster-language'],1);assert 'already referenced' in r.stdout
    call(['action','cluster-language','install'],1);assert config.read_text()==foreign and not payload_dir.exists()
    write(config,stock)
    original_module=module.read_bytes();module.write_bytes(b'unsupported native module')
    call(['action','cluster-language','install'],1);assert config.read_text()==stock and not payload_dir.exists();module.write_bytes(original_module)
    # Complete public controller, defaults from the real manifest.
    call(['action','cluster-language','install'])
    assert (payload_dir/'libpatch.conf').read_text()=='hud_display_language = off\nhud_display_code = 0\n'
    library=payload_dir/'libpatch-svcjciblmsettings.so'
    assert library.read_bytes()==(folder/'assets/libpatch-svcjciblmsettings.so').read_bytes()
    for path in [config,second]:
        text=path.read_text();block=text.split('<service name="jciBLMSettings"')[1].split('</service>')[0]
        assert 'libpatch-svcjciblmsettings.so' in block
        assert 'libpatch-svcjciblmsettings.so' not in text.split('<service name="jciMMUI"')[1].split('</service>')[0]
    call(['action','cluster-language','status'])
    saved=store/'cluster-language/package'
    deep(saved/'tweaks/cluster-language/run.sh',saved/'settings.conf','installed')
    original_library=library.read_bytes();library.write_bytes(b'corrupted payload')
    r=deep(saved/'tweaks/cluster-language/run.sh',saved/'settings.conf','broken');assert 'payload differs' in r.stderr
    library.write_bytes(original_library)
    # A changed native module / unavailable HUD must not prevent saved removal.
    module.write_bytes(b'changed after install');env['TEST_HUD']='unknown'
    (folder/'assets/libpatch-svcjciblmsettings.so').write_bytes(b'new invalid USB version')
    call(['action','cluster-language','uninstall'])
    assert config.read_text()==stock and second.read_text()==stock and not payload_dir.exists()
    # USB user settings reach the generated file, the only way to set a manual code.
    (folder/'assets/libpatch-svcjciblmsettings.so').write_bytes(original_library)
    module.write_bytes(original_module);env['TEST_HUD']='whud'
    write(usb/'user/cluster-language/settings.conf','hud_display_language=hu\nhud_display_code=200\n')
    call(['action','cluster-language','install'])
    assert (payload_dir/'libpatch.conf').read_text()=='hud_display_language = hu\nhud_display_code = 200\n'
    deep(saved/'tweaks/cluster-language/run.sh',saved/'settings.conf','installed')
    call(['action','cluster-language','uninstall'])
    assert config.read_text()==stock and second.read_text()==stock and not payload_dir.exists()
    assert not lock.exists() and gpio.read_text()=='0\n'
    print('CLUSTER_LANGUAGE_PASSED:',checks,'real package checks; defaults, hardware warnings, foreign hook/native-module refusal, exact saved uninstall and unrelated service preservation.')
