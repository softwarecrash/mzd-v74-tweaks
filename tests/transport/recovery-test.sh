#!/bin/sh
# Private OEM fixture supplied by the host; never stored in the repository.
set -eu
BASE=/tmp/original-shell-recovery
mkdir -p "$BASE/usb/tweaks/patch-example/assets" "$BASE/internal" "$BASE/persist"
cp -R /experiment/package/lib "$BASE/usb/lib"
cp /experiment/baseline-recovery.sh "$BASE/usb/lib/recovery.sh"
cp /experiment/package/installer.sh "$BASE/usb/installer.sh"
cp /experiment/package/tweaks/patch-example/assets/change.patch "$BASE/usb/tweaks/patch-example/assets/change.patch"
sed -e "s|^target=.*|target=$BASE/internal/target.data|" /experiment/package/tweaks/patch-example/manifest.conf > "$BASE/usb/tweaks/patch-example/manifest.conf"
cp /experiment/original-list.js "$BASE/internal/target.data"
cp /experiment/original-list.js "$BASE/internal/target.data.org"
# Reproduce the exact old patch bytes and native patch tool, without live mounts.
(cd "$BASE/internal" && patch -N -p0 -i /experiment/old-beep.patch)
printf '/dev/ffx01p1 %s/internal relfs ro 0 0\n/dev/mmcblk0p2 %s/persist relfs rw 0 0\n/dev/sdb1 %s/usb vfat rw 0 0\n' "$BASE" "$BASE" "$BASE" > "$BASE/mounts"
printf 'JCI_SW_VER="MAZ_CMU-150_74.00.324"\n' > "$BASE/version"
for lib in "$BASE/usb/lib/"*.sh; do
 sed -e "s|/proc/mounts|$BASE/mounts|g" -e "s|/jci/version.ini|$BASE/version|g" \
     -e "s|^MZD_RECOVERY_ROOT=/|MZD_RECOVERY_ROOT=$BASE/internal|" \
     -e "s|^MZD_PACKAGE_STORE=.*|MZD_PACKAGE_STORE=$BASE/persist/installed|" "$lib" > "$BASE/next"
 cp "$BASE/next" "$lib"
done
echo OLD_INSTALL_REPRODUCED
md5sum "$BASE/internal/target.data" "$BASE/internal/target.data.org"
# Deliberately keep stderr: an absent button otherwise hides the actual refusal.
cmush() { /usr/bin/qemu-arm -L /cmu /cmu/lib/ld-linux.so.3 --library-path /cmu/lib:/cmu/usr/lib /cmu/bin/busybox sh "$@"; }
set +e
cmush "$BASE/usb/installer.sh" restore-check patch-example > "$BASE/baseline.log" 2>&1
baseline=$?
set -e
echo "BASELINE_RECOVERY_EXIT=$baseline"
cat "$BASE/baseline.log"
sed -e "s|/proc/mounts|$BASE/mounts|g" \
    -e "s|^MZD_RECOVERY_ROOT=/|MZD_RECOVERY_ROOT=$BASE/internal|" \
    /experiment/fixed-recovery.sh > "$BASE/usb/lib/recovery.sh"
cmush "$BASE/usb/installer.sh" restore-check patch-example > "$BASE/fixed.log" 2>&1
cat "$BASE/fixed.log"
grep '^available' "$BASE/fixed.log" > /dev/null
echo ORIGINAL_SHELL_RECOVERY_PASSED
