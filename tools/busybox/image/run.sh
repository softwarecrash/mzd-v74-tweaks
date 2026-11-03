#!/bin/sh
# run.sh COMMAND...
# Runs COMMAND in the test image (make-image.sh) the way a tweak runs on the CMU: as user 0 (cmu), with the CMU's
# 128 kB stack, the repository read-only at /repo (the working folder), an empty /tmp, no network. The CI job
# workers and tools/test-in-container.sh both use this script, so the tests run the same way everywhere.
# Examples:
#   sh tools/busybox/image/run.sh /usr/local/bin/python3 tests/contract/test_workers.py
#   sh tools/busybox/image/run.sh sh -c 'grep -x a /dev/null; echo $?'
#
# Settings: IMAGE (default cmu-tweak-test:local), CMU_TEST_ONLY (passed on to the test), QEMU_STATIC (a static
# qemu-arm, for an x86 machine whose binfmt registration cannot start ARM programs in containers).
# Docker's default capabilities are kept, not dropped: a tweak has all capabilities on the CMU, and without any,
# user 0 would be an ordinary user.
set -eu

here=$(cd "$(dirname "$0")" && pwd)    # tools/busybox/image
repo=$(cd "$here/../../.." && pwd)     # the repository root
image=${IMAGE:-cmu-tweak-test:local}
if [ $# = 0 ]; then
    echo "usage: sh $0 COMMAND..." >&2
    exit 2
fi

# Git Bash on Windows rewrites paths given to Docker; give it a Windows path instead (as tools/test-in-container.sh).
MSYS_NO_PATHCONV=1
export MSYS_NO_PATHCONV
host_repo=$repo
if (cd "$repo" && pwd -W) >/dev/null 2>&1; then host_repo=$(cd "$repo" && pwd -W); fi

# QEMU_STATIC, when given, adds one mount: "-v FILE:/usr/libexec/qemu-binfmt/arm-binfmt-P:ro". Each ${...:+...} below
# gives one word when QEMU_STATIC is set and nothing when it is not.
exec docker run --rm --network none --read-only --security-opt no-new-privileges \
    --user 0:0 --ulimit stack=131072:131072 --tmpfs /tmp:rw,exec,nosuid,size=128m \
    -e PATH=/sbin:/usr/sbin:/bin:/usr/bin -e HOME=/tmp -e PYTHONDONTWRITEBYTECODE=1 -e CMU_TEST_BUSYBOX=1 \
    -e CMU_TEST_ONLY="${CMU_TEST_ONLY:-}" -v "$host_repo:/repo:ro" -w /repo \
    ${QEMU_STATIC:+-v} ${QEMU_STATIC:+"$QEMU_STATIC:/usr/libexec/qemu-binfmt/arm-binfmt-P:ro"} \
    "$image" "$@"
