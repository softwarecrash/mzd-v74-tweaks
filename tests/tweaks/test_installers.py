"""Independent small-file tests of each standalone installer; no real device writes."""
import difflib
import hashlib
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest

REPO = Path(__file__).resolve().parents[2]
ROOT = REPO / 'tweaks'
SHELL = 'C:/Program Files/Git/bin/bash.exe' if os.name == 'nt' else '/bin/sh'
UI_IDS = ['list-beep', 'shorter-delay', 'list-loop', 'main-menu-loop']
ORIGINAL = b'alpha\nbeta\ngamma\nkeep 1\nkeep 2\nkeep 3\nkeep 4\none\ntwo\nthree\n'
INSTALLED = ORIGINAL.replace(b'beta\n', b'BETA\n').replace(b'two\n', b'TWO\n')

def bp(path):
    value = Path(path).resolve().as_posix()
    return '/' + value[0].lower() + value[2:] if len(value) > 1 and value[1] == ':' else value

def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding='utf-8', newline='\n')
    path.chmod(0o755)

def md5(data):
    return hashlib.md5(data).hexdigest()

def checksum(path):
    write(path.with_name(path.name + '.md5'), md5(path.read_bytes()) + '  ' + path.name + '\n')

class Fixture:
    def __init__(self, id):
        self.temporary = tempfile.TemporaryDirectory(prefix='diffpatch-installer-')
        self.tmp = Path(self.temporary.name)
        self.id = id
        self.usb, self.bins = self.tmp/'USB stick', self.tmp/'bin'
        self.usb.mkdir(); self.bins.mkdir()
        self.folder = self.usb/'arbitrary folder name'
        self.libs = self.usb/'lib'
        shutil.copytree(ROOT/id, self.folder)
        self.script = self.folder/'run.sh'
        self.app, self.gpio, self.mounts = self.tmp/'target.data', self.tmp/'gpio', self.tmp/'mounts'
        self.backup = self.app.with_name(self.app.name+'.org')
        self.resources = self.tmp/'resources'
        self.service = self.resources/'mzd-v74-tweaks/ssh'
        self.version = self.tmp/'version.ini'
        self.events = self.tmp/'events'
        write(self.gpio,'0\n')
        write(self.mounts,f'mock {bp(self.usb)} vfat rw 0 0\nroot / relfs ro 0 0\nres {bp(self.resources)} relfs ro 0 0\n')
        write(self.version,'JCI_SW_VER="MAZ_CMU-150_74.00.324"\n')
        write(self.events,'')
        write(self.bins/'sync', f'#!/bin/sh\necho sync >> "{bp(self.events)}"\n')
        # A tweak must never open/close UI processes or restart the CMU.
        for name in ['jci-dialog', 'killall', 'reboot']:
            write(self.bins/name, f'#!/bin/sh\necho FORBIDDEN-{name} >> "{bp(self.events)}"\nexit 97\n')
        write(self.bins/'mount',f'''#!/bin/sh
if [ "$3" = / ] && [ "$2" = rw,remount ] && [ -f "{bp(self.tmp/'fail-mount')}" ]; then exit 1; fi
if [ "$3" = / ] || [ "$3" = "{bp(self.resources)}" ]; then
  awk -v p="$3" -v o="$2" '$2==p {{$4=(o=="rw,remount"?"rw":"ro")}} {{print}}' "{bp(self.mounts)}" > "{bp(self.tmp/'mounts.new')}"
  mv "{bp(self.tmp/'mounts.new')}" "{bp(self.mounts)}"
fi
''')
        write(self.bins/'cat',f'''#!/bin/sh
case "$1" in
  */install/target.data|*/uninstall/target.data)
    if [ -f "{bp(self.tmp/'fail-write')}" ]; then printf corrupt; exit 0; fi ;;
esac
exec /bin/cat "$@"
''')
        if id == 'ssh':
            self.original = b'#!/bin/sh\n\n'
            mock = f'''#!/bin/sh
D=$(CDPATH= cd "$(dirname "$0")" && pwd)
case "$1" in
check) [ ! -f "{bp(self.tmp/'foreign-port')}" ] ;;
boot)
  # A detached service must not retain the launcher's stdout/stderr pipes.
  if ( : >&3 ) 2>/dev/null || ( : >&4 ) 2>/dev/null; then exit 1; fi
  [ ! -f "{bp(self.tmp/'fail-start')}" ] && [ -f "$D/enabled" ] && echo running > "$D/running" ;;
status) [ -f "$D/running" ] ;;
stop) rm -f "$D/running" ;;
*) exit 1 ;;
esac
'''
            write(self.folder/'assets/service.sh',mock)
            checksum(self.folder/'assets/service.sh')
        else:
            self.original = ORIGINAL
            patch = ''.join(difflib.unified_diff(ORIGINAL.decode().splitlines(keepends=True),
                    INSTALLED.decode().splitlines(keepends=True),fromfile='target.data',tofile='target.data',n=1))
            write(self.folder/'assets/change.patch',patch)
            checksum(self.folder/'assets/change.patch')
        self.app.write_bytes(self.original)
        # Redirect only the copied self-contained worker; no runtime lib is copied.
        for path in [self.script]:
            source = path.read_text(encoding='utf-8')
            source = re.sub(r'^APP=.*$', 'APP="'+bp(self.app)+'"',source,flags=re.M)
            source = re.sub(r'^ORIGINAL=.*$', 'ORIGINAL='+md5(self.original),source,flags=re.M)
            source = re.sub(r'^LOCK=.*$', 'LOCK="'+bp(self.tmp/'lock')+'"',source,flags=re.M)
            source = source.replace('/proc/mounts',bp(self.mounts)).replace('/jci/version.ini',bp(self.version))
            source = source.replace('/sys/class/gpio/Watchdog\\ Disable/value',bp(self.gpio))
            source = source.replace('/tmp/mnt/resources',bp(self.resources))
            if path == self.script:
                source = source.replace('#!/bin/sh\n','#!/bin/sh\nPATH="'+bp(self.bins)+':/usr/bin:/bin"\nexport PATH\n',1)
            write(path,source)
            checksum(path)

    def run(self, action=None, code=0, contains=''):
        args = [] if action is None else [action] if isinstance(action, str) else action
        result = subprocess.run([SHELL,bp(self.script),*args],capture_output=True,timeout=25)
        self.stdout = result.stdout.decode(errors='replace')
        self.stderr = result.stderr.decode(errors='replace')
        output = result.stdout.decode(errors='replace')+result.stderr.decode(errors='replace')
        assert result.returncode == code, output
        assert contains in output, output
        assert self.gpio.read_text().strip() == '0'
        assert 'root / relfs ro ' in self.mounts.read_text()
        assert not (self.tmp/'lock').exists()
        assert 'FORBIDDEN-' not in self.events.read_text()
        return output

    def close(self): self.temporary.cleanup()

