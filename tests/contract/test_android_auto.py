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
    bins = base / 'bin'
    mounts = base / 'mounts'
    version = base / 'version'
    gpio = base / 'watchdog'
    lock = base / 'packages.lock'
    for d in [usb, internal, persist, bins, base / 'locks']:
        d.mkdir()

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
        s = s.replace('/tmp/mzd-packages.lock', bp(lock))
        s = s.replace('/sys/class/gpio/Watchdog\\ Disable/value', shlex.quote(bp(gpio)))
        s = s.replace('LOCK="/tmp/mzd-$LOCK_GROUP-tweak.lock"', 'LOCK="' + bp(base / 'locks') + '/$LOCK_GROUP.lock"')
        write(p, s)
    write(version, 'JCI_SW_VER="MAZ_CMU-150_74.00.324"\n')
    write(gpio, '0\n')
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
    call(['action', 'android-auto', 'status'], output='uninstalled\n') if hasattr(call, 'dummy') else None
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
    assert not r.stdout, 'WHUD_color should not emit warnings or blocks'

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

    # Reset hook check
    saved_tweak = saved / 'tweaks/android-auto'
    archive = base / 'reset-archive'
    archive.mkdir()
    system = base / 'reset-system'
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

    run_reset('check')
    run_reset('prepare')
    assert len(list(archive.glob('payload-*'))) == 4
    # Finish refuses until targets are restored to OEM hash
    run_reset('finish', 1)

    # Saved uninstall restores baseline
    call(['action', 'android-auto', 'uninstall'])
    assert config.read_text() == stock and second.read_text() == stock
    assert xml_std.read_text() == orig_std and xml_ucp.read_text() == orig_ucp
    assert not payload_dir.exists()
    assert not lock.exists() and gpio.read_text() == '0\n'

    r = call(['statuses', 'android-auto'])
    assert 'android-auto\tuninstalled\t\n' in r.stdout

    # Test installation with explicit command-line settings overriding user defaults
    call(['action', 'android-auto', 'install', 'resolution_dpi=103', 'resolution_par=10670'])
    std_103 = xml_std.read_text()
    assert '<density>103</density>' in std_103 and '<par>10670</par>' in std_103
    call(['action', 'android-auto', 'uninstall'])
    assert xml_std.read_text() == orig_std

    print('ANDROID_AUTO_PASSED:', checks, 'real package checks; shims, XML patch hook, user settings defaults and asset overrides, saved uninstall.')
