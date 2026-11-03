"""Small explicit local delta to the pinned GPL upstream loader; no driver changes."""
def adapt_loader(data):
    replacements = [
        (b'BOOTLOG=${BOOTLOG:-/data_persist/log/aaw-boot.log}',
         b'''# Local integration: bounded RAM diagnostics, removed by the saved uninstaller.
BOOTLOG=/tmp/mzd-tplink-rtl8811au-boot.log
DMESGLOG=/tmp/mzd-tplink-rtl8811au-dmesg.log
for log_file in "$BOOTLOG" "$DMESGLOG"; do
    if [ -L "$log_file" ] || { [ -e "$log_file" ] && { [ ! -f "$log_file" ] || [ "$(stat -c %h "$log_file")" != 1 ]; }; }; then
        echo "load-wlan1: Unsafe diagnostic path: $log_file" >&2
        exit 1
    fi
done
umask 077'''),
        (b"| tail -40 \\\n        >> \"/data_persist/log/aaw-boot-$BOOT_ID.dmesg\" 2>/dev/null",
         b'| tail -40 | tail -c 8192 > "$DMESGLOG" 2>/dev/null'),
        (b'"wlans=$bc_wlans usb=$bc_usb result=$RESULT" >> "$BOOTLOG" 2>/dev/null',
         b'"wlans=$bc_wlans result=$RESULT usb=$bc_usb" | head -c 4096 > "$BOOTLOG" 2>/dev/null'),
        (b'[ "$RESULT" = ok ] || bc_dmesg',
         b'if [ "$RESULT" = ok ]; then rm -f "$DMESGLOG"; else bc_dmesg; fi'),
    ]
    for old, new in replacements:
        if data.count(old) != 1:
            raise ValueError('Upstream loader changed; review the RAM logging adaptation.')
        data = data.replace(old, new, 1)
    # Replace upstream persistence-specific commentary with the local policy.
    start=data.index(b'# Console output lives in /tmp')
    end=data.index(b'# Local integration:', start)
    data=data[:start]+b'# Keep only the latest invocation in RAM. Logs do not survive reboot.\n'+data[end:]
    return data
