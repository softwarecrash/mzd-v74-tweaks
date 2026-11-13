"""Run scoped network cleanup with fake commands; no real network is changed."""
from pathlib import Path
import os
import shlex
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'development/candidates/android-auto-wireless/stop-runtime.sh'
with tempfile.TemporaryDirectory(prefix='wireless-stop-') as directory:
    base = Path(directory)
    state, bins, net = (base / name for name in ('state', 'bin', 'wlan1'))
    for p in (state, bins, net):
        p.mkdir()
    events = base / 'events'
    mode = base / 'mode'
    mode.write_text('owned', encoding='utf-8')
    files = [base / name for name in ('aa-hostapd-wlan1.conf', 'aa-hostapd-wlan1.conf.tmp', 'aa-udhcpd.conf', 'aa-udhcpd.leases', 'aaw_listend.log', 'mzd-aaw-boot.log', 'mzd-aaw-dongle-reset.log')]
    foreign = base / 'wlan0-hostapd.conf'
    foreign.write_text('untouched', encoding='utf-8')
    source = SOURCE.read_text(encoding='utf-8').replace('/tmp/mzd-aaw-runtime', str(state)).replace('/sys/class/net/wlan1', str(net))
    for path in files:
        source = source.replace('/tmp/' + path.name, str(path))
    script = base / 'stop.sh'
    script.write_text(source, encoding='utf-8')
    for name in ('lua', 'iptables', 'ifconfig', 'iw'):
        path = bins / name
        body = '#!/bin/sh\n'
        if name == 'lua':
            body += 'cat ' + shlex.quote(str(mode)) + '\n'
        else:
            body += 'echo ' + name + ' "$@" >> ' + shlex.quote(str(events)) + '\n'
            if name == 'ifconfig':
                body += '[ "${FAIL_DOWN:-0}" != 1 ] || exit 1\n'
        body += 'exit 0\n'
        path.write_text(body, encoding='utf-8');path.chmod(0o755)
    env = dict(os.environ, PATH=str(bins) + ':/usr/bin:/bin')
    command = '. ' + shlex.quote(str(script)) + '; HERE=/fixture; PAYLOAD_DIR=/fixture; mzd_aaw_stop_runtime'
    def run(code=0):
        r = subprocess.run(['/bin/sh', '-c', command], env=env, capture_output=True, text=True)
        assert r.returncode == code, (r.returncode, r.stdout, r.stderr)
    for path in files:
        path.write_text('owned RAM state', encoding='utf-8')
    (state / 'firewall-added').touch()
    run()
    assert all(not path.exists() for path in files)
    commands = events.read_text(encoding='utf-8')
    assert 'iptables -D INPUT -i wlan1 -j ACCEPT' in commands
    assert 'ifconfig wlan1 down' in commands and 'iw dev wlan1 set type managed' in commands
    assert 'wlan0' not in commands and foreign.read_text(encoding='utf-8') == 'untouched'
    # A rule not inserted by this adapter is never removed.
    events.unlink();run()
    assert 'iptables' not in events.read_text(encoding='utf-8')
    # No runtime ownership: do not touch networking or RAM config.
    events.unlink();mode.write_text('inactive', encoding='utf-8');files[0].touch();run()
    assert not events.exists() and files[0].exists()
    # Cleanup failure must abort removal, retaining remaining runtime config.
    mode.write_text('owned', encoding='utf-8');env['FAIL_DOWN'] = '1';run(1)
    assert files[0].exists()
print('WIRELESS_SHUTDOWN_PASSED: own firewall removal, wlan1-only cleanup, inactive no-op, foreign state preservation and failure refusal.')
