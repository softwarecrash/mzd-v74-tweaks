"""Check discovery metadata, reproducible rendering and ZIP completeness."""
import hashlib
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from zipfile import ZipFile

REPO = Path(__file__).resolve().parents[2]
ROOT = REPO / 'tweaks'
spec = importlib.util.spec_from_file_location('installer_builder', REPO / 'build/tweaks/render_installers.py')
builder = importlib.util.module_from_spec(spec)
spec.loader.exec_module(builder)
IDS = {'ssh', 'list-beep', 'shorter-delay', 'list-loop', 'main-menu-loop'}


class MetadataAndPackage(unittest.TestCase):
    def test_discovery_and_generated_installers(self):
        folders = builder.tweak_folders()
        self.assertEqual({p.name for p in folders}, IDS)
        schema = json.loads(builder.SCHEMA.read_text())
        self.assertEqual(set(schema['required']), builder.REQUIRED_FIELDS)
        self.assertEqual(set(schema['properties']), builder.FIELDS)
        targets = {}
        for folder in folders:
            metadata = builder.read_manifest(folder)
            self.assertEqual(metadata['actions'], ['install', 'uninstall', 'status'])
            self.assertEqual(metadata['reboot_required'], folder.name != 'ssh')
            self.assertNotIn('libraries', metadata)
            self.assertNotIn('library_api', metadata)
            self.assertEqual((folder / metadata['entrypoint']).read_bytes(), builder.render(folder))
            # Different tweaks editing the same file must share the same lock.
            target = metadata['target']
            targets.setdefault(target, metadata['lock_group'])
            self.assertEqual(targets[target], metadata['lock_group'])
        builder.build(check=True)

    def test_manifest_rejects_invalid_data(self):
        source = json.loads((ROOT / 'list-loop/manifest.json').read_text())
        with tempfile.TemporaryDirectory() as temporary:
            folder = Path(temporary) / 'list-loop'
            folder.mkdir()
            for key, value in [('entrypoint', '../other.sh'), ('original_md5', 'unknown'),
                               ('firmware', ['invalid']), ('id', 'other'),
                               ('target', '/jci/../etc/passwd'),
                               ('reboot_required', 'yes'), ('reboot_required', 1),
                               ('library_api', 99), ('library_api', True),
                               ('actions', ['install', 'uninstall', 'restore', 'status'])]:
                data = dict(source, **{key: value})
                (folder / 'manifest.json').write_text(json.dumps(data))
                with self.subTest(field=key), self.assertRaises(ValueError):
                    builder.read_manifest(folder)

    def test_packaged_metadata_and_payloads(self):
        with tempfile.TemporaryDirectory() as temporary:
            archive = Path(temporary) / 'usb.zip'
            subprocess.run([sys.executable, str(REPO / 'build/tweaks/package.py'), str(archive)], check=True)
            with ZipFile(archive) as package:
                for name in IDS:
                    prefix = 'tweaks/' + name + '/'
                    self.assertEqual(package.read(prefix + 'manifest.json'),
                                     (ROOT / name / 'manifest.json').read_bytes())
                    for checksum in (ROOT / name).rglob('*.md5'):
                        relative = checksum.relative_to(ROOT / name).as_posix()
                        expected, basename = package.read(prefix + relative).decode().split()
                        target = prefix + str(Path(relative).with_name(basename)).replace('\\', '/')
                        self.assertEqual(hashlib.md5(package.read(target)).hexdigest(), expected)
                self.assertIn('docs/tweaks/README.md', package.namelist())
                self.assertIn('schemas/tweak-manifest.schema.json', package.namelist())
                self.assertFalse(any(p.startswith('lib/') for p in package.namelist()))
                self.assertFalse(any(p.startswith(('build/', 'tests/', 'diffpatch/')) for p in package.namelist()))



if __name__ == '__main__':
    unittest.main(verbosity=2)
