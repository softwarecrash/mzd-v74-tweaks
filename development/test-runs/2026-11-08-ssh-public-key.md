# SSH public-key bench test

- Date: 2026-11-08
- Commit: local SSH 0.8.11 candidate based on 4c674da (not yet committed)
- Type: physical CMU, bench without vehicle
- Firmware: 74.00.324; factory OpenSSH 5.9
- Preconditions: independent RAM-only SSH recovery listener on a separate port;
  generated RSA test public key placed at `user/ssh/public.key` on USB.
  Private keys remained on the test computer.

| Step | Actual | Result |
| --- | --- | --- |
| Ignore unsupported Ed25519 key during update | No import or native validation; installation succeeds | Pass |
| Install RSA with password enabled | Actual RSA login and separate password-only login succeed | Pass |
| Install RSA with password disabled | Actual RSA login succeeds; password-only client is refused with publickey as the only method | Pass |
| Update with password disabled | Update succeeds and preserves both key selection and disabled-password setting | Pass |
| Update without required USB key | Candidate preflight refuses before removing the existing installation | Pass |
| Final state | SSH 0.8.11 installed with RSA and password enabled; both login methods verified | Pass |
| Requested final password-only state | Reinstalled with Ignore and password enabled; actual password login succeeds, key authentication is disabled and test public key removed from CMU and USB | Pass |
| Recovery cleanup | Separate listener and its owned firewall rule removed; normal status reports installed | Pass |

The first real key installation exposed a readiness check against the USB
source's empty key template. It now checks the staged candidate containing the
imported public key. The package regression fixture covers this case.

## Limits and observations

No reboot-persistence test in this run. Some new SSH connections timed out;
subsequent connections and the held recovery session remained usable. This run
does not establish the cause of those intermittent timeouts. No personal keys,
addresses or raw diagnostic logs are included.
