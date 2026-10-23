"""Render independent shell installers from reviewed templates and manifests.

This build-time tool needs only Python's standard library. It does not create
patches or read private firmware dumps, and the CMU does not need Python/JSON tools.
"""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shlex

ROOT = Path(__file__).resolve().parent
ACTIONS = ['dialog', 'install', 'uninstall', 'restore', 'status']
FIELDS = {
    'schema_version', 'id', 'name', 'description', 'version', 'type', 'group',
    'firmware', 'entrypoint', 'actions', 'target', 'original_md5', 'lock_group',
    'status_scope',
}


def read_manifest(folder):
    """Validate metadata without executing it or accepting arbitrary paths."""
    raw = (folder / 'manifest.json').read_bytes()
    if b'\r' in raw:
        raise ValueError(f'{folder.name}: manifest must use LF')
    manifest = json.loads(raw)
    if set(manifest) != FIELDS or manifest['schema_version'] != 1:
        raise ValueError(f'{folder.name}: unsupported manifest fields/schema')
    if manifest['id'] != folder.name or not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', folder.name):
        raise ValueError(f'{folder.name}: invalid tweak ID')
    for key in ('name', 'description'):
        value = manifest[key]
        if not isinstance(value, str) or not value or any(ord(c) < 32 or ord(c) > 126 for c in value):
            raise ValueError(f'{folder.name}: {key} must be one printable ASCII line')
    if "'" in manifest['description']:
        raise ValueError(f'{folder.name}: description contains a shell quote')
    if not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+', manifest['version']):
        raise ValueError(f'{folder.name}: invalid version')
    if manifest['type'] not in ('patch', 'service') or manifest['group'] not in ('interface', 'system'):
        raise ValueError(f'{folder.name}: unsupported type/group')
    if manifest['firmware'] != ['74.00.324'] or manifest['entrypoint'] != 'run.sh':
        raise ValueError(f'{folder.name}: unsupported firmware/entrypoint')
    if manifest['actions'] != ACTIONS or manifest['status_scope'] != 'target-patch':
        raise ValueError(f'{folder.name}: unsupported action/status contract')
    if not re.fullmatch(r'/jci/[A-Za-z0-9_./-]+', manifest['target']) or '..' in manifest['target'].split('/'):
        raise ValueError(f'{folder.name}: invalid target')
    if not re.fullmatch(r'[0-9a-f]{32}', manifest['original_md5']):
        raise ValueError(f'{folder.name}: invalid OEM checksum')
    if not re.fullmatch(r'[A-Za-z0-9_-]+', manifest['lock_group']):
        raise ValueError(f'{folder.name}: invalid lock group')
    return manifest


def tweak_folders():
    """Folders are discovered by manifest, just as a future launcher can do."""
    return sorted(path.parent for path in ROOT.glob('*/manifest.json'))


def render(folder):
    manifest = read_manifest(folder)
    ssh = manifest['id'] == 'ssh'
    values = {
        'ID': shlex.quote(manifest['id']),
        'TITLE': shlex.quote(manifest['name']),
        'TITLE_COMMENT': manifest['name'],
        'DESCRIPTION': manifest['description'],
        'TARGET': shlex.quote(manifest['target']),
        'ORIGINAL': manifest['original_md5'],
        'GROUP': manifest['lock_group'],
        'SSH_FUNCTIONS': (ROOT / 'templates/ssh-functions.sh.in').read_text().rstrip() if ssh else '',
        'SSH_PREPARE': 'ssh_prepare' if ssh else '# No extra payload to prepare for this UI tweak.',
        'SSH_COMPLETE': 'ssh_complete' if ssh else '# No service activation needed for this UI tweak.',
    }
    source = (ROOT / 'templates/run.sh.in').read_text()
    for key, value in values.items():
        source = source.replace('@' + key + '@', value)
    if re.search(r'@[A-Z_]+@', source):
        raise ValueError(f'{folder.name}: unresolved template token')
    return source.encode('ascii')


def checksum_bytes(path, data):
    return f'{hashlib.md5(data).hexdigest()}  {path.name}\n'.encode('ascii')


def build(check=False):
    folders = tweak_folders()
    if not folders:
        raise ValueError('No manifests found')
    for folder in folders:
        script = folder / 'run.sh'
        outputs = {script: render(folder)}
        # Assets are never rewritten here: preserve exact patch/service bytes.
        for path in [script, folder / 'manifest.json', *sorted((folder / 'assets').iterdir())]:
            if path.is_file() and not path.name.endswith('.md5'):
                data = outputs[path] if path in outputs else path.read_bytes()
                outputs[path.with_name(path.name + '.md5')] = checksum_bytes(path, data)
        for path, data in outputs.items():
            if check:
                if not path.is_file() or path.read_bytes() != data:
                    raise ValueError(f'Outdated generated file: {path.relative_to(ROOT)}')
            else:
                path.write_bytes(data)
        print(f'{folder.name}: ' + ('generated files verified' if check else 'installer and checksums updated'))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true', help='Fail if generated files need rebuilding')
    build(parser.parse_args().check)
