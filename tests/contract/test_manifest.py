"""Check the actual shell and developer readers, including literal shell syntax."""
from pathlib import Path
import os
import shlex
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / 'tools'))
from manifest import parse

SHELL = 'C:/Program Files/Git/bin/bash.exe' if os.name == 'nt' else '/bin/sh'
def bp(path):
    s = Path(path).resolve().as_posix()
    return '/' + s[0].lower() + s[2:] if len(s) > 1 and s[1] == ':' else s

original = (ROOT / 'usb/tweaks/list-beep/manifest.conf').read_text(encoding='utf-8')
# Attribution cases below supply their own field, independent of real credits.
original = ''.join(line for line in original.splitlines(keepends=True) if not line.startswith('contributors='))
checks = 0
with tempfile.TemporaryDirectory(prefix='cmu-manifest-') as temporary:
    base = Path(temporary); file = base / 'manifest.conf'; driver = base / 'read.sh'
    marker = base / 'must-not-exist'
    driver.write_text('. ' + shlex.quote(bp(ROOT / 'usb/lib/manifest.sh')) + '\n'
                      'mzd_manifest_load "$1" || exit 1\nprintf \'%s\\n\' "$NAME" "$DESCRIPTION" "$APP" "$ORIGINAL" "$LOCK"\n',
                      encoding='utf-8', newline='\n')
    literal = 'Literal = # "quote" \\path $(touch ' + shlex.quote(bp(marker)) + ') `touch ' + shlex.quote(bp(marker)) + '`'
    cases = [
        ('ordinary', original, True),
        ('contributors literal', original+'contributors=Original author; '+literal+'\n', True),
        ('contributors empty', original+'contributors=\n', True),
        ('contributors duplicate', original+'contributors=A\ncontributors=B\n', False),
        ('reset options', original+'confirmation=Reset all?\nrefresh_all=true\nreset_entrypoint=reset.sh\n', True),
        ('invalid refresh', original+'refresh_all=yes\n', False),
        ('invalid reset path', original+'reset_entrypoint=../run.sh\n', False),
        ('CRLF', original.replace('\n', '\r\n'), True),
        ('no final newline', original.rstrip('\n'), True),
        ('comments and blank lines', '# comment\n\n   \n' + original, True),
        ('literal values', original.replace('name=No List Beep', 'name=' + literal), True),
        ('duplicate', original + 'id=list-beep\n', False),
        ('duplicate dependency', original.replace('requires=\n', 'requires=ssh ssh\n'), False),
        ('unknown', original + 'PATH=/bad\n', False),
        ('missing', original.replace('id=list-beep\n', ''), False),
        ('no equals', original + 'invalid line\n', False),
        ('bad contract', original.replace('contract_version=1', 'contract_version=2'), False),
        ('bad ID', original.replace('id=list-beep', 'id=../escape'), False),
        ('bad firmware', original.replace('firmware=74.00.324', 'firmware=unknown'), False),
        ('bad actions', original.replace('actions=install uninstall status', 'actions=reboot'), False),
        ('bad boolean', original.replace('reboot_required=true', 'reboot_required=yes'), False),
        ('bad OEM hash', original.replace('oem_backup_md5=', 'oem_backup_md5=bad'), False),
        ('control character', original + '# tab\t\n', False),
    ]
    shim=(ROOT/'development/examples/shim/manifest.conf').read_text()
    cases += [('shim metadata',shim,True),
              ('partial shim',original+'shim_asset=assets/a.so\n',False),
              ('shim path traversal',shim.replace('shim_asset=assets/shim-example.so','shim_asset=assets/../bad.so'),False),
              ('wrong shim owner',shim.replace('/shims/shim-example/','/shims/other/'),False),
              ('bad shim service',shim.replace('shim_service=jciMMUI','shim_service=jciMMUI;reboot'),False),
              ('bad extra hash',shim.replace(':030e918f5d6edcd62d196ee37b86fe99',':bad'),False),
              ('duplicate shim target',shim.replace('shim_extra_targets=', 'shim_extra_targets=/jci/sm/sm.conf:74d9fc389b74fb01d0cfc2615a82c782 '),False)]
    gui=(ROOT/'development/examples/gui-extension/manifest.conf').read_text()
    cases += [('GUI extension',gui,True),
              ('GUI game container',gui.replace('gui_menu_path=','gui_menu_path=Games'),True),
              ('unsupported GUI API',gui.replace('gui_api=1','gui_api=2'),False),
              ('nested menu path',gui.replace('gui_menu_path=','gui_menu_path=Tools/Examples'),True),
              ('empty path segment',gui.replace('gui_menu_path=','gui_menu_path=Tools//Examples'),False),
              ('path traversal',gui.replace('gui_menu_path=','gui_menu_path=Tools/../Examples'),False),
              ('leading path slash',gui.replace('gui_menu_path=','gui_menu_path=/Tools'),False),
              ('deep menu path',gui.replace('gui_menu_path=','gui_menu_path='+ '/'.join(['a']*9)),False),
              ('GUI traversal',gui.replace('assets/view.html','assets/../view.html'),False),
              ('reserved GUI ID',gui.replace('id=gui-example','id=games'),False),
              ('GUI missing reset',gui.replace('reset_entrypoint=reset.sh\n',''),False),
              ('GUI metadata on patch',original+'gui_api=1\n',False)]
    for label, data, valid in cases:
        file.write_bytes(data.encode('utf-8'))
        try:
            parsed = parse(data); python_ok = True
        except ValueError:
            python_ok = False
        r = subprocess.run([SHELL, bp(driver), bp(file)], capture_output=True, text=True, timeout=15)
        assert python_ok == valid and (r.returncode == 0) == valid, (label, python_ok, r.stdout, r.stderr)
        if valid:
            assert r.stdout.splitlines()[0] == parsed['name'], (label, r.stdout)
        else:
            assert not r.stdout and r.stderr.strip(), (label, r.stdout, r.stderr)
        assert not marker.exists(), 'Manifest content was executed.'
        checks += 1
    # Sequential manifest loading resets optional payload directory.
    manifest_a = base / 'custom.conf'; manifest_b = base / 'default.conf'
    manifest_a.write_text(original + 'payload_dir=/tmp/mnt/data_persist/custom-dir\n', encoding='utf-8')
    manifest_b.write_text(original, encoding='utf-8')
    seq_driver = base / 'seq.sh'
    seq_driver.write_text('. ' + shlex.quote(bp(ROOT / 'usb/lib/manifest.sh')) + '\n'
                          'mzd_manifest_load "$1" || exit 1\n[ "$PAYLOAD_DIR" = /tmp/mnt/data_persist/custom-dir ] || exit 1\n'
                          'mzd_manifest_load "$2" || exit 1\n[ -z "$PAYLOAD_DIR" ] || exit 1\n',
                          encoding='utf-8', newline='\n')
    r = subprocess.run([SHELL, bp(seq_driver), bp(manifest_a), bp(manifest_b)], capture_output=True, text=True, timeout=15)
    assert r.returncode == 0, (r.stdout, r.stderr)
    checks += 1
    # Test the real installer adapter; it validates and forwards the same raw data.
    usb = base / 'usb'; (usb / 'lib').mkdir(parents=True)
    shutil.copyfile(ROOT / 'usb/installer.sh', usb / 'installer.sh')
    for name in ['defines.sh', 'manifest.sh', 'version.sh']:
        shutil.copyfile(ROOT / 'usb/lib' / name, usb / 'lib' / name)
    shutil.copyfile(ROOT / 'usb/VERSION', usb / 'VERSION')
    folder = usb / 'tweaks/list-beep'; folder.mkdir(parents=True)
    (folder / 'manifest.conf').write_text(original, encoding='utf-8', newline='\n')
    for args, expected in [(['list'], 'list-beep\n'), (['manifest', 'list-beep'], original)]:
        r = subprocess.run([SHELL, bp(usb / 'installer.sh')] + args, capture_output=True, text=True, timeout=15)
        assert r.returncode == 0 and r.stdout == expected, (args, r.stdout, r.stderr)
        checks += 1
print('MANIFEST_DATA_PASSED:', checks, 'shell/developer/adapter checks; no evaluation or sidecars.')
