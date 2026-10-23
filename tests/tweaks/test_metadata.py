"""Check discovery metadata and standalone worker configuration."""
import json
from pathlib import Path
import tempfile
import unittest

REPO = Path(__file__).resolve().parents[2]
ROOT = REPO / 'tweaks'
import manifest_support as metadata_support
IDS = {'ssh', 'list-beep', 'shorter-delay', 'list-loop', 'main-menu-loop'}


class MetadataAndWorkers(unittest.TestCase):
    def test_discovery_and_standalone_installers(self):
        folders = metadata_support.tweak_folders()
        self.assertEqual({p.name for p in folders}, IDS)
        schema = json.loads(metadata_support.SCHEMA.read_text())
        self.assertEqual(set(schema['required']), metadata_support.REQUIRED_FIELDS)
        self.assertEqual(set(schema['properties']), metadata_support.FIELDS)
        targets = {}
        for folder in folders:
            metadata = metadata_support.read_manifest(folder)
            self.assertEqual(metadata['actions'], ['install', 'uninstall', 'status'])
            self.assertEqual(metadata['reboot_required'], folder.name != 'ssh')
            self.assertNotIn('libraries', metadata)
            self.assertNotIn('library_api', metadata)
            source = (folder / metadata['entrypoint']).read_text()
            self.assertIn('ID=' + metadata['id'], source)
            self.assertIn('APP=' + metadata['target'], source)
            self.assertIn('ORIGINAL=' + metadata['original_md5'], source)
            self.assertIn('LOCK=/tmp/mzd-' + metadata['lock_group'] + '-tweak.lock', source)
            # Different tweaks editing the same file must share the same lock.
            target = metadata['target']
            targets.setdefault(target, metadata['lock_group'])
            self.assertEqual(targets[target], metadata['lock_group'])

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
                    metadata_support.read_manifest(folder)

if __name__ == '__main__':
    unittest.main(verbosity=2)
