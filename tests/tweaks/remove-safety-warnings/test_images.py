"""Synthetic transactions; never reads or modifies a CMU target."""
from pathlib import Path
import hashlib, os, re, shlex, shutil, struct, subprocess, tempfile, zlib, sys

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / 'usb/tweaks/remove-safety-warnings'
SHELL = 'C:/Program Files/Git/bin/bash.exe' if os.name == 'nt' else '/bin/sh'
def bp(p):
    s = Path(p).resolve().as_posix()
    return '/' + s[0].lower() + s[2:] if len(s)>1 and s[1]==':' else s
def write(p,s):
    p.parent.mkdir(parents=True,exist_ok=True)
    p.write_text(s,encoding='utf-8',newline='\n'); p.chmod(0o755)
def md5(data): return hashlib.md5(data).hexdigest()

# Verify the complete published input inventory and decode our generated assets.
rows = [r.split('\t') for r in (SOURCE/'assets/camera-images.tsv').read_text().splitlines()]
assert len(rows)==46 and len({r[0] for r in rows})==46
for width in (800,801):
    d=(SOURCE/f'assets/transparent-{width}x50.png').read_bytes()
    assert d[:8]==b'\x89PNG\r\n\x1a\n' and struct.unpack('>IIBBBBB',d[16:29])==(width,50,8,6,0,0,0)
    pos=8; encoded=b''
    while pos<len(d):
        n=int.from_bytes(d[pos:pos+4],'big');kind=d[pos+4:pos+8];data=d[pos+8:pos+8+n]
        assert zlib.crc32(kind+data)&0xffffffff==int.from_bytes(d[pos+8+n:pos+12+n],'big')
        if kind==b'IDAT': encoded+=data
        pos+=n+12
    assert zlib.decompress(encoded)==(b'\0'+b'\xff\xff\xff\0'*width)*50

