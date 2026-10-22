"""Package standalone folders, refusing missing or mismatching required assets."""
import hashlib
from pathlib import Path
import sys
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent
IDS = ('ssh', 'list-beep', 'shorter-delay', 'list-loop', 'main-menu-loop')

def package(destination):
    files = [ROOT / 'README.md']
    for name in IDS:
        folder = ROOT / name
        required = ['run.sh', 'assets/change.patch']
        if name == 'ssh':
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
    if destination == ROOT or ROOT in destination.parents:
        raise ValueError('Place the ZIP outside the source diffpatch directory.')
    destination.parent.mkdir(parents=True, exist_ok=True)
    with ZipFile(destination, 'w', ZIP_DEFLATED) as archive:
        for path in files:
            archive.write(path, 'diffpatch/' + path.relative_to(ROOT).as_posix())
    with ZipFile(destination) as archive:
        assert archive.testzip() is None
        for path in files:
            assert archive.read('diffpatch/' + path.relative_to(ROOT).as_posix()) == path.read_bytes()
    print(f'{destination}: {len(files)} verified files, {destination.stat().st_size} bytes')

if __name__ == '__main__':
    if len(sys.argv) != 2:
        raise SystemExit('Usage: python3 diffpatch/package.py OUTPUT.zip')
    package(sys.argv[1])
