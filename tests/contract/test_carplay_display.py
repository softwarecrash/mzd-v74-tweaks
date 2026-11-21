"""CarPlay Display real package on synthetic CMU files."""
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
    if p.is_symlink():
        p.unlink()
    p.write_text(s, encoding='utf-8', newline='\n')
    p.chmod(0o755)


def md5(b):
    return hashlib.md5(b).hexdigest()


OEM_MD5 = 'b420a8a510aa8e3de24c04430dd07638'
stock_xml = (
    '<?xml version="1.0" encoding="utf-8"?>\n'
    '<CARPLAY_CREATE_CONFIGURATION>\n\n'
    '\t<!--\n'
    '\t\tvehicleType is must be set.\n'
    '\t\tvehicleType is one of the following:\n'
    '\t\t\tJ03, J12, J36, J53, J71, J72, J78, J5L, default.\n'
    '\t\tvehicleType option: can add brand name, except vehicleType is default.\n'
    '\t\t\tMAZDA, FIAT.\n'
    '\t\t\n'
    '\t\tFor Excample:\n'
    '\t\t\tJ03, J12, J12:MAZDA, J12:FIAT, etc...\n'
    '\t\t\n'
    '\t\tsearch action\n'
    '\t\t\t1 : search : match vehicle type and brand\n'
    '\t\t\t2 : search : match only vehicle type\n'
    '\t\t\t3 : search : default\n'
    '\t\t\t4 : startup failed\n\n'
    '\t\tIn same tag except oemIconInfoSet, if there are two or more tags with same name and vehicleType, it is not guaranteed which one will be used.\n'
    '\t\tIn oemIconInfoSet, same name, vehicleType and num instead.\n'
    '\t-->\n\n\n'
    '\t<!-- default -->\n'
    '\t<name vehicleType="default" value="CarPlay"/>\n'
    '\t<model vehicleType="default" value="Mazda"/>\n'
    '\t<hwRevision vehicleType="default" value="1.0.0"/>\n'
    '\t<manufacture vehicleType="default" value="Mazda"/>\n\n'
    '\t<oemIconLength vehicleType="default" value="4"/>\n'
    '\t<oemIconEnabled vehicleType="default" value="TRUE"/>\n'
    '\t<oemIconLabel vehicleType="default" value="Mazda"/>\n\n'
    '\t<oemIconInfoSet vehicleType="default" num="0" heightPixel="104" widthPixel="104" filePath="/jci/carplay/Logo_Mazda_Mask-icon_104.png" preRendered="FALSE" />\n'
    '\t<oemIconInfoSet vehicleType="default" num="1" heightPixel="120" widthPixel="120" filePath="/jci/carplay/Logo_Mazda_Full-bleed-icon_120.png" preRendered="TRUE" />\n'
    '\t<oemIconInfoSet vehicleType="default" num="2" heightPixel="180" widthPixel="180" filePath="/jci/carplay/Logo_Mazda_Full-bleed-icon_180.png" preRendered="TRUE" />\n'
    '\t<oemIconInfoSet vehicleType="default" num="3" heightPixel="256" widthPixel="256" filePath="/jci/carplay/Logo_Mazda_Full-bleed-icon_256.png" preRendered="TRUE" />\n\n'
    '\t<osInfo vehicleType="default" value="Linux cmu 3.0.35 armv7l 32"/>\n\n'
    '\t<limitedUiEnabled vehicleType="default" value="TRUE"/>\n'
    '\t<screenInfo  vehicleType="default" uuid="" uuidIsNull="TRUE" heightPixel="480" widthPixel="800" heightPhysical="85" widthPhysical="154" fps="60"/>\n'
    '\t<touchInfo   vehicleType="default" uuid="" uuidIsNull="TRUE" countryCode="33" vendorId="7434" productId="34827" lowFidelity="TRUE" multiTouch="FALSE" minx="0" maxx="800" miny="0" maxy="480" />\n'
    '\t<knobInfo    vehicleType="default" uuid="" uuidIsNull="TRUE" countryCode="33" vendorId="7434" productId="34827" cmin="-128" cmax="127" />\n'
    '\t<playKeyInfo vehicleType="default" uuid="" uuidIsNull="TRUE" countryCode="33" vendorId="7434" productId="34827" />\n'
    '\t<telKeyInfo  vehicleType="default" uuid="" uuidIsNull="TRUE" countryCode="33" vendorId="7434" productId="34827" />\n'
    '\t\n\t\n'
    '\t<!-- example\n'
    '    \t<model vehicleType="J03" value="Mazda J03"/>\n'
    '\t    <model vehicleType="J12" value="Mazda J12"/>\n'
    '\t    <model vehicleType="J36" value="Mazda J36"/>\n'
    '\t    <model vehicleType="J53" value="Mazda J53"/>\n'
    '\t    <model vehicleType="J71" value="Mazda J71"/>\n'
    '\t    <model vehicleType="J72" value="Mazda J72"/>\n'
    '\t    <model vehicleType="J78" value="Mazda J78"/>\n'
    '\t    <model vehicleType="J5L" value="Mazda J5L"/>\n'
    '    -->\n'
    '</CARPLAY_CREATE_CONFIGURATION>\n\n'
)
assert md5(stock_xml.encode('utf-8')) == OEM_MD5

