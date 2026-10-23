# Shorter List Delay

Reduce the four list autoscroll delays and intervals.

Run `sh run.sh` or `sh run.sh dialog` for screen dialogs, or use `install`, `uninstall`,
`restore`, or `status`. Resolve the script from its actual USB location; the
current working directory does not matter. This folder contains all its assets
and can be copied to a USB independently. `restore` removes only this tweak.

The only target file is `/jci/gui/common/controls/List2/js/List2Ctrl.js`. `assets/change.patch` contains the exact
previously verified change. The original checksum is
`e111883b9dcbeb6bb154521826fcacac`. An adjacent `.org` original is created on the first
write and is retained. Normal uninstall reverses only this patch, preserving
other tweaks. Existing unknown/corrupt originals are refused.

No patch is applied directly to the system file. Both directions are tested
on copies on the startup medium, with inverse byte comparisons; partial or
ambiguous states are refused. Reports and rollback copies go to
`reports/diffpatch/shorter-delay-*/` at the root of that medium. See the parent README
for verification, reboot and SSH details.

`manifest.json` provides discovery metadata and the OEM checksum. See
[MANIFEST.md](../MANIFEST.md) for the proposed menu/status contract.
