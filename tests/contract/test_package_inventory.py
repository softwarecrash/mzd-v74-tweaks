"""Real package inventories: byte compatibility, batching and fail-closed input handling."""
from pathlib import Path
import hashlib, math, os, shlex, shutil, subprocess, tempfile, time

ROOT = Path(__file__).resolve().parents[2]
SHELL = os.environ.get('INVENTORY_SHELL', '/bin/sh')
HELPER = Path(os.environ.get('INVENTORY_HELPER', ROOT / 'usb/lib/packages.sh'))
checks = 0

def write(path, text):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding='utf-8', newline='\n')
    path.chmod(0o755)

with tempfile.TemporaryDirectory(prefix='mzd-inventory-test-') as temp:
    base = Path(temp); entry = base / 'entry'; package = entry / 'package'
    package.mkdir(parents=True); bins = base / 'bin'; bins.mkdir()
    calls = base / 'hash-calls'
    real_md5 = shutil.which('md5sum')
    assert real_md5
    write(bins / 'md5sum', '#!/bin/sh\nprintf "call\\n" >> ' + shlex.quote(str(calls)) + '\nexec ' + shlex.quote(real_md5) + ' "$@"\n')
    env = dict(os.environ, PATH=str(bins) + ':' + os.environ['PATH'])
    command = [SHELL, '-c', '. "$1"; mzd_package_inventory "$2"', 'inventory', str(HELPER), str(entry)]
    def run(ok=True):
        global checks
        result = subprocess.run(command, env=env, capture_output=True, timeout=120)
        assert (result.returncode == 0) == ok, (result.returncode, result.stdout, result.stderr)
        checks += 1
        return result.stdout
    assert run() == b'' and not calls.exists()
    for n in range(193):
        write(package / ('nested/file-%03d' % n), 'payload-%d\n' % n)
    for name in ["space name", "quote'and\"double", ' leading and trailing ', '-option']:
        write(package / name, 'special\n')
    def expected():
        files = sorted((p for p in package.rglob('*') if p.is_file()), key=lambda p: os.fsencode(p.relative_to(entry).as_posix()))
        return b''.join(hashlib.md5(p.read_bytes()).hexdigest().encode() + b'\t' + os.fsencode(p.relative_to(entry).as_posix()) + b'\n' for p in files)
    start = time.monotonic()
    first = run(); assert first == expected()
    elapsed = time.monotonic() - start
    assert len(calls.read_text().splitlines()) == math.ceil(197 / 64)
    print('INVENTORY_MEASUREMENT: files=197 md5_processes=%d seconds=%.3f' % (len(calls.read_text().splitlines()), elapsed), flush=True)
    write(package / 'nested/file-000', 'changed\n'); assert run() == expected() and first != expected()
    (package / 'nested/file-001').unlink(); assert run() == expected()
    # Structural checks apply even when inventory is called directly during staging.
    for name in ['bad\tname', 'bad\nname', 'bad\\name']:
        path = package / name; write(path, 'unsupported\n'); run(False); path.unlink()
    target = base / 'foreign'; write(target, 'keep\n')
    link = package / 'link'; link.symlink_to(target); run(False); link.unlink()
    assert target.read_text() == 'keep\n'
    # Failure in each producer must not be hidden by a later successful command.
    original_md5 = (bins / 'md5sum').read_text()
    for tool in ['find', 'sort', 'xargs', 'md5sum']:
        write(bins / tool, '#!/bin/sh\nprintf "partial\\n"\nexit 91\n')
        run(False)
        (bins / tool).unlink()
        if tool == 'md5sum': write(bins / tool, original_md5)
    # Let the structural scans pass; fail specifically in the inventory producer.
    find_calls=base/'find-calls';real_find=shutil.which('find');assert real_find
    write(bins/'find', '#!/bin/sh\nprintf "call\\n" >> '+shlex.quote(str(find_calls))+'\nif [ "$(wc -l < '+shlex.quote(str(find_calls))+')" -eq 3 ]; then echo partial; exit 91; fi\nexec '+shlex.quote(real_find)+' "$@"\n')
    run(False);assert len(find_calls.read_text().splitlines())==3
    (bins/'find').unlink()
    for fake in ['#!/bin/sh\nexit 0\n', '#!/bin/sh\necho malformed\n']:
        write(bins / 'md5sum', fake); run(False)
print('PACKAGE_INVENTORY_PASSED:', checks, 'checks; exact bytes, batch count, changed/missing files, special names, links and producer failures.')
