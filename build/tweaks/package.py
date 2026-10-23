"""Package standalone folders, refusing missing or mismatching required assets."""
import hashlib
from pathlib import Path
import sys
from zipfile import ZipFile, ZIP_DEFLATED

from render_installers import LIBDIR, REPO, ROOT, SCHEMA, build, read_manifest, tweak_folders

def package(destination):
    # Refuse packages with stale generated workers or mismatching metadata.
    build(check=True)
    files = [SCHEMA, *sorted((REPO / 'docs/tweaks').glob('*.md'))]
    # No shared files are added for self-contained workers. Future workers
    # opting into libraries must declare their runtime dependency explicitly.
    dependencies = {name + '.sh' for folder in tweak_folders()
                    for name in read_manifest(folder).get('libraries', [])}
    for name in sorted(dependencies):
        files.extend([LIBDIR / name, LIBDIR / (name + '.md5')])
    for folder in tweak_folders():
        read_manifest(folder)
        required = ['run.sh', 'manifest.json']
        # Custom workers may be command-only, with no assets or diff at all.
        required += [p.relative_to(folder).as_posix() for p in (folder / 'assets').rglob('*')
                     if p.is_file() and not p.name.endswith('.md5')]
        if folder.name == 'ssh':
            required += ['assets/' + n for n in
                         ('service.sh', 'sshd_config', 'password.hash', 'usb-log-marker.txt')]
        for relative in required:
            target = folder / relative
            checksum = target.with_name(target.name + '.md5')
            expected, basename = checksum.read_text().split()
            if basename != target.name or hashlib.md5(target.read_bytes()).hexdigest() != expected:
                raise ValueError(f'Checksum mismatch: {target}')
        files.extend(sorted(p for p in folder.rglob('*') if p.is_file()))
    destination = Path(destination).resolve()
    if destination == ROOT or ROOT in destination.parents or LIBDIR in destination.parents or destination in files:
        raise ValueError('Place the ZIP outside the runtime tweak folders and source files.')
    destination.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(destination, 'w', ZIP_DEFLATED) as archive:
        for path in files:
            archive.write(path, path.relative_to(REPO).as_posix())
    with ZipFile(destination) as archive:
        assert archive.testzip() is None
        for path in files:
            assert archive.read(path.relative_to(REPO).as_posix()) == path.read_bytes()
    print(f'{destination}: {len(files)} verified files, {destination.stat().st_size} bytes')

if __name__ == '__main__':
    package(sys.argv[1])
