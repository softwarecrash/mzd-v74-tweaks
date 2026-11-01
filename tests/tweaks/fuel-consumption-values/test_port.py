"""Optional full-OEM verification: pass the private original and the main-branch modified JS.

No vehicle originals are committed. CI covers synthetic worker fixtures; this
check applies the shipped diff to real full-file inputs.
"""
from pathlib import Path
import hashlib
import os
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'tools'))
from manifest import read

if len(sys.argv) != 3:
    raise SystemExit('Usage: python test_port.py OEM_FuelConsumptionCtrl.js MAIN_FuelConsumptionCtrl.js')
original = Path(sys.argv[1]).read_bytes()
expected = Path(sys.argv[2]).read_bytes()
folder = ROOT / 'usb/tweaks/fuel-consumption-values'
m = read(folder / 'manifest.conf')
assert hashlib.md5(original).hexdigest() == m['oem_backup_md5']
SHELL = 'C:/Program Files/Git/bin/bash.exe' if os.name == 'nt' else '/bin/sh'
def bp(p):
    value = Path(p).resolve().as_posix()
    return '/' + value[0].lower() + value[2:] if len(value) > 1 and value[1] == ':' else value

with tempfile.TemporaryDirectory(prefix='cmu-fuel-values-port-') as directory:
    work = Path(directory); target = work / 'target.data'
    def patch(reverse=False):
        command = 'cd "$1" && patch -N ' + ('-R ' if reverse else '') + '-p0 -i "$2" < /dev/null'
        r = subprocess.run([SHELL, '-c', command, '--', bp(work), bp(folder / 'assets/change.patch')],
                           capture_output=True, text=True, timeout=15)
        assert r.returncode == 0, (r.stdout, r.stderr)
    target.write_bytes(original)
    patch(); assert target.read_bytes() == expected
    patch(True); assert target.read_bytes() == original
    prefix = b'// unrelated prefix modification\n'
    suffix = b'\n// unrelated suffix modification\n'
    target.write_bytes(prefix + original + suffix)
    patch(); assert target.read_bytes() == prefix + expected + suffix
    later = b'\n// modification added after installation\n'
    target.write_bytes(target.read_bytes() + later)
    patch(True); assert target.read_bytes() == prefix + original + suffix + later
print('FULL_OEM_PORT_PASSED: v74 hash, byte-identical main-branch result, inverse and unrelated-change preservation.')
