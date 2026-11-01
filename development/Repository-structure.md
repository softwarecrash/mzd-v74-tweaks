# Repository structure

| Path | Purpose |
| --- | --- |
| `usb/` | Ready-to-run USB package; copy its contents to the stick |
| `usb/ui/` | Opera-compatible installer UI |
| `usb/tweaks/<id>/` | Runtime manifests, workers, assets and user READMEs |
| `usb/lib/` | Shared runtime and native Lua bridge source |
| `development/` | Developer documentation and architecture |
| `development/examples/` | Copyable command and patch templates |
| `development/tweaks/` | Tweak-specific implementation notes |
| `development/test-runs/` | Reviewed evidence and the manual test template |
| `tests/` | Executable isolated, behavior and transport tests |
| `src/mazda/patches/<name>/` | C sources of shims shipped as `usb/tweaks/*/assets/<name>.so` |
| `src/mazda/m3-toolchain` | CMU cross-compiler submodule pinned for reproducible shim builds |
| `build/` | Developer build scripts (`build/build.sh` rebuilds the shims) |
| `tools/` | Validation, local styling preview and Wiki publishing tools |
| `wiki/` | User documentation published to the GitHub Wiki |
| `docs/` | Website sources |

Nothing assembles the USB tree at startup. No custom compiled helpers are needed.
Grouping comes from manifests rather than extra tweak folder levels. Shared
helpers have defined roles; tweak-specific policy stays in each worker.

Keep developer instructions here. README files shipped with tweaks explain their
purpose, supported firmware and user-facing behavior. Technical contracts and
test procedures are not published in the user Wiki. Private dumps, credentials,
runtime logs and emulation caches remain excluded from Git.
