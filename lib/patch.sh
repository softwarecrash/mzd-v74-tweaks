#!/bin/sh
# API 2: optional text patch operations. Importing performs no operations.
# Every operation takes explicit paths/context; no APP/PATCH_FILE/STATE globals.
# The worker owns locks, writable mounts and multi-file orchestration.

mzd_patch_api() {
  printf '%s\n' '2'
}

# Native BusyBox has no dry-run. Probe a copy and require an exact inverse.
mzd_patch_probe() (
  context=$1
  direction=$2
  patch_file=$3
  work="$context/$direction"
  mkdir -p "$work/inverse" || exit 1
  cp "$context/before.data" "$work/target.data" || exit 1
  if [ "$direction" = install ]
  then
    (cd "$work" && patch -N -p0 -i "$patch_file" < /dev/null) > "$work/patch.log" 2>&1 || exit 1
    inverse=-R
  else
    (cd "$work" && patch -N -R -p0 -i "$patch_file" < /dev/null) > "$work/patch.log" 2>&1 || exit 1
    inverse=
  fi
  cmp -s "$context/before.data" "$work/target.data" && exit 1
  cp "$work/target.data" "$work/inverse/target.data" || exit 1
  # inverse is either the fixed -R flag or empty; never caller-provided code.
  (cd "$work/inverse" && patch -N $inverse -p0 -i "$patch_file" < /dev/null) > "$work/inverse.log" 2>&1 || exit 1
  cmp -s "$context/before.data" "$work/inverse/target.data"
)

