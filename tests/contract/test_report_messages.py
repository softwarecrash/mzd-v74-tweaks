"""Final GUI output must not retain the worker's initial progress message."""
from pathlib import Path
import os
import shlex
import subprocess
import tempfile

ROOT=Path(__file__).resolve().parents[2]
SHELL='C:/Program Files/Git/bin/bash.exe' if os.name=='nt' else '/bin/sh'
def bp(p):
    s=Path(p).resolve().as_posix()
    return '/'+s[0].lower()+s[2:] if len(s)>1 and s[1]==':' else s

with tempfile.TemporaryDirectory(prefix='cmu-report-') as directory:
    base=Path(directory);bins=base/'bin';bins.mkdir()
    sync=bins/'sync';sync.write_text('#!/bin/sh\nexit 0\n',newline='\n');sync.chmod(0o755)
    for action in ['install','uninstall','run']:
        for code in [0,1]:
            report=base/(action+str(code));report.mkdir()
            driver=base/'driver.sh'
            driver.write_text('''#!/bin/sh
set -u
PATH=BIN:/usr/bin:/bin
export PATH
. HELPER
ACTION=ACTION_VALUE
MZD_REPORT=REPORT
MZD_CLEANUP=
MZD_SUCCESS=
exec 3>&1 4>&2
exec > "$MZD_REPORT/run.log" 2>&1
trap mzd_finish 0
mzd_report_start
MZD_SUCCESS="$MZD_ACTION_LABEL completed."
exit CODE
'''.replace('BIN',shlex.quote(bp(bins))).replace('HELPER',shlex.quote(bp(ROOT/'usb/lib/report.sh'))).replace('ACTION_VALUE',action).replace('REPORT\n',shlex.quote(bp(report))+'\n').replace('CODE',str(code)),encoding='utf-8',newline='\n')
            result=subprocess.run([SHELL,bp(driver)],capture_output=True,text=True,timeout=10)
            assert result.returncode==code,(result.stdout,result.stderr)
            assert 'in progress' not in result.stdout+result.stderr
            label=action.capitalize()
            assert result.stdout==(label+' completed.\n' if code==0 else ''),result.stdout
            assert label+' in progress.' in (report/'run.log').read_text()
print('REPORT_MESSAGES_PASSED: progress stays in logs, final output is capitalized, failure never announces success.')
