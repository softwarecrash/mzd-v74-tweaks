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

REPO = Path(__file__).resolve().parents[2]
ROOT = REPO / 'tweaks'
TEMPLATES = Path(__file__).with_name('templates')
SCHEMA = REPO / 'schemas/tweak-manifest.schema.json'
LIBDIR = REPO / 'lib'
LIBRARIES = ('common.sh', 'system.sh', 'patch.sh')
LIBRARY_API = 2
ACTIONS = ['install', 'uninstall', 'status']
FIELDS = {
    'schema_version', 'id', 'name', 'description', 'version', 'type', 'group',
    'firmware', 'entrypoint', 'actions', 'target', 'original_md5', 'lock_group',
    'status_scope', 'reboot_required', 'library_api', 'libraries',
}
REQUIRED_FIELDS = FIELDS - {'target', 'original_md5', 'lock_group'}
GENERATED_IDS = {'ssh', 'list-beep', 'list-loop', 'shorter-delay', 'main-menu-loop'}


def read_manifest(folder):
    """Validate metadata without executing it or accepting arbitrary paths."""
    raw = (folder / 'manifest.json').read_bytes()
    if b'\r' in raw:
        raise ValueError(f'{folder.name}: manifest must use LF')
    manifest = json.loads(raw)
    if not REQUIRED_FIELDS <= set(manifest) <= FIELDS or manifest['schema_version'] != 5:
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
    if manifest['type'] not in ('patch', 'service', 'command', 'files'):
        raise ValueError(f'{folder.name}: unsupported implementation type')
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', manifest['group']):
        raise ValueError(f'{folder.name}: invalid menu group')
    firmware = manifest['firmware']
    if not isinstance(firmware, list) or not firmware:
        raise ValueError(f'{folder.name}: firmware must be a nonempty version list')
    for version in firmware:
        if not isinstance(version, str) or not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+', version):
            raise ValueError(f'{folder.name}: invalid firmware version')
    if len(set(firmware)) != len(firmware) or manifest['entrypoint'] != 'run.sh':
        raise ValueError(f'{folder.name}: duplicate firmware or unsupported entrypoint')
    scopes = ('target-patch', 'configuration', 'payload', 'service-health')
    if manifest['actions'] != ACTIONS or manifest['status_scope'] not in scopes:
        raise ValueError(f'{folder.name}: unsupported action/status contract')
    if type(manifest['reboot_required']) is not bool:
        raise ValueError(f'{folder.name}: reboot_required must be a boolean')
    if type(manifest['library_api']) is not int or manifest['library_api'] != LIBRARY_API:
        raise ValueError(f'{folder.name}: unsupported shared library API')
    libraries = manifest['libraries']
    if not isinstance(libraries, list) or 'common' not in libraries:
        raise ValueError(f'{folder.name}: library selection must include common')
    for name in libraries:
        if not isinstance(name, str) or name + '.sh' not in LIBRARIES:
            raise ValueError(f'{folder.name}: unknown library')
    if len(set(libraries)) != len(libraries):
        raise ValueError(f'{folder.name}: duplicate library selection')
    if 'target' in manifest:
        target = manifest['target']
        if not re.fullmatch(r'/[A-Za-z0-9_./-]+', target) or '..' in target.split('/'):
            raise ValueError(f'{folder.name}: invalid target')
    if 'original_md5' in manifest and not re.fullmatch(r'[0-9a-f]{32}', manifest['original_md5']):
        raise ValueError(f'{folder.name}: invalid OEM checksum')
    if 'lock_group' in manifest and not re.fullmatch(r'[A-Za-z0-9_-]+', manifest['lock_group']):
        raise ValueError(f'{folder.name}: invalid lock group')
    return manifest


def tweak_folders():
    """Folders are discovered by manifest, just as a future launcher can do."""
    return sorted(path.parent for path in ROOT.glob('*/manifest.json'))


def render(folder):
    manifest = read_manifest(folder)
    if folder.name not in GENERATED_IDS:
        raise ValueError(f'{folder.name}: has a hand-maintained entrypoint, not this template')
    if manifest['firmware'] != ['74.00.324'] or manifest['libraries'] != ['common', 'system', 'patch']:
        raise ValueError(f'{folder.name}: unsupported generated-worker configuration')
    ssh = manifest['id'] == 'ssh'
    values = {
        'ID': shlex.quote(manifest['id']),
        'TITLE_COMMENT': manifest['name'],
        'TARGET': shlex.quote(manifest['target']),
        'ORIGINAL': manifest['original_md5'],
        'GROUP': manifest['lock_group'],
        'LIBRARY_API': str(manifest['library_api']),
        'LIBRARY_FILES': ' '.join(name + '.sh' for name in manifest['libraries']),
        'SSH_FUNCTIONS': (TEMPLATES / 'ssh-functions.sh.in').read_text().rstrip() if ssh else '',
        'SSH_PREPARE': 'ssh_prepare || exit 1' if ssh else ': # No service-specific preparation.',
        'SSH_COMPLETE': 'ssh_complete || exit 1' if ssh else ': # No service-specific completion.',
    }
    source = (TEMPLATES / 'worker.sh.in').read_text()
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
    for name in LIBRARIES:
        path = LIBDIR / name
        checksum = path.with_name(path.name + '.md5')
        data = path.read_bytes()
        if b'\r' in data:
            raise ValueError(f'{name}: library must use LF')
        expected = checksum_bytes(path, data)
        if check:
            if not checksum.is_file() or checksum.read_bytes() != expected:
                raise ValueError(f'Outdated library checksum: {name}')
        else:
            checksum.write_bytes(expected)
    for folder in folders:
        script = folder / 'run.sh'
        read_manifest(folder)
        # The template belongs only to these five reference workers. Custom
        # command/service/file workers keep their own run.sh and lifecycle.
        outputs = {script: render(folder)} if folder.name in GENERATED_IDS else {}
        if not outputs and not script.is_file():
            raise ValueError(f'Missing worker: {script}')
        # Assets are never rewritten here: preserve exact patch/service bytes.
        for path in [script, folder / 'manifest.json', *sorted((folder / 'assets').rglob('*'))]:
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
    args = parser.parse_args()
    build(args.check)
