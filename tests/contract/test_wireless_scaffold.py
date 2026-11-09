"""Run the development adapter in the real USB layout; assert no mutations."""
from pathlib import Path
import json
import os
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))
from manifest import read

CANDIDATE = ROOT / 'development/candidates/android-auto-wireless'
assert not (ROOT / 'usb/tweaks/android-auto-wireless').exists()
metadata = read(CANDIDATE / 'manifest.conf')
assert metadata['id'] == 'android-auto-wireless'
assert metadata['conflicts'] == ['android-auto']
assert metadata['config.libpatch.path'] == '/tmp/mnt/data_persist/oem-aa-mod/libpatch.conf'
provenance = json.loads((CANDIDATE / 'upstream.json').read_text())
assert provenance['repository'] == 'https://github.com/PingusPepan/oem-aa-mod'
assert provenance['payload_bundled'] is False

with tempfile.TemporaryDirectory(prefix='wireless-scaffold-') as directory:
    base = Path(directory)
    usb = base / 'usb'
    shutil.copytree(ROOT / 'usb/lib', usb / 'lib')
    worker = usb / 'tweaks/android-auto-wireless'
    shutil.copytree(CANDIDATE, worker)
    bins = base / 'bin'
    bins.mkdir()
    events = base / 'mutations'
    for command in ['mount', 'umount', 'reboot', 'iptables', 'killall', 'sync']:
        p = bins / command
        p.write_text('#!/bin/sh\necho forbidden >> "' + str(events) + '"\nexit 90\n')
        p.chmod(0o755)
    env = dict(os.environ, PATH=str(bins) + ':/usr/bin:/bin')
    def snapshot():
        return {str(p.relative_to(base)): p.read_bytes() if p.is_file() else None
                for p in base.rglob('*')}
    before = snapshot()
    def call(script, args, code):
        r = subprocess.run(['/bin/sh', str(worker / script), *args], env=env,
                           capture_output=True, text=True, timeout=10)
        assert r.returncode == code, (script, args, r.returncode, r.stdout, r.stderr)
        assert snapshot() == before, 'scaffold changed files or directories'
        return r
    for args in [[], ['--help'], ['-h']]:
        assert 'Usage:' in call('run.sh', args, 0).stdout
    r = call('run.sh', ['status'], 0)
    assert r.stdout == 'unavailable\n' and 'scaffold' in r.stderr
    r = call('run.sh', ['preflight'], 1)
    assert r.stdout.startswith('block\t')
    for args in [['install'], ['uninstall'], ['uninstall', '--preserve-config']]:
        r = call('run.sh', args, 1)
        assert not r.stdout and 'nothing changed' in r.stderr
    for args in [['other'], ['status', 'extra'], ['install', '--preserve-config']]:
        call('run.sh', args, 1)
    call('reset.sh', ['check'], 0)
    for args in [[], ['prepare'], ['finish'], ['other']]:
        call('reset.sh', args, 1)
print('WIRELESS_SCAFFOLD_PASSED: manifest, real USB-layout entrypoints, blocked mutations, config argument and reset boundary.')
