"""Android Auto Mod real package on synthetic CMU files; release libraries are not executed."""
from pathlib import Path
import hashlib
import os
import re
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
    if p.is_symlink():
        p.unlink()
    p.write_text(s, encoding='utf-8', newline='\n')
    p.chmod(0o755)


def md5(b):
    return hashlib.md5(b).hexdigest()


def fixture(patch, installed=False):
    lines = []
    position = 0
    for line in patch.splitlines(keepends=True):
        if line.startswith('@@ '):
            match = re.match(r'@@ -(\d+)', line)
            while len(lines) < int(match.group(1)) - 1:
                lines.append('<gap%d/>\n' % len(lines))
            position += 1
        elif position and line[:1] in [' ', '+', '-']:
            if line[:1] == ' ' or line[:1] == ('+' if installed else '-'):
                lines.append(line[1:])
    return ''.join(lines)


assert hashlib.sha256((ROOT / 'usb/tweaks/android-auto/assets/libpatch-aap_service.so').read_bytes()).hexdigest() == 'b3a63c334d90be2810e2f22289e91eb71fab94de283edb4e504e00ceac656556'
assert hashlib.sha256((ROOT / 'usb/tweaks/android-auto/assets/libpatch-blmjciaapa.so').read_bytes()).hexdigest() == 'a6b87f72ae31429cebe14eea5c6d3a4a2749d4ea643a8c73303b3437533ad5b5'
assert hashlib.sha256((ROOT / 'usb/tweaks/android-auto/assets/libpatch-svcjcinavi.so').read_bytes()).hexdigest() == '01f3939c764f6fb411b0898e77e88ffefb351404c81179070b2691f5406f9b56'

