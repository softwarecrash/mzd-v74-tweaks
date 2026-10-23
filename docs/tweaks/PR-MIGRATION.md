# Follow-up plan for the existing contributions

## What the review actually says

Piotrmocko's [PR #17 review](https://github.com/piotrmocko/mzd-v74-tweaks/pull/17#pullrequestreview-5624575849)
is a comment review, not a rejection of the feature or a request to abandon the
existing PRs. He found no code issues apart from documentation, and asks for:

- Blank lines and comments explaining larger sections.
- Consistent shell formatting with fewer inline conditions.
- Functions for common work, ready to move into shared helpers later.
- Central dialog wrappers (`info`, `confirm`, `ask`) and non-blocking progress.
- Documentation of the explicit `dialog` action.
- Agreement on the OEM checksum's location.

He did not review the Python tests. Successful CI must not be represented as his
approval of those tests. The manifest format/status protocol and final helper
layout remain proposals in issue #11.

## Changes made in this experimental branch

- Five versioned JSON manifests, schema documentation and checked ZIP inclusion.
- Shared runtime API 2 in `lib/common.sh`, optional `lib/system.sh` and
  optional `lib/patch.sh`. A copied
  `tweaks/<id>/` folder and `lib/` work without a launcher.
- Readable shell sections, named validation/write functions, comments explaining
  rollback and patch-state detection, and a short top-level workflow.
- Shell-only workers with textual progress, errors and a recorded status-output
  contract. Usage-only startup replaces the earlier prototype's implicit GUI.
- Display/confirmation/reboot handling assigned to the launcher, not individual
  tweaks. This follows the owner's clarified architecture; the review's dialog
  abstraction belongs on the launcher side in this design.
- OEM checksums maintained in manifests and rendered into independent scripts;
  a reproducibility check prevents those copies from drifting apart.
- Original patch files and SSH supervisor/configuration kept unchanged.

## Route A: keep the current PRs

If the maintainer wants the contributions before the restructuring:

1. Apply a readability-only follow-up to #17: sections, comments, named technical
   helpers and corrected docs. Retain its targeted AWK backend and the existing
   feature-specific tests to keep the review focused. Agree with the maintainer
   how the existing launcher should supply dialogs before removing any current
   PR entry behaviour; the experimental branch now uses shell-only workers.
2. Apply the same agreed style to #15, #16 and #18. Keep each tweak in its own PR,
   even though three of them modify the same file.
3. Apply the corresponding worker structure to SSH #14 while keeping
   its separately verified service implementation and lifecycle tests intact.
4. Integrate the manifest/shared-library variant through a coordinated replacement.
   The branch already implements it; the old PRs remain unchanged.
   Do not add an unagreed launcher framework to individual feature PRs.

Advantages: preserves the current reviews and allows incremental acceptance.
Cost: a later backend/layout migration would still be needed.

## Route B: adopt diff/patch before merging

If the maintainer prefers the new common direction now:

1. Agree on the manifest fields, status/error contract, helper location and the
   BusyBox-compatible copy/probe workflow in #11. Decide whether live service
   health should be separate from patch presence.
2. Submit the agreed common foundation once, if shared runtime helpers are
   wanted. The current standalone templates are an implementation proposal,
   not a requirement that upstream adopt our entire development branch.
3. Port one small UI tweak as the reference implementation. Validate its new
   wrapper on the CMU, then adapt the remaining tweaks in separate PRs.
4. Keep SSH as its own contribution. Verify installation, actual login, full
   reboot and uninstall with the final integrated wrapper; do not infer this
   from an offline service stand-in.
5. Update the existing PR branches if practical, or explicitly link replacements
   and close superseded PRs only after agreement. Do not leave parallel PRs
   appearing to be competing implementations of the same feature.

Advantages: avoids maintaining two installer approaches. Cost: needs agreement
and final-wrapper vehicle tests before treating it as the replacement.

## Current working direction

Continue with route B and the standalone structure: runtime folders under
`tweaks/`, tooling under `build/tweaks/`, tests under `tests/tweaks/`, documents
under `docs/tweaks/`, and the schema under `schemas/`. Agree the remaining
manifest/category/helper details before integrating the launcher.

Keep the five existing PRs available and unchanged until the replacement path
is ready for review. This preparation changes only the experimental branch;
it does not alter, close, replace or post comments on any upstream PR.
