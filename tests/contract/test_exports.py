"""Real export entrypoints/jobs with isolated source trees, USB and commands."""
from pathlib import Path
import os
import shutil
import shlex
import subprocess
import tempfile
import calendar
import time
import zipfile
from cases import CASES

ROOT = Path(__file__).resolve().parents[2]
SHELL = 'C:/Program Files/Git/bin/bash.exe' if os.name == 'nt' else '/bin/sh'
assert {k for k, v in CASES.items() if v == 'export-command'} == {'backup-jci', 'logs-collector'}
def bp(p):
    s = Path(p).resolve().as_posix()
    return '/' + s[0].lower() + s[2:] if len(s) > 1 and s[1] == ':' else s
def write(p, text):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(text, encoding='utf-8', newline='\n'); p.chmod(0o755)
checks = 0
with tempfile.TemporaryDirectory(prefix='cmu-export-') as directory:
    base = Path(directory); usb = base/'usb'; source = base/'source'; bins = base/'bin'; state = base/'state'
    source.mkdir(); bins.mkdir(); state.mkdir()
    write(source/'first.log', 'first\n'); write(source/'nested/second log.txt', 'second\n')
    syslog_conf = base/'syslog-ng.conf'
    shutil.copyfile(ROOT/'src/mazda/cmu/data/log/syslog-ng.conf', syslog_conf)
    shutil.copytree(ROOT/'usb/lib', usb/'lib')
    # A fixed car clock: 2026-11-01 16:49:39 UTC (development/CMU-time.md).
    write(base/'rtc', '1793551779\n'); dt=usb/'lib/datetime.sh'
    write(dt, dt.read_text().replace('/sys/class/rtc/rtc0/since_epoch', bp(base/'rtc')))
    shutil.copyfile(ROOT/'usb/installer.sh', usb/'installer.sh')
    version = base/'version'; mounts = base/'mounts'; events = base/'events'
    write(version, 'JCI_SW_VER="MAZ_CMU-150_74.00.324"\n')
    write(mounts, 'mock '+bp(usb)+' vfat ro 0 0\n')
    lib = usb/'lib/export.sh'
    text = lib.read_text().replace('/jci/version.ini', bp(version)).replace('/proc/mounts', bp(mounts))
    text = text.replace('/tmp/mnt/sd[a-z][0-9]*|/mnt/sd[a-z][0-9]*', shlex.quote(bp(usb)))
    write(lib, text)
    for id_ in ['backup-jci', 'logs-collector']:
        folder = usb/'tweaks'/id_; shutil.copytree(ROOT/'usb/tweaks'/id_, folder)
        manifest = folder/'manifest.conf'
        data = manifest.read_text().replace('target=/jci', 'target='+bp(source)).replace('target=/data/log/syslog-ng.conf', 'target='+bp(syslog_conf))
        write(manifest, data)
        worker = folder/'run.sh'
        worker_text = worker.read_text().replace('#!/bin/sh\n', '#!/bin/sh\nPATH='+shlex.quote(bp(bins)+':/usr/bin:/bin')+'\nexport PATH\n', 1)
        worker_text = worker_text.replace("EXPORT_SOURCE='/jci'", "EXPORT_SOURCE=" + shlex.quote(bp(source)))
        worker_text = worker_text.replace("EXPORT_SOURCE=${LOG_ROTATION_PATH%/}", "EXPORT_SOURCE=" + shlex.quote(bp(source)))
        write(worker, worker_text)
    # Both target and mock mount paths include no fixed drive-letter assumptions.
    write(bins/'mount', '''#!/bin/sh
[ "$3" = USB ] || { echo FORBIDDEN_MOUNT >> EVENTS; exit 90; }
[ "$2" = rw,remount ] || { echo FORBIDDEN_USB_RO >> EVENTS; exit 91; }
echo mount >> EVENTS
awk -v mode="$2" '{$4=(mode=="rw,remount"?"rw":"ro"); print}' MOUNTS > NEXT
mv NEXT MOUNTS
'''.replace('USB',shlex.quote(bp(usb))).replace('EVENTS',shlex.quote(bp(events)))
          .replace('MOUNTS',shlex.quote(bp(mounts))).replace('NEXT',shlex.quote(bp(base/'mounts.next'))))
    write(bins/'sync', '#!/bin/sh\necho sync >> '+shlex.quote(bp(events))+'\n')
    for name in ['reboot','killall','iptables','sshd']:
        write(bins/name,'#!/bin/sh\necho FORBIDDEN >> '+shlex.quote(bp(events))+'\nexit 90\n')
    write(bins/'df', '#!/bin/sh\nprintf "Filesystem 1024-blocks Used Available Capacity Mounted\\nmock 999999 1 999998 1%% usb\\n"\n')
    # Real ZIP bytes are generated/verified using a portable stand-in, not a CMU zip binary.
    helper=base/'zip_mock.py'
    write(helper, '''import sys,os,zipfile,time
from pathlib import Path
def p(s):
 if os.name=='nt' and len(s)>3 and s[0]=='/' and s[2]=='/':s=s[1]+':'+s[2:]
 return Path(s)
base=p(sys.argv[1]);mode=sys.argv[2];args=sys.argv[3:]
if (base/('fail-'+mode)).exists():raise SystemExit(1)
if mode=='zip':
 time.sleep(0.2)
 with zipfile.ZipFile(p(args[-2]),'w',zipfile.ZIP_DEFLATED) as z:
  for f in p(args[-1]).rglob('*'):
   if f.is_file():z.write(f,f.as_posix())
else:
 with zipfile.ZipFile(p(args[-1])) as z:assert z.testzip() is None
''')
    for name in ['zip','unzip']:
        write(bins/name,'#!/bin/sh\nexec '+shlex.quote(bp(Path(os.sys.executable)))+' '+shlex.quote(bp(helper))+' '+shlex.quote(bp(base))+' '+name+' "$@"\n')
    env=dict(os.environ,INSTALLER_STATE=bp(state))
    def command(id_,args,expected=0):
        global checks
        r=subprocess.run([SHELL,bp(usb/'tweaks'/id_/'run.sh')]+args,env=env,capture_output=True,text=True,timeout=20)
        assert r.returncode==expected,(id_,args,r.returncode,r.stdout,r.stderr)
        assert not events.exists() or 'FORBIDDEN' not in events.read_text()
        checks+=1;return r
    original={p.relative_to(source).as_posix():p.read_bytes() for p in source.rglob('*') if p.is_file()}
    for id_ in ['backup-jci','logs-collector']:
        if events.exists():events.unlink()
        snapshot={p.relative_to(usb).as_posix():p.read_bytes() for p in usb.rglob('*') if p.is_file()}
        assert command(id_,['status']).stdout=='uninstalled\n'
        assert not events.exists() and not (usb/'exports').exists() if id_=='backup-jci' else not events.exists()
        assert snapshot=={p.relative_to(usb).as_posix():p.read_bytes() for p in usb.rglob('*') if p.is_file()}
        command(id_,[]); command(id_,['--help']); command(id_,['install'],1)
        r=command(id_,['run']);assert 'Saved to USB:' in r.stdout
        assert ' rw ' in mounts.read_text()
        complete=list((usb/'exports'/id_).glob('*-complete'));assert len(complete)==1
        assert (complete[0]/'run.log').read_text().startswith('Start: '),'run.log starts with the time line'
        if id_=='backup-jci':
            with zipfile.ZipFile(complete[0]/'jci.zip') as z:assert z.testzip() is None and len(z.namelist())==2
        else:
            assert (complete[0]/'logs/nested/second log.txt').read_text()=='second\n'
        command(id_,['run']);assert len(list((usb/'exports'/id_).glob('*-complete')))==2
    write(base/'fail-zip','yes');command('backup-jci',['run'],1);(base/'fail-zip').unlink()
    assert len(list((usb/'exports/backup-jci').glob('*-complete')))==2
    assert list((usb/'exports/backup-jci').glob('*/.incomplete'))
    write(base/'fail-unzip','yes');command('backup-jci',['run'],1);(base/'fail-unzip').unlink()
    assert len(list((usb/'exports/backup-jci').glob('*-complete')))==2
    # Jobs use the real adapter and return immediately, allowing serial polling.
    adapter=usb/'installer.sh'
    write(adapter,adapter.read_text().replace('#!/bin/sh\n','#!/bin/sh\nPATH='+shlex.quote(bp(bins)+':/usr/bin:/bin')+'\nexport PATH\n',1))
    def job(args):
        r=subprocess.run([SHELL,bp(adapter)]+args,env=env,capture_output=True,text=True,timeout=20)
        assert r.returncode==0,(args,r.stdout,r.stderr);return r.stdout
    token=job(['start-run','backup-jci']).strip();assert token.startswith('job.')
    statuses=[]
    for _ in range(100):
        result=job(['job-status',token]);statuses.append(result)
        if result.startswith('done\n'):break
        time.sleep(0.05)
    assert result=='done\n0\n',statuses
    assert any(s.startswith('running\n') for s in statuses), 'No independent progress polling occurred.'
    assert 'Saved to USB:' in job(['job-output',token,'stdout'])
    assert job(['job-output',token,'stderr'])==''
    assert not (state/'active-job').exists()
    # A nested installer still exports at the originating USB root.
    nested = usb / 'nested installer'
    shutil.copytree(usb / 'lib', nested / 'lib')
    shutil.copytree(usb / 'tweaks/logs-collector', nested / 'tweaks/logs-collector')
    before = set((usb / 'exports/logs-collector').glob('*-complete'))
    result = subprocess.run([SHELL, bp(nested / 'tweaks/logs-collector/run.sh'), 'run'],
                            env=env, capture_output=True, text=True, timeout=20)
    assert result.returncode == 0, (result.stdout, result.stderr)
    created = set((usb / 'exports/logs-collector').glob('*-complete')) - before
    assert len(created) == 1 and bp(next(iter(created))) in result.stdout
    assert not (nested / 'exports').exists()
    assert original=={p.relative_to(source).as_posix():p.read_bytes() for p in source.rglob('*') if p.is_file()}
    # File dates: the folder and the export's own files get the car's local time; copies keep theirs.
    stamp=calendar.timegm((2026,11,1,20,49,39))
    dated=dict(env,MZD_DATETIME_OFFSET='14400',MZD_DATETIME_ASKED='1')
    for id_,own,copied in [('logs-collector','source-files.txt','logs/first.log'),('backup-jci','jci.zip',None)]:
        before=set((usb/'exports'/id_).glob('*-complete'))
        r=subprocess.run([SHELL,bp(usb/'tweaks'/id_/'run.sh'),'run'],env=dated,capture_output=True,text=True,timeout=20)
        assert r.returncode==0,(r.stdout,r.stderr)
        created=set((usb/'exports'/id_).glob('*-complete'))-before;assert len(created)==1
        folder=next(iter(created));assert folder.name.startswith('20261101-204939-'),folder.name
        assert (folder/'run.log').read_text().startswith('Start: 2026-11-01 20:49:39 local (UTC 16:49:39, zone +4:00)')
        for p in [folder,folder/'run.log',folder/own]:assert int(p.stat().st_mtime)==stamp,p
        if copied:assert int((folder/copied).stat().st_mtime)!=stamp,'a copied file keeps its own date'
        checks+=1

    # Log Collector rotation settings lifecycle and error handling.
    oem_syslog_text = (ROOT / 'src/mazda/cmu/data/log/syslog-ng.conf').read_text()
    help_out = command('logs-collector', ['--help']).stdout
    assert 'Usage: sh run.sh <run|status|settings> [log_rotation_size=512|5120]' in help_out
    assert 'run       Copy running logs to USB' in help_out
    assert 'status    Check export readiness' in help_out
    assert 'settings  Print current rotation size' in help_out

    # Initial settings query reflects stock 512
    assert command('logs-collector', ['settings']).stdout == 'log_rotation_size=512\n'

    # Enlarging rotation size to 5120 creates .org backup, sets target, emits dynamic reboot signal
    r = command('logs-collector', ['run', 'log_rotation_size=5120'])
    assert 'MZD_REBOOT_REQUIRED\n' in r.stdout
    assert 'Running logs rotation size set to Enlarged 5 MB (5120 KiB).' in r.stdout
    assert 'Reboot the CMU for changes to take effect.' in r.stdout
    assert 'Saved to USB:' not in r.stdout
    assert (base / 'syslog-ng.conf.org').exists()
    assert (base / 'syslog-ng.conf.org').read_text() == oem_syslog_text
    assert '/var/log/running_log/ 5120"' in syslog_conf.read_text()

    # Settings query reflects updated rotation size
    assert command('logs-collector', ['settings']).stdout == 'log_rotation_size=5120\n'

    # Run with unchanged setting (already 5120) copies logs instead of re-applying rotation
    before_count = len(list((usb / 'exports/logs-collector').glob('*-complete')))
    r = command('logs-collector', ['run', 'log_rotation_size=5120'])
    assert 'Saved to USB:' in r.stdout
    assert 'MZD_REBOOT_REQUIRED' not in r.stdout
    assert len(list((usb / 'exports/logs-collector').glob('*-complete'))) == before_count + 1

    # Restoring stock 512 matches OEM checksum and removes .org backup
    r = command('logs-collector', ['run', 'log_rotation_size=512'])
    assert 'MZD_REBOOT_REQUIRED\n' in r.stdout
    assert 'Running logs rotation size set to Stock 512 KB (512 KiB).' in r.stdout
    assert syslog_conf.read_text() == oem_syslog_text
    assert not (base / 'syslog-ng.conf.org').exists()

    # Settings query reflects stock 512 again
    assert command('logs-collector', ['settings']).stdout == 'log_rotation_size=512\n'

    # Non-OEM modified target keeps .org backup when restored to stock 512
    command('logs-collector', ['run', 'log_rotation_size=5120'])
    assert (base / 'syslog-ng.conf.org').exists()
    write(syslog_conf, syslog_conf.read_text() + '# Non-OEM comment\n')
    r = command('logs-collector', ['run', 'log_rotation_size=512'])
    assert 'MZD_REBOOT_REQUIRED\n' in r.stdout
    assert (base / 'syslog-ng.conf.org').exists(), 'Non-OEM target retains .org backup'
    (base / 'syslog-ng.conf.org').unlink()
    write(syslog_conf, oem_syslog_text)

    # Invalid setting value is rejected
    r = command('logs-collector', ['run', 'log_rotation_size=999'], 1)
    assert 'Invalid value for log_rotation_size: 999' in r.stderr

    # Missing target config file fails when attempting rotation change
    syslog_conf.rename(base / 'syslog-ng.conf.bak')
    r = command('logs-collector', ['run', 'log_rotation_size=5120'], 1)
    assert 'configuration file not found' in r.stderr
    r = command('logs-collector', ['settings'], 1)
    assert r.returncode == 1
    (base / 'syslog-ng.conf.bak').rename(syslog_conf)

    # Target file missing running_log pattern fails cleanly
    write(syslog_conf, '# config without running_log\n')
    r = command('logs-collector', ['run', 'log_rotation_size=5120'], 1)
    assert 'running_log rotation entry not found' in r.stderr
    write(syslog_conf, oem_syslog_text)
    checks += 8
print('EXPORT_COMMANDS_PASSED:',checks,'entrypoint checks, read-only sources, USB-only unique outputs, ZIP validation/failure and live jobs.')