checks = 0
with tempfile.TemporaryDirectory(prefix='cmu-aa-') as temporary:
    base = Path(temporary)
    usb = base / 'usb'
    internal = base / 'internal'
    persist = base / 'persist'
    data = base / 'data'
    bins = base / 'bin'
    mounts = base / 'mounts'
    version = base / 'version'
    gpio = base / 'watchdog'
    lock = base / 'packages.lock'
    for d in [usb, internal, persist, data / 'integration', bins, base / 'locks']:
        d.mkdir(parents=True)

    startup = internal / 'scripts/stage_wifi.sh'
    write(startup, '#!/bin/sh\necho original\n')

    store = persist / 'mzd-tweaks/installed'
    config = internal / 'sm.conf'
    second = internal / 'sm_WCP.conf'
    stock = (
        '<services>\n'
        '    <service name="jciMMUI" path="/jci/mmui/example.so">\n'
        '        <dependency value="other"/>\n'
        '    </service>\n'
        '    <service name="jciAAPA" path="/jci/aapa/example.so">\n'
        '        <dependency value="other"/>\n'
        '    </service>\n'
        '    <service name="jcinavi" path="/jci/navi/example.so">\n'
        '        <dependency value="other"/>\n'
        '    </service>\n'
        '    <service name="aap_service" path="/jci/aap/example.so">\n'
        '        <dependency value="other"/>\n'
        '    </service>\n'
        '</services>\n'
    )
    write(config, stock)
    write(second, stock)

    xml_std = internal / 'aap_system_attributes.xml'
    xml_ucp = internal / 'aap_system_attributes_UCP.xml'
    patch_std = (ROOT / 'usb/tweaks/android-auto/assets/aap_system_attributes.patch').read_text(encoding='utf-8')
    patch_ucp = (ROOT / 'usb/tweaks/android-auto/assets/aap_system_attributes_UCP.patch').read_text(encoding='utf-8')
    orig_std = fixture(patch_std)
    orig_ucp = fixture(patch_ucp)
    write(xml_std, orig_std)
    write(xml_ucp, orig_ucp)

    shutil.copytree(ROOT / 'usb/lib', usb / 'lib')
    write(usb / 'installer.sh', (ROOT / 'usb/installer.sh').read_text().replace('#!/bin/sh\n', '#!/bin/sh\nPATH=' + shlex.quote(bp(bins) + ':/usr/bin:/bin') + '\nexport PATH\n', 1))
    for p in (usb / 'lib').glob('*.sh'):
        s = p.read_text().replace('/tmp/mnt/data_persist', bp(persist)).replace('/proc/mounts', bp(mounts)).replace('/jci/version.ini', bp(version))
        s = s.replace('MZD_SHIM_ROOT=/', 'MZD_SHIM_ROOT=' + shlex.quote(bp(internal)))
        s = s.replace('MZD_GUI_STARTUP_MOUNT=/', 'MZD_GUI_STARTUP_MOUNT=' + shlex.quote(bp(internal)))
        s = s.replace('/tmp/mnt/data', bp(data))
        s = s.replace('/jci/scripts/stage_wifi.sh', bp(startup))
        s = s.replace('/tmp/mzd-stage_wifi-tweak.lock', bp(base / 'locks/stage_wifi.lock'))
        s = s.replace('/tmp/mzd-gui-extension.lock', bp(base / 'locks/gui.lock'))
        s = s.replace('/tmp/mzd-packages.lock', bp(lock))
        s = s.replace('/sys/class/gpio/Watchdog\\ Disable/value', shlex.quote(bp(gpio)))
        s = s.replace('LOCK="/tmp/mzd-$LOCK_GROUP-tweak.lock"', 'LOCK="' + bp(base / 'locks') + '/$LOCK_GROUP.lock"')
        write(p, s)
    write(version, 'JCI_SW_VER="MAZ_CMU-150_74.00.324"\n')
    write(gpio, '0\n')
    write(mounts, f'/dev/root {bp(internal)} relfs ro 0 0\n/dev/data {bp(persist)} relfs rw 0 0\n/dev/usb {bp(usb)} vfat rw 0 0\n/dev/data2 {bp(data)} relfs rw 0 0\n')

    if os.environ.get('CMU_TEST_BUSYBOX'):
        busybox = shutil.which('busybox')
        assert busybox, 'BusyBox requested but missing.'
        for name in ['awk', 'patch', 'diff', 'cp', 'cmp', 'md5sum', 'cut', 'readlink', 'dirname',
                     'mktemp', 'mkdir', 'rm', 'cat', 'grep', 'od', 'dd']:
            os.symlink(busybox, bins / name)

    write(bins / 'sync', '#!/bin/sh\nexit 0\n')
    write(bins / 'df', '#!/bin/sh\nprintf "Filesystem 1024-blocks Used Available Capacity Mounted\\nfixture 1000000 1 900000 1%% internal\\n"\n')
    write(bins / 'mount', '#!/bin/sh\nexit 0\n')
    for name in ['lua', 'setsid']:
        write(bins / name, '#!/bin/sh\nexit 0\n')
    with (usb / 'lib/gui-services.sh').open('a', encoding='utf-8') as f:
        f.write('\nmzd_gui_services_stop() { :; }\n')
        f.write('mzd_gui_services_start() { :; }\n')
    write(bins / 'dbus-send', '''#!/bin/sh
case "${TEST_HUD:-whud}:$*" in
    none:*byte:13*) printf '   byte 0\\n' ;;
    unknown:*) exit 1 ;;
    mono:*byte:13*) printf '   byte 1\\n' ;;
    mono:*byte:26*) printf '   byte 0\\n' ;;
    combiner:*byte:13*) printf '   byte 1\\n' ;;
    combiner:*byte:26*) printf '   byte 1\\n' ;;
    whud:*byte:13*) printf '   byte 1\\n' ;;
    whud:*byte:26*) printf '   byte 2\\n' ;;
    *) exit 1 ;;
esac
''')

    env = dict(os.environ, PATH=bp(bins) + ':/usr/bin:/bin')

    folder = usb / 'tweaks/android-auto'
    shutil.copytree(ROOT / 'usb/tweaks/android-auto', folder)
    payload_dir = persist / 'oem-aa-mod'

    m = (folder / 'manifest.conf').read_text().replace('/jci/sm/sm.conf', bp(config)).replace('74d9fc389b74fb01d0cfc2615a82c782', md5(stock.encode()))
    m = m.replace('/tmp/mnt/data_persist/oem-aa-mod', bp(payload_dir))
    write(folder / 'manifest.conf', m)

    table = (folder / 'components.tsv').read_text()
    replacements = {
        '/jci/sm/sm.conf': bp(config),
        '/jci/sm/sm_WCP.conf': bp(second),
        '74d9fc389b74fb01d0cfc2615a82c782': md5(stock.encode()),
        '030e918f5d6edcd62d196ee37b86fe99': md5(stock.encode()),
        '/tmp/mnt/data_persist': bp(persist),
        '/etc/aap_system_attributes.xml': bp(xml_std),
        '58e287b8fb677d41307178f3b425d09a': md5(xml_std.read_bytes()),
        '/etc/aap_system_attributes_UCP.xml': bp(xml_ucp),
        '357c4fe93baf5a948cf3a70157a4607e': md5(xml_ucp.read_bytes())
    }
    for old, new in replacements.items():
        table = table.replace(old, new)
    write(folder / 'components.tsv', table)

    def call(args, code=0):
        global checks
        command = 'exec /bin/sh ' + ' '.join(shlex.quote(a) for a in [bp(usb / 'installer.sh'), *args])
        r = subprocess.run([SHELL, '-c', command], env=env, capture_output=True, text=True, timeout=150)
        assert r.returncode == code, (args, r.returncode, r.stdout, r.stderr)
        checks += 1
        return r

    def deep(worker, settings, state):
        global checks
        cfg = dict(env, MZD_WORKER_DIRECT='1', MZD_SETTINGS_FILE=bp(settings))
        before = {p.relative_to(usb).as_posix(): hashlib.md5(p.read_bytes()).hexdigest() for p in usb.rglob('*') if p.is_file()}
        r = subprocess.run([SHELL, '-c', 'exec /bin/sh ' + shlex.quote(bp(worker)) + ' status'], env=cfg, capture_output=True, text=True, timeout=90)
        assert r.returncode == 0 and r.stdout == state + '\n', (r.returncode, r.stdout, r.stderr)
        assert before == {p.relative_to(usb).as_posix(): hashlib.md5(p.read_bytes()).hexdigest() for p in usb.rglob('*') if p.is_file()}, 'Status wrote to USB'
        checks += 1
        return r

    # Status before installation
    r = call(['statuses', 'android-auto'])
    assert 'android-auto\tuninstalled\t\n' in r.stdout

    settings_file = base / 'settings.conf'
    write(settings_file, 'resolution_dpi=141\nresolution_par=10670\n')
    deep(folder / 'run.sh', settings_file, 'uninstalled')

    # Target missing -> unavailable
    config.unlink()
    r = deep(folder / 'run.sh', settings_file, 'unavailable')
    assert 'Missing target' in r.stderr
    write(config, stock)

    # Manifest and preflight checks
    call(['manifest', 'android-auto'])
    env['TEST_HUD'] = 'whud'
    r = call(['preflight-info', 'android-auto'])
    assert 'info\tDetected supported Windshield HUD' in r.stdout

    env['TEST_HUD'] = 'mono'
    r = call(['preflight-info', 'android-auto'])
    assert 'warning\tDetected Combiner HUD (monochrome)' in r.stdout

    env['TEST_HUD'] = 'combiner'
    r = call(['preflight-info', 'android-auto'])
    assert 'warning\tDetected Combiner HUD (color)' in r.stdout

    env['TEST_HUD'] = 'none'
    r = call(['preflight-info', 'android-auto'])
    assert 'warning\tThis vehicle has no HUD' in r.stdout

    env['TEST_HUD'] = 'unknown'
    r = call(['preflight-info', 'android-auto'])
    assert 'warning\tUnknown HUD type' in r.stdout
    env['TEST_HUD'] = 'whud'

    # Foreign AA Mod shim in primary loader (sm.conf) must block installation
    foreign = stock.replace('<dependency value="other"/>', '<environ_var env_name="LD_PRELOAD" env_value="/data_persist/oem-aa-mod/libpatch-blmjciaapa.so"/>', 1)
    write(config, foreign)
    r = call(['preflight-info', 'android-auto'], 1)
    assert 'already referenced' in r.stdout
    call(['action', 'android-auto', 'install'], 1)
    assert config.read_text() == foreign and not payload_dir.exists()
    write(config, stock)

    # Foreign AA Mod shim in secondary loader (sm_WCP.conf) must also block installation
    foreign_wcp = stock.replace('<dependency value="other"/>', '<environ_var env_name="LD_PRELOAD" env_value="/data_persist/oem-aa-mod/libpatch-svcjcinavi.so"/>', 1)
    write(second, foreign_wcp)
    r = call(['preflight-info', 'android-auto'], 1)
    assert 'already referenced' in r.stdout
    call(['action', 'android-auto', 'install'], 1)
    assert second.read_text() == foreign_wcp and not payload_dir.exists()
    write(second, stock)

    # Cluster-language shim must not block android-auto
    cluster_shim = stock.replace('<dependency value="other"/>', '<environ_var env_name="LD_PRELOAD" env_value="/data_persist/cluster-language/libpatch-svcjciblmsettings.so"/>', 1)
    write(config, cluster_shim)
    r = call(['preflight-info', 'android-auto'])
    assert 'info\tDetected supported Windshield HUD' in r.stdout and 'already referenced' not in r.stdout
    write(config, stock)

    # Manifest settings defaults
    info = call(['settings-info', 'android-auto']).stdout
    assert 'value.resolution_dpi=141' in info and 'value.resolution_par=10670' in info

    # User settings defaults override via USB user/<id>/settings.conf
    user_dir = usb / 'user/android-auto'
    write(user_dir / 'settings.conf', '# Custom user defaults\nresolution_dpi=153\nresolution_par=15800\n')
    info = call(['settings-info', 'android-auto']).stdout
    assert 'value.resolution_dpi=153' in info and 'value.resolution_par=15800' in info

    # User asset override via USB user/<id>/libpatch.conf
    # The override replaces bundled assets/libpatch.conf entirely (not merged)
    custom_asset_content = 'use_protocol_v1_6 = false\naa_audio_low_latency = true\n'
    write(user_dir / 'libpatch.conf', custom_asset_content)

    # libpatch.conf exceeding 64 KB size limit is rejected before mutation
    write(user_dir / 'libpatch.conf', 'x' * 65537)
    r = call(['action', 'android-auto', 'install'], 1)
    assert 'exceeds size limit of 64 KB: libpatch.conf' in r.stderr
    write(user_dir / 'libpatch.conf', custom_asset_content)

    # Invalid setting argument rejected before mutation
    call(['action', 'android-auto', 'install', 'resolution_dpi=99'], 1)
    assert not payload_dir.exists() and config.read_text() == stock and xml_std.read_text() == orig_std

    # Install using user defaults and asset overrides
    call(['action', 'android-auto', 'install'])

    # Verify payloads: libpatch.conf is replaced entirely, not merged with bundled keys
    assert (payload_dir / 'libpatch-blmjciaapa.so').read_bytes() == (folder / 'assets/libpatch-blmjciaapa.so').read_bytes()
    assert (payload_dir / 'libpatch-svcjcinavi.so').read_bytes() == (folder / 'assets/libpatch-svcjcinavi.so').read_bytes()
    assert (payload_dir / 'libpatch-aap_service.so').read_bytes() == (folder / 'assets/libpatch-aap_service.so').read_bytes()
    assert (payload_dir / 'libpatch.conf').read_text() == custom_asset_content
    assert 'touch_enable' not in (payload_dir / 'libpatch.conf').read_text()
    assert 'hu_headunit_communication' not in (payload_dir / 'libpatch.conf').read_text()

    # Verify loader entries in SM configs
    for path in [config, second]:
        text = path.read_text()
        aapa = text.split('<service name="jciAAPA"')[1].split('</service>')[0]
        navi = text.split('<service name="jcinavi"')[1].split('</service>')[0]
        aaps = text.split('<service name="aap_service"')[1].split('</service>')[0]
        mmui = text.split('<service name="jciMMUI"')[1].split('</service>')[0]
        assert 'libpatch-blmjciaapa.so' in aapa
        assert 'libpatch-svcjcinavi.so' in navi
        assert 'libpatch-aap_service.so' in aaps
        assert 'libpatch-' not in mmui

    # Verify dynamic patch applied DPI=153 and PAR=15800 into XML targets
    std_patched = xml_std.read_text()
    ucp_patched = xml_ucp.read_text()
    for text in [std_patched, ucp_patched]:
        assert '<density>153</density>' in text
        assert '<real_density>153</real_density>' in text
        assert '<par>15800</par>' in text
        assert '<subscribe>TRUE</subscribe>' in text
    config_patched = config.read_text()
    second_patched = second.read_text()

    # Verify GUI module and shared integration
    gui_module = data / 'integration/mzd-gui-modules/android-auto'
    assert (gui_module / 'manifest.conf').exists()
    assert (gui_module / 'assets/view.html').exists()
    assert (gui_module / 'assets/view.js').exists()
    assert (gui_module / 'assets/resident.js').exists()
    assert (gui_module / 'assets/service/entry.lua').exists()
    assert (gui_module / 'assets/i18n.js').exists()
    assert (data / 'integration/developer_mode_GuiConfig.js').exists()
    assert (data / 'integration/mzd-gui-runtime').exists()
    assert (data / 'integration/mzd-gui-registry.js').exists()
    assert (data / 'integration/mzd-gui-services.tsv').read_text().strip() == 'android-auto\tassets/service/entry.lua'
    assert '# MZD shared GUI services' in startup.read_text()
    assert (persist / 'mzd-tweaks/gui-data/android-auto/owner').read_text() == 'MZD_GUI_DATA_V1\nandroid-auto\n'

    # Verify persistent package and settings
    saved = store / 'android-auto/package'
    saved_settings = (saved / 'settings.conf').read_text()
    assert 'resolution_dpi=153\n' in saved_settings and 'resolution_par=15800\n' in saved_settings
    assert (saved / 'tweaks/android-auto/assets/libpatch.conf').read_text() == custom_asset_content

    # Fast and deep status installed
    r = call(['statuses', 'android-auto'])
    assert 'android-auto\tinstalled\t\n' in r.stdout
    deep(saved / 'tweaks/android-auto/run.sh', saved / 'settings.conf', 'installed')

    # Tamper detection
    orig_bytes = (payload_dir / 'libpatch-blmjciaapa.so').read_bytes()
    (payload_dir / 'libpatch-blmjciaapa.so').write_bytes(b'tampered binary payload')
    r = deep(saved / 'tweaks/android-auto/run.sh', saved / 'settings.conf', 'broken')
    assert 'payload differs' in r.stderr
    (payload_dir / 'libpatch-blmjciaapa.so').write_bytes(orig_bytes)

    # Status aggregation: native installed but GUI uninstalled -> broken
    temp_gui = base / 'temp-gui-module'
    state_conf = store / 'android-auto/state.conf'
    orig_state = state_conf.read_text()
    gui_module.rename(temp_gui)
    state_conf.unlink()
    r = deep(saved / 'tweaks/android-auto/run.sh', saved / 'settings.conf', 'broken')
    assert 'partially installed: native installed, GUI uninstalled' in r.stderr
    write(state_conf, orig_state)
    temp_gui.rename(gui_module)
    deep(saved / 'tweaks/android-auto/run.sh', saved / 'settings.conf', 'installed')

    # Status aggregation: native uninstalled but GUI installed -> broken
    temp_payload = base / 'temp-payload'
    payload_dir.rename(temp_payload)
    config.write_text(stock)
    second.write_text(stock)
    xml_std.write_text(orig_std)
    xml_ucp.write_text(orig_ucp)
    r = deep(saved / 'tweaks/android-auto/run.sh', saved / 'settings.conf', 'broken')
    assert 'partially installed: native uninstalled, GUI installed' in r.stderr
    temp_payload.rename(payload_dir)
    config.write_text(config_patched)
    second.write_text(second_patched)
    xml_std.write_text(std_patched)
    xml_ucp.write_text(ucp_patched)
    deep(saved / 'tweaks/android-auto/run.sh', saved / 'settings.conf', 'installed')

    # Ignored *.tmp staging files in payload_dir must not fail status check
    (payload_dir / 'staging.tmp').write_text('temporary staging payload')
    deep(saved / 'tweaks/android-auto/run.sh', saved / 'settings.conf', 'installed')
    (payload_dir / 'staging.tmp').unlink()

    # Failed loader replacement during uninstall must roll back both native and GUI components
    real_mv = (shlex.quote(bp(shutil.which('busybox'))) + ' mv') if os.environ.get('CMU_TEST_BUSYBOX') else shlex.quote(bp(shutil.which('mv') or '/bin/mv'))
    write(bins / 'mv', f'''#!/bin/sh
for value do case "$value" in {shlex.quote(bp(config))}.mzd-restore-*) exit 1 ;; esac; done
exec {real_mv} "$@"
''')
    call(['action', 'android-auto', 'uninstall'], 1)
    (bins / 'mv').unlink()

    # Native installation remains intact
    assert (payload_dir / 'libpatch-blmjciaapa.so').read_bytes() == (folder / 'assets/libpatch-blmjciaapa.so').read_bytes()
    assert (payload_dir / 'libpatch-svcjcinavi.so').read_bytes() == (folder / 'assets/libpatch-svcjcinavi.so').read_bytes()
    assert (payload_dir / 'libpatch-aap_service.so').read_bytes() == (folder / 'assets/libpatch-aap_service.so').read_bytes()
    assert (payload_dir / 'libpatch.conf').read_text() == custom_asset_content
    for path in [config, second]:
        text = path.read_text()
        assert 'libpatch-blmjciaapa.so' in text
        assert 'libpatch-svcjcinavi.so' in text
        assert 'libpatch-aap_service.so' in text
    for text in [xml_std.read_text(), xml_ucp.read_text()]:
        assert '<density>153</density>' in text
        assert '<par>15800</par>' in text

    # GUI installation remains intact
    assert (gui_module / 'manifest.conf').exists()
    assert (gui_module / 'assets/view.html').exists()
    assert (data / 'integration/developer_mode_GuiConfig.js').exists()
    assert (data / 'integration/mzd-gui-runtime').exists()
    assert (data / 'integration/mzd-gui-registry.js').exists()
    assert 'android-auto' in (data / 'integration/mzd-gui-registry.js').read_text()
    assert (data / 'integration/mzd-gui-services.tsv').read_text().strip() == 'android-auto\tassets/service/entry.lua'
    assert '# MZD shared GUI services' in startup.read_text()

    # Deep status confirms installed state after rollback
    deep(saved / 'tweaks/android-auto/run.sh', saved / 'settings.conf', 'installed')
    assert not lock.exists() and gpio.read_text() == '0\n'
    assert not list(internal.glob('*.mzd-restore-*'))

    # A failed native rollback followed by a successful GUI rollback must report exit code 2 and critical cleanup warning
    failed = base / 'write-failed'
    write(bins / 'mv', f'''#!/bin/sh
for value do
    case "$value" in
        {shlex.quote(bp(second))}.mzd-restore-*)
            touch {shlex.quote(bp(failed))}
            exit 1
            ;;
        {shlex.quote(bp(config))}.mzd-restore-*)
            [ ! -f {shlex.quote(bp(failed))} ] || exit 1
            ;;
    esac
done
exec {real_mv} "$@"
''')
    r = call(['action', 'android-auto', 'uninstall'], 2)
    assert 'Cleanup failed; system state could not be fully restored. Do NOT reboot.' in r.stderr
    (bins / 'mv').unlink()
    failed.unlink()

    # The installation remained incomplete, but GUI rollback succeeded
    assert 'libpatch-blmjciaapa.so' not in config.read_text()
    assert 'libpatch-blmjciaapa.so' in second.read_text()
    assert (gui_module / 'manifest.conf').exists()
    assert (gui_module / 'assets/view.html').exists()
    assert (data / 'integration/developer_mode_GuiConfig.js').exists()
    assert (data / 'integration/mzd-gui-runtime').exists()
    assert (data / 'integration/mzd-gui-registry.js').exists()
    assert 'android-auto' in (data / 'integration/mzd-gui-registry.js').read_text()
    assert (data / 'integration/mzd-gui-services.tsv').read_text().strip() == 'android-auto\tassets/service/entry.lua'
    assert '# MZD shared GUI services' in startup.read_text()

    # Restore first loader so saved uninstall can restore baseline
    write(config, second.read_text())

    # Saved uninstall restores baseline
    call(['action', 'android-auto', 'uninstall'])
    assert config.read_text() == stock and second.read_text() == stock
    assert xml_std.read_text() == orig_std and xml_ucp.read_text() == orig_ucp
    assert not payload_dir.exists()
    assert not gui_module.exists()
    assert not (data / 'integration/developer_mode_GuiConfig.js').exists()
    assert not (data / 'integration/mzd-gui-runtime').exists()
    assert startup.read_text() == '#!/bin/sh\necho original\n'
    assert not lock.exists() and gpio.read_text() == '0\n'

    r = call(['statuses', 'android-auto'])
    assert 'android-auto\tuninstalled\t\n' in r.stdout

    # A missing shared GUI boot hook must not block native or GUI cleanup
    call(['action', 'android-auto', 'install'])
    (data / 'integration/developer_mode_GuiConfig.js').unlink()
    call(['action', 'android-auto', 'uninstall'])
    assert config.read_text() == stock and second.read_text() == stock
    assert xml_std.read_text() == orig_std and xml_ucp.read_text() == orig_ucp
    assert not payload_dir.exists()
    assert not gui_module.exists()
    assert not (data / 'integration/developer_mode_GuiConfig.js').exists()
    assert not (data / 'integration/mzd-gui-runtime').exists()
    assert startup.read_text() == '#!/bin/sh\necho original\n'

    # Reinstall to test reset hook lifecycle
    call(['action', 'android-auto', 'install'])
    saved_tweak = saved / 'tweaks/android-auto'
    archive = base / 'reset-archive'
    if archive.exists():
        shutil.rmtree(archive)
    archive.mkdir()
    system = base / 'reset-system'
    if not system.exists():
        system.mkdir()
    write(system / 'mounts', '')
    write(system / 'locks', '')
    reset_script = base / 'reset-hook.sh'
    write(reset_script, f'''ROOT={shlex.quote(bp(saved))}
HERE={shlex.quote(bp(saved_tweak))}
MZD_SETTINGS_FILE={shlex.quote(bp(saved / 'settings.conf'))}
ACTION=run
MZD_RESET_DIR={shlex.quote(bp(archive))}
MZD_SYSTEM={shlex.quote(bp(system))}
. "$ROOT/lib/bundle.sh"
mzd_bundle_reset_main "$1"
''')
    def run_reset(phase, expected=0):
        global checks
        r = subprocess.run([SHELL, bp(reset_script), phase], env=env, capture_output=True, text=True, timeout=20)
        assert r.returncode == expected, (phase, r.returncode, r.stdout, r.stderr)
        checks += 1
        return r

    # Restore preflight and preparation tolerate a missing shared GUI boot hook
    (data / 'integration/developer_mode_GuiConfig.js').unlink()
    # Restore preflight must fail when a native payload is modified
    (payload_dir / 'libpatch-blmjciaapa.so').write_bytes(b'modified shim payload')
    r = run_reset('check', 1)
    assert 'Unknown payload; reset refused' in r.stderr
    (payload_dir / 'libpatch-blmjciaapa.so').write_bytes(orig_bytes)

    # Ignored *.tmp in payload_dir must not fail reset check
    (payload_dir / 'staging.tmp').write_text('temporary staging payload')
    run_reset('check')
    (payload_dir / 'staging.tmp').unlink()

    run_reset('check')
    run_reset('prepare')
    assert len(list(archive.glob('payload-*'))) == 3
    # During prepare phase, GUI module is uninstalled and archived
    assert not gui_module.exists()
    assert not (data / 'integration/developer_mode_GuiConfig.js').exists()
    # Finish refuses until targets are restored to OEM hash
    run_reset('finish', 1)

    # Restoring OEM backups allows finish to succeed
    for path in [config, second]:
        shutil.copyfile(path.with_name(path.name + '.org'), path)
    for path in [xml_std, xml_ucp]:
        shutil.copyfile(path.with_name(path.name + '.org'), path)
    run_reset('finish')
    assert not (payload_dir / 'libpatch-blmjciaapa.so').exists()
    assert (payload_dir / 'libpatch.conf').exists()
    assert not gui_module.exists()
    shutil.rmtree(store / 'android-auto')
    (payload_dir / 'libpatch.conf').unlink()
    payload_dir.rmdir()
    for lock_file in (base / 'locks').glob('*.lock'):
        if lock_file.is_dir():
            shutil.rmtree(lock_file)
        else:
            lock_file.unlink()

    # Test installation with explicit command-line settings overriding user defaults
    call(['action', 'android-auto', 'install', 'resolution_dpi=103', 'resolution_par=10670'])
    std_103 = xml_std.read_text()
    assert '<density>103</density>' in std_103 and '<par>10670</par>' in std_103
    call(['action', 'android-auto', 'uninstall'])
    assert xml_std.read_text() == orig_std

    # Default DPI 141 keeps the stock density line as context (no reversed hunk)
    call(['action', 'android-auto', 'install', 'resolution_dpi=141', 'resolution_par=10670'])
    for path in [xml_std, xml_ucp]:
        text = path.read_text()
        assert text.count('<density>141</density>') == 1, text
        assert '<real_density>141</real_density>' in text and '<par>10670</par>' in text
    r = call(['statuses', 'android-auto'])
    assert 'android-auto\tinstalled\t\n' in r.stdout
    call(['action', 'android-auto', 'uninstall'])
    assert xml_std.read_text() == orig_std and xml_ucp.read_text() == orig_ucp
    assert config.read_text() == stock and second.read_text() == stock and not payload_dir.exists()

    # Verify Lua config serializer line matching, staging directory and error cleanup
    lua = shutil.which('lua5.1') or shutil.which('lua')
    if lua:
        entry_path = bp(ROOT / "usb/tweaks/android-auto/assets/service/entry.lua")
        conf_path = bp(base / "test_libpatch.conf")
        gui_data = base / "test_gui_data"
        gui_data.mkdir(exist_ok=True)
        gui_data_dir = bp(gui_data)
        lua_code = f'''
package.preload["lfs"] = function() return {{ mkdir = function() end }} end
local factory = assert(loadfile("{entry_path}"))()
local conf = "{conf_path}"
local staging = "{gui_data_dir}"
local content = "touch = true\\nhud = true\\n"
local written_paths = {{}}
local removed_paths = {{}}
local files = {{
    exists = function(p)
        if p == staging then return true end
        local f = io.open(p, "r"); if f then f:close(); return true end; return false
    end,
    read = function(p) local f = io.open(p, "r"); if not f then return nil end; local s = f:read("*a"); f:close(); return s end,
    write_new = function(p, c)
        table.insert(written_paths, p)
        local f = assert(io.open(p, "w")); f:write(c); f:close()
    end,
    rename = function(src, dst) assert(os.rename(src, dst)) end,
    remove_if_exists = function(p)
        table.insert(removed_paths, p)
        os.remove(p)
    end,
    random = function() return "123" end,
    sync_directory = function() end
}}
files.write_new(conf, content)

-- 1. Test repeated set operations do not cause newline bloat
local service = factory({{ files = files, data = staging, config = {{ libpatch = conf }} }})
for i = 1, 5 do
    service.request("set", {{ key = "touch", value = (i % 2 == 0) }})
end
local res = files.read(conf)
local _, newlines = res:gsub("\\n", "\\n")
assert(newlines == 2, "Unexpected newline count after sets: " .. tostring(newlines) .. " in: " .. res)

-- Verify staging writes were directed to staging directory outside payload
local used_staging = false
for _, p in ipairs(written_paths) do
    if p:find(staging, 1, true) then used_staging = true end
end
assert(used_staging, "Expected temporary writes in staging directory")

-- 2. Test save operation with multiple keys does not cause newline bloat
service.request("save", {{ settings = {{ touch = true, hud = false, force_street_name = true }} }})
local res_save = files.read(conf)
local _, newlines_save = res_save:gsub("\\n", "\\n")
assert(newlines_save == 3, "Unexpected newline count after save: " .. tostring(newlines_save) .. " in: " .. res_save)

-- 3. Test failure during write/rename cleans up temporary file
files.rename = function(src, dst) error("Simulated disk error during rename") end
local ok, err = pcall(function()
    service.request("set", {{ key = "touch", value = false }})
end)
assert(not ok, "Expected operation to fail on rename error")
assert(#removed_paths > 0, "Temporary staging file should be cleaned up on failure")
'''
        r = subprocess.run([lua, '-e', lua_code], capture_output=True, text=True)
        assert r.returncode == 0, (r.returncode, r.stdout, r.stderr)
        checks += 1

    print('ANDROID_AUTO_PASSED:', checks, 'real package checks; shims, XML patch hook, user settings defaults and asset overrides, saved uninstall.')
