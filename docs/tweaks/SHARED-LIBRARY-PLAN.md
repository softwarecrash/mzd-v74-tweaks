# Independent tweak implementation

Current decision: the five reference tweaks are self-contained. Their shared
contract is `install`, `uninstall`, `status`, output/exit behaviour and manifest
metadata. A single tweak folder can be copied anywhere on USB and run directly
without `lib/`, a launcher or a build step.

The renderer embeds helper source into each reference `run.sh` at development
time. Duplicate code in those deployed scripts is intentional. The reviewed
patch and SSH payload bytes remain unchanged.

Shared runtime libraries remain optional for future larger features. They are
not required by the interface. See [LIBRARIES.md](LIBRARIES.md) for the optional
prototype; the five manifests declare no runtime library dependencies.

Firmware metadata declares supported versions; it cannot guarantee identical
implementation behaviour. Each worker checks firmware and protects its writes,
backups and rollback. Contract tests and focused reviews cover code changes.

Integrated vehicle validation remains pending; upstream PRs and existing
upstream installers are unchanged.
