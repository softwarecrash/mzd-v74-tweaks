"""Component schema agreement; fixtures are data only, no native code is loaded."""
from pathlib import Path
import os
import shlex
import shutil
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT/'tools'))
from manifest import read
SHELL = 'C:/Program Files/Git/bin/bash.exe' if os.name == 'nt' else '/bin/sh'

def bp(p):
    s=Path(p).resolve().as_posix()
    return '/'+s[0].lower()+s[2:] if len(s)>1 and s[1]==':' else s

checks=0
with tempfile.TemporaryDirectory(prefix='cmu-component-schema-') as temporary:
    folder=Path(temporary)/'bundle-example'
    shutil.copytree(ROOT/'development/examples/bundle', folder)
    original=(folder/'components.tsv').read_text()
    manifest=folder/'manifest.conf'
    def check(text, expected):
        global checks
        (folder/'components.tsv').write_text(text,encoding='utf-8',newline='')
        valid=True
        try: read(manifest)
        except ValueError: valid=False
        assert valid==expected,(text,valid)
        args=['awk','-v','id=bundle-example','-v','storage=/tmp/mnt/data_persist','-v','primary=/jci/sm/sm.conf','-v','original=74d9fc389b74fb01d0cfc2615a82c782','-v','mode=validate','-f',bp(ROOT/'usb/lib/components.awk'),bp(folder/'components.tsv')]
        r=subprocess.run([SHELL,'-c',' '.join(shlex.quote(a) for a in args)],capture_output=True,text=True,timeout=15)
        assert (r.returncode==0)==expected,(r.stdout,r.stderr,text)
        checks+=1
    check(original,True)
    check(original + 'executable\t/tmp/mnt/data_persist/mzd-tweaks/shims/bundle-example/helper\tassets/helper\t-\t-\n', True)
    check(original + 'executable\t/tmp/mnt/data_persist/wl/helper\tassets/helper\t-\t-\n', False)
    check(original + 'executable\t/tmp/mnt/data_persist/mzd-tweaks/shims/bundle-example/helper\tassets/helper\tjciMMUI\t-\n', False)
    for text in [original+original, original.replace('assets/alpha.so','assets/../alpha.so'),original.replace('/alpha.so','/nested/alpha.so'),original.replace('jciMMUI','bad service'),original.replace('shim\t','unknown\t',1),original.replace('74d9fc389b74fb01d0cfc2615a82c782','bad'),original.replace('/shims/bundle-example/','/shims/foreign/'),original.replace('loader\t/jci/sm/sm.conf','loader\t/jci//sm/sm.conf'),original.replace('assets/alpha.so\tjciMMUI\t-','assets/alpha.so\tjciMMUI\t-\textra'),original.replace('assets/alpha.so\tjciMMUI\t-','assets/alpha.so\tjciMMUI\tbad_option')]:
        check(text,False)
    for bad_char in ['"', '\\', '<', '>', '&']:
        check(original + f'loader_env\tLD_LIBRARY_PATH=/jci/lib{bad_char}foo\t-\tjciMMUI\t-\n', False)
    check(original + 'loader_env\tLD_LIBRARY_PATH=/jci/lib:/usr/lib\t-\tjciMMUI\t-\n', True)
    check(original + 'loader_env\tFOO=bar\t-\tjciMMUI\t-\nloader_env\tFOO=baz\t-\tjciMMUI\t-\n', False)
    check(original + 'loader_env\tFOO=bar\t-\tjciMMUI\t-\nloader_env\tFOO=baz\t-\tjciCARPLAY\t-\n', True)
    for bad_name in ['', '1VAR', 'VAR-NAME', 'VAR.NAME', 'VAR NAME', '@VAR']:
        check(original + f'loader_env\t{bad_name}=val\t-\tjciMMUI\t-\n', False)
    check(original + 'loader_env\tNO_EQUALS\t-\tjciMMUI\t-\n', False)
    check(original + 'loader_env\tEMPTY=\t-\tjciMMUI\t-\n', False)
    check(original + 'loader_env\tVALID=1\tassets/foo\tjciMMUI\t-\n', False)
    check(original + 'loader_env\tVALID=1\t-\tjciMMUI\tno_reset\n', False)
    check(original + 'loader_env\tVALID=1\t-\tjciMMUI\t74d9fc389b74fb01d0cfc2615a82c782\n', False)
    check(original + 'loader_env\tVALID=1\t-\t-\t-\n', False)
    check(original + 'loader_env\tVALID=1\t-\tbad service\t-\n', False)
    check(original + 'loader_env\tVALID=a\rb\t-\tjciMMUI\t-\n', False)
    check(original + ''.join(f'loader_env\tVAR_{i}=val_{i}\t-\tjciMMUI\t-\n' for i in range(16)), True)
    check(original + ''.join(f'loader_env\tVAR_{i}=val_{i}\t-\tjciMMUI\t-\n' for i in range(17)), False)
    check(original.replace('assets/alpha.so\tjciMMUI\t-', 'assets/alpha.so\tjciMMUI\tno_reset'), True)
    check(original.replace('\n','\r\n'),True)
    mapping=folder/'assets/libpatch.map'
    mapping.write_text('hud_display_language\tnot_a_setting\n',encoding='utf-8')
    try:read(manifest)
    except ValueError:checks+=1
    else:raise AssertionError('Unknown mapped setting accepted')
print('COMPONENT_SCHEMA_PASSED:',checks,'developer/runtime grammar and unknown configuration-key checks.')