checks=0
with tempfile.TemporaryDirectory(prefix='cmu-safety-images-') as directory:
    b=Path(directory);usb=b/'usb';internal=b/'internal';persist=b/'persist';bins=b/'bin'
    for p in (usb,internal,persist,bins):p.mkdir()
    shutil.copytree(ROOT/'usb/lib',usb/'lib')
    shutil.copyfile(ROOT/'usb/installer.sh',usb/'installer.sh')
    shutil.copyfile(ROOT/'usb/VERSION',usb/'VERSION')
    worker=usb/'tweaks/remove-safety-warnings';shutil.copytree(SOURCE,worker,ignore=shutil.ignore_patterns('tests','*.txt','*.md','*.tsv'))
    # Copy only the inventory/ownership text deliberately excluded above.
    shutil.copyfile(SOURCE/'assets/camera-images.tsv',worker/'assets/camera-images.tsv')
    shutil.copyfile(SOURCE/'managed-paths.tsv',worker/'managed-paths.tsv')
    shutil.copytree(ROOT/'usb/tweaks/restore-originals',usb/'tweaks/restore-originals')
    old=usb/'tweaks/no-more-disclaimer';old.mkdir()
    write(old/'run.sh','#!/bin/sh\nprintf "uninstalled\\n"\n')
    target=internal/'systemApp.js';images=internal/'images';images.mkdir()
    patch=(SOURCE/'assets/change.patch').read_text();lines=[];started=False
    for line in patch.splitlines(keepends=True):
        if line.startswith('@@ '):
            line_no=int(re.match(r'@@ -(\d+)',line)[1])
            while len(lines)<line_no-1:lines.append('// synthetic gap %d\n'%len(lines))
            started=True
        elif started and line[:1] in (' ','-'):lines.append(line[1:])
    stock=''.join(lines);write(target,stock)
    if '--full' not in sys.argv:
        rows=[next(r for r in rows if r[0]==n) for n in ('SafetyText_DE_German.png','SafetyText_UK_English.png','SafetyText_UK_Ukrainian.png')]
    originals={}
    for row in rows:
        originals[row[0]]=b'synthetic original PNG fixture '+row[0].encode()
        (images/row[0]).write_bytes(originals[row[0]]);row[1]=md5(originals[row[0]])
    write(worker/'assets/camera-images.tsv',''.join('\t'.join(r)+'\n' for r in rows))
    write(worker/'managed-paths.tsv','patch\t'+bp(target)+'\n'+''.join('patch\t'+bp(images/r[0])+'\n' for r in rows))
    m=(worker/'manifest.conf').read_text().replace('/jci/gui/apps/system/js/systemApp.js',bp(target)).replace('383d7e688256e09b825ced9e3eb69ee9',md5(stock.encode()))
    write(worker/'manifest.conf',m)
    rp=usb/'tweaks/restore-originals/manifest.conf';write(rp,rp.read_text().replace('target=/jci','target='+bp(internal)))
    version=b/'version';mounts=b/'mounts';gpio=b/'gpio'
    write(version,'JCI_SW_VER="MAZ_CMU-150_74.00.324"\n');write(gpio,'0\n')
    write(mounts,f'mock {bp(usb)} vfat rw 0 0\n/dev/root {bp(internal)} relfs ro 0 0\n/dev/mmcblk0p1 {bp(persist)} relfs rw 0 0\n')
    replacements={'/jci/nativegui/images':bp(images),'/tmp/mnt/data_persist':bp(persist),'/proc/mounts':bp(mounts),'/jci/version.ini':bp(version),'/tmp/mzd-packages.lock':bp(b/'packages.lock'),'/tmp/mzd-restore-originals.lock':bp(b/'restore.lock'),'/tmp/mzd-camera-warning-images.lock':bp(b/'camera.lock'),'/tmp/mzd-$LOCK_GROUP-tweak.lock':bp(b/'target.lock'),'/sys/class/gpio/Watchdog\\ Disable/value':shlex.quote(bp(gpio)),'MZD_SHIM_ROOT=/':'MZD_SHIM_ROOT='+bp(internal)}
    for p in usb.rglob('*.sh'):
        s=p.read_text()
        for a,v in replacements.items():s=s.replace(a,v)
        s=s.replace('/tmp/mnt/sd[a-z][0-9]*|/mnt/sd[a-z][0-9]*',shlex.quote(bp(usb)))
        if p.name=='camera.sh':s=s.replace('NR!=46','NR!='+str(len(rows))).replace('= 46 ]','= '+str(len(rows))+' ]')
        s=s.replace('#!/bin/sh\n','#!/bin/sh\nPATH='+shlex.quote(bp(bins)+':/usr/bin:/bin')+'\nexport PATH\n',1)
        write(p,s)
    write(bins/'sync','#!/bin/sh\nexit 0\n');write(bins/'mount','#!/bin/sh\nexit 0\n')
    write(bins/'df','#!/bin/sh\nprintf "Filesystem 1024-blocks Used Available Capacity Mounted\\nmock 1000000 1 999999 1%% persist\\n"\n')
    if os.environ.get('CMU_TEST_BUSYBOX'):
        busybox=shutil.which('busybox');assert busybox,'BusyBox requested but missing.'
        for name in ['awk','patch','diff','cp','cmp','md5sum','cut','readlink','dirname','mktemp','mkdir','rm','cat','grep','find','sort','stat','head','tail','od','dd','tr','sed','date','du']:
            os.symlink(busybox,bins/name)
        real_mv=shlex.quote(bp(busybox))+' mv'
    else:
        real_mv=shlex.quote(subprocess.run([SHELL,'-c','command -v mv'],capture_output=True,text=True,check=True).stdout.strip())
    first=images/rows[0][0];fail=b/'fail';critical=b/'critical';tripped=b/'tripped'
    write(bins/'mv','#!/bin/sh\nfor arg do destination=$arg; done\nif [ -f '+shlex.quote(bp(fail))+' ] && [ "$destination" = '+shlex.quote(bp(first))+' ]; then\n if [ ! -f '+shlex.quote(bp(tripped))+' ]; then : > '+shlex.quote(bp(tripped))+'; exit 1; fi\nfi\nif [ -f '+shlex.quote(bp(critical))+' ] && [ -f '+shlex.quote(bp(tripped))+' ] && [ "$destination" = '+shlex.quote(bp(target))+' ]; then exit 1; fi\nexec '+real_mv+' "$@"\n')
    def call(action,code=0,direct=False):
        global checks
        args=[bp(worker/'run.sh'),action] if direct else [bp(usb/'installer.sh'),'action','remove-safety-warnings',action]
        env=dict(os.environ)
        if direct:env['MZD_WORKER_DIRECT']='1'
        r=subprocess.run([SHELL,*args],env=env,capture_output=True,text=True,timeout=600)
        assert r.returncode==code,(action,code,r.returncode,r.stdout,r.stderr)
        checks+=1;return r
    def status(expected):
        before={p.relative_to(b):p.read_bytes() for p in b.rglob('*') if p.is_file()}
        r=call('status',direct=True);assert r.stdout==expected+'\n',(r.stdout,r.stderr)
        if expected in ('broken','unavailable'):assert r.stderr
        assert before=={p.relative_to(b):p.read_bytes() for p in b.rglob('*') if p.is_file()},'Status mutated files'
    def original():
        assert target.read_text()==stock
        assert all((images/n).read_bytes()==d for n,d in originals.items())
        assert gpio.read_text()=='0\n' and not (b/'camera.lock').exists() and not (b/'target.lock').exists()
        assert not list(internal.rglob('*.mzd-restore-*'))
    if '--restore-only' in sys.argv:
        call('install')
        r=subprocess.run([SHELL,bp(usb/'installer.sh'),'action','restore-originals','run'],capture_output=True,text=True,timeout=600)
        assert r.returncode==0,(r.stdout,r.stderr,[p.read_text()[-5000:] for p in usb.glob('reports/restore-originals/*/run.log')])
        original();assert not list(internal.rglob('*.org'))
        assert not (persist/'mzd-tweaks/installed/remove-safety-warnings').exists()
        assert list(usb.glob('reports/restore-originals/*/reset-hooks/remove-safety-warnings/camera-images.tsv'))
        print('SAFETY_RESTORE_PASSED: full controller restore, verified originals, receipt and backup cleanup;',len(rows),'images.')
        raise SystemExit(0)
    status('uninstalled')
    missing=first.read_bytes();first.unlink();status('unavailable');first.write_bytes(missing)
    first.write_bytes(b'foreign');status('unavailable');call('install',1,direct=True);assert first.read_bytes()==b'foreign';first.write_bytes(missing)
    write(Path(str(first)+'.org'),'foreign backup');status('unavailable');Path(str(first)+'.org').unlink()
    if os.name!='nt':
        first.unlink();first.symlink_to(images/rows[1][0])
        before={p.relative_to(b):p.read_bytes() for p in b.rglob('*') if p.is_file()}
        rejected=call('status',1,direct=True)
        assert not rejected.stdout and 'Symbolic link' in rejected.stderr
        assert before=={p.relative_to(b):p.read_bytes() for p in b.rglob('*') if p.is_file()}
        first.unlink();first.write_bytes(missing)
    write(fail,'1');failed=call('install',1,direct=True)
    assert tripped.exists(),('Injected write failure was not reached.',failed.stdout,failed.stderr,[p.read_text()[-4000:] for p in usb.glob('reports/remove-safety-warnings/*/run.log')])
    original();fail.unlink();tripped.unlink()
    call('install');status('installed')
    assert all((images/r[0]).read_bytes()==(worker/'assets'/r[2]).read_bytes() for r in rows)
    backup=Path(str(first)+'.org');kept=backup.read_bytes();backup.unlink();status('broken');backup.write_bytes(kept)
    write(first,'foreign edit');status('broken');call('uninstall',1,direct=True);assert first.read_text()=='foreign edit';first.write_bytes((worker/'assets'/rows[0][2]).read_bytes())
    # Removal must use the saved worker/assets, never the replacement USB files.
    (worker/'assets/transparent-800x50.png').write_bytes(b'replacement bad asset')
    call('uninstall');original()
    shutil.copyfile(SOURCE/'assets/transparent-800x50.png',worker/'assets/transparent-800x50.png')
    status('uninstalled')
    # Unknown concurrent state during failed rollback is critical and remains archived.
    write(fail,'1');write(critical,'1');call('install',2,direct=True)
    assert 'No More Disclaimer' in target.read_text()
    assert list(usb.glob('reports/remove-safety-warnings/*/files/1/before.data'))
    print('SAFETY_IMAGES_PASSED:',checks,'real entrypoint checks;',len(rows),'transaction images; all 46 inventory entries and both transparent PNGs verified.')
