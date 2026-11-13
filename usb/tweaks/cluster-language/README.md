# Instrument Cluster and HUD Language

Settings-service shim for CMU **74.00.324**. It changes the language code sent to
the instrument cluster and HUD and leaves the CMU interface language unchanged.

On some languages the HUD hides the street-name line. Choosing English can show
it again. Tested on a Mazda 6 2019 EU with color HUD, 74.00.324A: Hungarian CMU
with English UK shows the street name. Which other codes hide it is not known.
The cluster/HUD warning texts follow the chosen language.

## Use

1. Open **System > Instrument Cluster and HUD Language**.
2. Choose **Cluster / HUD language**, then select Install.
3. Wait for Install completed, exit the installer and restart the CMU.
4. To choose another language, uninstall and install again.

**Off** forwards the normal CMU language code. The list shows full language names,
with the English variants first. The settings file uses these values:

| Setting | Code | Setting | Code | Setting | Code |
| --- | --- | --- | --- | --- | --- |
| `en-uk` | 7 | `es-mx` | 6 | `pl` | 23 |
| `en-us` | 4 | `fi` | 18 | `pt` | 13 |
| `en-au` | 2 | `fr` | 8 | `ru` | 12 |
| `ar` | 26 | `fr-ca` | 5 | `sk` | 20 |
| `cs` | 19 | `hu` | 21 | `sv` | 15 |
| `da` | 16 | `it` | 10 | `tr` | 22 |
| `de` | 9 | `ja` | 1 | `uk` (Ukrainian) | 27 |
| `es` | 11 | `nl` | 14 | `zh-cn`, `zh-tw` | 24, 25 |

These are the codes the stock CMU sends. It sends 4 for any other language.

To test another code, set **Custom language code** (1 to 255), or put
`hud_display_code=<code>` in `user/cluster-language/settings.conf` on the USB
drive. A value other than 0 replaces the language in the list.

## Installed files

Own files are in `/tmp/mnt/data_persist/mzd-tweaks/shims/cluster-language/`:
`libpatch-svcjciblmsettings.so` and the generated `libpatch.conf`. Do not edit
that file by hand: the installer then reports the tweak as broken and refuses to
uninstall it until the file is restored.

Both `sm.conf` and `sm_WCP.conf` receive the jciBLMSettings preload entry, and
other shims are preserved. Native modules must match the declared OEM
fingerprints. This tweak is independent of Android Auto Mod and has no JS patches.

An existing reference to another copy of this shim blocks installation. Remove it
with its own installer first. Do not restore entire SM configs to do that.

No HUD, or an unknown or combiner HUD, gives a warning only, because the shim also
changes the instrument cluster.

## Source

`src/mazda/patches/libpatch-svcjciblmsettings/`, built by `build/build.sh`.
License: AGPL-3.0-or-later (see `LICENSE`).

The service has `reset_board=yes`: a library or process failure can restart the
CMU. Never reboot after a critical installer error; inspect the USB report first.

The runtime log is `/tmp/cluster-language.log`. Action reports and `run.log` are
saved on the originating USB under
`reports/cluster-language/<action>-<timestamp>-<unique>/`.
