# Development

All developer documentation, examples and reviewed test evidence belong here.
The Wiki is for users. Commands in these guides run from the repository root.
Runtime source remains in `usb/`, executable tests in `tests/`, and tools in `tools/`.

## Start here

- [Contribution guide](CONTRIBUTING.md)
- [Repository structure](Repository-structure.md)
- [Tweak layout](Tweak-layout.md)
- [Manifest format](Manifest-format.md)
- [Worker contract](Worker-contract.md)
- [Persistent packages and versioned uninstall](Persistent-packages.md)
- [Confirmed recovery of an unmanaged patch target](Target-recovery.md)
- [Shared runtime](Shared-runtime.md)
- [Native Lua transport](Lua-transport.md)
- [CMU BusyBox: the version to target and its limits](CMU-BusyBox.md)
  -  [CMU BusyBox applet reference](CMU-BusyBox-reference.md)
- [Date and time on the CMU](CMU-time.md)

## Examples

Copy a complete example into `usb/tweaks/<id>/` before running it:

- [Hello command](examples/hello/README.md)
- [Settings command: number, toggle and choice](examples/settings/README.md)
- [Patch worker](examples/patch/README.md)
- [Shared shim loader and inert C example](examples/shim/README.md)

The example folders are templates, not extra runtime tweaks. Their workers retain
the paths used after copying into the USB layout.

## Verification and tooling

- [Testing and offline styling preview](Testing.md)
- [Original CMU runtime tests](testing/Original-runtime.md)
- [Public fixtures](testing/Fixtures.md)
- [Vehicle test procedure](Vehicle-testing.md)
- [Reviewed test runs and template](test-runs/README.md)
- [Wiki publishing](Wiki-publishing.md)
- [Tweak implementation notes](tweaks/)

Component bundles: [multiple shims, configuration and patches](examples/bundle/README.md).
