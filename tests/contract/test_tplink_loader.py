"""Real shell loader on fake /proc, /sys and payloads; no module is ever loaded."""
from pathlib import Path
import os,shlex,subprocess,tempfile

ROOT=Path(__file__).resolve().parents[2]
SHELL='C:/Program Files/Git/bin/bash.exe' if os.name=='nt' else '/bin/sh'
def bp(p):
    s=Path(p).resolve().as_posix();return '/'+s[0].lower()+s[2:] if len(s)>1 and s[1]==':' else s
def write(p,data):
    p.parent.mkdir(parents=True,exist_ok=True);p.write_text(data,encoding='utf-8',newline='\n');p.chmod(0o755)
with tempfile.TemporaryDirectory(prefix='tplink-loader-') as folder:
    b=Path(folder);bins=b/'bin';prefix=bp(b/'diagnostic')
    write(b/'payload/dongle.conf','CHANNEL_PLAN=0x11\n')
    for n in range(100):(b/'sys/bus/usb/devices'/('device'+str(n)+'x'*70)).mkdir(parents=True)
    write(b/'proc/modules','');write(b/'proc/uptime','12.00 0.00\n')
    write(b/'proc/sys/kernel/random/boot_id','12345678-1234\n')
    write(b/'proc/interrupts','72: 0 0 ehci_hcd:usb2\n')
    write(b/'proc/irq/72/smp_affinity','1\n');write(b/'proc/sys/net/core/netdev_max_backlog','1000\n')
    write(bins/'insmod','#!/bin/sh\nexit 1\n')
    write(bins/'dmesg','#!/bin/sh\ni=0;while [ "$i" -lt 150 ];do printf "usb %0100d\\n" "$i";i=$((i+1));done\n')
    source=(ROOT/'usb/tweaks/tplink-rtl8811au/assets/load-wlan1.sh').read_text(encoding='utf-8')
    source=source.replace('/data_persist/wl',bp(b/'payload')).replace('/tmp/mzd-tplink-rtl8811au',prefix)
    source=source.replace('/proc/',bp(b/'proc')+'/').replace('/sys/',bp(b/'sys')+'/')
    write(b/'loader.sh',source)
    env=dict(os.environ,PATH=bp(bins)+':'+os.environ['PATH'])
    boot=b/'diagnostic-boot.log';dump=b/'diagnostic-dmesg.log'
    for _ in range(3):
        result=subprocess.run([SHELL,bp(b/'loader.sh')],env=env,capture_output=True,text=True,timeout=20)
        assert result.returncode==1,(result.stdout,result.stderr)
        assert boot.stat().st_size==4096 and 'result=insmod-failed' in boot.read_text()
        assert 0<dump.stat().st_size<=8192 and len(dump.read_text().splitlines())<=40
    write(b/'proc/modules','rtl8812au 123 0 - Live 0x0000\n')
    result=subprocess.run([SHELL,bp(b/'loader.sh')],env=env,capture_output=True,text=True,timeout=20)
    assert result.returncode==0,(result.stdout,result.stderr)
    assert 'result=ok' in boot.read_text() and not dump.exists()
    assert (b/'proc/irq/72/smp_affinity').read_text().strip()=='2'
    helper=(ROOT/'usb/tweaks/tplink-rtl8811au/diagnostics.sh').read_text().replace('/tmp/mzd-tplink-rtl8811au',prefix)
    write(b/'diagnostics.sh',helper)
    def cleanup():return subprocess.run([SHELL,'-c','. '+shlex.quote(bp(b/'diagnostics.sh'))+'; driver_diagnostics_remove'],capture_output=True,text=True)
    write(dump,'owned failure\n');assert cleanup().returncode==0
    assert not boot.exists() and not dump.exists()
    if os.name!='nt':
        unrelated=b/'unrelated';write(unrelated,'keep\n');boot.symlink_to(unrelated)
        assert cleanup().returncode!=0 and unrelated.read_text()=='keep\n' and boot.is_symlink()
        result=subprocess.run([SHELL,bp(b/'loader.sh')],env=env,capture_output=True,text=True,timeout=20)
        assert result.returncode==1 and unrelated.read_text()=='keep\n'
print('TPLINK_LOADER_PASSED: bounded overwritten RAM logs, failure/success cleanup, simulated runtime tuning and symlink refusal; no driver loaded.')
