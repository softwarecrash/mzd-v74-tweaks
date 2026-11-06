"""PR entrypoint: metadata, syntax and developer test coverage."""
from pathlib import Path
import os
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
USB = ROOT / 'usb'
SHELL = 'C:/Program Files/Git/bin/bash.exe' if os.name == 'nt' else '/bin/sh'
sys.path.insert(0, str(ROOT / 'tests/contract'))
from cases import CASES

def require(ok, message):
    if not ok:
        raise SystemExit(message)

from manifest import read as read_manifest

manifests = {}
for folder in sorted((USB / 'tweaks').iterdir()):
    if not folder.is_dir():
        continue
    require((folder / 'manifest.conf').is_file(), 'Unexpected folder under tweaks/: ' + folder.name)
    m = read_manifest(folder / 'manifest.conf')
    require(m['id'] == folder.name, 'Manifest ID/folder mismatch: ' + folder.name)
    require(len(m['firmware']) == 1, 'Add explicit multi-firmware worker coverage before advertising it: ' + folder.name)
    require(m['id'] in CASES, 'Register entrypoint tests in tests/contract/cases.py: ' + m['id'])
    if m.get('reset_entrypoint'):
        require((folder / m['reset_entrypoint']).is_file() and not (folder / m['reset_entrypoint']).is_symlink(), 'Reset hook missing or linked: ' + folder.name)
    if m['type'] in ['service', 'files', 'gui-extension']:
        require(m.get('reset_entrypoint') == 'reset.sh', 'Managed persistent extras require a reset hook: ' + folder.name)
    if m.get('gui_entrypoint'):
        require((folder / m['gui_entrypoint']).is_file() and not (folder / m['gui_entrypoint']).is_symlink(), 'GUI entrypoint missing or linked: ' + folder.name)
    for key in ['gui_resident', 'gui_service', 'gui_translations']:
        if m.get(key):
            require((folder / m[key]).is_file() and not (folder / m[key]).is_symlink(), 'GUI asset missing or linked: ' + folder.name + ' (' + key + ')')
    for key, val in m.items():
        if key.startswith('config.') and key.endswith('.source') and val != '-':
            require((folder / val).exists() and not (folder / val).is_symlink(), 'Config template source missing or linked: ' + folder.name + ' (' + val + ')')
    source = (folder / 'run.sh').read_text(encoding='utf-8')
    require(('mzd_manifest_load "$HERE/manifest.conf"' in source or (m['type']=='gui-extension' and 'mzd_gui_main "$@"' in source) or (CASES[m['id']] == 'export-command' and 'mzd_export_main "$@"' in source) or (m.get('shim_asset') and 'mzd_shim_main "$@"' in source) or (m.get('components') and 'mzd_bundle_main "$@"' in source)), 'Worker must load its manifest: ' + folder.name)
    require(not re.search(r'^(ID|FIRMWARE|APP|ORIGINAL|LOCK|REQUIRES|CONFLICTS)=', source, re.M),
            'Do not duplicate manifest configuration in run.sh: ' + folder.name)
    require(not re.search(r'(^|\n|;)\s*(/jci/tools/)?(reboot|jci-dialog)(?=\s|$)', '\n'.join(line for line in source.splitlines() if not line.lstrip().startswith('#'))),
            'Workers must not open dialogs or reboot: ' + folder.name)
    patch = folder / 'assets/change.patch'
    if patch.is_file():
        headers = [line for line in patch.read_text(encoding='utf-8').splitlines() if line.startswith(('--- ', '+++ '))]
        require(headers == ['--- target.data', '+++ target.data'], 'Patch must target only target.data: ' + folder.name)
    manifests[m['id']] = m
for id_, m in manifests.items():
    for other in m['requires'] + m['conflicts']:
        require(other in manifests and other != id_, 'Invalid dependency/conflict for ' + id_)
    require(not set(m['requires']) & set(m['conflicts']), 'A required tweak cannot also conflict: ' + id_)
def visit(id_, trail):
    require(id_ not in trail, 'Dependency cycle: ' + ' -> '.join(trail + [id_]))
    for dependency in manifests[id_]['requires']:
        visit(dependency, trail + [id_])
for id_ in manifests:
    visit(id_, [])
for path in ROOT.rglob('*.sh'):
    subprocess.run([SHELL, '-n', str(path)], check=True)
for name in ['server.lua', 'process.lua', 'protocol.lua']:
    require((USB / 'lib/lua-bridge' / name).is_file(), 'Lua transport file missing: ' + name)
require(not (USB / 'bin').exists(), 'Obsolete compiled helpers must not ship.')
require(not (USB / 'transport-backend').exists(), 'The installer uses Lua directly, without a selector.')
require((USB / 'installer.conf').is_file(), 'Installer logging configuration missing.')
require((USB / 'jci-autoupdate').is_file(), 'USB autoupdate marker missing.')
require(len(list(USB.glob('*.up'))) == 1, 'Expected exactly one automatic USB entry file.')
require(not (USB / 'start-ssh.sh').exists() and not (USB / 'mazda.pub').exists(), 'Temporary SSH must not ship.')
print('Validated', len(manifests), 'tweaks, dependency graph, syntax and runnable USB structure.')
