"""Synthetic transactions for the widescreen tweak; never reads or modifies a CMU target."""
from pathlib import Path
import hashlib
import os
import re
import shlex
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / 'usb/tweaks/widescreen'
SHELL = 'C:/Program Files/Git/bin/bash.exe' if os.name == 'nt' else '/bin/sh'


def bp(p):
    s = Path(p).resolve().as_posix()
    return '/' + s[0].lower() + s[2:] if len(s) > 1 and s[1] == ':' else s


def write(p, s):
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(s, encoding='utf-8', newline='\n')
    p.chmod(0o755)


def md5(data):
    return hashlib.md5(data).hexdigest()


# Static CSS checks on assets/widescreen.css
css_text = (SOURCE / 'assets/widescreen.css').read_text(encoding='utf-8')
assert not re.search(r'var\(--', css_text), 'widescreen.css must not use CSS custom properties'
assert "font-family: 'Saira ExtraCondensed', \"Tipperary\", Arial, Helvetica, sans-serif !important;" in css_text, (
    'widescreen.css references Saira ExtraCondensed with CMU fallback fonts'
)
assert not re.search(r'font-weight:\s*[0-9]+', css_text), 'widescreen.css must not use numeric font-weight'
assert 'body.widescreen .MainMenuCtrl .mzd-coin > div' in css_text
assert '-o-transform: scaleX(0.67);' in css_text
assert '-o-transform: scaleX(0.63);' in css_text

# Verify main-menu scaling rules cover both MZD Tweaks and standalone OEM DOMs
# without targeting both parent coin containers and inner icon layers for scaleX(0.67).
css_no_comments = re.sub(r'/\*.*?\*/', '', css_text, flags=re.S)
scale_match = re.search(r'([^{}]+)\{\s*-o-transform:\s*scaleX\(0\.67\);', css_no_comments)
assert scale_match, 'missing scaleX(0.67) rule'
scale_selectors = [s.strip() for s in scale_match.group(1).split(',')]
for expected_sel in (
    'body.widescreen .MainMenuCtrl .mzd-coin > div',
    'body.widescreen .MainMenuCtrl .mzd-coin-highlight',
    'body.widescreen .MainMenuCtrl .MainMenuCtrlAppDiv > div',
    'body.widescreen .MainMenuCtrl .MainMenuCtrlEntDiv > div',
    'body.widescreen .MainMenuCtrl .MainMenuCtrlComDiv > div',
    'body.widescreen .MainMenuCtrl .MainMenuCtrlNavDiv > div',
    'body.widescreen .MainMenuCtrl .MainMenuCtrlSetDiv > div',
    'body.widescreen .MainMenuCtrl .MainMenuCtrlAppHighlight',
    'body.widescreen .MainMenuCtrl .MainMenuCtrlEntHighlight',
    'body.widescreen .MainMenuCtrl .MainMenuCtrlComHighlight',
    'body.widescreen .MainMenuCtrl .MainMenuCtrlNavHighlight',
    'body.widescreen .MainMenuCtrl .MainMenuCtrlSetHighlight',
):
    assert expected_sel in scale_selectors, f'missing scaleX(0.67) selector: {expected_sel}'
for parent_sel in (
    'body.widescreen .MainMenuCtrl .mzd-coin',
    'body.widescreen .MainMenuCtrl .MainMenuCtrlAppDiv',
    'body.widescreen .MainMenuCtrl .MainMenuCtrlEntDiv',
    'body.widescreen .MainMenuCtrl .MainMenuCtrlComDiv',
    'body.widescreen .MainMenuCtrl .MainMenuCtrlNavDiv',
    'body.widescreen .MainMenuCtrl .MainMenuCtrlSetDiv',
):
    assert parent_sel not in scale_selectors, f'parent coin container must not be scaled: {parent_sel}'

