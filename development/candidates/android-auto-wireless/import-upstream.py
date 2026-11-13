"""Import a pinned upstream release locally; never runs on the CMU."""
from pathlib import Path
import argparse
import hashlib
import json
import zipfile

ROOT = Path(__file__).resolve().parent
MEMBERS = {
    'libpatch-blmjciaapa.so': 'libpatch-blmjciaapa.so',
    'libpatch-aap_service.so': 'libpatch-aap_service.so',
    'aaw_listend': 'aaw_listend',
    'aaw_handler': 'aaw_handler',
    'resources/wl/start-aa-ap.sh': 'start-aa-ap.sh',
    'resources/wl/reset-aa-dongle.sh': 'reset-aa-dongle.sh',
}

def prepare(archive, metadata):
    assert hashlib.sha256(archive.read_bytes()).hexdigest() == metadata['archive_sha256'], 'Unexpected upstream archive; review and pin a new release first.'
    prefix = 'oem-aa-mod-' + metadata['artifact_commit'] + '/'
    with zipfile.ZipFile(archive) as z:
        assert len(z.namelist()) == len(set(z.namelist())), 'Duplicate archive entries.'
        payload = {dest: z.read(prefix + member) for member, dest in MEMBERS.items()}
    for name, data in payload.items():
        if name.endswith('.so') or name in ('aaw_listend', 'aaw_handler'):
            assert data[:6] == b'\x7fELF\x01\x01' and data[18:20] == b'\x28\x00', 'Expected ARM ELF32: ' + name
        else:
            assert data.startswith(b'#!/bin/sh') and b'\x00' not in data, 'Expected POSIX script: ' + name
    return payload

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    args = parser.parse_args()
    metadata = json.loads((ROOT / 'upstream.json').read_text(encoding='utf-8'))
    payload = prepare(args.archive, metadata)
    destination = ROOT / 'assets/upstream'
    assert (destination / 'LICENSE').is_file() and (destination / 'NOTICE.md').is_file(), 'Upstream licensing files required.'
    for name, data in payload.items():
        (destination / name).write_bytes(data)
    print('Imported pinned wireless payload; no installer, private config or OEM replacement files copied.')
