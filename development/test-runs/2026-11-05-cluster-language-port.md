# Instrument Cluster and HUD Language port validation

- Date: 2026-11-05
- Revision: the commit containing this record; base `79faca2`
- Tester: patrikguth
- Type: isolated local tests, not physical CMU
- Firmware / region / hardware: 74.00.324 EU (fixtures, stand-in libraries)

| Check | Result |
| --- | --- |
| All "Validate tweaks" steps in containers | 37 steps passed |
| Real package through the installer | 17 checks passed |
| Worker suite, including this tweak | 281 checks passed, also on the CMU-like BusyBox 1.19.2 from the CI |
| `build/build.sh` with the pinned m3-toolchain | Shim built; fuel shim still `a8d5cada…` |
| Shim under qemu-arm with stand-in libraries | 328 checks passed |
| Mutations: control type, process, code, client fallback, name and number parsing, log cap, retry, arguments, code priority | 13 of 13 caught |

Not run: the shim with the real Mazda libraries, and a vehicle test. The C++ version of the same hook has run in a Mazda 6 2019 EU since October.
