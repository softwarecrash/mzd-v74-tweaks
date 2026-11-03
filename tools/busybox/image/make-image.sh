#!/bin/sh
# make-image.sh BUSYBOX [IMAGE]
# Makes the Docker image in which the tweak tests run with only the CMU's programs: the given BusyBox as
# /bin/busybox and /bin/sh, with its applets linked exactly where they are on the CMU (links.txt), and a Python
# for the test driver in /usr/local, outside the PATH the tests give the tweak scripts. Nothing else: no shell
# and no tools of another system. IMAGE is the name of the new image (default cmu-tweak-test:local).
#
# The test driver (python3) runs the tweak scripts with /bin/sh and a PATH of /usr/bin and /bin, so every shell
# and every command a script uses is the CMU-like BusyBox. A command that is not on the CMU is "not found".
#
# Needs Docker. Python is copied from the official image python:3.12-alpine, pinned by digest: the interpreter
# and its standard library (/usr/local) and the shared libraries it loads (*.so* of /lib and /usr/lib), but no
# program of Alpine. The image is made for the processor of this machine; on an x86 machine the ARM BusyBox in
# it needs qemu-arm, as for the other scripts (see ../README.md).
set -eu

here=$(cd "$(dirname "$0")" && pwd)    # tools/busybox/image
python_image=python:3.12-alpine@sha256:e6dae589c1c05976188fd3bd019afd091445fc533ed2ea29001beddc7368a9c8

bb=${1:-}
image=${2:-cmu-tweak-test:local}
if [ -z "$bb" ] || [ ! -f "$bb" ]; then
    echo "usage: sh $0 BUSYBOX [IMAGE]" >&2
    exit 2
fi

say() { printf '\n== %s\n' "$*"; }

# A scratch folder and a temporary container (to copy Python out of), both removed at the end.
tmp=$(mktemp -d "${TMPDIR:-/tmp}/make-image.XXXXXX")
cid=''
trap 'if [ -n "$cid" ]; then docker rm -f "$cid" >/dev/null 2>&1 || true; fi; rm -rf "$tmp"' EXIT
trap 'exit 1' INT TERM
root=$tmp/root

say "1/4 BusyBox and its links, users and groups, as on the CMU"
mkdir -p "$root/bin" "$root/sbin" "$root/usr/bin" "$root/usr/sbin" "$root/lib" "$root/usr/lib" \
    "$root/tmp" "$root/etc" "$root/proc" "$root/dev" "$root/sys" "$root/usr/libexec/qemu-binfmt"
chmod 1777 "$root/tmp"                    # like a real /tmp: writable by everyone (Docker keeps this mode)
cp "$bb" "$root/bin/busybox"
chmod 755 "$root/bin/busybox"
count=0
while IFS= read -r path; do
    case $path in '#'*|'') continue ;; esac
    # The link target as on the CMU: relative to the folder of the link.
    case $path in
        /bin/*)                target=busybox ;;
        /sbin/*)               target=../bin/busybox ;;
        /usr/bin/*|/usr/sbin/*) target=../../bin/busybox ;;
        *) echo "make-image.sh: unexpected path in links.txt: $path" >&2; exit 1 ;;
    esac
    ln -s "$target" "$root$path"
    count=$((count + 1))
done <"$here/links.txt"
echo "$count links"

# The users and groups of the CMU (recorded on the car with System Recon): user 0 is called "cmu", there is no
# user "root". Only facts that were recorded: the users service, hmi and browser (uid 1001-1003) are left out
# because their group is not known; the password and comment fields stay empty. BusyBox reads these files
# itself (CONFIG_USE_BB_PWD_GRP), so "id" prints uid=0(cmu) gid=0(root) as on the car.
printf '%s\n' 'cmu::0:0::/root:/bin/sh' >"$root/etc/passwd"
for g in root:0 tty:5 disk:6 kmem:9 cdrom:11 dialout:18 video:39 audio:63 user:1000 service:1001 hmi:1002 browser:1003; do
    printf '%s::%s:\n' "${g%:*}" "${g#*:}"
done >"$root/etc/group"
mkdir -p "$root/root"                    # the home folder of user 0, as on the CMU

say "2/4 Python for the test driver (from $python_image)"
cid=$(docker create "$python_image")
docker cp "$cid:/usr/local" "$root/usr/" >/dev/null
docker cp "$cid:/lib" "$tmp/alpine-lib" >/dev/null
docker cp "$cid:/usr/lib" "$tmp/alpine-usr-lib" >/dev/null
# Only the shared libraries (and the links between them), never a program.
for from in alpine-lib:lib alpine-usr-lib:usr/lib; do
    src=$tmp/${from%%:*}
    dst=$root/${from#*:}
    (cd "$src" && find . \( -type f -o -type l \) -name '*.so*') | while IFS= read -r f; do
        mkdir -p "$dst/$(dirname "$f")"
        cp -P "$src/$f" "$dst/$f"
    done
done
# Programs that came with /usr/local besides Python itself (pip, idle, ...) are not needed by the tests.
find "$root/usr/local/bin" ! -name 'python3*' \( -type f -o -type l \) -exec rm -f {} +
find "$root/usr/local/bin" -mindepth 1 -maxdepth 1 -exec basename {} \; | sort | tr '\n' ' '; echo

say "3/4 Check: no program of another system"
# Every program in the folders of the PATH must be a link to our BusyBox.
others=$(find "$root/bin" "$root/sbin" "$root/usr/bin" "$root/usr/sbin" \( -type f -o -type l \) ! -name busybox |
    while IFS= read -r f; do
        [ "$(readlink "$f")" = busybox ] || [ "$(readlink "$f")" = ../bin/busybox ] ||
            [ "$(readlink "$f")" = ../../bin/busybox ] || echo "$f"
    done)
if [ -n "$others" ]; then
    echo "make-image.sh: these are not links to BusyBox: $others" >&2
    exit 1
fi
echo "only BusyBox in /bin, /sbin, /usr/bin, /usr/sbin"

say "4/4 Make the image $image"
tar -C "$root" -c . | docker import - "$image" >/dev/null
echo "made $image"
