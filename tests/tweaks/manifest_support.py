"""Data-only manifest validation for offline tests; no code generation."""
import json
from pathlib import Path
import re

REPO = Path(__file__).resolve().parents[2]
ROOT = REPO / 'tweaks'
SCHEMA = REPO / 'schemas/tweak-manifest.schema.json'
ACTIONS = ['install', 'uninstall', 'status']
FIELDS = {
    'schema_version', 'id', 'name', 'description', 'version', 'type', 'group',
    'firmware', 'entrypoint', 'actions', 'target', 'original_md5', 'lock_group',
    'status_scope', 'reboot_required',
}
REQUIRED_FIELDS = FIELDS - {'target', 'original_md5', 'lock_group'}


def read_manifest(folder):
    """Validate metadata without executing it or accepting arbitrary paths."""
    raw = (folder / 'manifest.json').read_bytes()
    if b'\r' in raw:
        raise ValueError(f'{folder.name}: manifest must use LF')
    manifest = json.loads(raw)
    if not REQUIRED_FIELDS <= set(manifest) <= FIELDS or manifest['schema_version'] != 6:
        raise ValueError(f'{folder.name}: unsupported manifest fields/schema')
    if manifest['id'] != folder.name or not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', folder.name):
        raise ValueError(f'{folder.name}: invalid tweak ID')
    for key in ('name', 'description'):
        value = manifest[key]
        if not isinstance(value, str) or not value or any(ord(c) < 32 or ord(c) > 126 for c in value):
            raise ValueError(f'{folder.name}: {key} must be one printable ASCII line')
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
