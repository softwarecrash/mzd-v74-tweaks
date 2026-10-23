# Shared runtime helper implementation

Status: implemented on this branch as API 2. See [LIBRARIES.md](LIBRARIES.md)
for the maintained interface and usage. Integrated vehicle validation remains
pending; upstream PRs and existing upstream installers are unchanged.

The initial two-library extraction was too specific to single-file patches.
The revised structure separates general helpers (`common.sh`), optional system
operations (`system.sh`) and optional text patches (`patch.sh`). Each worker
loads what it needs and explicitly controls its own lifecycle.

Implemented checks cover:

- Five reference tweak workers, including SSH activation rollback.
- A command-only worker with no target file and no system/patch library present.
- A system-only worker with multiple mounts/locks and failure cleanup.
- Two independent patch contexts and explicit group rollback.
- Missing/corrupt/incompatible libraries and imports without side effects.
- Manifests without patch-specific fields and hand-maintained custom workers.
- Original CMU BusyBox patch/diff compatibility using private offline fixtures.

Standalone use means copying `lib/` and `tweaks/<id>/`, preserving their relative
layout. No per-tweak ZIP, launcher or build step is required.
