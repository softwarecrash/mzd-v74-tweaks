"""Exercise optional libraries without a single-file patch worker or real CMU."""
from pathlib import Path
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from zipfile import ZipFile

from test_installers import Fixture, SHELL, ORIGINAL, INSTALLED, bp, checksum, md5, write
import test_metadata


class OptionalLibraries(unittest.TestCase):
    def worker(self, fixture, libraries, body, cleanup=''):
        # Only copied test libraries contain redirected device paths.
        imports = '\n'.join('. "' + bp(fixture.libs/(name + '.sh')) + '"' for name in libraries)
        source = f'''#!/bin/sh
set -u
PATH="{bp(fixture.bins)}:/usr/bin:/bin"
export PATH
{imports}
mzd_begin "{bp(fixture.script)}" custom {cleanup}
{body}
'''
        write(fixture.script, source)
        checksum(fixture.script)

    def test_command_worker_without_patch_or_target(self):
        f = Fixture('main-menu-loop')
        try:
            f.app.unlink()
            # Neither optional module exists on this deliberately small USB.
            (f.libs/'patch.sh').unlink()
            (f.libs/'system.sh').unlink()
            tool = f.bins/'mazda-config-test'
            setting = bp(f.tmp/'configuration')
            write(tool, f'''#!/bin/sh
case "$1" in
  enable) echo enabled > "{setting}" ;;
  disable) rm -f "{setting}" ;;
  status) if [ -f "{setting}" ]; then echo installed; else echo uninstalled; fi ;;
  *) exit 1 ;;
esac
''')
            self.worker(f, ['common'], '''mzd_require_assets "$0" || exit 1
mzd_validate_firmware 74.00.324 || exit 1
mzd_require_tools mazda-config-test || exit 1
case "$1" in
  install) mazda-config-test enable || exit 1 ;;
  uninstall) mazda-config-test disable || exit 1 ;;
  status) mazda-config-test status >&3 ;;
esac''')
            self.assertEqual(f.run('status'), 'uninstalled\n')
            f.run('install'); f.run('install')
            self.assertEqual(f.run('status'), 'installed\n')
            f.run('uninstall'); f.run('uninstall')
            self.assertEqual(f.run('status'), 'uninstalled\n')
            self.assertFalse(f.app.exists())
        finally:
            f.close()

    def test_system_only_worker_multiple_mounts_locks_and_failure_cleanup(self):
        for fail in (False, True):
            with self.subTest(fail=fail):
                f = Fixture('main-menu-loop')
                try:
                    (f.libs/'patch.sh').unlink()
                    second_lock = f.tmp/'second-lock'
                    self.worker(f, ['common', 'system'], f'''mzd_system_begin
mzd_system_lock "{bp(f.tmp/'lock')}" || exit 1
mzd_system_lock "{bp(second_lock)}" || exit 1
mzd_system_watchdog_disable || exit 1
mzd_system_remount_rw / || exit 1
mzd_system_remount_rw "{bp(f.resources)}" || exit 1
{'mzd_fail deliberate' if fail else ':'}
''', 'mzd_system_cleanup')
                    f.run('install', 1 if fail else 0)
                    self.assertFalse(second_lock.exists())
                    self.assertIn(f'res {bp(f.resources)} relfs ro ', f.mounts.read_text())
                finally:
                    f.close()

    def test_two_patch_contexts_and_explicit_rollback(self):
        f = Fixture('main-menu-loop')
        try:
            second = f.tmp/'second.data'
            second.write_bytes(ORIGINAL)
            second_lock = f.tmp/'second-lock'
            # Two contexts coexist, with unrelated caller variable names. No
            # APP, ORIGINAL, PATCH_FILE or STATE globals are supplied to the API.
            self.worker(f, ['common', 'system', 'patch'], f'''mzd_system_begin
mzd_system_lock "{bp(f.tmp/'lock')}" || exit 1
mzd_system_lock "{bp(second_lock)}" || exit 1
state=caller-state
target=caller-target
context=caller-context
before=caller-before
mzd_patch_prepare "{bp(f.app)}" "{bp(f.folder/'assets/change.patch')}" {md5(ORIGINAL)} "$MZD_REPORT/first" || exit 1
mzd_patch_prepare "{bp(second)}" "{bp(f.folder/'assets/change.patch')}" {md5(ORIGINAL)} "$MZD_REPORT/second" || exit 1
[ "$state:$target:$context:$before" = caller-state:caller-target:caller-context:caller-before ] || exit 9
if [ "$1" = status ]
then
  mzd_patch_state "$MZD_REPORT/first" >&3
  exit 0
fi
mzd_patch_validate_backup "$MZD_REPORT/first" || exit 1
mzd_patch_validate_backup "$MZD_REPORT/second" || exit 1
mzd_system_watchdog_disable || exit 1
mzd_system_remount_rw / || exit 1
mzd_patch_apply "$MZD_REPORT/first" "$1" || exit 1
mzd_patch_apply "$MZD_REPORT/second" "$1" || exit 1
if [ -f "{bp(f.tmp/'rollback')}" ]
then
  mzd_patch_rollback "$MZD_REPORT/second" || exit 1
  mzd_patch_rollback "$MZD_REPORT/first" || exit 1
fi
''', 'mzd_system_cleanup')
            self.assertEqual(f.run('status'), 'uninstalled\n')
            f.run('install')
            self.assertEqual(f.app.read_bytes(), INSTALLED)
            self.assertEqual(second.read_bytes(), INSTALLED)
            f.run('uninstall')
            self.assertEqual(f.app.read_bytes(), ORIGINAL)
            self.assertEqual(second.read_bytes(), ORIGINAL)
            write(f.tmp/'rollback', 'yes')
            f.run('install')
            self.assertEqual(f.app.read_bytes(), ORIGINAL)
            self.assertEqual(second.read_bytes(), ORIGINAL)
        finally:
            f.close()

    def test_command_manifest_needs_no_patch_metadata(self):
        data = json.loads((test_metadata.ROOT/'main-menu-loop/manifest.json').read_text())
        for key in ('target', 'original_md5', 'lock_group'):
            del data[key]
        data.update(id='command-example', type='command', status_scope='configuration', libraries=['common'])
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary)/'command-example'
            folder.mkdir()
            (folder/'manifest.json').write_text(json.dumps(data), newline='\n')
            self.assertEqual(test_metadata.builder.read_manifest(folder), data)

    def test_custom_worker_is_not_overwritten_and_packages_without_assets(self):
        # A temporary repository tests the real build tools, without adding a
        # pretend touchscreen tweak to the actual runtime catalogue.
        with tempfile.TemporaryDirectory() as temporary:
            repo = Path(temporary)
            source_repo = test_metadata.REPO
            for relative in ('build/tweaks/render_installers.py', 'build/tweaks/package.py',
                             'schemas/tweak-manifest.schema.json'):
                target = repo/relative
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source_repo/relative, target)
            shutil.copytree(source_repo/'lib', repo/'lib')
            folder = repo/'tweaks/command-example'
            folder.mkdir(parents=True)
            data = json.loads((test_metadata.ROOT/'main-menu-loop/manifest.json').read_text())
            for key in ('target', 'original_md5', 'lock_group'):
                del data[key]
            data.update(id='command-example', type='command', status_scope='configuration', libraries=['common'])
            (folder/'manifest.json').write_text(json.dumps(data), newline='\n')
            worker = b'#!/bin/sh\n# Hand-maintained command worker\nexit 0\n'
            (folder/'run.sh').write_bytes(worker)
            subprocess.run([sys.executable, str(repo/'build/tweaks/render_installers.py')],
                           check=True, capture_output=True)
            self.assertEqual((folder/'run.sh').read_bytes(), worker)
            archive = repo/'usb.zip'
            subprocess.run([sys.executable, str(repo/'build/tweaks/package.py'), str(archive)],
                           check=True, capture_output=True)
            with ZipFile(archive) as package:
                self.assertEqual(package.read('tweaks/command-example/run.sh'), worker)
                self.assertIn('lib/common.sh', package.namelist())
                self.assertFalse(any('/assets/' in name for name in package.namelist()))


if __name__ == '__main__':
    unittest.main(verbosity=2)
