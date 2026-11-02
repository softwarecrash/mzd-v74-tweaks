"""Mixed component transactions on synthetic files; no executable fixture is loaded."""
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
with tempfile.TemporaryDirectory(prefix='cmu-bundles-') as temporary:
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
    write(bins/'sync','#!/bin/sh\nexit 0\n')
    write(bins/'df','#!/bin/sh\nprintf "Filesystem 1024-blocks Used Available Capacity Mounted\\nfixture 1000000 1 900000 1%% internal\\n"\n')
    write(bins/'mount','#!/bin/sh\nexit 0\n')
    write(config,stock);write(second,stock)
    env=dict(os.environ,PATH=bp(bins)+':/usr/bin:/bin')
    # Header-only fixtures exercise placement and rollback, not a real ELF loader.
    elf=bytearray(52);elf[:7]=b'\x7fELF\x01\x01\x01';elf[16:20]=b'\x03\x00\x28\x00';elf[37]=2;elf[39]=5

    folder=usb/'tweaks/bundle-example'
    shutil.copytree(ROOT/'development/examples/bundle',folder)
    payload_dir=persist/'mzd-tweaks/shims/bundle-example'
    m=(folder/'manifest.conf').read_text().replace('/jci/sm/sm.conf',bp(config)).replace('74d9fc389b74fb01d0cfc2615a82c782',md5(stock.encode()))
    write(folder/'manifest.conf',m)
    table=(folder/'components.tsv').read_text().replace('/jci/sm/sm.conf',bp(config)).replace('/jci/sm/sm_WCP.conf',bp(second)).replace('74d9fc389b74fb01d0cfc2615a82c782',md5(stock.encode())).replace('030e918f5d6edcd62d196ee37b86fe99',md5(stock.encode())).replace('/tmp/mnt/data_persist',bp(persist))
    target=internal/'target.js';write(target,'value = 10;\n')
    table=table.replace('assets/beta.so\tjciMMUI','assets/beta.so\tjciBLMSettings')
    table+='patch\t'+bp(target)+'\tassets/change.patch\t-\t'+md5(target.read_bytes())+'\n'
    write(folder/'components.tsv',table)
    write(folder/'assets/change.patch','--- target.data\n+++ target.data\n@@ -1 +1 @@\n-value = 10;\n+value = 20;\n')
    for name in ['alpha','beta']:(folder/('assets/'+name+'.so')).write_bytes(bytes(elf)+name.encode())

    def call(args,code=0):
        global checks
        command='exec /bin/sh '+' '.join(shlex.quote(a) for a in [bp(usb/'installer.sh'),*args])
        r=subprocess.run([SHELL,'-c',command],env=env,capture_output=True,text=True,timeout=120)
        assert r.returncode==code,(args,r.returncode,r.stdout,r.stderr)
        checks+=1;return r

    # Invalid component paths and unavailable hardware must stop before writes.
    original_table=table
    write(folder/'components.tsv',table.replace('/alpha.so','/../alpha.so'))
    call(['manifest','bundle-example'],1)
    write(folder/'components.tsv',table)
    worker=(folder/'run.sh').read_text()
    write(folder/'run.sh',worker.replace('mzd_bundle_main',"mzd_bundle_prerequisites() { printf 'block\\tNo supported HUD.\\n'; }\nmzd_bundle_main"))
    r=call(['preflight-info','bundle-example'],1);assert 'No supported HUD' in r.stdout
    call(['action','bundle-example','install'],1)
    assert config.read_text()==stock and target.read_text()=='value = 10;\n' and not payload_dir.exists()
    write(folder/'run.sh',worker.replace('mzd_bundle_main',"mzd_bundle_prerequisites() { printf 'info\\tSupported HUD detected.\\n'; }\nmzd_bundle_main"))
    r=call(['preflight-info','bundle-example']);assert 'info\tSupported HUD detected.' in r.stdout
    write(folder/'run.sh',worker.replace('mzd_bundle_main',"mzd_bundle_prerequisites() { printf 'warning\\tNo additional function in this region.\\n'; }\nmzd_bundle_main"))
    r=call(['preflight-info','bundle-example']);assert 'warning' in r.stdout
    # Combined transaction: two shims, two loaders, one generated config, one JS patch.
    call(['action','bundle-example','install','hud_display_language=english'])
    assert (payload_dir/'libpatch.conf').read_text()=='hud_display_language = english\n'
    assert 'alpha.so' in config.read_text() and 'beta.so' in config.read_text()
    assert target.read_text()=='value = 20;\n'
    saved=store/'bundle-example/package'
    assert (saved/'settings.conf').read_text()=='hud_display_language=english\n'
    # Sequential manifest loading: custom payload_dir followed by default path must reset PAYLOAD_DIR.
    custom_dir=persist/'custom-shims/custom-bundle'
    custom_manifest=m.replace('id=bundle-example','id=custom-bundle').replace('version=0.1.0','version=0.2.0')+'payload_dir='+bp(custom_dir)+'\n'
    custom_table=table.replace(bp(payload_dir),bp(custom_dir))
    custom_folder=usb/'tweaks/custom-bundle'
    write(custom_folder/'manifest.conf',custom_manifest)
    write(custom_folder/'components.tsv',custom_table)
    seq=('. '+shlex.quote(bp(usb/'lib/manifest.sh'))+'\n'
        'mzd_manifest_load '+shlex.quote(bp(custom_folder/'manifest.conf'))+' || exit 1\n'
        '[ "$PAYLOAD_DIR" = '+shlex.quote(bp(custom_dir))+' ] || exit 1\n'
        'mzd_manifest_load '+shlex.quote(bp(folder/'manifest.conf'))+' || exit 1\n'
        '[ -z "$PAYLOAD_DIR" ] || exit 1\n')
    r=subprocess.run([SHELL,'-c',seq],env=env,capture_output=True,text=True,timeout=15)
    assert r.returncode==0,(r.stdout,r.stderr)
    shutil.rmtree(custom_folder)
    checks+=1
    # Upgrade an installed default-path bundle to a custom payload_dir.
    custom_payload_dir=persist/'custom-shims/bundle-example'
    custom_manifest=m.replace('version=0.1.0','version=0.2.0')+'payload_dir='+bp(custom_payload_dir)+'\n'
    custom_table=table.replace(bp(payload_dir),bp(custom_payload_dir))
    write(folder/'manifest.conf',custom_manifest)
    write(folder/'components.tsv',custom_table)
    call(['action','bundle-example','install','hud_display_language=english'])
    assert (custom_payload_dir/'libpatch.conf').read_text()=='hud_display_language = english\n'
    assert (custom_payload_dir/'alpha.so').exists() and (custom_payload_dir/'beta.so').exists()
    assert not payload_dir.exists()
    assert 'version=0.2.0' in (saved/'tweaks/bundle-example/manifest.conf').read_text()
    assert bp(custom_payload_dir) in (saved.parent/'paths.tsv').read_text()
    assert target.read_text()=='value = 20;\n'
    # Upgrade back from custom path to default path.
    write(folder/'manifest.conf',m.replace('version=0.1.0','version=0.3.0'))
    write(folder/'components.tsv',table)
    call(['action','bundle-example','install','hud_display_language=english'])
    assert (payload_dir/'libpatch.conf').read_text()=='hud_display_language = english\n'
    assert (payload_dir/'alpha.so').exists() and (payload_dir/'beta.so').exists()
    assert not custom_payload_dir.exists()
    assert 'version=0.3.0' in (saved/'tweaks/bundle-example/manifest.conf').read_text()
    assert bp(payload_dir) in (saved.parent/'paths.tsv').read_text()
    write(folder/'manifest.conf',m)
    # New USB defaults/assets must not affect saved uninstall.
    (folder/'assets/alpha.so').write_bytes(b'new invalid library')
    r=call(['action','bundle-example','status']);assert r.stdout=='installed\n'
    call(['action','bundle-example','uninstall'])
    assert config.read_text()==stock and second.read_text()==stock
    assert target.read_text()=='value = 10;\n' and not payload_dir.exists()
    (folder/'assets/alpha.so').write_bytes(bytes(elf)+b'alpha')
    # Fail the final JS write, after both loaders and payloads changed.
    write(bins/'mv', '#!/bin/sh\nfor value do case "$value" in '+shlex.quote(bp(target))+'.mzd-restore-*) exit 1 ;; esac; done\nexec /usr/bin/mv "$@"\n')
    call(['action','bundle-example','install'],1)
    assert config.read_text()==stock and second.read_text()==stock
    assert target.read_text()=='value = 10;\n' and not payload_dir.exists()
    assert not list(internal.glob('*.mzd-restore-*')) and not lock.exists() and gpio.read_text()=='0\n'
    (bins/'mv').unlink()
    call(['action','bundle-example','uninstall'])
    # Bad settings are refused before package staging or system changes.
    call(['action','bundle-example','install','hud_display_language=invalid'],1)
    assert config.read_text()==stock and not payload_dir.exists()
    # Critical rollback failure must keep payloads required by retained references.
    failed=base/'write-failed'
    write(bins/'mv', '#!/bin/sh\nfor value do case "$value" in '+shlex.quote(bp(target))+'.mzd-restore-*) touch '+shlex.quote(bp(failed))+'; exit 1 ;; '+shlex.quote(bp(second))+'.mzd-restore-*) [ ! -f '+shlex.quote(bp(failed))+' ] || exit 1 ;; esac; done\nexec /usr/bin/mv "$@"\n')
    call(['action','bundle-example','install'],2)
    assert 'alpha.so' in second.read_text() and (payload_dir/'alpha.so').exists() and (payload_dir/'beta.so').exists()
    assert not lock.exists() and gpio.read_text()=='0\n'
    (bins/'mv').unlink();failed.unlink()
    # Remove only verified isolated fixtures before the independent reset scenario.
    for d in [payload_dir,store/'bundle-example']:
        assert d.resolve().is_relative_to(persist.resolve()) and d != persist
        shutil.rmtree(d)
    write(config,stock);write(second,stock);write(target,'value = 10;\n')
    call(['action','bundle-example','install','hud_display_language=english'])
    saved=store/'bundle-example/package';saved_tweak=saved/'tweaks/bundle-example'
    reset=base/'reset-hook.sh';archive=base/'reset-archive';archive.mkdir()
    system=base/'reset-system';system.mkdir();write(system/'mounts','');write(system/'locks','')
    write(reset,'ROOT='+shlex.quote(bp(saved))+'\nHERE='+shlex.quote(bp(saved_tweak))+'\nMZD_SETTINGS_FILE='+shlex.quote(bp(saved/'settings.conf'))+'\nACTION=run\nMZD_RESET_DIR='+shlex.quote(bp(archive))+'\nMZD_SYSTEM='+shlex.quote(bp(system))+'\n. "$ROOT/lib/bundle.sh"\nmzd_bundle_reset_main "$1"\n')
    def hook(phase,code=0):
        global checks
        r=subprocess.run([SHELL,bp(reset),phase],env=env,capture_output=True,text=True,timeout=45)
        assert r.returncode==code,(phase,r.stdout,r.stderr)
        checks+=1;return r
    write(payload_dir/'foreign.txt','keep me\n');hook('check',1);assert (payload_dir/'foreign.txt').exists();(payload_dir/'foreign.txt').unlink()
    hook('check');hook('prepare');assert len(list(archive.glob('payload-*')))==3
    hook('finish',1);assert (payload_dir/'alpha.so').exists()
    for path in [config,second,target]:shutil.copyfile(path.with_name(path.name+'.org'),path)
    hook('finish');assert not payload_dir.exists()
    print('COMPONENT_BUNDLES_PASSED:',checks,'controller/reset checks; distinct services, mixed commit/rollback, critical payload retention, custom payload upgrades, settings config, block/warning, saved uninstall and owned reset.')