assert (
    'body.widescreen:not(.mzd-layout-flat):not(.mzd-coins-80):not(.mzd-coins-60):not(.mzd-main-menu-custom) '
    '.MainMenuCtrl .MainMenuCtrlAppDiv:not(.MainMenuCtrlCoinFocus)'
) in css_text
assert (
    'body.widescreen:not(.mzd-layout-flat):not(.mzd-coins-80):not(.mzd-coins-60):not(.mzd-main-menu-custom) '
    '.MainMenuCtrl .MainMenuCtrlSetDiv:not(.MainMenuCtrlCoinFocus)'
) in css_text
for cls in (
    'body.widescreen .StatusBarCtrlRemoteUIBtn_En',
    'body.widescreen .List2Ctrl .ListItem.style01 .image1',
    'body.widescreen .List2CtrlTitle.style05 .image1',
    'body.widescreen .ClockSettings2CtrlHoursTensDigitFrame',
    'body.widescreen .ClockSettings2CtrlHoursOnesDigitFrame',
    'body.widescreen .ClockSettings2CtrlMinutesTensDigitFrame',
    'body.widescreen .ClockSettings2CtrlMinutesOnesDigitFrame',
):
    assert cls in css_text, f'missing {cls}'
assert 'text-align: center !important;' in css_text

# Static patch checks on assets/gui-index.patch
patch_text = (SOURCE / 'assets/gui-index.patch').read_text(encoding='utf-8')
assert patch_text.startswith('--- target.data\n+++ target.data\n'), 'gui-index.patch must use --- target.data / +++ target.data headers'
assert '<link rel="stylesheet" href="common/css/widescreen.css" /> <!-- MZD Tweaks -->' in patch_text
assert '<body class="widescreen"> <!-- MZD Tweaks -->' in patch_text

