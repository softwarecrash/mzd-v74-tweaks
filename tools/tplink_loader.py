"""Small explicit local delta to the pinned GPL upstream loader; no driver changes."""
def adapt_loader(data):
    replacements = [
        (b'    bc_common\n    echo "id=$BOOT_ID',
         b'''    bc_common
    if [ -f "$BOOTLOG" ] && ! grep -q "^id=$BOOT_ID " "$BOOTLOG"; then
        # Bound old input too, including logs left by an older loader version.
        tail -c 4096 "$BOOTLOG" > "$BOOTLOG.1" 2>/dev/null
    fi
    echo "id=$BOOT_ID'''),
        (b'BOOTLOG=${BOOTLOG:-/data_persist/log/aaw-boot.log}',
         b'''# Local integration: bounded persistent diagnostics, removed by the saved uninstaller.
BOOTLOG=/data_persist/log/mzd-tplink-rtl8811au-boot.log
DMESGLOG=/data_persist/log/mzd-tplink-rtl8811au-dmesg.log
for log_file in "$BOOTLOG" "$BOOTLOG.1" "$DMESGLOG"; do
    if [ -L "$log_file" ] || { [ -e "$log_file" ] && { [ ! -f "$log_file" ] || [ "$(stat -c %h "$log_file")" != 1 ]; }; }; then
        echo "load-wlan1: Unsafe diagnostic path: $log_file" >&2
        exit 1
    fi
done
# Never follow a redirected persistent log directory.
[ -d /data_persist/log ] && [ ! -L /data_persist/log ] || exit 1
umask 077'''),
        (b"| tail -40 \\\n        >> \"/data_persist/log/aaw-boot-$BOOT_ID.dmesg\" 2>/dev/null",
         b'| tail -39; } | head -c 8192 > "$DMESGLOG" 2>/dev/null'),
        (b'"wlans=$bc_wlans usb=$bc_usb result=$RESULT" >> "$BOOTLOG" 2>/dev/null',
         b'"wlans=$bc_wlans result=$RESULT usb=$bc_usb" | head -c 4096 > "$BOOTLOG" 2>/dev/null'),
    ]
    for old, new in replacements:
        if data.count(old) != 1:
            raise ValueError('Upstream loader changed; review the persistent logging adaptation.')
        data = data.replace(old, new, 1)
    data=data.replace(b'    dmesg 2>/dev/null |', b'    { echo "id=$BOOT_ID stage=loader result=$RESULT"; dmesg 2>/dev/null |', 1)
    # Keep the upstream explanation of boot_id and reboot-surviving diagnostics.
    return data
