---
name: run-checks
description: Run this repository's tests, contract checks, ShellCheck, Lua or Node checks, or the worker suite on the CMU-like BusyBox. Use whenever you want to test, validate or verify a change. All checks run in Docker containers through tools/test-in-container.sh, never on the host.
---

# Run checks in containers

The runtime is BusyBox `sh` on the CMU and CI runs on Linux. On a developer
machine (macOS especially) `/bin/sh`, `sed`, `grep`, `patch` and `mv` are
different programs, so a host run gives wrong results, and some checks start
real entrypoints. Run every check inside the containers.

## Commands (from the repository root)

| Goal | Command |
| --- | --- |
| Everything CI runs | `sh tools/test-in-container.sh` |
| Worker suite on the CMU-like BusyBox | `sh tools/test-in-container.sh workers` |
| Worker suite, one tweak | `CMU_TEST_ONLY=<tweak-id> sh tools/test-in-container.sh workers` |
| One check | `sh tools/test-in-container.sh run python tests/contract/test_packages.py` |
| One Node check | `sh tools/test-in-container.sh run node tests/installer/test-ui.cjs` |
| All installer UI checks | `sh tools/test-in-container.sh run node --test "tests/installer/*.cjs"` |
| A command under BusyBox | `sh tools/test-in-container.sh busybox <command>` |
| List the CI steps | `sh tools/test-in-container.sh run python tools/container/run-ci-steps.py --list` |

The steps come from `.github/workflows/validate-tweaks.yml`; nothing to keep in
sync. The first run builds the images and the CMU-like BusyBox (needs network,
some minutes; longer under qemu); later runs reuse them. The containers have no
network and mount the repository read-only.

## Rules

- Never run `python tests/...`, `node tests/...`, `shellcheck`, `luac` or any
  `usb/` script directly on the host, even when it looks faster.
- Never run `usb/` scripts at all outside the test fixtures; they target a CMU.
- If Docker is missing or not running, stop and tell the user (start Docker
  Desktop, OrbStack or `colima start`). Do not fall back to a host run and do
  not install BusyBox or GNU tools on the host instead.
- `tests/transport/test-in-vm.py` needs private CMU files outside the
  repository. Run it only when the user asks.
- Pick checks as listed in `development/CONTRIBUTING.md` step 7; before a pull
  request run the full set.
- Report the summary lines (`=== Summary`, `FAILED ...`, `*_PASSED`) and keep
  container results separate from vehicle results.