with tempfile.TemporaryDirectory(prefix='cmu-widescreen-') as directory:
    b = Path(directory)
    usb = b / 'usb'
    internal = b / 'internal'
    persist = b / 'persist'
    bins = b / 'bin'
    for p in (usb, internal, persist, bins):
        p.mkdir()
    shutil.copytree(ROOT / 'usb/lib', usb / 'lib')
    shutil.copyfile(ROOT / 'usb/installer.sh', usb / 'installer.sh')
    shutil.copyfile(ROOT / 'usb/VERSION', usb / 'VERSION')
    worker = usb / 'tweaks/widescreen'
    shutil.copytree(SOURCE, worker)
    shutil.copytree(ROOT / 'usb/tweaks/restore-originals', usb / 'tweaks/restore-originals')

    gui_css_dir = internal / 'jci/gui/common/css'
    font_dir = internal / 'jci/fonts/CHN'
    gui_css_dir.mkdir(parents=True)
    font_dir.mkdir(parents=True)
    target = internal / 'jci/gui/index.html'

    # Reconstruct stock index.html matching gui-index.patch hunks
    lines = []
    started = False
    for line in patch_text.splitlines(keepends=True):
        if line.startswith('@@ '):
            line_no = int(re.match(r'@@ -(\d+)', line)[1])
            while len(lines) < line_no - 1:
                lines.append(f'<!-- synthetic line {len(lines) + 1} -->\n')
            started = True
        elif started and line[:1] in (' ', '-'):
            lines.append(line[1:])
    stock = ''.join(lines)
    write(target, stock)

    managed = (SOURCE / 'managed-paths.tsv').read_text(encoding='utf-8')
    managed = managed.replace('/jci/gui/index.html', bp(target))
    managed = managed.replace('/jci/gui/common/css', bp(gui_css_dir))
    managed = managed.replace('/jci/fonts/CHN', bp(font_dir))
    write(worker / 'managed-paths.tsv', managed)

    manifest = (worker / 'manifest.conf').read_text(encoding='utf-8')
    manifest = manifest.replace('/jci/gui/index.html', bp(target))
    manifest = manifest.replace('0ad187b787e242953a9a7612f55bfcfb', md5(stock.encode('utf-8')))
    write(worker / 'manifest.conf', manifest)

    rp = usb / 'tweaks/restore-originals/manifest.conf'
    write(rp, rp.read_text(encoding='utf-8').replace('target=/jci', 'target=' + bp(internal / 'jci')))

    version = b / 'version'
    mounts = b / 'mounts'
    gpio = b / 'gpio'
    write(version, 'JCI_SW_VER="MAZ_CMU-150_74.00.324"\n')
    write(gpio, '0\n')
    write(
        mounts,
        f'mock {bp(usb)} vfat rw 0 0\n'
        f'/dev/root {bp(internal)} relfs ro 0 0\n'
        f'/dev/mmcblk0p1 {bp(persist)} relfs rw 0 0\n',
    )

    replacements = {
        '/jci/gui/common/css': bp(gui_css_dir),
        '/jci/fonts/CHN': bp(font_dir),
        '/tmp/mnt/data_persist': bp(persist),
        '/proc/mounts': bp(mounts),
        '/jci/version.ini': bp(version),
        '/tmp/mzd-packages.lock': bp(b / 'packages.lock'),
        '/tmp/mzd-restore-originals.lock': bp(b / 'restore.lock'),
        '/tmp/mzd-$LOCK_GROUP-tweak.lock': bp(b / 'target.lock'),
        '/sys/class/gpio/Watchdog\\ Disable/value': shlex.quote(bp(gpio)),
        'MZD_SHIM_ROOT=/': 'MZD_SHIM_ROOT=' + bp(internal),
        "EXPORT_SOURCE='/jci'": 'EXPORT_SOURCE=' + bp(internal / 'jci'),
    }
    for p in usb.rglob('*.sh'):
        s = p.read_text(encoding='utf-8')
        for a, v in replacements.items():
            s = s.replace(a, v)
        s = s.replace('/tmp/mnt/sd[a-z][0-9]*|/mnt/sd[a-z][0-9]*', shlex.quote(bp(usb)))
        s = s.replace('#!/bin/sh\n', '#!/bin/sh\nPATH=' + shlex.quote(bp(bins) + ':/usr/bin:/bin') + '\nexport PATH\n', 1)
        write(p, s)

    write(bins / 'sync', '#!/bin/sh\nexit 0\n')
    write(bins / 'mount', '#!/bin/sh\nexit 0\n')
    write(
        bins / 'df',
        '#!/bin/sh\nprintf "Filesystem 1024-blocks Used Available Capacity Mounted\\nmock 1000000 1 999999 1%% persist\\n"\n',
    )

    def call(action, code=0, direct=False):
        args = [bp(worker / 'run.sh'), action] if direct else [bp(usb / 'installer.sh'), 'action', 'widescreen', action]
        env = dict(os.environ)
        if direct:
            env['MZD_WORKER_DIRECT'] = '1'
        res = subprocess.run([SHELL, *args], capture_output=True, text=True, env=env)
        assert res.returncode == code, f'{action} exited {res.returncode}: {res.stderr}'
        return res

    # 1. Initial status is uninstalled
    assert call('status', direct=True).stdout.strip() == 'uninstalled'

    # 2. Install patches index.html, creates .org backup, and installs CSS + fonts
    call('install')
    assert call('status', direct=True).stdout.strip() == 'installed'
    patched = target.read_text(encoding='utf-8')
    assert '<link rel="stylesheet" href="common/css/widescreen.css" /> <!-- MZD Tweaks -->' in patched
    assert '<body class="widescreen"> <!-- MZD Tweaks -->' in patched
    assert (internal / 'jci/gui/index.html.org').read_text(encoding='utf-8') == stock
    assert (gui_css_dir / 'widescreen.css').read_bytes() == (SOURCE / 'assets/widescreen.css').read_bytes()
    assert (font_dir / 'SairaExtraCondensed-Regular.ttf').read_bytes() == (
        SOURCE / 'assets/fonts/SairaExtraCondensed-Regular.ttf'
    ).read_bytes()
    assert (font_dir / 'SairaExtraCondensed-Medium.ttf').read_bytes() == (
        SOURCE / 'assets/fonts/SairaExtraCondensed-Medium.ttf'
    ).read_bytes()

    # 3. Uninstall restores index.html and removes CSS + fonts + .org
    call('uninstall')
    assert call('status', direct=True).stdout.strip() == 'uninstalled'
    assert target.read_text(encoding='utf-8') == stock
    assert not (internal / 'jci/gui/index.html.org').exists()
    assert not (gui_css_dir / 'widescreen.css').exists()
    assert not (font_dir / 'SairaExtraCondensed-Regular.ttf').exists()
    assert not (font_dir / 'SairaExtraCondensed-Medium.ttf').exists()
    assert not list(internal.rglob('*.mzd-restore-*'))

    # 4. Foreign file at target font path reports unavailable and refuses install
    foreign_font = font_dir / 'SairaExtraCondensed-Regular.ttf'
    foreign_font.write_bytes(b'foreign font bytes')
    res_unavail = call('status', direct=True)
    assert res_unavail.stdout.strip() == 'unavailable'
    assert res_unavail.stderr.strip() != ''
    call('install', code=1)
    assert foreign_font.read_bytes() == b'foreign font bytes'
    foreign_font.unlink()

    # 5. Partial state (CSS installed without index.html patch) reports broken
    (gui_css_dir / 'widescreen.css').write_bytes((SOURCE / 'assets/widescreen.css').read_bytes())
    res_broken = call('status', direct=True)
    assert res_broken.stdout.strip() == 'broken'
    assert res_broken.stderr.strip() != ''
    (gui_css_dir / 'widescreen.css').unlink()

    # 6. Failure-injection checks for rollback bookkeeping (install & uninstall)
    orig_run_sh = (worker / 'run.sh').read_text(encoding='utf-8')

    # 6a. Install: fail recording the 2nd file before creating it; 1st file must be rolled back.
    install_record_line = 'printf \'%s\\n\' "$target" >> "$MZD_REPORT/created" || mzd_fail \'Cannot record created file.\''
    assert install_record_line in orig_run_sh
    injected_install = orig_run_sh.replace(
        install_record_line,
        'if [ "$(wc -l < "$MZD_REPORT/created")" -ge 1 ]; then false; else printf \'%s\\n\' "$target" >> "$MZD_REPORT/created"; fi || mzd_fail \'Cannot record created file.\'',
        1,
    )
    write(worker / 'run.sh', injected_install)
    call('install', code=1, direct=True)
    assert call('status', direct=True).stdout.strip() == 'uninstalled'
    assert target.read_text(encoding='utf-8') == stock
    assert not (gui_css_dir / 'widescreen.css').exists()
    assert not (font_dir / 'SairaExtraCondensed-Regular.ttf').exists()
    assert not (font_dir / 'SairaExtraCondensed-Medium.ttf').exists()
    assert not list(internal.rglob('*.mzd-restore-*'))

    # Restore clean run.sh and install normally.
    write(worker / 'run.sh', orig_run_sh)
    call('install')
    assert call('status', direct=True).stdout.strip() == 'installed'

    # 6b. Uninstall: fail recording the 2nd file before deleting it; 1st file must be restored and 2nd untouched.
    uninstall_record_line = 'printf \'%s\\t%s\\n\' "$target" "$backup" >> "$MZD_REPORT/removed" || mzd_fail \'Cannot record removed file.\''
    assert uninstall_record_line in orig_run_sh
    injected_uninstall = orig_run_sh.replace(
        uninstall_record_line,
        'if [ "$n" -ge 2 ]; then false; else printf \'%s\\t%s\\n\' "$target" "$backup" >> "$MZD_REPORT/removed"; fi || mzd_fail \'Cannot record removed file.\'',
        1,
    )
    write(worker / 'run.sh', injected_uninstall)
    call('uninstall', code=1, direct=True)
    write(worker / 'run.sh', orig_run_sh)
    assert call('status', direct=True).stdout.strip() == 'installed'
    assert target.read_text(encoding='utf-8') == patched
    assert (gui_css_dir / 'widescreen.css').read_bytes() == (SOURCE / 'assets/widescreen.css').read_bytes()
    assert (font_dir / 'SairaExtraCondensed-Regular.ttf').read_bytes() == (
        SOURCE / 'assets/fonts/SairaExtraCondensed-Regular.ttf'
    ).read_bytes()
    assert (font_dir / 'SairaExtraCondensed-Medium.ttf').read_bytes() == (
        SOURCE / 'assets/fonts/SairaExtraCondensed-Medium.ttf'
    ).read_bytes()
    assert not list(internal.rglob('*.mzd-restore-*'))

    # 7. Test reset.sh hook (check / prepare / finish)
    reset_env = dict(os.environ)
    reset_env['ACTION'] = 'run'
    reset_env['MZD_SYSTEM'] = bp(b / 'reset_sys')
    reset_env['MZD_RESET_DIR'] = bp(b / 'reset_dir')
    (b / 'reset_sys').mkdir(exist_ok=True)
    (b / 'reset_dir').mkdir(exist_ok=True)
    for phase in ('check', 'prepare', 'finish'):
        r = subprocess.run([SHELL, bp(worker / 'reset.sh'), phase], capture_output=True, text=True, env=reset_env)
        assert r.returncode == 0, f'reset.sh {phase} failed: {r.stderr}'
    assert not (gui_css_dir / 'widescreen.css').exists()
    assert not (font_dir / 'SairaExtraCondensed-Regular.ttf').exists()
    assert not (font_dir / 'SairaExtraCondensed-Medium.ttf').exists()

    # 8. Busy ro,remount on internal root after committed uninstall (e.g. Opera holding unlinked fonts)
    # must succeed so package cleanup removes index.html.org; other remount errors or
    # busy remount on install must still fail with exit 2.
    write(target, stock)
    (internal / 'jci/gui/index.html.org').unlink(missing_ok=True)
    shutil.rmtree(persist / 'mzd-tweaks/installed/widescreen', ignore_errors=True)
    write(
        bins / 'mount',
        '''#!/bin/sh
if [ "$2" = ro,remount ] && [ "$3" = "''' + bp(internal) + '''" ]; then
    if [ -f "''' + bp(b / 'busy-remount') + '''" ]; then
        echo "mount: mounting /dev/ffx01p1 on / failed: Device or resource busy" >&2
        exit 255
    fi
    if [ -f "''' + bp(b / 'fail-remount') + '''" ]; then
        echo "mount: mounting /dev/ffx01p1 on / failed: I/O error" >&2
        exit 1
    fi
fi
awk -v p="$3" -v mode="$2" '{$4=($2==p?(mode=="rw,remount"?"rw":"ro"):$4);print}' "''' + bp(mounts) + '''" > "''' + bp(mounts) + '''.next" && mv "''' + bp(mounts) + '''.next" "''' + bp(mounts) + '''"
''',
    )
    call('install')
    (b / 'fail-remount').write_text('yes', encoding='utf-8')
    call('uninstall', code=2)
    (b / 'fail-remount').unlink()
    (b / 'busy-remount').write_text('yes', encoding='utf-8')
    call('uninstall')
    assert call('status', direct=True).stdout.strip() == 'uninstalled'
    assert target.read_text(encoding='utf-8') == stock
    assert not (internal / 'jci/gui/index.html.org').exists()
    write(
        mounts,
        f'mock {bp(usb)} vfat rw 0 0\n'
        f'/dev/root {bp(internal)} relfs ro 0 0\n'
        f'/dev/mmcblk0p1 {bp(persist)} relfs rw 0 0\n',
    )
    call('install', code=2)

print('WIDESCREEN_PASSED')
