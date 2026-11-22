"""CarPlay Wireless bundle transaction on synthetic CMU files."""
from pathlib import Path
import hashlib
import os
import shlex
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
SHELL = 'C:/Program Files/Git/bin/bash.exe' if os.name == 'nt' else '/bin/sh'

def bp(p):
    s = Path(p).resolve().as_posix()
    return '/' + s[0].lower() + s[2:] if len(s) > 1 and s[1] == ':' else s

def write(p, s):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(s, encoding='utf-8', newline='\n')
    p.chmod(0o755)

def md5(b): return hashlib.md5(b).hexdigest()

checks = 0

with tempfile.TemporaryDirectory(prefix='cmu-carplay-wireless-') as temporary:
    base = Path(temporary)
    usb = base / 'usb'
    internal = base / 'internal'
    persist = base / 'persist'
    bins = base / 'bin'
    mounts = base / 'mounts'
    version = base / 'version'
    watchdog = base / 'watchdog'
    lock = base / 'packages.lock'
    for d in [usb, internal, persist, bins, base / 'locks']:
        d.mkdir()
    store = persist / 'mzd-tweaks/installed'

    config = internal / 'sm_WCP.conf'
    stock_sm = (
        '<services>\n'
        '    <service name="jcinavi" path="/jci/navi/svcjcinavi.so" autorun="yes" reset_board="yes" args="wcp">\n'
        '        <dependency type="service" value="stage_navi"/>\n'
        '    </service>\n'
        '    <service name="jciLDS" path="/jci/lds/svcjcilds.so" autorun="yes" reset_board="yes" args="/jci/lds/lds ConfigFile=/jci/lds/lds.xml GPS=UBLOX">\n'
        '        <dependency type="service" value="stage_navi"/>\n'
        '    </service>\n'
        '</services>\n'
    )

    with open(ROOT / 'src/mazda/cmu/jci/scripts/get_board_type.sh', 'rb') as f:
        stock_gbt = f.read().decode('utf-8')
    gbt = internal / 'get_board_type.sh'

    with open(ROOT / 'src/mazda/cmu/usr/bin/autostart', 'rb') as f:
        stock_autostart = f.read().decode('utf-8')
    autostart = internal / 'autostart'

    gpio1056 = internal / 'sys/class/gpio/DI_TP1056/value'
    gpio1029 = internal / 'sys/class/gpio/DI_TP1029/value'

    shutil.copytree(ROOT / 'usb/lib', usb / 'lib')
    write(usb / 'installer.sh', (ROOT / 'usb/installer.sh').read_text().replace(
        '#!/bin/sh\n', '#!/bin/sh\nPATH=' + shlex.quote(bp(bins) + ':/usr/bin:/bin') + '\nexport PATH\n', 1))

    for p in (usb / 'lib').glob('*.sh'):
        s = p.read_text().replace('/tmp/mnt/data_persist', bp(persist)).replace('/proc/mounts', bp(mounts)).replace('/jci/version.ini', bp(version))
        s = s.replace('MZD_SHIM_ROOT=/', 'MZD_SHIM_ROOT=' + shlex.quote(bp(internal)))
        s = s.replace('/tmp/mzd-packages.lock', bp(lock))
        s = s.replace('/sys/class/gpio/Watchdog\\ Disable/value', shlex.quote(bp(watchdog)))
        s = s.replace('/sys/class/gpio/DI_TP1056/value', shlex.quote(bp(gpio1056)))
        s = s.replace('/sys/class/gpio/DI_TP1029/value', shlex.quote(bp(gpio1029)))
        s = s.replace('LOCK="/tmp/mzd-$LOCK_GROUP-tweak.lock"', 'LOCK="' + bp(base / 'locks') + '/$LOCK_GROUP.lock"')
        write(p, s)

    write(version, 'JCI_SW_VER="MAZ_CMU-150_74.00.324"\n')
    write(watchdog, '0\n')
    write(mounts, f'/dev/root {bp(internal)} relfs ro 0 0\n/dev/data {bp(persist)} relfs rw 0 0\n/dev/usb {bp(usb)} vfat rw 0 0\n')

    if os.environ.get('CMU_TEST_BUSYBOX'):
        busybox = shutil.which('busybox')
        assert busybox, 'BusyBox requested but missing.'
        for name in ['awk', 'patch', 'diff', 'cp', 'cmp', 'md5sum', 'cut', 'readlink', 'dirname',
                     'mktemp', 'mkdir', 'rm', 'cat', 'grep', 'od', 'dd']:
            os.symlink(busybox, bins / name)

    write(bins / 'sync', '#!/bin/sh\nexit 0\n')
    write(bins / 'df', '#!/bin/sh\nprintf "Filesystem 1024-blocks Used Available Capacity Mounted\\nfixture 1000000 1 900000 1%% internal\\n"\n')
    write(bins / 'mount', '#!/bin/sh\nexit 0\n')
    write(bins / 'logger', '#!/bin/sh\nexit 0\n')

    write(config, stock_sm)
    write(gbt, stock_gbt)
    write(autostart, stock_autostart)
    write(gpio1056, '0\n')
    write(gpio1029, '0\n')

    env = dict(os.environ, PATH=bp(bins) + ':/usr/bin:/bin')

    folder = usb / 'tweaks/carplay-wireless'
    shutil.copytree(ROOT / 'usb/tweaks/carplay-wireless', folder)

    r_sh = (folder / 'reset.sh').read_text().replace('/data_persist', bp(persist))
    write(folder / 'reset.sh', r_sh)

    r_run = (folder / 'run.sh').read_text().replace('/data_persist', bp(persist))
    write(folder / 'run.sh', r_run)

    p_gbt = (folder / 'assets/get_board_type.patch').read_text().replace('/data_persist', bp(persist))
    write(folder / 'assets/get_board_type.patch', p_gbt)

    m = (folder / 'manifest.conf').read_text()
    m = m.replace('/jci/sm/sm_WCP.conf', bp(config)).replace('030e918f5d6edcd62d196ee37b86fe99', md5(stock_sm.encode()))
    write(folder / 'manifest.conf', m)

    t = (folder / 'components.tsv').read_text()
    t = t.replace('/jci/sm/sm_WCP.conf', bp(config)).replace('030e918f5d6edcd62d196ee37b86fe99', md5(stock_sm.encode()))
    t = t.replace('/jci/scripts/get_board_type.sh', bp(gbt)).replace('89e4842bc3911d360d1b89ff3001e5ec', md5(stock_gbt.encode()))
    t = t.replace('/usr/bin/autostart', bp(autostart)).replace('90dd7122d11f6f2a279c306193a13810', md5(stock_autostart.encode()))
    write(folder / 'components.tsv', t)

    def call(args, expected_code=0):
        global checks
        cmd = [SHELL, bp(usb / 'installer.sh')] + args
        r = subprocess.run(cmd, env=env, capture_output=True, text=True)
        assert r.returncode == expected_code, (r.stdout, r.stderr, args)
        checks += 1
        return r

    # 1. Hardware Preflight: Newer Hardware Blocks Install
    write(gpio1056, '1\n')
    r_block = call(['preflight-info', 'carplay-wireless'], expected_code=1)
    assert 'native wireless CP' in r_block.stdout
    write(gpio1056, '0\n')

    # 1b. Hardware Preflight: Unreadable / Missing GPIO Fallback
    gpio1056.unlink()
    r_unreadable = call(['preflight-info', 'carplay-wireless'], expected_code=1)
    assert 'Unable to determine CMU hardware type' in r_unreadable.stdout
    write(gpio1056, '0\n')

    # 2. Hardware Preflight: Legacy Hardware Passes
    r_pass = call(['preflight-info', 'carplay-wireless'], expected_code=0)
    assert 'Legacy CMU150' in r_pass.stdout

    # 2b. Prerequisites: Standalone mod in autostart blocks install
    write(autostart, stock_autostart.replace('test ! -e "$UBLOX_FILE" && touch "$UBLOX_FILE"', 'test -e "$UBLOX_FILE" && rm -f "$UBLOX_FILE" # WCP mod: do not create ublox.txt'))
    r_wcp_auto = call(['preflight-info', 'carplay-wireless'], expected_code=1)
    assert 'Another Wireless CarPlay mod is already referenced' in r_wcp_auto.stdout
    write(autostart, stock_autostart)

    # 2c. Prerequisites: Standalone mod in get_board_type.sh (patched without MZD Tweaks comment) blocks install
    standalone_gbt = (
        '#!/bin/sh\nret=1\n'
        'if [ -e /data_persist/wcp_force_off ]; then exit 1; fi\n'
        'exit 2\n'
    )
    write(gbt, standalone_gbt)
    r_wcp_gbt1 = call(['preflight-info', 'carplay-wireless'], expected_code=1)
    assert 'Another Wireless CarPlay mod is already referenced' in r_wcp_gbt1.stdout
    write(gbt, stock_gbt)

    # 2f. Prerequisites: Missing autostart or get_board_type.sh blocks install
    autostart.unlink()
    r_missing = call(['preflight-info', 'carplay-wireless'], expected_code=1)
    assert 'A required system script is missing or linked' in r_missing.stdout
    write(autostart, stock_autostart)

    # 3. Status before install
    r_stat0 = call(['action', 'carplay-wireless', 'status'])
    assert r_stat0.stdout.strip() == 'uninstalled'

    # 4. Install deletes leftover persistent files after installation succeeds
    extra_force = persist / 'wcp_force_off'
    extra_boot = persist / 'wcp_bootcnt'
    extra_ublox = persist / 'ublox.txt'
    write(extra_force, '1\n')
    write(extra_boot, '10\n')
    write(extra_ublox, 'active\n')

    call(['action', 'carplay-wireless', 'install'])

    assert not extra_force.exists()
    assert not extra_boot.exists()
    assert not extra_ublox.exists()
    checks += 3

    # Assert sm_WCP.conf changes
    sm_text = config.read_text()
    assert 'args=""' in sm_text
    assert 'args="wcp"' not in sm_text
    assert '<!-- mzd-attr-args:removed=wcp -->' in sm_text
    assert 'args="/jci/lds/lds ConfigFile=/jci/lds/lds.xml"' in sm_text
    assert 'GPS=UBLOX' not in sm_text
    assert '<!-- mzd-attr-GPS:removed_args=UBLOX -->' in sm_text
    assert sm_text.count('reset_board="no"') == 2
    assert sm_text.count('<!-- mzd-attr-reset_board:yes -->') == 2

    # Assert get_board_type.sh changes
    gbt_text = gbt.read_text()
    assert 'vim_app' in gbt_text
    assert 'caller=' in gbt_text
    assert '# MZD Tweaks WCP mod' in gbt_text
    assert 'DI_TP1056' not in gbt_text
    assert 'DI_TP1029' not in gbt_text

    # Assert autostart changes
    auto_text = autostart.read_text()
    assert 'MZD Tweaks WCP mod: do not create ublox.txt' in auto_text
    assert 'touch "$UBLOX_FILE"' not in auto_text

    # 5. Status after install
    r_stat1 = call(['action', 'carplay-wireless', 'status'])
    assert r_stat1.stdout.strip() == 'installed'

    # 5b. Safety switch test (/data_persist/wcp_force_off forces stock ret=1)
    force_off = persist / 'wcp_force_off'
    write(force_off, '')
    gbt_runner = base / 'gbt-test.sh'
    write(gbt_runner, f'#!/bin/sh\nsh {shlex.quote(bp(gbt))}\n')
    r_force = subprocess.run([SHELL, bp(gbt_runner)], capture_output=True)
    assert r_force.returncode == 1, (r_force.returncode, r_force.stdout, r_force.stderr)
    force_off.unlink()
    r_normal = subprocess.run([SHELL, bp(gbt_runner)], capture_output=True)
    assert r_normal.returncode == 2, (r_normal.returncode, r_normal.stdout, r_normal.stderr)
    checks += 2

    # 5c. Reset hook contract verification (check, prepare, finish)
    reset_script = folder / 'reset.sh'
    extra_force = persist / 'wcp_force_off'
    extra_boot = persist / 'wcp_bootcnt'
    write(extra_force, '1\n')
    write(extra_boot, '5\n')

    reset_dir = base / 'reset-archive'
    reset_dir.mkdir()
    reset_system = base / 'reset-system'
    reset_system.mkdir()
    saved_settings = base / 'settings.conf'
    write(saved_settings, '')
    env_reset = dict(env, ACTION='run', MZD_RESET_DIR=bp(reset_dir), MZD_REPORT=bp(reset_dir),
                     MZD_SYSTEM=bp(reset_system), MZD_SETTINGS_FILE=bp(saved_settings))

    # check phase: must be read-only and NOT delete extras
    r_chk = subprocess.run([SHELL, bp(reset_script), 'check'], env=env_reset, capture_output=True, text=True)
    assert r_chk.returncode == 0, (r_chk.stdout, r_chk.stderr)
    assert extra_force.exists()
    assert extra_boot.exists()
    checks += 1

    # prepare phase: must archive extras into MZD_RESET_DIR
    r_prep = subprocess.run([SHELL, bp(reset_script), 'prepare'], env=env_reset, capture_output=True, text=True)
    assert r_prep.returncode == 0, (r_prep.stdout, r_prep.stderr)
    assert (reset_dir / 'wcp_force_off').exists()
    assert (reset_dir / 'wcp_bootcnt').exists()
    assert extra_force.exists()
    checks += 1

    # 6. Failed uninstall preserves safety switch (/data_persist/wcp_force_off)
    write(extra_force, '1\n')
    extra_log = Path('/tmp/wcp_board.log')
    write(extra_log, 'test\n')
    saved_autostart = autostart.read_text()
    write(autostart, stock_autostart)  # Unexpected modification to target triggers uninstall failure

    r_uninst_fail = call(['action', 'carplay-wireless', 'uninstall'], expected_code=1)
    assert extra_force.exists()
    assert extra_log.exists()
    checks += 2

    # Restore expected installed target and run successful uninstall
    write(autostart, saved_autostart)
    call(['action', 'carplay-wireless', 'uninstall'])
    assert config.read_text() == stock_sm
    assert gbt.read_text() == stock_gbt
    assert autostart.read_text() == stock_autostart
    assert not extra_force.exists()
    assert not extra_log.exists()
    checks += 2

    r_stat2 = call(['action', 'carplay-wireless', 'status'])
    assert r_stat2.stdout.strip() == 'uninstalled'

    write(extra_force, '1\n')
    write(extra_boot, '5\n')
    write(extra_log, 'test\n')
    # finish phase (after targets are restored to stock hash): cleans up extras
    r_fin = subprocess.run([SHELL, bp(reset_script), 'finish'], env=env_reset, capture_output=True, text=True)
    assert r_fin.returncode == 0, (r_fin.stdout, r_fin.stderr)
    assert not extra_force.exists()
    assert not extra_boot.exists()
    assert not extra_log.exists()
    checks += 1

    # 7. Multi-tweak sharing and exact reversibility test
    runner = base / 'transform-runner.sh'
    write(runner, (
        f'. {shlex.quote(bp(usb / "lib/shim.sh"))}\n'
        f'. {shlex.quote(bp(usb / "lib/bundle.sh"))}\n'
        'ROOT=' + shlex.quote(bp(usb)) + '\n'
        'ID=carplay-wireless\n'
        'MZD_PACKAGE_STORE=' + shlex.quote(bp(store)) + '\n'
        'action=$1; in=$2; out=$3; tab=$4; target=$5\n'
        'mzd_bundle_transform "$in" "$action" "$out" "$tab" "$target"\n'
    ))

    # Target has pre-existing LD_PRELOAD in jcinavi (simulating android-auto)
    shared_stock = stock_sm.replace(
        '<service name="jcinavi" path="/jci/navi/svcjcinavi.so" autorun="yes" reset_board="yes" args="wcp">',
        '<service name="jcinavi" path="/jci/navi/svcjcinavi.so" autorun="yes" reset_board="yes" args="wcp">\n'
        '        <environ_var env_name="LD_PRELOAD" env_value="/tmp/mnt/data_persist/mzd-tweaks/shims/android-auto/libpatch-svcjcinavi.so"/> <!-- mzd-v74-shims -->'
    )
    in_file = base / 'shared-in.xml'
    write(in_file, shared_stock)
    target_file = base / 'shared-target.xml'
    write(target_file, shared_stock)
    tab_file = folder / 'components.tsv'
    added_file = base / 'shared-added.xml'
    inverse_file = base / 'shared-inverse.xml'

    r = subprocess.run([SHELL, bp(runner), 'install', bp(in_file), bp(added_file), bp(tab_file), bp(target_file)], capture_output=True, text=True)
    assert r.returncode == 0, (r.stdout, r.stderr)
    added_text = added_file.read_text()
    assert 'libpatch-svcjcinavi.so' in added_text
    assert 'args=""' in added_text
    assert 'reset_board="no"' in added_text

    r = subprocess.run([SHELL, bp(runner), 'uninstall', bp(added_file), bp(inverse_file), bp(tab_file), bp(target_file)], capture_output=True, text=True)
    assert r.returncode == 0, (r.stdout, r.stderr)
    assert inverse_file.read_text() == shared_stock, (inverse_file.read_text(), shared_stock)
    checks += 2

    attr_runner = base / 'attr-runner.sh'
    write(attr_runner, (
        f'. {shlex.quote(bp(usb / "lib/shim.sh"))}\n'
        'ROOT=' + shlex.quote(bp(usb)) + '\n'
        'mzd_loader_attr_transform "$1" "$2" "$3" "$4" "$5" "${6:-0}"\n'
    ))

    # 8. Edge case verification: stock match (issue 2) across set, remove_val, remove_attr and token re-ordering exact reversibility (issue 3)
    stock_match_stock = stock_sm.replace(
        'reset_board="yes"', 'reset_board="no"'
    ).replace(
        'args="wcp"', 'args="clean"'
    ).replace(
        ' GPS=UBLOX', ''
    )
    match_in = base / 'match-in.xml'
    match_added = base / 'match-added.xml'
    match_inverse = base / 'match-inverse.xml'
    write(match_in, stock_match_stock)

    # Status before install on stock match file: all 3 operations report uninstalled
    for svc, spec, op in [('jcinavi', 'reset_board=no', 'set'), ('jcinavi', 'args=wcp', 'remove_val'), ('jciLDS', 'GPS=UBLOX', 'remove_attr'), ('jciLDS', 'reset_board=no', 'set')]:
        r_st = subprocess.run([SHELL, bp(attr_runner), bp(match_in), 'status', svc, spec, op], capture_output=True, text=True)
        assert r_st.returncode == 0 and r_st.stdout.strip() == 'uninstalled', (r_st.stdout, r_st.stderr, svc, spec, op)
    checks += 4

    r = subprocess.run([SHELL, bp(runner), 'install', bp(match_in), bp(match_added), bp(tab_file), bp(match_in)], capture_output=True, text=True)
    assert r.returncode == 0, (r.stdout, r.stderr)
    match_added_text = match_added.read_text()
    assert 'args="clean"' in match_added_text
    assert '<!-- mzd-attr-args:removed=clean -->' in match_added_text
    assert 'GPS=UBLOX' not in match_added_text
    assert '<!-- mzd-attr-GPS:removed_args=absent -->' in match_added_text
    assert match_added_text.count('reset_board="no"') == 2
    assert match_added_text.count('<!-- mzd-attr-reset_board:no -->') == 2
    checks += 1

    # Status after install on stock match file: all 3 operations report installed
    for svc, spec, op in [('jcinavi', 'reset_board=no', 'set'), ('jcinavi', 'args=wcp', 'remove_val'), ('jciLDS', 'GPS=UBLOX', 'remove_attr'), ('jciLDS', 'reset_board=no', 'set')]:
        r_st = subprocess.run([SHELL, bp(attr_runner), bp(match_added), 'status', svc, spec, op], capture_output=True, text=True)
        assert r_st.returncode == 0 and r_st.stdout.strip() == 'installed', (r_st.stdout, r_st.stderr, svc, spec, op)
    checks += 4

    r = subprocess.run([SHELL, bp(runner), 'uninstall', bp(match_added), bp(match_inverse), bp(tab_file), bp(match_in)], capture_output=True, text=True)
    assert r.returncode == 0, (r.stdout, r.stderr)
    assert '<!-- mzd-attr-' not in match_inverse.read_text()
    assert match_inverse.read_text() == stock_match_stock
    checks += 2

    # Stock match remove_attr where XML attribute itself is absent (no args attr)
    xml_attr_stock = '<services>\n    <service name="jciTest" path="/bin/test" reset_board="yes"/>\n</services>\n'
    xml_attr_in = base / 'xml-attr-in.xml'
    write(xml_attr_in, xml_attr_stock)
    r_xa_st0 = subprocess.run([SHELL, bp(attr_runner), bp(xml_attr_in), 'status', 'jciTest', 'target=a:b:c', 'remove_attr'], capture_output=True, text=True)
    assert r_xa_st0.returncode == 0 and r_xa_st0.stdout.strip() == 'uninstalled', (r_xa_st0.stdout, r_xa_st0.stderr)
    r_xa_inst = subprocess.run([SHELL, bp(attr_runner), bp(xml_attr_in), 'install', 'jciTest', 'target=a:b:c', 'remove_attr'], capture_output=True, text=True)
    assert r_xa_inst.returncode == 0, (r_xa_inst.stdout, r_xa_inst.stderr)
    xml_attr_added = base / 'xml-attr-added.xml'
    write(xml_attr_added, r_xa_inst.stdout)
    assert 'target="a:b:c"' not in r_xa_inst.stdout
    assert '<!-- mzd-attr-target:removed_attr=absent -->' in r_xa_inst.stdout
    r_xa_st1 = subprocess.run([SHELL, bp(attr_runner), bp(xml_attr_added), 'status', 'jciTest', 'target=a:b:c', 'remove_attr'], capture_output=True, text=True)
    assert r_xa_st1.returncode == 0 and r_xa_st1.stdout.strip() == 'installed', (r_xa_st1.stdout, r_xa_st1.stderr)
    r_xa_uninst = subprocess.run([SHELL, bp(attr_runner), bp(xml_attr_added), 'uninstall', 'jciTest', 'target=a:b:c', 'remove_attr'], capture_output=True, text=True)
    assert r_xa_uninst.returncode == 0, (r_xa_uninst.stdout, r_xa_uninst.stderr)
    assert '<!-- mzd-attr-' not in r_xa_uninst.stdout
    assert r_xa_uninst.stdout == xml_attr_stock
    checks += 4

    # Stock match remove_val where attribute is empty in stock
    empty_stock = '<services>\n    <service name="jciEmpty" path="/bin/test" args="" reset_board="yes"/>\n</services>\n'
    empty_in = base / 'empty-in.xml'
    write(empty_in, empty_stock)
    r_em_st0 = subprocess.run([SHELL, bp(attr_runner), bp(empty_in), 'status', 'jciEmpty', 'args=wcp', 'remove_val'], capture_output=True, text=True)
    assert r_em_st0.returncode == 0 and r_em_st0.stdout.strip() == 'uninstalled', (r_em_st0.stdout, r_em_st0.stderr)
    r_em_inst = subprocess.run([SHELL, bp(attr_runner), bp(empty_in), 'install', 'jciEmpty', 'args=wcp', 'remove_val'], capture_output=True, text=True)
    assert r_em_inst.returncode == 0, (r_em_inst.stdout, r_em_inst.stderr)
    assert 'args=""' in r_em_inst.stdout
    assert '<!-- mzd-attr-args:removed= -->' in r_em_inst.stdout
    empty_added = base / 'empty-added.xml'
    write(empty_added, r_em_inst.stdout)
    r_em_st1 = subprocess.run([SHELL, bp(attr_runner), bp(empty_added), 'status', 'jciEmpty', 'args=wcp', 'remove_val'], capture_output=True, text=True)
    assert r_em_st1.returncode == 0 and r_em_st1.stdout.strip() == 'installed', (r_em_st1.stdout, r_em_st1.stderr)
    r_em_uninst = subprocess.run([SHELL, bp(attr_runner), bp(empty_added), 'uninstall', 'jciEmpty', 'args=wcp', 'remove_val'], capture_output=True, text=True)
    assert r_em_uninst.returncode == 0, (r_em_uninst.stdout, r_em_uninst.stderr)
    assert '<!-- mzd-attr-' not in r_em_uninst.stdout
    assert r_em_uninst.stdout == empty_stock
    checks += 4

    # Colon offset preservation and whitespace preservation in remove_attr
    colon_stock = '<services>\n    <service name="jciTest" path="/bin/test"  target="a:b:c" reset_board="yes"/>\n</services>\n'
    colon_in = base / 'colon-in.xml'
    write(colon_in, colon_stock)
    r_c_inst = subprocess.run([SHELL, bp(attr_runner), bp(colon_in), 'install', 'jciTest', 'target=a:b:c', 'remove_attr'], capture_output=True, text=True)
    assert r_c_inst.returncode == 0, (r_c_inst.stdout, r_c_inst.stderr)
    colon_added = base / 'colon-added.xml'
    write(colon_added, r_c_inst.stdout)
    assert 'target="a:b:c"' not in r_c_inst.stdout
    assert '<!-- mzd-attr-target:removed_attr=a:b:c:' in r_c_inst.stdout
    r_c_uninst = subprocess.run([SHELL, bp(attr_runner), bp(colon_added), 'uninstall', 'jciTest', 'target=a:b:c', 'remove_attr'], capture_output=True, text=True)
    assert r_c_uninst.returncode == 0, (r_c_uninst.stdout, r_c_uninst.stderr)
    assert r_c_uninst.stdout == colon_stock
    checks += 2

    # Token containing colons in remove_val
    colon_val_stock = '<services>\n    <service name="jciVal" tokens="foo:bar" reset_board="yes"/>\n</services>\n'
    colon_val_in = base / 'colon-val-in.xml'
    write(colon_val_in, colon_val_stock)
    r_v_inst = subprocess.run([SHELL, bp(attr_runner), bp(colon_val_in), 'install', 'jciVal', 'tokens=foo:bar', 'remove_val'], capture_output=True, text=True)
    assert r_v_inst.returncode == 0, (r_v_inst.stdout, r_v_inst.stderr)
    colon_val_added = base / 'colon-val-added.xml'
    write(colon_val_added, r_v_inst.stdout)
    assert 'tokens=""' in r_v_inst.stdout
    assert '<!-- mzd-attr-tokens:removed=foo:bar -->' in r_v_inst.stdout
    r_v_uninst = subprocess.run([SHELL, bp(attr_runner), bp(colon_val_added), 'uninstall', 'jciVal', 'tokens=foo:bar', 'remove_val'], capture_output=True, text=True)
    assert r_v_uninst.returncode == 0, (r_v_uninst.stdout, r_v_uninst.stderr)
    assert r_v_uninst.stdout == colon_val_stock
    checks += 2

print('CARPLAY_WIRELESS_PASSED:', checks, 'contract, preflight, install, status, and coexistence checks.')
