# Remove Safety Warnings

Firmware **74.00.324**, version **0.1.0**.

Combines the former No More Disclaimer startup patch with transparent
reversing-camera warning images. The startup event sequence is unchanged.
No native binary, camera service, camera picture or guidelines are modified.
Startup behavior is based on [Piotr Mocko's v74 implementation](https://github.com/piotrmocko/mzd-v74-tweaks/blob/8b329eb9ffc7ce322786b2ad9980d37b887f4adc/jci-mods/systemApp.js)
and the original MZD-AIO approach.

## Installation and removal

Use the USB installer or `sh run.sh install`, `status` and `uninstall`.
Restart after changing this tweak. Remove any installed `no-more-disclaimer`
package using its saved uninstaller first. There is no automatic ID migration;
overlapping managed paths and unknown existing modifications block installation.

The patch targets `systemApp.js` and 46 warning PNGs. Two generated, transparent
RGBA images retain the OEM dimensions: 800x50 and 801x50. The image inventory
contains OEM filenames and fingerprints, not original image content.

All targets and existing `.org` backups are validated before writes. Installation
backs up verified originals and rolls back changes in reverse order on failure.
Uninstall reverses the startup patch and restores verified images; later foreign
edits are refused. For new managed installations, Uninstall restores original
file metadata and removes owned `.org` backups once no other installed tweak
uses the target.
Backups present before installation are preserved.
Restore originals also validates and removes these backups via the saved reset
hook. Saved packages provide immutable removal code and assets.

Reports: `reports/remove-safety-warnings/<action>-<timestamp>-<unique>/`.

## Validation

From the repository root:

```sh
python tests/tweaks/remove-safety-warnings/test_images.py --full
python tests/tweaks/remove-safety-warnings/test_images.py --restore-only
```

The synthetic suite exercises all 46 image paths, PNG transparency/dimensions,
read-only status, failed writes, rollback, foreign edits, saved uninstall and
Restore originals. CMU lifecycle testing on 74.00.324 verified image fingerprints
and exact restoration of all 47 targets, with the native GUI binary unchanged.
Actual reversing-camera display behavior has not been verified by that lifecycle
test. No native suppression experiment or firmware dump is included.
