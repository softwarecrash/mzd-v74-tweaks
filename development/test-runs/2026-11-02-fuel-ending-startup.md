# Fuel ending shim: retryable startup resolution

- Scope: PR #24, firmware 74.00.324. Synthetic tests only; no CMU changes.
- Changes: cache successful original-function lookups, retry missing functions,
  and activate redirection only with both guards and the original EEM function.
  Cache publication and snapshots use a mutex; loader operations and calls into
  originals happen outside that mutex.
- Build: pinned m3-toolchain commit `61ec0343de84f6fc7c46840056df1d600d44be8a`
  in an isolated, networkless Linux/QEMU appliance. Rebuilding the previous
  source first reproduced the previously shipped binary byte-for-byte.
- Regression evidence: the new early-EEM, missing-EEM and later-loaded-EEM
  scenarios fail with the previous shim. The revised shim passes them.
- ARM verification: 118 checks pass under qemu-arm against synthetic libraries,
  including the existing feature matrix, missing guards, alternate SONAME,
  unrelated process, delayed loading and eight concurrent first-use threads.
  Startup probes have a 15-second process limit.
- Package verification: the 16 real package checks pass under Linux/BusyBox,
  including native-module refusal, combined JS/shim publication, integrity
  inspection, unrelated-edit preservation and saved uninstall.
- Metadata and runnable USB validation: 18 tweaks pass.

Missing EEM is an explicit failure: known guards retain their original results,
but EEM calls return -1 until an original becomes available. This is not a claim
that full original functionality can be provided without that function.

The updated source and ARM asset require independent review and vehicle testing.
The older standalone shim's vehicle evidence does not validate this revision.
