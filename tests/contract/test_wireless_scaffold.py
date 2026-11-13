"""Run the development adapter in the real USB layout; assert no mutations."""
from pathlib import Path
import json
import hashlib
import importlib.util
import zipfile
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
assert metadata['requires'] == ['tplink-rtl8811au']
assert metadata['config.libpatch.path'] == '/tmp/mnt/data_persist/mzd-tweaks/shims/android-auto-wireless/libpatch.conf'
assert metadata['config.libpatch.source'] == 'assets/libpatch.conf'
assert (CANDIDATE / metadata['config.libpatch.source']).is_file()
provenance = json.loads((CANDIDATE / 'upstream.json').read_text())
assert provenance['repository'] == 'https://github.com/PingusPepan/oem-aa-mod'
assert provenance['payload_bundled'] is True
assert len(provenance['archive_sha256']) == 64
assert provenance['upstream_license'] == 'AGPL-3.0'
assert metadata['components'] == 'components.tsv'
assert (CANDIDATE / 'components.tsv').is_file()
for name in ['LICENSE', 'NOTICE.md', 'start-aa-ap.sh', 'reset-aa-dongle.sh']:
    assert (CANDIDATE / 'assets/upstream' / name).is_file()
for name in ['libpatch-blmjciaapa.so', 'libpatch-aap_service.so', 'aaw_listend', 'aaw_handler']:
    payload = (CANDIDATE / 'assets/upstream' / name).read_bytes()
    assert payload[:6] == b'\x7fELF\x01\x01' and payload[18:20] == b'\x28\x00'

# Exercise the importer using generated archives; no external download is needed.
spec = importlib.util.spec_from_file_location('wireless_import', CANDIDATE / 'import-upstream.py')
importer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(importer)
with tempfile.TemporaryDirectory(prefix='wireless-import-') as directory:
    archive = Path(directory) / 'payload.zip'
    with zipfile.ZipFile(archive, 'w') as z:
        for member, name in importer.MEMBERS.items():
            z.writestr('oem-aa-mod-f646816/' + member, (CANDIDATE / 'assets/upstream' / name).read_bytes())
        z.writestr('oem-aa-mod-f646816/resources/libpatch.conf', 'private = never import')
        z.writestr('oem-aa-mod-f646816/install.sh', 'never execute')
    fixture_metadata = dict(provenance, archive_sha256=hashlib.sha256(archive.read_bytes()).hexdigest())
    payload = importer.prepare(archive, fixture_metadata)
    assert set(payload) == set(importer.MEMBERS.values())
    assert 'libpatch.conf' not in payload and 'install.sh' not in payload
    try:
        importer.prepare(archive, dict(fixture_metadata, archive_sha256='0' * 64))
    except AssertionError:
        pass
    else:
        raise AssertionError('Importer accepted an unpinned archive')

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
    assert r.stdout == 'uninstalled\n' and not r.stderr
    r = call('run.sh', ['preflight'], 1)
    assert r.stdout.startswith('block\t')
    for args in [['other'], ['status', 'extra'], ['install', '--preserve-config']]:
        call('run.sh', args, 1)
    call('reset.sh', ['check'], 1)
    for args in [[], ['prepare'], ['finish'], ['other']]:
        call('reset.sh', args, 1)
print('WIRELESS_SCAFFOLD_PASSED: pinned payload, normal USB-layout entrypoint, read-only discovery/preflight, argument checks and missing-target reset refusal.')
