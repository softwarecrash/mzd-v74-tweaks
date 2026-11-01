"""Fuel Consumption Ending Screen real package on synthetic CMU files; the shim is not executed."""
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
ID='fuel-consumption-ending'

def bp(p):
    s=Path(p).resolve().as_posix()
    return '/'+s[0].lower()+s[2:] if len(s)>1 and s[1]==':' else s

def write(p,s):
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(s,encoding='utf-8',newline='\n');p.chmod(0o755)

def md5(b):return hashlib.md5(b).hexdigest()

def fixture(patch, installed=False):
    # Reconstruct only the checked-in hunk contexts, with unique harmless gaps.
    lines=[];position=0
    for line in patch.splitlines(keepends=True):
        if line.startswith('@@ '):
            match=re.match(r'@@ -(\d+)',line)
            while len(lines)<int(match.group(1))-1:
                lines.append('// contract fixture gap %d\n'%len(lines))
            position+=1
        elif position and line[:1] in [' ','+','-']:
            if line[:1]==' ' or line[:1]==('+' if installed else '-'):
                lines.append(line[1:])
    return ''.join(lines)

shim_asset=ROOT/'usb/tweaks'/ID/'assets/fuel_ending_mmui.so'
assert shim_asset.read_bytes()[:4]==b'\x7fELF','The shim asset must be the built ARM library.'
checks=0
with tempfile.TemporaryDirectory(prefix='cmu-fuel-ending-') as temporary:
    base=Path(temporary);usb=base/'usb';internal=base/'internal';persist=base/'persist'
    bins=base/'bin';mounts=base/'mounts';version=base/'version';gpio=base/'watchdog';lock=base/'packages.lock'
    for d in [usb,internal,persist,bins,base/'locks']:d.mkdir()
    store=persist/'mzd-tweaks/installed'
    config=internal/'sm.conf';second=internal/'sm_WCP.conf'
    stock='<services>\n    <service name="jciMMUI" path="/jci/mmui/example.so">\n        <dependency value="other"/>\n    </service>\n'
    stock+='<service name="jciBLMSettings" path="/jci/settings/example.so">\n<dependency value="other"/>\n</service>\n</services>\n'
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
    if os.environ.get('CMU_TEST_BUSYBOX'):
        busybox=shutil.which('busybox')
        assert busybox,'BusyBox requested but missing.'
        for name in ['awk','patch','diff','cp','cmp','md5sum','cut','readlink','dirname',
                     'mktemp','mkdir','rm','cat','grep','od','dd']:
            os.symlink(busybox,bins/name)
    write(bins/'sync','#!/bin/sh\nexit 0\n')
    write(bins/'df','#!/bin/sh\nprintf "Filesystem 1024-blocks Used Available Capacity Mounted\\nfixture 1000000 1 900000 1%% internal\\n"\n')
    write(bins/'mount','#!/bin/sh\nexit 0\n')
    write(config,stock);write(second,stock)
    env=dict(os.environ,PATH=bp(bins)+':/usr/bin:/bin')

    folder=usb/'tweaks'/ID
    shutil.copytree(ROOT/'usb/tweaks'/ID,folder)
    payload_dir=persist/'mzd-tweaks/shims'/ID
    patch=(folder/'assets/change.patch').read_text()
    app=internal/'ecoenergyApp.js';app_stock=fixture(patch);write(app,app_stock)
    # Expected result: the shipped diff applied by the same patch command.
    expected=base/'expected';expected.mkdir();write(expected/'target.data',app_stock)
    r=subprocess.run([SHELL,'-c','cd "$1" && patch -p0 -i "$2" < /dev/null','--',bp(expected),bp(folder/'assets/change.patch')],env=env,capture_output=True,text=True,timeout=15)
    assert r.returncode==0,(r.stdout,r.stderr)
    app_mod=(expected/'target.data').read_text()
    assert 'EndingEffectiveness -> EndingFuelConsumption' in app_mod and '7000); // MOD' in app_mod and '5000);' not in app_mod
    eco=internal/'libjciuiaecoenergy.so';mmui=internal/'svcjcimmui.so'
    write(eco,'synthetic ecoenergy UIA\n');write(mmui,'synthetic MMUI service\n')
    m=(folder/'manifest.conf').read_text().replace('/jci/sm/sm.conf',bp(config)).replace('74d9fc389b74fb01d0cfc2615a82c782',md5(stock.encode()))
    write(folder/'manifest.conf',m)
    table=(folder/'components.tsv').read_text()
    for old,new in {'/jci/sm/sm.conf':bp(config),'/jci/sm/sm_WCP.conf':bp(second),'74d9fc389b74fb01d0cfc2615a82c782':md5(stock.encode()),'030e918f5d6edcd62d196ee37b86fe99':md5(stock.encode()),'/tmp/mnt/data_persist':bp(persist),
                    '/jci/gui/apps/ecoenergy/js/ecoenergyApp.js':bp(app),'32f3607cbbbb0532f28bb726882e990b':md5(app_stock.encode()),
                    '/jci/mmui/uia/libjciuiaecoenergy.so':bp(eco),'ac44a5f1bbcbe32d83d4076e6e6f4562':md5(eco.read_bytes()),
                    '/jci/mmui/svcjcimmui.so':bp(mmui),'3b63fa37aa2ae4989c1febaa18c1f292':md5(mmui.read_bytes())}.items():
        assert old in table,old;table=table.replace(old,new)
    write(folder/'components.tsv',table)
    def call(args,code=0):
        global checks
        command='exec /bin/sh '+' '.join(shlex.quote(a) for a in [bp(usb/'installer.sh'),*args])
        r=subprocess.run([SHELL,'-c',command],env=env,capture_output=True,text=True,timeout=150)
        assert r.returncode==code,(args,r.returncode,r.stdout,r.stderr)
        checks+=1;return r
    def deep(worker,settings,state):
        global checks
        cfg=dict(env,MZD_WORKER_DIRECT='1',MZD_SETTINGS_FILE=bp(settings))
        before={p.relative_to(usb).as_posix():md5(p.read_bytes()) for p in usb.rglob('*') if p.is_file()}
        r=subprocess.run([SHELL,'-c','exec /bin/sh '+shlex.quote(bp(worker))+' status'],env=cfg,capture_output=True,text=True,timeout=90)
        assert r.returncode==0 and r.stdout==state+'\n',(r.returncode,r.stdout,r.stderr)
        assert before=={p.relative_to(usb).as_posix():md5(p.read_bytes()) for p in usb.rglob('*') if p.is_file()},'Status wrote to USB'
        checks+=1;return r
    def mmui_block(text):return text.split('<service name="jciMMUI"')[1].split('</service>')[0]
    settings=base/'settings.conf';write(settings,'')
    deep(folder/'run.sh',settings,'uninstalled')
    config.unlink();r=deep(folder/'run.sh',settings,'unavailable');assert 'Missing target' in r.stderr;write(config,stock)
    call(['manifest',ID])
    r=call(['preflight-info',ID]);assert not r.stdout
    # A shim from the older fuel-consumption.sh or the standalone installer blocks.
    for old in ['/data_persist/fuel-ending/fuel_ending_mmui.so','/data_persist/fogyend/fogyend_mmui.so']:
        foreign=stock.replace('<dependency value="other"/>','<environ_var env_name="LD_PRELOAD" env_value="'+old+'"/>',1)
        write(second,foreign);r=call(['preflight-info',ID],1);assert 'Another fuel ending shim' in r.stdout
        call(['action',ID,'install'],1)
        assert second.read_text()==foreign and config.read_text()==stock and app.read_text()==app_stock and not payload_dir.exists()
    write(second,stock)
    # An unsupported native module or a differently modified app is refused unchanged.
    original_eco=eco.read_bytes();eco.write_bytes(b'unsupported native module')
    call(['action',ID,'install'],1)
    assert config.read_text()==stock and app.read_text()==app_stock and not payload_dir.exists()
    eco.write_bytes(original_eco)
    other=app_stock.replace('5000);','6000);',1);assert other!=app_stock;write(app,other)
    call(['action',ID,'install'],1)
    assert config.read_text()==stock and app.read_text()==other and not payload_dir.exists()
    # A fresh install needs the verified OEM app.
    write(app,app_stock)
    call(['action',ID,'install'])
    assert app.read_text()==app_mod
    library=payload_dir/'fuel_ending_mmui.so'
    assert library.read_bytes()==shim_asset.read_bytes()
    for path in [config,second]:
        text=path.read_text()
        assert 'fuel_ending_mmui.so' in mmui_block(text)
        assert 'fuel_ending_mmui.so' not in text.split('<service name="jciBLMSettings"')[1]
    call(['action',ID,'status'])
    saved=store/ID/'package'
    deep(saved/'tweaks'/ID/'run.sh',saved/'settings.conf','installed')
    original_library=library.read_bytes();library.write_bytes(b'corrupted payload')
    r=deep(saved/'tweaks'/ID/'run.sh',saved/'settings.conf','broken');assert 'payload differs' in r.stderr
    library.write_bytes(original_library)
    # Repeated install keeps one loader entry; the saved package uninstalls even
    # after the USB copy and a native module changed.
    call(['action',ID,'install'])
    assert app.read_text()==app_mod and mmui_block(config.read_text()).count('fuel_ending_mmui.so')==1
    # A later unrelated edit in the app survives uninstall.
    write(app,app_mod+'// unrelated edit\n')
    (folder/'assets/fuel_ending_mmui.so').write_bytes(b'new invalid USB version')
    eco.write_bytes(b'changed after install')
    call(['action',ID,'uninstall'])
    assert config.read_text()==stock and second.read_text()==stock
    assert app.read_text()==app_stock+'// unrelated edit\n' and not payload_dir.exists()
    assert not lock.exists() and gpio.read_text()=='0\n'
    print('FUEL_CONSUMPTION_ENDING_PASSED:',checks,'real package checks; old-shim refusal, native-module and changed-app refusal, JS patch with shim in one transaction, later unrelated edit preserved and exact saved uninstall.')
