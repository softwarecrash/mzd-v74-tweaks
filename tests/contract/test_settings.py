"""Real settings reader/controller on private fixtures; never writes vehicle paths."""
from pathlib import Path
import os
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))
from manifest import parse

SHELL = 'C:/Program Files/Git/bin/bash.exe' if os.name == 'nt' else '/bin/sh'


def bp(p):
    s = Path(p).resolve().as_posix()
    return '/' + s[0].lower() + s[2:] if len(s) > 1 and s[1] == ':' else s


def write(p, data):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(data, encoding='utf-8', newline='\n')
    p.chmod(0o755)


checks = 0
with tempfile.TemporaryDirectory(prefix='cmu-settings-') as temporary:
    base = Path(temporary); usb = base/'usb'; bins = base/'bin'; persist = base/'persist'
    store = persist/'installed'; target = base/'target'; events = base/'events'; version = base/'version'
    mounts = base/'mounts'; session = base/'session'
    for d in [bins, persist, session]: d.mkdir()
    shutil.copytree(ROOT/'usb/lib', usb/'lib')
    write(usb/'installer.sh', (ROOT/'usb/installer.sh').read_text().replace('#!/bin/sh\n', '#!/bin/sh\nPATH='+shlex.quote(bp(bins)+':/usr/bin:/bin')+'\nexport PATH\n',1))
    shutil.copytree(ROOT/'development/examples/settings', usb/'tweaks/settings-example')
    manifest = usb/'tweaks/settings-example/manifest.conf'; original = manifest.read_text()
    write(version, 'JCI_SW_VER="MAZ_CMU-150_74.00.324"\n')
    worker = usb/'tweaks/settings-example/run.sh'
    write(worker, worker.read_text().replace('/jci/version.ini', bp(version)))
    write(mounts, f'/dev/test {bp(persist)} relfs rw 0 0\n/dev/usb {bp(usb)} vfat rw 0 0\n')
    pkg = usb/'lib/packages.sh'
    write(pkg, pkg.read_text().replace('MZD_PACKAGE_STORE=/tmp/mnt/data_persist/mzd-tweaks/installed', 'MZD_PACKAGE_STORE='+shlex.quote(bp(store)))
          .replace('MZD_PACKAGE_MOUNT=/tmp/mnt/data_persist', 'MZD_PACKAGE_MOUNT='+shlex.quote(bp(persist)))
          .replace('MZD_PACKAGE_MOUNTS=/proc/mounts', 'MZD_PACKAGE_MOUNTS='+shlex.quote(bp(mounts)))
          .replace('MZD_PACKAGE_LOCK=/tmp/mzd-packages.lock', 'MZD_PACKAGE_LOCK='+shlex.quote(bp(base/'lock')))
          .replace('/jci/version.ini', bp(version)))
    write(bins/'sync', '#!/bin/sh\nexit 0\n')
    write(bins/'mount', '#!/bin/sh\nexit 0\n')
    report=usb/'lib/report.sh'
    write(report,report.read_text().replace('/proc/mounts',bp(mounts)))
    write(bins/'df', '#!/bin/sh\nprintf "Filesystem 1024-blocks Used Available Capacity Mounted\\nfixture 1000000 1 900000 1%% persist\\n"\n')
    env = dict(os.environ, PATH=bp(bins)+':/usr/bin:/bin', INSTALLER_STATE=bp(session))

    def call(args, code=0):
        global checks
        # Windows argv quoting does not preserve a bare newline; quote literal test arguments for the POSIX shell.
        command = 'exec /bin/sh ' + ' '.join(shlex.quote(a) for a in [bp(usb/'installer.sh'), *args])
        r = subprocess.run([SHELL, '-c', command], env=env, capture_output=True, text=True, timeout=45)
        assert r.returncode == code, (args, r.returncode, r.stdout, r.stderr)
        checks += 1
        return r

    info = call(['settings-info', 'settings-example']).stdout
    assert 'settings_saved=false' in info and 'value.log_limit_mb=20' in info
    assert '20 MB' in call(['action','settings-example','run']).stdout

    # User settings defaults from USB user/<id>/settings.conf with comments and empty lines
    user_conf = usb/'user/settings-example/settings.conf'
    write(user_conf, '# Custom user defaults\n\nlog_limit_mb=30\ncompress=false\n# end of overrides\nprofile=large\n')
    info = call(['settings-info', 'settings-example']).stdout
    assert 'value.log_limit_mb=30' in info and 'value.compress=false' in info and 'value.profile=large' in info
    out = call(['action','settings-example','run']).stdout
    assert '30 MB' in out and 'false' in out and 'large' in out
    # Explicit command-line arguments override user defaults
    out = call(['action','settings-example','run','log_limit_mb=40']).stdout
    assert '40 MB' in out and 'false' in out and 'large' in out
    # Partial user defaults fall back to manifest defaults for unlisted settings
    write(user_conf, 'log_limit_mb=35\n')
    info = call(['settings-info', 'settings-example']).stdout
    assert 'value.log_limit_mb=35' in info and 'value.compress=true' in info and 'value.profile=stock' in info
    # Invalid user defaults are rejected with clear diagnostics
    write(user_conf, 'log_limit_mb=21\n')
    r = call(['settings-info', 'settings-example'], 1)
    assert 'Invalid default for log_limit_mb: 21' in r.stderr
    write(user_conf, 'unknown_key=foo\n')
    r = call(['settings-info', 'settings-example'], 1)
    assert 'Unknown default: unknown_key' in r.stderr
    # Size limit on settings.conf (exceeding 64 KB is rejected)
    write(user_conf, 'log_limit_mb=30\n' + ('# padding comment line\n' * 3000))
    assert user_conf.stat().st_size > 65536
    r = call(['settings-info', 'settings-example'], 1)
    assert 'User configuration file exceeds size limit of 64 KB: settings.conf' in r.stderr
    user_conf.unlink()
    (usb/'user/settings-example').rmdir()
    (usb/'user').rmdir()

    args = ['log_limit_mb=30', 'compress=false', 'profile=large']
    out = call(['action','settings-example','run', *args]).stdout
    assert '30 MB' in out and 'false' in out and 'large' in out
    for bad in [['log_limit_mb=0'], ['log_limit_mb=101'], ['log_limit_mb=21'], ['log_limit_mb=030'],
                ['log_limit_mb=2147483648'], ['compress=yes'], ['profile=unknown'], ['unknown=true'],
                ['compress=true','compress=false'], ['log_limit_mb=$(touch injected)'], ['profile=stock\ncompress=true']]:
        r = call(['action','settings-example','run', *bad], 1)
        assert not r.stdout and 'Settings:' in r.stderr
    assert not (usb/'tweaks/settings-example/injected').exists()
    assert not (session/'active-job').exists()
    call(['start-run','settings-example','compress=wrong'], 1)
    assert not (session/'active-job').exists()
    token = call(['start-run','settings-example', *args]).stdout.strip()
    for _ in range(100):
        result = call(['job-status',token]).stdout
        if result.startswith('done\n'): break
        time.sleep(0.1)
    assert result.startswith('done\n0'), result
    assert '30 MB' in call(['job-output',token,'stdout']).stdout
    assert (session/token/'settings.conf').read_text() == 'log_limit_mb=30\ncompress=false\nprofile=large\n'

    # Shell and Python readers agree about schema errors and literal labels.
    driver = base/'schema.sh'
    write(driver, '. '+shlex.quote(bp(usb/'lib/manifest.sh'))+'\nmzd_manifest_load "$1"\n')
    options64=' '.join('opt'+str(i).zfill(2)+'x'*27 for i in range(64))
    extended=original.replace('stock medium large',options64).replace('profile.default=stock','profile.default='+options64.split()[0])
    for text, accepted in [(extended,True),(extended.replace(options64,options64+' extra'),False),(original.replace('setting.profile.options=stock medium large','setting.profile.options='+('a'*4097)),False),(original, True), (original.replace('Log storage limit','Literal $(touch injected)'), True),
                           (original.replace('step=5','step=0'), False),
                           (original.replace('default=20','default=21'), False),
                           (original+'setting.unknown.type=number\n', False),
                           (original.replace('compress.default=true','compress.default=yes'), False),
                           (original.replace('stock medium large','stock stock'), False),
                           (original.replace('compress profile','compress compress'), False),
                           (original+'setting.compress.options=true false\n', False)]:
        write(manifest,text)
        r = subprocess.run([SHELL,bp(driver),bp(manifest)],env=env,capture_output=True,text=True,timeout=15)
        assert (r.returncode==0)==accepted, (text,r.stderr)
        try: parse(text); python_ok=True
        except ValueError: python_ok=False
        assert python_ok==accepted
        checks += 1
    write(manifest,original)

    # A persistent worker writes only the private target; saved config must survive
    # new USB defaults/schema/helper changes and removal of the USB tweak folder.
    folder = usb/'tweaks/configured'; folder.mkdir()
    data = (ROOT/'usb/tweaks/list-beep/manifest.conf').read_text()
    data = re.sub('^id=.*$', 'id=configured', data, flags=re.M)
    data = re.sub('^target=.*$', 'target='+bp(target), data, flags=re.M)
    data += original[original.index('settings='):]
    write(folder/'manifest.conf',data)
    write(folder/'run.sh', '''#!/bin/sh
set -eu
HERE=$(CDPATH= cd "$(dirname "$0")" && pwd)
. "$HERE/../../lib/settings.sh"
TARGET=TARGET_PATH
case "$1" in
status) if [ -f "$TARGET" ]; then echo installed; else echo uninstalled; fi ;;
install) ACTION=install; . "$HERE/../../lib/report.sh"; mzd_begin "$0" configured; printf '%s %s %s\n' "$(mzd_setting log_limit_mb)" "$(mzd_setting compress)" "$(mzd_setting profile)" > "$TARGET" ;;
uninstall) ACTION=uninstall; . "$HERE/../../lib/report.sh"; mzd_begin "$0" configured; [ "$(cat "$TARGET")" = "$(mzd_setting log_limit_mb) $(mzd_setting compress) $(mzd_setting profile)" ]; rm "$TARGET" ;;
esac
'''.replace('TARGET_PATH',shlex.quote(bp(target))))
    call(['action','configured','install','log_limit_mb=21'],1)
    assert not target.exists() and not store.exists()
    call(['action','configured','install',*args]); assert target.read_text().strip()=='30 false large'
    saved=store/'configured/package/settings.conf'; assert saved.read_text()=='log_limit_mb=30\ncompress=false\nprofile=large\n'
    reports=list(usb.glob('reports/configured/install-*/settings.conf'))
    assert reports and reports[0].read_text()==saved.read_text()
    call(['action','configured','install',*args])
    call(['action','configured','install','log_limit_mb=40'],1)
    assert target.read_text().strip()=='30 false large'
    write(folder/'manifest.conf',data.replace('default=20','default=50'))
    write(usb/'lib/settings.sh',(usb/'lib/settings.sh').read_text()+'\n# new USB helper version\n')
    info=call(['settings-info','configured']).stdout
    assert 'settings_saved=true' in info and 'setting.log_limit_mb.default=20' in info and 'value.log_limit_mb=30' in info
    # Upgrade uses the old saved options for removal, then the new options for installation.
    write(folder/'manifest.conf',re.sub('^version=.*$', 'version=1.0.0', data, flags=re.M))
    call(['action','configured','install','log_limit_mb=40','compress=false','profile=medium'])
    assert target.read_text().strip()=='40 false medium'
    assert 'value.log_limit_mb=40' in call(['settings-info','configured']).stdout
    # The new USB helper cannot alter the saved uninstaller's option reader.
    write(usb/'lib/settings.sh',(usb/'lib/settings.sh').read_text()+'\nmzd_setting() { echo wrong-new-helper; }\n')
    # Reset hooks use the same saved configuration, including all phases.
    hook=store/'configured/package/tweaks/configured/reset.sh'
    write(hook, '#!/bin/sh\nHERE=$(CDPATH= cd "$(dirname "$0")" && pwd)\n. "$HERE/../../lib/settings.sh"\nprintf "%s %s\\n" "$1" "$(mzd_setting log_limit_mb)"\n')
    hook_driver=base/'hook-driver.sh'
    write(hook_driver,'. '+shlex.quote(bp(usb/'lib/restore.sh'))+'\nmzd_restore_run_hook "$1" "$2"\n')
    for phase in ['check','prepare','finish']:
        r=subprocess.run([SHELL,bp(hook_driver),bp(hook),phase],env=env,capture_output=True,text=True,timeout=20)
        assert r.returncode==0 and r.stdout==phase+' 40\n',(phase,r.stdout,r.stderr)
        checks+=1
    hook.unlink()  # Restore the exact package inventory for the uninstall test.
    missing=saved.read_text(); saved.unlink()
    call(['action','configured','uninstall'],1); assert target.exists()
    write(saved,missing)
    # Inventory catches a modified configuration before uninstall can touch a target.
    before=saved.read_text(); write(saved,before.replace('40','45'))
    call(['action','configured','uninstall'],1); assert target.exists()
    write(saved,before)
    assert folder.resolve().is_relative_to(base.resolve())
    shutil.rmtree(folder)
    call(['action','configured','uninstall']); assert not target.exists() and not (store/'configured').exists()
    print('SETTINGS_PASSED:', checks, 'checks: schemas, defaults, refusal before Run, background lifetime, saved configuration and uninstall.')
