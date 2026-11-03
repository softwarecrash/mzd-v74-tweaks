---
trigger: always_on
---

Follow AGENTS.md in the repository root.

Run tests and checks only inside the Docker containers, with
`sh tools/test-in-container.sh` (see the run-checks skill). Never run
`python tests/...`, `node tests/...`, `shellcheck`, `luac` or `usb/` scripts on
the host. If Docker is unavailable, stop and tell the user instead of running
anything on the host.
