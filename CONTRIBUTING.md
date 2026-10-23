# Development standards proposal

This branch proposes one repository-wide standard for discussion in #11 and
the shared-standards issue. Acceptance is a maintainer decision. There are no
legacy-style exemptions or compatibility baselines. This configuration proposal
does not rewrite existing application or installer code.

## Tools and checks

Use Python 3.12 or newer and an isolated environment. Windows contributors can
use the same pre-commit hooks; Git for Windows supplies Git. Tool packages are
pinned in .pre-commit-config.yaml so local runs and CI use the same versions.

```sh
python -m pip install pre-commit==4.7.0
python -m pre_commit install
python -m pre_commit validate-config
python -m pre_commit run --all-files
```

All configured hooks are read-only, including the formatter. CI runs them over
the entire repository, not only changed files. Existing violations fail checks;
addressing them requires an explicit code-change task, not a hidden baseline.

The common suite checks ShellCheck diagnostics, shfmt formatting, UTF-8/LF,
YAML/JSON syntax, merge markers, tracked checksum sidecars and tweak manifests.
Existing CI continues to check patch reproduction, JS syntax, installers and
native shims. Run relevant behaviour tests as well; formatting/lint do not prove
runtime compatibility with the old CMU.

## Formatting and protected data

- Shell: POSIX sh, two spaces, indented case arms, spaces after redirection
  operators, and shfmt's canonical block layout (then/do on the condition line).
  .editorconfig is the shfmt configuration source. This is a concrete style
  proposal; decide it together rather than maintaining two formatter styles.
- Use blank lines between logical sections and short comments explaining the
  purpose of larger steps. Avoid compressing multiple operations onto one line.
- Source: UTF-8 without BOM, LF, final newline. Python uses four spaces.
- ShellCheck: sh mode, all severities, no global exclusions. Add a local
  suppression only with an explanation of the verified CMU-specific reason.
- OEM originals, derived OEM files, native binaries, MP3/entry assets, graphics,
  patch files and fixture data are protected from formatting/normalization.
  .editorconfig, .gitattributes and the pre-commit exclusion define this boundary.
- Protected data still needs integrity checks. A blanket formatter or recursive
  newline-conversion command must never be run over the repository.

The pinned shfmt Python distribution 4.2.0 supplies shfmt 3.14.1. ShellCheck is 0.11.0 via
shellcheck-py 0.11.0.1. jsonschema is 4.26.0. Update pins deliberately in one PR.

## Tweak and launcher interface

```text
tweaks/<id>/manifest.json
tweaks/<id>/run.sh
tweaks/<id>/assets/
```

Each complete tweak folder must work independently from the shell, regardless
of the current directory. Required libraries must be included in its package.

| Action | Result |
| --- | --- |
| install | Install; repeated calls preserve the requested state. |
| uninstall | Remove this tweak only, preserving other tweaks. |
| status | Exit 0 and stdout exactly installed or uninstalled plus newline. |
| No arguments / --help | Usage only; no mounts, logs or system changes. |

Other actions and extra arguments fail without modifying the CMU. Errors use
stderr and nonzero exit codes; status errors leave stdout empty. Progress is
human-readable stdout, not a machine protocol. Workers never prompt, open UI
or reboot. The launcher confirms actions, runs changes sequentially and handles
the display and final reboot question. Workers additionally lock shared targets.

Manifests are JSON data, never sourced as code. Required common fields are
schema_version, id, name, description, version, type, group, firmware,
entrypoint, actions and reboot_required. The pre-commit hook embeds the proposed
common-field schema; backend-specific metadata is allowed. IDs match folder
names, entrypoint is run.sh, and actions are install/uninstall/status. Agree
category names and the final schema version before integrating the prototype.

schema_version versions the interface; incompatible contract changes require a
new value. version independently versions the tweak. Firmware support must be
explicitly checked by the worker. Document whether service status means installed
or currently running. reboot_required is a boolean for the launcher's final
reboot decision, never permission for the worker to reboot.

## Safety and verification

- Validate firmware, tools, assets, write access and available space before
  modifications. Refuse unknown, conflicting or partial states.
- Keep verified OEM backups on the CMU. Keep logs, reports and complete
  previous-state rollback copies on the startup USB, without internal fallback.
- Verify changes and rollback. Preserve other tweaks when uninstalling.
- Restore prior mount/watchdog state and release owned locks on success, errors
  and catchable signals. Power loss is not a catchable signal.
- Test install, repeat install, uninstall, conflicts and failure/rollback paths.
  Check combinations when tweaks share files. Never equate emulator success
  with vehicle verification; record firmware/region and remaining limitations.

## Pull requests

Use the PR template: explain the behaviour and affected targets, list concrete
validation and separate vehicle evidence from offline tests. One tweak per
feature PR; shared infrastructure is reviewed separately. Follow AGENTS.md when
using coding agents. Existing custom agent definitions remain available.

The proposed job name is `CI / standards`. A maintainer must select the actual
check in branch protection/rulesets to make it a merge requirement; adding the
workflow alone cannot enforce branch settings.
