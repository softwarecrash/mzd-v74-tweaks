"""Keep the TP-Link Archer T2U RTL8811AU Driver assets equal to a cmu150-rtl8811au release.

    python tools/update_tplink_rtl8811au.py --check   # CI: pinned release + explicit loader delta
    python tools/update_tplink_rtl8811au.py 1.1.0     # copy another release into the tweak

Downloads cmu150-rtl8811au-<version>.tar.gz and its .sha256 from the GitHub
release v<version> and checks the archive against that checksum (and, for the
pinned version, against PINNED_SHA256 below).

--check changes nothing. The driver, config and license must equal the release;
the loader must equal the release plus the reviewed bounded-RAM-logging delta
in tplink_loader.py. The service entries must match the release as well.

<version> copies the unchanged release files into usb/tweaks/tplink-rtl8811au/
and prints the values to update by hand, including the pin below.

Make sure to update installation process whenever install.sh changes in the cmu repo!
"""
from pathlib import Path
import hashlib
import io
import re
import sys
import tarfile
import urllib.request
from tplink_loader import adapt_loader

REPO = 'PingusPepan/cmu150-rtl8811au'
# The release the committed assets come from.
PINNED_VERSION = '1.0.0'
PINNED_SHA256 = '862112dcada1582716927fdf0d18c11b9f37f155e13cadd1f238fadfc9d8cf66'
ROOT = Path(__file__).resolve().parents[1]
TWEAK = ROOT / 'usb/tweaks/tplink-rtl8811au'
# Release file -> destination inside the tweak folder.
FILES = {
    'rtl8812au.ko': 'assets/rtl8812au.ko',
    'load-wlan1.sh': 'assets/load-wlan1.sh',
    'dongle.conf': 'assets/dongle.conf',
    'LICENSE': 'LICENSE',
}
# Release files that only document the manual installation.
IGNORED = {'install.sh', 'INSTALL.md', 'sm.conf.snippet'}


def fail(message):
    raise SystemExit('ERROR: ' + message)


def fetch(url):
    with urllib.request.urlopen(url, timeout=60) as response:
        return response.read()


def service_block(text):
    """The load_wlan1 service block, line by line."""
    block = re.search(r'^[ \t]*<service\b[^>]*name="load_wlan1".*?</service>$', text, re.S | re.M)
    if not block:
        fail('No load_wlan1 service block found.')
    return block.group(0).splitlines()


if len(sys.argv) != 2 or not (sys.argv[1] == '--check' or re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+', sys.argv[1])):
    raise SystemExit(__doc__)
check = sys.argv[1] == '--check'
version = PINNED_VERSION if check else sys.argv[1]
name = f'cmu150-rtl8811au-{version}'
base = f'https://github.com/{REPO}/releases/download/v{version}/'

archive = fetch(base + name + '.tar.gz')
listed = fetch(base + name + '.tar.gz.sha256').decode('ascii').split()
digest = hashlib.sha256(archive).hexdigest()
if not listed or listed[0] != digest:
    fail(f'{name}.tar.gz does not match its .sha256 ({digest}).')
if version == PINNED_VERSION and digest != PINNED_SHA256:
    fail(f'{name}.tar.gz changed since it was pinned ({digest}, pinned {PINNED_SHA256}).')

payload = {}
with tarfile.open(fileobj=io.BytesIO(archive), mode='r:gz') as tar:
    for member in tar.getmembers():
        if member.isdir() and member.name == name:
            continue
        leaf = member.name[len(name) + 1:] if member.name.startswith(name + '/') else ''
        if not member.isfile() or not leaf or '/' in leaf:
            fail('Unexpected archive member: ' + member.name)
        if leaf not in FILES and leaf not in IGNORED:
            fail('New release file, review it before updating: ' + leaf)
        payload[leaf] = tar.extractfile(member).read()
missing = (set(FILES) | IGNORED) - set(payload)
if missing:
    fail('Release files missing: ' + ', '.join(sorted(missing)))

# The boot entry is not copied: assets/sm*.patch carry the release's service
# block verbatim. Stop when the release changes it, so the patches are
# regenerated deliberately.
theirs = service_block(payload['sm.conf.snippet'].decode('utf-8'))
for patch in ['sm.conf.patch', 'sm_WCP.conf.patch']:
    added = '\n'.join(line[1:] for line in (TWEAK / 'assets' / patch).read_text(encoding='utf-8').splitlines()
                      if line.startswith('+') and not line.startswith('+++'))
    if service_block(added) != theirs:
        fail(f'The release load_wlan1 service differs from assets/{patch}. Update the patches first.')

payload['load-wlan1.sh'] = adapt_loader(payload['load-wlan1.sh'])

if check:
    for leaf, destination in FILES.items():
        if not (TWEAK / destination).is_file() or (TWEAK / destination).read_bytes() != payload[leaf]:
            fail(f'{destination} is not the {leaf} of {name}.tar.gz. Run: python tools/update_tplink_rtl8811au.py {version}')
    print(f'{TWEAK.relative_to(ROOT)} verified against {name}.tar.gz (SHA256 {digest}) plus the explicit RAM logging adaptation.')
    raise SystemExit(0)

for leaf, destination in FILES.items():
    (TWEAK / destination).write_bytes(payload[leaf])

print(f'Updated {TWEAK.relative_to(ROOT)} from {name}.tar.gz (SHA256 {digest}).')
print('Update by hand:')
print(f'  tools/update_tplink_rtl8811au.py: PINNED_VERSION = {version!r}, PINNED_SHA256 = {digest!r}')
print(f'  manifest.conf: version and "cmu150-rtl8811au {version}" in description')
print('  README.md: release link, commit, archive SHA256')
print('  tests/contract/test_tplink_rtl8811au.py: asset SHA256 pins')
for leaf, destination in FILES.items():
    print(f'    {destination}: {hashlib.sha256(payload[leaf]).hexdigest()}')
