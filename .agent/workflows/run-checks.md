---
description: Run all CI checks in Docker containers and report the result
---

1. From the repository root run `sh tools/test-in-container.sh`.
2. If Docker is not running, stop and ask the user to start it. Do not run any
   check on the host.
3. Report the `=== Summary` and `FAILED ...` lines. For each failure, rerun only
   that check with `sh tools/test-in-container.sh run <command>` before
   changing code.
