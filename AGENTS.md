# Repository instructions for coding agents

Read CONTRIBUTING.md and the applicable manifest/interface documentation before
editing. These instructions apply repository-wide, including the existing
custom agents under .github/agents/. User instructions take precedence.

## Scope and implementation

- Keep each feature PR limited to one tweak. Put shared infrastructure in a
  separate PR. Do not mix unrelated refactoring with a feature.
- Preserve firmware functionality outside the intended change. Port known AIO
  changes precisely; do not replace v74 files with complete older versions.
- Treat OEM copies, binary assets, patch payloads, entry assets and fixtures as
  byte-sensitive data. Never run formatters or newline conversion over them.
- CMU scripts use POSIX sh and must work with the actual CMU BusyBox. A passing
  linter is not evidence that an option exists on the CMU.
- Write English code comments, messages, documentation and PR descriptions.
- Explain major steps and non-obvious safety checks with short comments. Use
  the shared formatting rules rather than introducing a personal style.

## Standalone worker contract

- Tweaks accept install, uninstall and status. No argument or --help prints
  usage without changes. Workers must not open dialogs, prompt or reboot.
- Successful status prints exactly installed or uninstalled plus a newline.
  Errors use stderr and a nonzero exit code; status errors leave stdout empty.
- The launcher owns selection, confirmation, display and final reboot handling.
- Validate prerequisites before modifications, refuse unknown/conflicting
  states, preserve other tweaks, and verify writes and rollback results.
- Keep logs/reports/operation rollback copies on the startup USB and retain
  verified OEM backups on the CMU. Restore changed mount/watchdog states and
  release owned locks on exit and catchable signals.

## Verification and reporting

- Run the checks documented in CONTRIBUTING.md and relevant behaviour tests.
  Do not weaken checks, add a legacy baseline or globally suppress diagnostics
  merely to make CI pass. Explain any narrow suppression at its source.
- Keep required checksum sidecars synchronized with intentional file changes;
  never update them to conceal an unintended payload change.
- Distinguish static checks, isolated tests, emulation and vehicle evidence.
  Record firmware/region and limitations for vehicle tests. Do not claim that
  a new installer is vehicle-tested because its underlying tweak was tested.
- Summarize changes, validation and remaining limitations for reviewers.