class StandaloneInstallers(unittest.TestCase):
    def test_standalone_without_shared_files(self):
        for id in [*UI_IDS, 'ssh']:
            f = Fixture(id)
            try:
                self.assertFalse(f.libs.exists())
                source = f.script.read_text()
                self.assertNotIn('LIBDIR=', source)
                self.assertNotIn('. "$LIBDIR/', source)
                f.run('status', contains='uninstalled')
                f.run('install')
                f.run('status', contains='installed')
                f.run('uninstall')
                self.assertEqual(f.app.read_bytes(), f.original)
            finally:
                f.close()

    def test_headless_usage_and_status_contract(self):
        for id in [*UI_IDS, 'ssh']:
            with self.subTest(tweak=id):
                f = Fixture(id)
                try:
                    for action in (None, '--help', '-h'):
                        f.run(action, contains='Usage:')
                    for action in ('restore', 'dialog', 'unknown', ['install', 'extra']):
                        f.run(action, 1)
                        self.assertEqual(f.stdout, '')
                        self.assertTrue(f.stderr)
                    # Help/invalid actions return before mounts, logs or writes.
                    self.assertEqual(f.events.read_text(), '')
                    self.assertFalse((f.usb/'reports').exists())
                    self.assertFalse(f.backup.exists())
                    self.assertEqual(f.app.read_bytes(), f.original)

                    self.assertEqual(f.run('status'), 'uninstalled\n')
                    self.assertEqual(f.stderr, '')
                    # Errors use stderr, not the machine-readable state channel.
                    with (f.folder/'manifest.json').open('a') as manifest:
                        manifest.write('\n')
                    f.run('status', 1, 'checksum mismatch')
                    self.assertEqual(f.stdout, '')
                    self.assertIn('Reports:', f.stderr)
                    self.assertEqual(f.app.read_bytes(), f.original)
                finally:
                    f.close()

    def test_ui_lifecycle_and_failures(self):
        for id in UI_IDS:
            with self.subTest(tweak=id):
                f=Fixture(id)
                try:
                    f.run('status',contains='uninstalled')
                    f.run('install',contains='install completed')
                    self.assertEqual(f.run('status'), 'installed\n')
                    self.assertEqual(f.stderr, '')
                    self.assertEqual(f.app.read_bytes(),INSTALLED)
                    self.assertEqual(f.backup.read_bytes(),ORIGINAL)
                    f.run('install',contains='already present')
                    foreign=b'// unrelated prefix\n'+INSTALLED+b'// unrelated suffix\n'
                    f.app.write_bytes(foreign)
                    f.run('uninstall')
                    self.assertEqual(f.app.read_bytes(),b'// unrelated prefix\n'+ORIGINAL+b'// unrelated suffix\n')
                    f.run('install');f.run('uninstall')
                    previous=f.app.read_bytes()
                    f.backup.write_bytes(b'bad backup')
                    f.run('install',1,'not the known OEM original')
                    self.assertEqual(f.app.read_bytes(),previous)
                    f.backup.unlink()
                    f.run('install',1,'backup is missing')
                    f.backup.write_bytes(ORIGINAL)
                    # A half-applied multi-hunk patch must not change the system.
                    partial=ORIGINAL.replace(b'beta\n',b'BETA\n')
                    f.app.write_bytes(partial)
                    f.run('install',1,'Patch state is unknown')
                    self.assertEqual(f.app.read_bytes(),partial)
                    f.app.write_bytes(previous)
                    write(f.tmp/'fail-write','yes')
                    f.run('install',1,'previous file was restored')
                    self.assertEqual(f.app.read_bytes(),previous)
                    (f.tmp/'fail-write').unlink()
                    write(f.tmp/'fail-mount','yes')
                    f.run('install',1,'Cannot remount')
                    self.assertEqual(f.app.read_bytes(),previous)
                    (f.tmp/'fail-mount').unlink()
                    write(f.version,'JCI_SW_VER="MAZ_CMU-150_70.00.100"\n')
                    f.run('install',1,'requires firmware')
                    write(f.version,'JCI_SW_VER="MAZ_CMU-150_74.00.324"\n')
                    write(f.folder/'assets/change.patch','damaged')
                    f.run('install',1,'checksum mismatch')
                    self.assertEqual(f.app.read_bytes(),previous)
                finally:f.close()

    def test_ssh_lifecycle_and_failures(self):
        f=Fixture('ssh')
        try:
            write(f.tmp/'foreign-port','yes')
            f.run('install',1,'prerequisites failed')
            self.assertEqual(f.app.read_bytes(),f.original)
            self.assertFalse(f.service.exists())
            (f.tmp/'foreign-port').unlink()
            f.run('install',contains='SSH: port 22')
            self.assertIn(b'service.sh boot',f.app.read_bytes())
            self.assertTrue((f.service/'enabled').exists())
            f.run('install',contains='already present')
            f.run('uninstall')
            self.assertEqual(f.app.read_bytes(),f.original)
            self.assertFalse(f.service.exists())
            f.run('uninstall',contains='already present')
            write(f.tmp/'fail-start','yes')
            f.run('install',1,'runtime changes were reverted')
            self.assertEqual(f.app.read_bytes(),f.original)
            self.assertFalse((f.service/'enabled').exists())
            (f.tmp/'fail-start').unlink()
            # A non-writable enable target must also undo the new hook.
            (f.service/'enabled').mkdir()
            f.run('install',1,'Cannot enable the SSH service')
            self.assertEqual(f.app.read_bytes(),f.original)
            (f.service/'enabled').rmdir()
        finally:f.close()

    def test_package_checksums(self):
        for id in [*UI_IDS,'ssh']:
            for checksum_file in (ROOT/id).rglob('*.md5'):
                expected,name=checksum_file.read_text().split()
                self.assertEqual(md5((checksum_file.parent/name).read_bytes()),expected)

if __name__=='__main__':unittest.main(verbosity=2)
