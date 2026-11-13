# Patch-worker template

This is a complete patch worker as a concrete reference (it comments out one
line of a sample target). To add a
new tweak, copy to usb/tweaks/<new-id>/, then change its manifest.conf and patch. ID, target, firmware, OEM backup
fingerprint, lock group and dependencies are declared only in the manifest.
Add relevant tests.
Do not install this unchanged example: its patch targets a sample OEM file.
The folder must live under usb/tweaks/ to resolve ../../lib/ at runtime. This example
is not automatically discovered. See [Contributing](../../CONTRIBUTING.md) and [Worker contract](../../Worker-contract.md).

This template uses the current persistent package controller. The controller
saves the worker and its shared helpers before installation, then uses that
saved version for uninstall. Do not set MZD_WORKER_DIRECT in ordinary calls.

Call mzd_report_start after opening the report session. It writes the initial
progress message only to run.log; the GUI already displays live progress.
Set MZD_SUCCESS for the final result, using MZD_ACTION_LABEL for a capitalized
Install/Uninstall label. mzd_finish forwards success only after cleanup succeeds.
Never forward an old "in progress" message into the final result.