checks = 0
with tempfile.TemporaryDirectory(prefix='cmu-carplay-') as temporary:
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
        d.mkdir(parents=True)

    store = persist / 'mzd-tweaks/installed'
    target = internal / 'carplay_config_create.xml'
    write(target, stock_xml)

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

    env = dict(os.environ, PATH=bp(bins) + ':/usr/bin:/bin')

    folder = usb / 'tweaks/carplay-display'
    shutil.copytree(ROOT / 'usb/tweaks/carplay-display', folder)

    m = (folder / 'manifest.conf').read_text().replace('/jci/carplay/carplay_config_create.xml', bp(target))
    write(folder / 'manifest.conf', m)

    table = (folder / 'components.tsv').read_text().replace('/jci/carplay/carplay_config_create.xml', bp(target))
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

    # Initial status
    r = call(['statuses', 'carplay-display'])
    assert 'carplay-display\tuninstalled\t\n' in r.stdout

    settings_file = base / 'settings.conf'
    write(settings_file, 'display_size=177x100\n')
    deep(folder / 'run.sh', settings_file, 'uninstalled')

    # Manifest and settings-info checks
    call(['manifest', 'carplay-display'])
    info = call(['settings-info', 'carplay-display']).stdout
    assert 'value.display_size=154x85' in info
    assert 'settings_saved=false' in info

    # Corrupted user settings: ignored and loads defaults with warning
    user_conf = usb / 'user/carplay-display/settings.conf'
    write(user_conf, 'display_size=invalid_size\n')
    r = call(['settings-info', 'carplay-display'])
    assert 'value.display_size=154x85' in r.stdout
    assert 'warning.1=Invalid default for display_size: invalid_size' in r.stdout
    assert 'Invalid default for display_size: invalid_size' in r.stderr

    # Install when user settings file is corrupted: uses manifest defaults
    call(['action', 'carplay-display', 'install'])
    saved = store / 'carplay-display/package'
    saved_settings = (saved / 'settings.conf').read_text()
    assert 'display_size=154x85\n' in saved_settings
    assert 'heightPhysical="85" widthPhysical="154"' in target.read_text()
    call(['action', 'carplay-display', 'uninstall'])
    assert md5(target.read_bytes()) == OEM_MD5
    user_conf.unlink()

    # Valid user defaults override via user/carplay-display/settings.conf
    write(user_conf, '# Custom user default\ndisplay_size=244x92\n')
    info = call(['settings-info', 'carplay-display']).stdout
    assert 'value.display_size=244x92' in info

    # Install using user defaults
    call(['action', 'carplay-display', 'install'])
    assert (saved / 'settings.conf').read_text() == 'display_size=244x92\n'
    assert 'heightPhysical="92" widthPhysical="244"' in target.read_text()
    r = call(['statuses', 'carplay-display'])
    assert 'carplay-display\tinstalled\t\n' in r.stdout
    deep(saved / 'tweaks/carplay-display/run.sh', saved / 'settings.conf', 'installed')

    call(['action', 'carplay-display', 'uninstall'])
    assert md5(target.read_bytes()) == OEM_MD5
    user_conf.unlink()

    # Test each display size via explicit arguments
    sizes = [
        ('154x85', 'heightPhysical="85" widthPhysical="154"'),
        ('177x100', 'heightPhysical="100" widthPhysical="177"'),
        ('244x92', 'heightPhysical="92" widthPhysical="244"'),
        ('297x113', 'heightPhysical="113" widthPhysical="297"'),
    ]

    for val, expected_attr in sizes:
        call(['action', 'carplay-display', 'install', f'display_size={val}'])
        assert (saved / 'settings.conf').read_text() == f'display_size={val}\n'
        assert expected_attr in target.read_text()
        deep(saved / 'tweaks/carplay-display/run.sh', saved / 'settings.conf', 'installed')
        call(['action', 'carplay-display', 'uninstall'])
        assert md5(target.read_bytes()) == OEM_MD5
        r = call(['statuses', 'carplay-display'])
        assert 'carplay-display\tuninstalled\t\n' in r.stdout

    # Test reset hook
    call(['action', 'carplay-display', 'install', 'display_size=177x100'])
    saved_tweak = saved / 'tweaks/carplay-display'
    archive = base / 'reset-archive'
    archive.mkdir(exist_ok=True)
    system = base / 'reset-system'
    system.mkdir(exist_ok=True)
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
    # Finish refuses until OEM target restored
    run_reset('finish', 1)
    # Restore OEM backup allows finish
    shutil.copyfile(target.with_name(target.name + '.org'), target)
    run_reset('finish')
    assert md5(target.read_bytes()) == OEM_MD5

    print('CARPLAY_PASSED:', checks, 'real package checks; display size XML patch, corrupted user settings fallback, user defaults, reset hook.')
