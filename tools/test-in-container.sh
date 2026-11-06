#!/bin/sh
# Run the repository checks in Linux containers that match CI.
# Works on macOS, Linux, WSL and Git Bash; needs only Docker on the host.
#
#   tools/test-in-container.sh                  all "Validate tweaks" steps
#   tools/test-in-container.sh workers          worker suite on the CMU-like BusyBox only
#   tools/test-in-container.sh run CMD...       one command, CI runner image
#   tools/test-in-container.sh busybox CMD...   one command in the test image (only the CMU-like BusyBox)
#
# CMU_TEST_ONLY=<tweak-id> limits the worker suite to one tweak.
# The worker suite and "busybox" use the same scripts as the CI jobs busybox and workers
# (tools/busybox/README.md): the BusyBox is built and checked once, then reused while its files do not change.
# On an x86 machine or an Apple Silicon Mac the ARM BusyBox runs through qemu (Docker Desktop has it); give
# QEMU_STATIC=/path/to/qemu-arm-static if Docker cannot start ARM programs in containers.
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
IMAGE=mzd-tweaks-test

usage() {
    sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
    exit 2
}

command -v docker >/dev/null 2>&1 || {
    echo "Docker is required. Install Docker Desktop, OrbStack or Colima." >&2
    exit 1
}
docker info >/dev/null 2>&1 || {
    echo "The Docker daemon is not running. Start Docker Desktop, OrbStack or 'colima start'." >&2
    exit 1
}

# Git Bash would rewrite the container paths; give Docker a Windows path.
MSYS_NO_PATHCONV=1
export MSYS_NO_PATHCONV
HOST_ROOT=$ROOT
if (cd "$ROOT" && pwd -W) >/dev/null 2>&1; then HOST_ROOT=$(cd "$ROOT" && pwd -W); fi

build() {
    docker build -q --target "$1" -t "$IMAGE:$1" -f "$HOST_ROOT/tools/container/Dockerfile" \
        "$HOST_ROOT/tools/container" >/dev/null
}

# Same isolation as the CI worker step: no network, read-only repository.
run_in() {
    target=$1; shift
    build "$target"
    docker run --rm --network none --read-only --cap-drop ALL \
        --security-opt no-new-privileges --user "$(id -u):$(id -g)" \
        --tmpfs /tmp:rw,exec,nosuid,size=512m \
        -e MZD_TEST_CONTAINER=1 -e CMU_TEST_ONLY="${CMU_TEST_ONLY:-}" \
        -v "$HOST_ROOT:/repo:ro" -w /repo "$IMAGE:$target" "$@"
}

# cmu_image: a checked CMU-like BusyBox (built only when its files changed) and the test image made from it.
# The steps are joined with && because "workers || ..." below turns set -e off inside the function: without them
# a failed build or check would be ignored.
cmu_image() {
    sh "$ROOT/tools/busybox/prepare.sh" &&
        sh "$ROOT/tools/busybox/image/make-image.sh" "$ROOT/.cache/cmu-busybox/busybox" cmu-tweak-test:local
}

workers() {
    echo "=== workers: worker suite in the test image (only the CMU-like BusyBox, user cmu, 128 kB stack)"
    cmu_image &&
        sh "$ROOT/tools/busybox/image/run.sh" /usr/local/bin/python3 tests/contract/test_workers.py
}

case "${1:-all}" in
    all)
        status=0
        run_in ubuntu python tools/container/run-ci-steps.py || status=1
        workers || { echo "FAILED worker suite on the CMU-like BusyBox"; status=1; }
        [ "$status" = 0 ] && echo "=== All checks passed in containers."
        exit "$status" ;;
    workers) workers ;;
    run) shift; [ $# -gt 0 ] || usage; run_in ubuntu "$@" ;;
    busybox) shift; [ $# -gt 0 ] || usage; cmu_image && sh "$ROOT/tools/busybox/image/run.sh" "$@" ;;
    -h|--help|help) usage ;;
    *) usage ;;
esac
