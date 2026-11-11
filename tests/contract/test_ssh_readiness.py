"""Exercise the real worker readiness wait with controlled service responses."""
from pathlib import Path
import os
import re
import shlex
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
source = (ROOT / 'usb/tweaks/ssh/run.sh').read_text()
match = re.search(r'^ssh_wait_ready\(\) \{\n.*?^\}\n', source, re.M | re.S)
assert match, 'Worker readiness wait is missing.'
with tempfile.TemporaryDirectory(prefix='ssh-readiness-') as directory:
    base = Path(directory)
    service = base / 'service.sh'
    count = base / 'calls'
    script = base / 'wait.sh'
    service.write_text('''#!/bin/sh
[ "$1" = status ] || exit 91
count=0
[ ! -f "$COUNT" ] || count=$(cat "$COUNT")
count=$((count+1)); printf '%s\n' "$count" > "$COUNT"
[ "$count" -ge "$READY_AFTER" ] || exit 1
printf 'SSH is running: port 22, user cmu.\nIf no address is shown yet, check the Wi-Fi connection.\n'
''')
    script.write_text('#!/bin/sh\nset -eu\nSERVICE=' + shlex.quote(str(base)) + '\n' + match[0] + '\nssh_wait_ready "$1" 3>&1\n')

    def check(ready_after, expected, dead=False):
        count.unlink(missing_ok=True)
        child = subprocess.Popen(['/bin/sleep', '60'], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            if dead:
                child.terminate(); child.wait(timeout=5)
            began = time.monotonic()
            result = subprocess.run(['/bin/sh', str(script), str(child.pid)],
                env=dict(os.environ, COUNT=str(count), READY_AFTER=str(ready_after)),
                capture_output=True, text=True, timeout=22)
            elapsed = time.monotonic()-began
            assert result.returncode == expected, (result.stdout, result.stderr)
            return elapsed, int(count.read_text()), result.stdout
        finally:
            if child.poll() is None:
                child.terminate(); child.wait(timeout=5)

    elapsed, calls, output = check(1, 0)
    assert calls == 1 and elapsed < 3, 'Fast startup must not wait for a fixed delay.'
    assert 'SSH is running' in output, 'A Wi-Fi address must not be required.'
    elapsed, calls, _ = check(4, 0)
    assert calls == 4 and 2.5 <= elapsed < 8, 'Startup later than two seconds must succeed.'
    elapsed, calls, _ = check(999, 1, dead=True)
    assert calls == 1 and elapsed < 3, 'An exited startup process must fail promptly.'
    elapsed, calls, _ = check(999, 1)
    assert 13.5 <= elapsed < 18 and 10 <= calls <= 17, (elapsed, calls)
print('SSH_READINESS_PASSED: immediate success, startup beyond two seconds, no address dependency, early process exit and monotonic 15-second deadline.')
