# Traffic Jam status bar and phone return

- Date: 2026-11-07
- Commit: ea3576c596b5eff7447939ece30e47bbe13bd28f
- Tester: SoftWareCrash (visual/controller checks), SSH verification
- Type: physical bench CMU; separate emulator checks
- Firmware / region / hardware: 74.00.324 / EU / CMU-150
- Packages: Tetris 0.5.1, Snake 0.1.2, Minesweeper 0.1.2
- Preconditions: shared GUI provider with the new layout/phone lifecycle;
  DriveDash and SSH already installed. Game settings/data were not fabricated.

| Step | Expected | Actual | Result |
| --- | --- | --- | --- |
| Install all three games | Reuse shared support; valid saved packages/assets | All installed; assets compared with USB sources | Pass |
| Restart | All game packages and shared service available | Installed status for all three; GUI service and SSH running | Pass |
| Emulator layout | Status bar and complete playfields/menus | User confirmed all three views fit | Pass |
| Phone interruption during play | Retain board/state, return paused | User confirmed return and preserved game state in the tested game | Pass |
| Continue after return | Play resumes only after deliberate Continue | User confirmed | Pass |

## Limits

The user did not identify which game was used for the physical phone-call test;
this does not claim a separate call test for each game. The three games' pause,
input and timer behavior was additionally exercised in isolated tests. Shared
runtime code matches the bench-tested helper; no DriveDash package is included
in this PR. No private logs, phone details or network addresses are published.
