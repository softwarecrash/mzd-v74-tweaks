"""CarPlay HUD Mod real package on synthetic CMU files; the release library is not executed."""
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
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(s,encoding='utf-8',newline='\n');p.chmod(0o755)

def md5(b): return hashlib.md5(b).hexdigest()

assert hashlib.sha256((ROOT/'usb/tweaks/carplay-hud/assets/libpatch-blmjcicarplay.so').read_bytes()).hexdigest() == '76c9f329dab61e5530b31c84ecf403890ce0846acd57213813d0e1dbda449a2e'
assert hashlib.sha256((ROOT/'usb/tweaks/carplay-hud/source/mazda-carplay-hud-source.zip').read_bytes()).hexdigest() == '2d6955d2dd13e804b5258901e381467d9d323a9828d2836548b18c94d53db1cb'

checks=0
with tempfile.TemporaryDirectory(prefix='cmu-carplay-hud-') as temporary:
    base=Path(temporary);usb=base/'usb';internal=base/'internal';persist=base/'persist'
    bins=base/'bin';mounts=base/'mounts';version=base/'version';gpio=base/'watchdog';lock=base/'packages.lock'
    for d in [usb,internal,persist,bins,base/'locks']:d.mkdir()
    store=persist/'mzd-tweaks/installed'
    config=internal/'sm.conf';second=internal/'sm_WCP.conf'
    stock='<services>\n    <service name="jciMMUI" path="/jci/mmui/example.so">\n        <dependency value="other"/>\n    </service>\n    <service name="jciCARPLAY" path="/jci/carplay/example.so" reset_board="yes">\n        <dependency value="other"/>\n    </service>\n</services>\n'
    devmgr_stock=(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<configs>\n'
        '<!-- true: accessory supports NMEA_GPHDT sentences -->\n'
        '<config><name>CARPLAY_LOCATION_NMEA_GPHDT</name><value>FALSE</value></config>\n'
        '<!-- Default FALSE -->\n'
        '<config><name>NaviSupported</name><value>FALSE</value></config>\n'
        '<!-- Default 0x5555 -->\n'
        '<config><name>NaviCompId</name><value>0x5555</value></config>\n'
        '<!-- Default 100 -->\n'
        '</configs>\n'
    )
    devmgr=internal/'devmgr_config_master.xml'
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
        assert busybox, 'BusyBox requested but missing.'
        for name in ['awk','patch','diff','cp','cmp','md5sum','cut','readlink','dirname',
                     'mktemp','mkdir','rm','cat','grep','od','dd']:
            os.symlink(busybox,bins/name)
    write(bins/'sync','#!/bin/sh\nexit 0\n')
    write(bins/'df','#!/bin/sh\nprintf "Filesystem 1024-blocks Used Available Capacity Mounted\\nfixture 1000000 1 900000 1%% internal\\n"\n')
    write(bins/'mount','#!/bin/sh\nexit 0\n')
    write(config,stock);write(second,stock);write(devmgr,devmgr_stock)
    env=dict(os.environ,PATH=bp(bins)+':/usr/bin:/bin')

    folder=usb/'tweaks/carplay-hud'
    shutil.copytree(ROOT/'usb/tweaks/carplay-hud',folder)
    payload_dir=persist/'mzd-tweaks/shims/carplay-hud'
    m=(folder/'manifest.conf').read_text().replace('/jci/sm/sm.conf',bp(config)).replace('74d9fc389b74fb01d0cfc2615a82c782',md5(stock.encode()))
    write(folder/'manifest.conf',m)
    table=(folder/'components.tsv').read_text()
    for old,new in {
        '/jci/sm/sm.conf':bp(config),
        '/jci/sm/sm_WCP.conf':bp(second),
        '74d9fc389b74fb01d0cfc2615a82c782':md5(stock.encode()),
        '030e918f5d6edcd62d196ee37b86fe99':md5(stock.encode()),
        '/tmp/mnt/data_persist':bp(persist),
        '/etc/devmgr_config_master.xml':bp(devmgr),
        'ee189da9e09388adb7cec4f49563cdbb':md5(devmgr_stock.encode()),
    }.items():
        table=table.replace(old,new)
    write(folder/'components.tsv',table)
    write(bins/'dbus-send', '#!/bin/sh\ncase "${TEST_HUD:-whud}:$*" in none:*byte:13*) printf "   byte 0\\n" ;; unknown:*) exit 1 ;; chud_mono:*byte:26*) printf "   byte 0\\n" ;; chud_color:*byte:26*) printf "   byte 1\\n" ;; *byte:13*) printf "   byte 1\\n" ;; *byte:26*) printf "   byte 2\\n" ;; *) exit 1 ;; esac\n')

    def call(args,code=0):
        global checks
        command='exec /bin/sh '+' '.join(shlex.quote(a) for a in [bp(usb/'installer.sh'),*args])
        r=subprocess.run([SHELL,'-c',command],env=env,capture_output=True,text=True,timeout=150)
        assert r.returncode==code,(args,r.returncode,r.stdout,r.stderr)
        checks+=1;return r

    def deep(worker, state):
        global checks
        cfg=dict(env,MZD_WORKER_DIRECT='1')
        before={p.relative_to(usb).as_posix():hashlib.md5(p.read_bytes()).hexdigest() for p in usb.rglob('*') if p.is_file()}
        r=subprocess.run([SHELL,'-c','exec /bin/sh '+shlex.quote(bp(worker))+' status'],env=cfg,capture_output=True,text=True,timeout=90)
        assert r.returncode==0 and r.stdout==state+'\n',(r.returncode,r.stdout,r.stderr)
        assert before=={p.relative_to(usb).as_posix():hashlib.md5(p.read_bytes()).hexdigest() for p in usb.rglob('*') if p.is_file()},'Status wrote to USB'
        checks+=1;return r

    deep(folder/'run.sh','uninstalled')
    call(['manifest','carplay-hud'])

    # Prerequisites tests:
    r=call(['preflight-info','carplay-hud']);assert 'info\tDetected supported Windshield HUD' in r.stdout
    env['TEST_HUD']='chud_mono';r=call(['preflight-info','carplay-hud'],0);assert 'warning\tDetected Combiner HUD (monochrome). Displaying street names will not work.' in r.stdout
    env['TEST_HUD']='chud_color';r=call(['preflight-info','carplay-hud'],0);assert 'warning\tDetected Combiner HUD (color). Displaying street names will not work.' in r.stdout
    env['TEST_HUD']='none';r=call(['preflight-info','carplay-hud'],1);assert 'This vehicle has no HUD' in r.stdout
    env['TEST_HUD']='unknown';r=call(['preflight-info','carplay-hud'],1);assert 'cannot determine HUD compatibility' in r.stdout
    env['TEST_HUD']='whud'

    # Standalone HUD mod already owning the hook is refused.
    foreign=stock.replace('<dependency value="other"/>','<environ_var env_name="LD_PRELOAD" env_value="/tmp/mnt/data_persist/cp-hud-mod/libpatch-blmjcicarplay.so"/>',1)
    write(config,foreign);r=call(['preflight-info','carplay-hud'],1);assert 'already referenced' in r.stdout
    call(['action','carplay-hud','install'],1);assert config.read_text()==foreign and not payload_dir.exists()
    write(config,stock)

    # Clean install
    call(['action','carplay-hud','install'])
    library=payload_dir/'libpatch-blmjcicarplay.so'
    assert library.read_bytes()==(folder/'assets/libpatch-blmjcicarplay.so').read_bytes()
    for path in [config,second]:
        text=path.read_text()
        carplay_block=text.split('<service name="jciCARPLAY"')[1].split('</service>')[0]
        assert 'libpatch-blmjcicarplay.so' in carplay_block
        assert 'reset_board="no"' in text
        assert '<!-- mzd-reset-board:yes -->' in text
        assert 'env_name="LD_LIBRARY_PATH" env_value="/jci/lib:/usr/lib"' in carplay_block
        assert 'libpatch-blmjcicarplay.so' not in text.split('<service name="jciMMUI"')[1].split('</service>')[0]
    assert '<config><name>NaviSupported</name><value>TRUE</value></config>' in devmgr.read_text()

    # Status check
    call(['action','carplay-hud','status'])
    saved=store/'carplay-hud/package'
    deep(saved/'tweaks/carplay-hud/run.sh','installed')

    # Status requires reset_board="no"
    tampered=config.read_text().replace('reset_board="no"', 'reset_board="yes"')
    write(config,tampered)
    r=deep(saved/'tweaks/carplay-hud/run.sh','broken')
    assert 'Partial loader configuration' in r.stderr
    write(config,tampered.replace('reset_board="yes"', 'reset_board="no"'))

    # Uninstall restores exact stock files
    call(['action','carplay-hud','uninstall'])
    assert config.read_text()==stock and second.read_text()==stock
    assert devmgr.read_text()==devmgr_stock
    assert not payload_dir.exists()
    assert not lock.exists() and gpio.read_text()=='0\n'

    # Direct multi-tweak sharing and exact reversibility test
    runner=base/'transform-runner.sh'
    write(runner, (
        f'. {shlex.quote(bp(usb/"lib/shim.sh"))}\n'
        f'. {shlex.quote(bp(usb/"lib/bundle.sh"))}\n'
        'ROOT=' + shlex.quote(bp(usb)) + '\n'
        'ID=carplay-hud\n'
        'MZD_PACKAGE_STORE=' + shlex.quote(bp(store)) + '\n'
        'action=$1; in=$2; out=$3; tab=$4; target=$5\n'
        'mzd_bundle_transform "$in" "$action" "$out" "$tab" "$target"\n'
    ))

    shared_stock=stock.replace(
        '<service name="jciCARPLAY" path="/jci/carplay/example.so" reset_board="yes">',
        '<service name="jciCARPLAY" path="/jci/carplay/example.so" reset_board="yes">\n'
        '        <environ_var env_name="LD_PRELOAD" env_value="/tmp/mnt/data_persist/mzd-tweaks/shims/other/other.so"/> <!-- mzd-v74-shims -->\n'
        '        <environ_var env_name="LD_LIBRARY_PATH" env_value="/jci/lib:/tmp/other/lib"/> <!-- mzd-v74-shims -->'
    )
    in_file=base/'shared-in.xml';write(in_file,shared_stock)
    # Set OEM backup to have /jci/lib so it is preserved on uninstall
    oem_backup=base/'shared-target.xml.org';write(oem_backup,shared_stock)
    target_file=base/'shared-target.xml';write(target_file,shared_stock)
    tab_file=folder/'components.tsv'
    added_file=base/'shared-added.xml'
    inverse_file=base/'shared-inverse.xml'

    r=subprocess.run([SHELL,bp(runner),'install',bp(in_file),bp(added_file),bp(tab_file),bp(target_file)],capture_output=True,text=True)
    assert r.returncode==0, (r.stdout,r.stderr)
    added_text=added_file.read_text()
    assert 'other.so' in added_text and 'libpatch-blmjcicarplay.so' in added_text
    assert '/tmp/other/lib' in added_text and '/usr/lib' in added_text
    assert 'reset_board="no"' in added_text
    assert '<!-- mzd-reset-board:yes -->' in added_text

    # Test no_reset reference tracking: when another package requires no_reset on jciCARPLAY,
    # uninstallation keeps reset_board="no" and preserves the comment.
    other_pkg = store/'other-pkg/package/tweaks/other-pkg'
    other_tsv = 'loader\t/jci/sm/sm.conf\t-\t-\t74d9fc389b74fb01d0cfc2615a82c782\nshim\t/tmp/mnt/data_persist/mzd-tweaks/shims/other-pkg/other.so\tassets/other.so\tjciCARPLAY\tno_reset\n'
    write(other_pkg/'components.tsv', other_tsv)
    r=subprocess.run([SHELL,bp(runner),'uninstall',bp(added_file),bp(inverse_file),bp(tab_file),bp(target_file)],capture_output=True,text=True)
    assert r.returncode==0, (r.stdout,r.stderr)
    kept_text = inverse_file.read_text()
    assert 'libpatch-blmjcicarplay.so' not in kept_text
    assert 'reset_board="no"' in kept_text
    assert '<!-- mzd-reset-board:yes -->' in kept_text
    checks+=1

    # When another package requires no_reset on a DIFFERENT service (jciMMUI),
    # uninstallation restores reset_board="yes" on jciCARPLAY.
    other_diff_tsv = 'loader\t/jci/sm/sm.conf\t-\t-\t74d9fc389b74fb01d0cfc2615a82c782\nshim\t/tmp/mnt/data_persist/mzd-tweaks/shims/other-pkg/other.so\tassets/other.so\tjciMMUI\tno_reset\n'
    write(other_pkg/'components.tsv', other_diff_tsv)
    r=subprocess.run([SHELL,bp(runner),'uninstall',bp(added_file),bp(inverse_file),bp(tab_file),bp(target_file)],capture_output=True,text=True)
    assert r.returncode==0, (r.stdout,r.stderr)
    assert inverse_file.read_text()==shared_stock, (inverse_file.read_text(), shared_stock)
    checks+=1

    # When another package has a shim on the same service WITHOUT no_reset,
    # uninstallation restores reset_board="yes".
    other_noopt_tsv = 'loader\t/jci/sm/sm.conf\t-\t-\t74d9fc389b74fb01d0cfc2615a82c782\nshim\t/tmp/mnt/data_persist/mzd-tweaks/shims/other-pkg/other.so\tassets/other.so\tjciCARPLAY\t-\n'
    write(other_pkg/'components.tsv', other_noopt_tsv)
    r=subprocess.run([SHELL,bp(runner),'uninstall',bp(added_file),bp(inverse_file),bp(tab_file),bp(target_file)],capture_output=True,text=True)
    assert r.returncode==0, (r.stdout,r.stderr)
    assert inverse_file.read_text()==shared_stock, (inverse_file.read_text(), shared_stock)
    checks+=1

    # When another package has flat components.tsv with no_reset on jciCARPLAY,
    # reference tracking preserves reset_board="no".
    shutil.rmtree(store/'other-pkg')
    write(store/'other-pkg/components.tsv', other_tsv)
    r=subprocess.run([SHELL,bp(runner),'uninstall',bp(added_file),bp(inverse_file),bp(tab_file),bp(target_file)],capture_output=True,text=True)
    assert r.returncode==0, (r.stdout,r.stderr)
    kept_text = inverse_file.read_text()
    assert 'reset_board="no"' in kept_text
    assert '<!-- mzd-reset-board:yes -->' in kept_text
    checks+=1

    # When the other package is removed from MZD_PACKAGE_STORE, uninstallation restores reset_board="yes".
    shutil.rmtree(store/'other-pkg')
    r=subprocess.run([SHELL,bp(runner),'uninstall',bp(added_file),bp(inverse_file),bp(tab_file),bp(target_file)],capture_output=True,text=True)
    assert r.returncode==0, (r.stdout,r.stderr)
    assert inverse_file.read_text()==shared_stock, (inverse_file.read_text(), shared_stock)
    checks+=2

    # Direct loader-env.awk normalization test for !entry with duplicates and empty delimiters
    norm_in = base/'norm-in.xml'; write(norm_in, stock)
    norm_out = base/'norm-out.xml'
    norm_args = ['awk', '-v', 'service=jciCARPLAY', '-v', 'env_name=LD_LIBRARY_PATH',
                 '-v', 'env_value=::/jci/lib::/usr/lib::/jci/lib::', '-v', 'mode=install',
                 '-f', bp(usb/'lib/loader-env.awk'), bp(norm_in)]
    r = subprocess.run([SHELL, '-c', ' '.join(shlex.quote(a) for a in norm_args)], capture_output=True, text=True)
    assert r.returncode == 0, (r.stdout, r.stderr)
    norm_text = r.stdout
    assert '<environ_var env_name="LD_LIBRARY_PATH" env_value="/jci/lib:/usr/lib"/> <!-- mzd-v74-shims -->' in norm_text
    checks+=1
    write(norm_out, norm_text)
    status_args = ['awk', '-v', 'service=jciCARPLAY', '-v', 'env_name=LD_LIBRARY_PATH',
                   '-v', 'env_value=/jci/lib:/usr/lib', '-v', 'mode=status',
                   '-f', bp(usb/'lib/loader-env.awk'), bp(norm_out)]
    r = subprocess.run([SHELL, '-c', ' '.join(shlex.quote(a) for a in status_args)], capture_output=True, text=True)
    assert r.returncode == 0 and r.stdout.strip() == 'installed', (r.stdout, r.stderr)
    checks+=1
    uninst_args = ['awk', '-v', 'service=jciCARPLAY', '-v', 'env_name=LD_LIBRARY_PATH',
                   '-v', 'env_value=/jci/lib:/usr/lib', '-v', 'mode=uninstall',
                   '-f', bp(usb/'lib/loader-env.awk'), bp(norm_out)]
    r = subprocess.run([SHELL, '-c', ' '.join(shlex.quote(a) for a in uninst_args)], capture_output=True, text=True)
    assert r.returncode == 0 and r.stdout == stock, (r.stdout, stock)
    checks+=1

    print('CARPLAY_HUD_PASSED:',checks,'real package checks; dual SM loaders, reset_board restoration, loader_env merging, patch application and exact uninstallation.')
