# Fuel Consumption Ending Screen port validation

- Date: 2026-11-01
- Revision: the commit containing this record; base `8a746e8`
- Tester: patrikguth
- Type: isolated local tests, not physical CMU
- Firmware / region / hardware: 74.00.324 EU (fixtures, full OEM JS file, stand-in libraries)
- Upstream reference: piotrmocko/mzd-v74-tweaks `main`: `jci-mods/ecoenergyApp.js`
  (MD5 `65b6008c19b52041232e0ead96ad22a6`), `jci-shims/fuel_ending_mmui.so`
  (MD5 `554ca237fcf6f11dbdd8b34d142ca544`)

| Check | Result |
| --- | --- |
| Manifest/component validation and installer discovery | Passed |
| Real package through the installer, BusyBox container (as in CI) | 16 checks passed |
| Old shim referenced (main-branch and standalone paths) | Refused, nothing changed |
| Unsupported native module, differently modified ecoenergyApp.js | Refused, nothing changed |
| Install: JS patch, payload and both SM loaders in one transaction | Passed; shim only in jciMMUI |
| Status installed/broken, repeated install, saved uninstall after USB/native changes | Passed; later unrelated JS edit preserved |
| Other contract suites | Passed |
| `build/build.sh` with the pinned m3-toolchain | Byte-identical to the main-branch shim |
| Build shims job simulated in Ubuntu (build, ARM check, qemu test, diff) | Passed; a source change is detected |
| Shim under qemu-arm with stand-in libraries | 91 checks passed |
| Complete OEM file plus diff, GNU and BusyBox `patch` | Byte-identical to the upstream main-branch file; exact reverse |
| actionlint, error-level ShellCheck | Passed |

## Limits and unresolved observations

The same JS change (comments only translated) and the same shim source have been
running in the tester's car (Mazda 6 2019 EU, i-stop, color HUD) since
2026-10-10, installed with the older standalone scripts; the ending screen with
filled graphs was confirmed there on a full trip. This launcher package itself
has not yet been installed on a physical CMU. A vehicle run should check install,
the ending screen after a trip, status, and uninstall back to the stock
i-stop screen. Behaviour on a car without i-stop is not vehicle-tested.
