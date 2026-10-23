# Standalone Mazda v74 tweaks

Each complete tweak folder runs independently on firmware 74.00.324.
Copy the required folder to USB and invoke its script from a root shell:

```sh
sh /tmp/mnt/sdb1/tweaks/list-beep/run.sh status
sh /tmp/mnt/sdb1/tweaks/list-beep/run.sh install
sh /tmp/mnt/sdb1/tweaks/list-beep/run.sh uninstall
```

Available tweaks: `list-beep`, `list-loop`, `main-menu-loop`, `shorter-delay`,
and `ssh`. See the README in each folder for details.

No build, launcher or shared library is needed. Each `run.sh` is maintained
directly; its configuration must agree with its manifest. After changing a
file, refresh its adjacent checksum, e.g. `md5sum run.sh > run.sh.md5`.

The manifest is discovery metadata for a future installer. The worker owns
its implementation and checks supported firmware. Actions are `install`,
`uninstall`, and `status`. Successful status prints `installed` or `uninstalled`;
a nonzero exit means an error or unknown state. Workers show no dialogs and
never reboot the CMU. UI changes require a manual reboot; SSH starts immediately.

The original tweak functions were tested on a vehicle. These standalone wrappers
have passed offline tests, including rollback and failure cases, but have not
yet been tested on the vehicle. Keep the complete assets and checksum files
with each worker. Reports are written to the startup USB drive.