# Prepare a unique USB context: target, patch, known OEM hash, context directory.
# No target writes or mount changes happen here. Call while holding its lock.
mzd_patch_prepare() (
  target=$1
  patch_file=$2
  original=$3
  context=$4
  mzd_require_tools patch diff cp cmp md5sum || exit 1
  mzd_require_assets "$patch_file" || exit 1
  if [ ! -f "$target" ] || [ -L "$target" ]
  then
    mzd_fail 'Target is missing or is a symbolic link.'
  fi
  case "$target:$patch_file:$context" in
    *'
'*) mzd_fail 'Multiline patch paths are unsupported.' ;;
  esac
  case "$target:$patch_file:$context" in
    /*:/*:/*) ;;
    *) mzd_fail 'Absolute patch paths are required.' ;;
  esac
  case "$original" in
    ''|*[!0-9a-f]*) mzd_fail 'Invalid OEM checksum.' ;;
  esac
  [ "${#original}" = 32 ] || mzd_fail 'Invalid OEM checksum.'
  canonical=$(readlink -f "$context") || mzd_fail 'Cannot resolve patch context.'
  case "$canonical" in
    "$MZD_REPORT"/*) ;;
    *) mzd_fail 'Patch contexts must stay in the startup USB report.' ;;
  esac
  mkdir "$context" || mzd_fail 'Cannot create a unique patch context.'
  printf '%s\n' "$target" > "$context/target.path" || exit 1
  printf '%s\n' "$original" > "$context/original.md5" || exit 1
  cp "$target" "$context/before.data" || mzd_fail 'Cannot save the USB rollback copy.'
  before=$(mzd_hash "$target")
  [ "$(mzd_hash "$context/before.data")" = "$before" ] || mzd_fail 'USB rollback copy mismatch.'
  printf '%s\n' "$before" > "$context/before.md5" || exit 1
  forward=0
  reverse=0
  mzd_patch_probe "$context" install "$patch_file" && forward=1
  mzd_patch_probe "$context" uninstall "$patch_file" && reverse=1
  case "$forward:$reverse" in
    1:0) state=uninstalled; direction=install ;;
    0:1) state=installed; direction=uninstall ;;
    *) mzd_fail 'Patch state is unknown, partial or ambiguous. No system file changed.' ;;
  esac
  mzd_hash "$context/$direction/target.data" > "$context/desired.md5" || exit 1
  printf '%s\n' "$state" > "$context/state" || exit 1
)

mzd_patch_state() (
  cat "$1/state"
)

mzd_patch_validate_backup() (
  context=$1
  target=$(cat "$context/target.path") || exit 1
  original=$(cat "$context/original.md5") || exit 1
  before=$(cat "$context/before.md5") || exit 1
  backup="$target.org"
  if [ -e "$backup" ] || [ -L "$backup" ]
  then
    if [ ! -f "$backup" ] || [ -L "$backup" ] || [ "$(mzd_hash "$backup")" != "$original" ]
    then
      mzd_fail 'The .org backup is not the known OEM original.'
    fi
  elif [ "$before" != "$original" ]
  then
    mzd_fail 'The shared OEM .org backup is missing. Nothing changed.'
  fi
)

# Write one prepared target. Worker must make the appropriate mount writable.
# A failure restores that target's complete previous contents, including other tweaks.
mzd_patch_apply() (
  context=$1
  action=$2
  state=$(mzd_patch_state "$context") || exit 1
  case "$action:$state" in
    install:installed|uninstall:uninstalled) exit 0 ;;
    install:uninstalled|uninstall:installed) ;;
    *) mzd_fail 'Invalid patch action or context state.' ;;
  esac
  mzd_patch_validate_backup "$context" || exit 1
  target=$(cat "$context/target.path") || exit 1
  original=$(cat "$context/original.md5") || exit 1
  before=$(cat "$context/before.md5") || exit 1
  desired=$(cat "$context/desired.md5") || exit 1
  [ "$(mzd_hash "$context/before.data")" = "$before" ] || mzd_fail 'Rollback copy changed.'
  prepared="$context/$action/target.data"
  [ "$(mzd_hash "$prepared")" = "$desired" ] || mzd_fail 'Prepared patch copy changed.'
  [ "$(mzd_hash "$target")" = "$before" ] || mzd_fail 'Target changed while preparing the tweak.'
  diff -U 3 "$context/before.data" "$prepared" > "$context/changes.diff"
  [ "$?" = 1 ] || mzd_fail 'Cannot record the prepared change.'
  backup="$target.org"
  if [ ! -e "$backup" ]
  then
    cp -a "$target" "$backup" && sync
    if [ "$(mzd_hash "$backup")" != "$original" ]
    then
      rm -f "$backup"
      mzd_fail 'Original backup failed.'
    fi
  fi
  cat "$prepared" > "$target"
  sync
  if [ "$(mzd_hash "$target")" != "$desired" ]
  then
    cat "$prepared" > "$target"
    sync
  fi
  if [ "$(mzd_hash "$target")" != "$desired" ]
  then
    cat "$context/before.data" > "$target"
    sync
    [ "$(mzd_hash "$target")" = "$before" ] || mzd_fail 'Write AND rollback failed. Do NOT reboot the CMU.'
    mzd_fail 'Write failed; the complete previous file was restored.'
  fi
)

# Explicit rollback for a later worker-specific failure, e.g. SSH activation.
# Refuse to overwrite an intervening change or an unrelated prepared target.
mzd_patch_rollback() (
  context=$1
  target=$(cat "$context/target.path") || exit 1
  before=$(cat "$context/before.md5") || exit 1
  desired=$(cat "$context/desired.md5") || exit 1
  current=$(mzd_hash "$target")
  [ "$current" = "$before" ] && exit 0
  [ "$current" = "$desired" ] || mzd_fail 'Rollback target changed. Do NOT reboot.'
  [ "$(mzd_hash "$context/before.data")" = "$before" ] || mzd_fail 'Rollback copy changed. Do NOT reboot.'
  cat "$context/before.data" > "$target"
  sync
  [ "$(mzd_hash "$target")" = "$before" ] || mzd_fail 'Rollback failed. Do NOT reboot.'
)
