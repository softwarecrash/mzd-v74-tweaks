# Main Menu Loop

Wrap between the first and last main-menu icons.

Run `sh run.sh install`, `sh run.sh uninstall`, or `sh run.sh status` directly from a shell. Without an argument (or with `--help`),
the script prints usage and changes nothing. It never opens dialogs, asks
questions or reboots the CMU. An installer can supply its own UI before invoking
these same actions. Progress is text on stdout; errors use stderr and a nonzero
exit code. The current working directory does not matter, and the folder can be
copied anywhere on USB as a complete folder. No shared `lib/` or launcher is
required; all helpers are embedded in `run.sh`.
Uninstall removes only this tweak.

The only target file is `/jci/gui/apps/system/controls/MainMenu/js/MainMenuCtrl.js`. `assets/change.patch` contains the exact
previously verified change. The original checksum is
`40ccb293b8c6f80960f0b953dd2e173e`. An adjacent `.org` original is created on the first
write and is retained. Normal uninstall reverses only this patch, preserving
other tweaks. Existing unknown/corrupt originals are refused.

No patch is applied directly to the system file. Both directions are tested
on copies on the startup medium, with inverse byte comparisons; partial or
ambiguous states are refused. Reports and rollback copies go to
`reports/diffpatch/main-menu-loop-*/` at the root of that medium. See [the overview](../README.md)
for verification, reboot and SSH details.

`manifest.json` provides discovery metadata and the OEM checksum. See
[the overview](../README.md) for the proposed menu/status contract.

## Results for callers

Capture stdout, stderr and the exit status separately. Exit `0` means success;
`1` means an ordinary failure; `2` means a critical failure requiring manual
intervention (for example failed rollback or failed system-state cleanup).
Signals can return `130`/`143`. Never infer success from progress text alone.
Final success/status output is emitted only after cleanup and result recording
succeed. Errors include the USB report path where available. A critical failure
must stop the launcher's remaining actions and must not offer an automatic reboot.
