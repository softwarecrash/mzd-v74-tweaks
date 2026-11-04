"""Standalone collector fixtures: bounded output, marks, stop and no target edits."""
from pathlib import Path
import os
import signal
import struct
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'development/diagnostics/issue-35'

with tempfile.TemporaryDirectory(prefix='issue35-fixture-') as temporary:
    base = Path(temporary)
    ram = base / 'ram'
    ram.mkdir()
    def write(relative, content):
        path = base / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding='utf-8')
        return path

    for relative, text in {
        'proc/uptime': '41.25 18.00\n', 'proc/stat': 'cpu 1 2 3 4 5\n',
        'proc/loadavg': '0.1 0.2 0.3\n', 'proc/meminfo': 'MemFree: 100000 kB\n',
        'proc/interrupts': 'LVDS 12\n', 'proc/bus/input/devices': 'touch\n',
        'proc/321/comm': 'jciMMUI\n', 'proc/321/stat': '321 (jciMMUI) S 1\n',
        'proc/321/status': 'State: S\n', 'proc/321/wchan': 'poll\n',
        'sys/class/input/event0/device/name': 'LVDS TouchScreen\n',
        'var/log/running_log/log': '00:00:41 IntroAnimation\n',
        'jci/version.ini': 'JCI_SW_VER=74.00.324\n',
        'jci/gui/apps/system/js/systemApp.js': 'unchanged OEM\n',
        'data/integration/developer_mode_GuiConfig.js': 'unchanged hook\n',
    }.items():
        write(relative, text)
    # Archive copying is byte-based: fake archive bytes are sufficient here.
    write('var/log/running_log/log_0000.tar.gz', 'archive-bytes')
    large = base / 'var/log/running_log/log_0001.tar.gz'
    large.write_bytes(b'x' * 1048577)
    original = {p: p.read_bytes() for p in base.rglob('*') if p.is_file()}
    bins = base / 'bin'
    for name, body in {
        'df': 'printf "Filesystem 1024-blocks Used Available Capacity Mounted\\nfixture 100000 0 100000 0%% /tmp\\n"',
        'ps': 'printf "321 cmu jciMMUI\\n"',
        'dmesg': 'printf "LVDS ready\\n"',
    }.items():
        path = write('bin/' + name, '#!/bin/sh\n' + body + '\n')
        path.chmod(0o755)
    script = SOURCE.joinpath('collect.sh').read_text()
    # Redirect the production paths only in this disposable fixture copy.
    for path in ['/tmp', '/proc', '/sys', '/dev/input', '/var/log', '/jci', '/data']:
        destination = str(ram if path == '/tmp' else base / path.lstrip('/'))
        script = script.replace(path, destination)
    # Exercise the byte cap with a real character device; never read host input.
    script = script.replace('node=' + str(base / 'dev/input') + '/${directory##*/}', 'node=/dev/zero')
    collector = write('collect.sh', script)
    shell = ['/bin/sh']
    tool_path = str(bins) + ':/usr/bin:/bin'
    if len(sys.argv) == 2:
        busybox = Path(sys.argv[1]).resolve()
        applets = base / 'busybox-applets'
        applets.mkdir()
        for name in subprocess.check_output([str(busybox), '--list'], text=True).splitlines():
            (applets / name).symlink_to(busybox)
        shell = [str(busybox), 'sh']
        tool_path = str(bins) + ':' + str(applets) + ':/usr/bin:/bin'
    env = dict(os.environ, PATH=tool_path)

    def start():
        process = subprocess.Popen(shell + [str(collector), 'collect', '4'],
                                   env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        line = process.stdout.readline()
        assert line.startswith('Report: '), line
        return process, Path(line.strip().split('Report: ', 1)[1])

    process, report = start()
    subprocess.run(shell + [str(collector), 'mark', str(report), 'before-touch'], env=env, check=True)
    out, err = process.communicate(timeout=20)
    assert process.returncode == 0, (out, err)
    assert 'marker=before-touch' in (report / 'timeline.txt').read_text()
    assert 'collection-end' in (report / 'timeline.txt').read_text()
    assert (report / 'event0.bin').stat().st_size == 131072
    assert (report / 'before-log_0000.tar.gz').read_bytes() == b'archive-bytes'
    assert not (report / 'before-log_0001.tar.gz').exists()
    assert 'skipped-over-1MiB' in (report / 'log-sources.txt').read_text()
    assert 'IntroAnimation' in (report / 'sample-0.txt').read_text()
    assert sum(p.stat().st_size for p in report.iterdir()) < 32 * 1024 * 1024
    assert all(path.read_bytes() == content for path, content in original.items())
    invalid = subprocess.run(shell + [str(collector), 'mark', str(report), 'bad\nlabel'], env=env, capture_output=True)
    assert invalid.returncode != 0
    for duration in ['0', '181', '-1', 'bad']:
        result = subprocess.run(shell + [str(collector), 'collect', duration], env=env, capture_output=True)
        assert result.returncode != 0
    process, partial = start()
    time.sleep(0.2)
    process.send_signal(signal.SIGTERM)
    process.communicate(timeout=10)
    assert process.returncode == 130
    assert 'interrupted' in (partial / 'timeline.txt').read_text()
    capture = write('input.bin', '')
    capture.write_bytes(struct.pack('<IIHHi', 41, 1234, 3, 0, 42) + b'partial')
    decoded = subprocess.run([sys.executable, str(SOURCE / 'decode-input.py'), str(capture)], capture_output=True, text=True, check=True)
    assert '41,1234,EV_ABS,0,42' in decoded.stdout and 'partial' in decoded.stderr
print('ISSUE35_DIAGNOSTICS_PASSED: fixture capture, marks, caps, interruption, unchanged sources and ARM32 input decoding.')
