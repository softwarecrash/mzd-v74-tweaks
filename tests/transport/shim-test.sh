#!/bin/sh
# Parser/ABI guard test only; the ELF header fixture is never loaded/executed.
set -eu
ROOT=/experiment/package
. "$ROOT/lib/shim.sh"
. "$ROOT/lib/manifest.sh"
mzd_manifest_load "$ROOT/tweaks/shim-example/manifest.conf"
SHIM_SERVICE=jciMMUI
SHIM_PATH=/tmp/shim-alpha.so
scratch=$(mktemp -d /tmp/original-shims.XXXXXX)
trap 'rm -rf "$scratch"' 0
cat > "$scratch/original" <<'CONF'
<services>
  <service name="jciMMUI" path="/jci/mmui/example.so">
    <dependency value="other"/>
  </service>
</services>
CONF
mzd_shim_elf /experiment/fixture-arm.so
mzd_shim_transform "$scratch/original" install > "$scratch/alpha"
[ "$(mzd_shim_transform "$scratch/alpha" status)" = installed ]
SHIM_PATH=/tmp/shim-beta.so
mzd_shim_transform "$scratch/alpha" install > "$scratch/both"
SHIM_PATH=/tmp/shim-alpha.so
mzd_shim_transform "$scratch/both" uninstall > "$scratch/beta"
[ "$(mzd_shim_transform "$scratch/beta" status)" = uninstalled ]
SHIM_PATH=/tmp/shim-beta.so
[ "$(mzd_shim_transform "$scratch/beta" status)" = installed ]
mzd_shim_transform "$scratch/beta" uninstall > "$scratch/restored"
cmp -s "$scratch/original" "$scratch/restored"
echo ORIGINAL_SHIM_TOOLS_PASSED

# The variable component schema and settings mapping use the same original awk.
. "$ROOT/lib/components.sh"
. "$ROOT/lib/settings.sh"
. "$ROOT/lib/bundle.sh"
HERE="$ROOT/tweaks/bundle-example"
mzd_manifest_load "$HERE/manifest.conf"
mzd_components records > "$scratch/components"
mzd_components paths > "$scratch/paths"
[ "$(awk 'END{print NR}' "$scratch/paths")" = 6 ]
mzd_settings_normalize "$HERE/manifest.conf" hud_display_language=english > "$scratch/settings"
MZD_SETTINGS_FILE="$scratch/settings"
mzd_component_config "$HERE/assets/libpatch.map" "$scratch/generated.conf"
grep -q '^hud_display_language = english$' "$scratch/generated.conf"
mzd_bundle_prerequisites() { printf 'info\tSupported hardware detected.\n'; }
mzd_bundle_preflight > "$scratch/info"
grep -q "$(printf '^info\tSupported hardware detected\.$')" "$scratch/info"
mzd_bundle_prerequisites() { printf 'warning\tA warning is not a block.\n'; }
mzd_bundle_preflight > "$scratch/warning"
mzd_bundle_prerequisites() { printf 'block\tNo supported hardware.\n'; }
if mzd_bundle_preflight > "$scratch/block"; then exit 1; fi
mzd_manifest_load "$ROOT/tweaks/shim-example/manifest.conf"
. "$ROOT/lib/vehicle.sh"
mkdir "$scratch/bin"
cat > "$scratch/bin/dbus-send" <<'DBUS'
#!/bin/sh
[ "${TEST_VBS_UNKNOWN:-0}" != 1 ] || { printf '   byte 255\n'; exit 0; }
case "$*" in *byte:13*) printf '   byte 1\n' ;; *byte:26*) printf '   byte 2\n' ;; *) exit 1 ;; esac
DBUS
chmod 755 "$scratch/bin/dbus-send"
PATH="$scratch/bin:$PATH"; export PATH
[ "$(mzd_vehicle_hud)" = WHUD_color ]
TEST_VBS_UNKNOWN=1; export TEST_VBS_UNKNOWN
[ "$(mzd_vehicle_hud)" = unknown ]
echo ORIGINAL_COMPONENT_TOOLS_PASSED

# Actual private OEM layouts: unrelated self-closing services and XML comments.
SHIM_SERVICE=jciBLMSettings
SHIM_PATH=/tmp/test-cluster-language.so
for name in sm.conf sm_WCP.conf; do
    mzd_shim_transform "/experiment/oem-$name" install > "$scratch/oem-patched"
    mzd_shim_transform "$scratch/oem-patched" uninstall > "$scratch/oem-restored"
    cmp -s "/experiment/oem-$name" "$scratch/oem-restored"
done
echo ORIGINAL_OEM_CLUSTER_LAYOUT_PASSED
