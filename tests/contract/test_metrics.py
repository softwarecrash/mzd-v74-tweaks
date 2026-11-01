"""Read-only system snapshots through the real installer with proc/df fixtures."""
from pathlib import Path
import os
import shlex
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
SHELL = 'C:/Program Files/Git/bin/bash.exe' if os.name == 'nt' else '/bin/sh'
def bp(path):
    s = Path(path).resolve().as_posix()
    return '/' + s[0].lower() + s[2:] if len(s)>1 and s[1]==':' else s

def write(path, data):
    path.write_text(data, encoding='utf-8', newline='\n'); path.chmod(0o755)

with tempfile.TemporaryDirectory(prefix='cmu-metrics-') as folder:
    base=Path(folder); usb=base/'usb'; lib=usb/'lib'; lib.mkdir(parents=True)
    shutil.copyfile(ROOT/'usb/lib/defines.sh', lib/'defines.sh')
    shutil.copyfile(ROOT/'usb/lib/version.sh', lib/'version.sh')
    bins=base/'bin'; bins.mkdir()
    proc=base/'stat'; dfdata=base/'df-data'
    write(proc, 'cpu  100 10 40 700 50 20 30 50 999 999\ncpu0 0 0 0 0\n')
    write(dfdata, 'Filesystem 1024-blocks Used Available Capacity Mounted on\n'
          '/dev/root 1000 500 400 56% /\n'
          '/dev/mmcblk0p2 2000 1000 900 53% /jci\n'
          '/dev/mmcblk0p3 2000 1000 600 70% /tmp/mnt/resources\n'
          '/dev/mmcblk0p3 2000 1000 600 70% /tmp/mnt/resources\n'
          'tmpfs 1000 100 900 10% /tmp\n'
          '/dev/sdb1 1000 200 800 20% /tmp/mnt/sdb1\n'
          '/dev/empty 0 0 0 0% /empty\n')
    write(bins/'df', '#!/bin/sh\ncat '+shlex.quote(bp(dfdata))+'\n')
    write(lib/'metrics.sh', (ROOT/'usb/lib/metrics.sh').read_text().replace('/proc/stat', bp(proc)))
    write(usb/'installer.sh', (ROOT/'usb/installer.sh').read_text().replace('#!/bin/sh\n',
        '#!/bin/sh\nPATH='+shlex.quote(bp(bins)+':/usr/bin:/bin')+'\nexport PATH\n',1))
    def run(*args):
        return subprocess.run([SHELL,bp(usb/'installer.sh'),'metrics',*args],capture_output=True,text=True,timeout=10)
    first=run('0','0'); assert first.returncode==0, first.stderr
    assert first.stdout=='cpu\t1000\t750\t-\ndisk\t/\t40\ndisk\t/tmp/mnt/resources\t30\n', first.stdout
    # Excludes guest counters, combines idle+iowait; 150/200 ticks busy = 75%.
    write(proc, 'cpu 200 10 90 740 60 20 30 50 999 999\n')
    assert run('1000','750').stdout.startswith('cpu\t1200\t800\t75\n')
    assert run('1200','800').stdout.startswith('cpu\t1200\t800\t-\n')
    assert run('9999','9000').stdout.startswith('cpu\t1200\t800\t-\n')
    for args in [(),('0',),('0','0','0'),('bad','0'),('1:2','0')]:
        result=run(*args); assert result.returncode!=0 and result.stdout=='', (args,result)
    write(bins/'df', '#!/bin/sh\nexit 1\n')
    assert run('0','0').returncode!=0
    write(proc,'invalid\n'); assert run('0','0').returncode!=0
    assert sorted(p.name for p in usb.iterdir())==['installer.sh','lib']
print('SYSTEM_METRICS_PASSED: CPU deltas, free percentages, mount filtering, duplicate suppression and failures; no writes.')
