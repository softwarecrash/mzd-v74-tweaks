#!/bin/sh
# check.sh BUSYBOX
# check.sh --print-help BUSYBOX
# Checks a built BusyBox against the CMU's BusyBox, without any file of the car. Four checks, each against a
# file next to this script:
#   1/4 Applet list     the applets of the program must be the 274 of applets.txt
#   2/4 Help texts      "busybox APPLET --help" of every applet must equal help.txt: the help lists the options
#                       compiled into an applet, so a missing or extra option shows here
#   3/4 CMU vs PC       every case of cmu-vs-pc.cases must give the CMU's exit code and output
#   4/4 ELF attributes  an ARM program must have the processor and ABI attributes of elf-attributes.txt
# Every check runs, also after one failed. The last line is "CHECK failed=N".
# Exit code: 0 everything passed, 1 a check failed, 2 wrong use.
#
# --print-help prints the help texts of BUSYBOX in the format of help.txt and checks nothing. help.txt was made
# this way from the CMU's own BusyBox, so the file and the check use the same code.
#
# The program is started directly. On an ARM machine that runs 32-bit ARM programs (as GitHub's ubuntu-24.04-arm
# runners) that just works; on an x86 machine qemu-arm must be registered for ARM programs (binfmt; on Debian or
# Ubuntu the package qemu-user-static). For qemu, QEMU_CPU is set to
# the CMU's processor (cortex-a9) unless it is set already. A dynamic build also needs its libraries:
#   QEMU_LD_PREFIX=FOLDER sh check.sh BUSYBOX
set -u                 # no "set -e": a failed check must not stop the checks after it
# Sort and compare in byte order, as the reference files are written, whatever the language of this machine.
LC_ALL=C
export LC_ALL

here=$(cd "$(dirname "$0")" && pwd)   # the folder of this script, where the expected files are
case_timeout=20                        # seconds per case: a case that hangs fails instead of blocking CI

print_help=0
if [ "${1:-}" = --print-help ]; then print_help=1; shift; fi
bb=${1:-}
if [ -z "$bb" ] || [ ! -f "$bb" ]; then
    echo "usage: sh $0 BUSYBOX" >&2
    echo "       sh $0 --print-help BUSYBOX" >&2
    exit 2
fi
bb=$(cd "$(dirname "$bb")" && pwd)/$(basename "$bb")

QEMU_CPU=${QEMU_CPU:-cortex-a9}
export QEMU_CPU
if [ -n "${QEMU_LD_PREFIX:-}" ]; then
    QEMU_LD_PREFIX=$(cd "$QEMU_LD_PREFIX" && pwd)
    export QEMU_LD_PREFIX
fi

say() { printf '\n== %s\n' "$*"; }                # a check header in the output
ok() { echo "ok    $*"; }
fails=0
fail() { echo "FAIL  $*"; fails=$((fails + 1)); }
oneline() { head -c 160 "$1" | tr '\n' ' '; }     # the start of a file, on one line (for messages)

# A scratch folder, deleted at the end (also after Ctrl-C). Its bin/ holds the program and one link per
# applet: BusyBox runs the applet whose name it is started under, so with PATH=bin/ a command like "grep"
# finds only the applet of this program, never a tool of this machine.
tmp=$(mktemp -d "${TMPDIR:-/tmp}/check.XXXXXX")
trap 'rm -rf "$tmp"' EXIT
trap 'exit 1' INT TERM
mkdir "$tmp/bin"
cp "$bb" "$tmp/bin/busybox"
chmod 755 "$tmp/bin/busybox"
if ! "$tmp/bin/busybox" --list >"$tmp/applets" 2>"$tmp/error"; then
    if [ "$print_help" = 1 ]; then
        echo "check.sh: the program does not run: $(oneline "$tmp/error")" >&2
        exit 1
    fi
    fail "the program does not run: $(oneline "$tmp/error")"
    echo
    echo "CHECK failed=$fails"
    exit 1
fi
while IFS= read -r applet; do
    [ "$applet" = busybox ] && continue           # a newer BusyBox lists itself too
    ln -s busybox "$tmp/bin/$applet"
done <"$tmp/applets"
sort "$tmp/applets" | grep -vx busybox >"$tmp/applets.sorted"

# isolated COMMAND...: runs COMMAND with an empty environment except PATH (only the applets), HOME (the folder
# $home), TERM and the qemu settings, with no input and at most case_timeout seconds.
isolated() {
    if [ -n "${QEMU_LD_PREFIX:-}" ]; then
        set -- env -i PATH="$tmp/bin" HOME="$home" TERM=dumb QEMU_CPU="$QEMU_CPU" QEMU_LD_PREFIX="$QEMU_LD_PREFIX" "$@"
    else
        set -- env -i PATH="$tmp/bin" HOME="$home" TERM=dumb QEMU_CPU="$QEMU_CPU" "$@"
    fi
    if command -v timeout >/dev/null 2>&1; then set -- timeout "$case_timeout" "$@"; fi
    "$@" </dev/null
}

# print_helps: the help text of every applet, in the format of help.txt: a line "### APPLET", what
# "busybox APPLET --help" printed (stdout and stderr together), and a line "[rc=N]" with its exit code.
print_helps() {
    home=$tmp
    while IFS= read -r applet; do
        printf '### %s\n' "$applet"
        isolated "$tmp/bin/busybox" "$applet" --help 2>&1
        printf '[rc=%s]\n' "$?"
    done <"$tmp/applets.sorted"
}
if [ "$print_help" = 1 ]; then
    print_helps >"$tmp/help.txt"
    # BusyBox's help ends with exit code 0 or 1; anything else means the program did not run (for example a
    # dynamic program without its libraries). Then print nothing, so no broken reference can be written.
    bad=$(grep '^\[rc=' "$tmp/help.txt" | grep -v '^\[rc=[01]\]$' | sort | uniq -c)
    if [ -n "$bad" ]; then
        echo "check.sh: the help texts did not come out right; exit codes: $bad" >&2
        grep -v '^\[rc=\|^### ' "$tmp/help.txt" | head -n 3 >&2
        exit 1
    fi
    cat "$tmp/help.txt"
    exit 0
fi

echo "checking $bb"
"$tmp/bin/busybox" 2>&1 | head -n 1             # its banner: version and build date

# ---------------------------------------------------------------------------------------------------------
say "1/4 Applet list"
if cmp -s "$here/applets.txt" "$tmp/applets.sorted"; then
    ok "$(wc -l <"$tmp/applets.sorted") applets, the same as on the CMU"
else
    fail "the applets differ from applets.txt (< only on the CMU, > only in this program):"
    diff "$here/applets.txt" "$tmp/applets.sorted" | grep '^[<>]' | head -n 20
fi

# ---------------------------------------------------------------------------------------------------------
say "2/4 Help texts"
# split_helps FILE FOLDER: one file per applet (FOLDER/APPLET) from a file in the format of help.txt.
split_helps() {
    mkdir -p "$2"
    awk -v dir="$2" '/^### / { if (f) close(f); f = dir "/" substr($0, 5); next } { print > f }' "$1"
}
if [ ! -f "$here/help.txt" ]; then
    fail "help.txt is missing"
else
    print_helps >"$tmp/help.txt"
    if cmp -s "$here/help.txt" "$tmp/help.txt"; then
        ok "the help of all $(grep -c '^### ' "$tmp/help.txt") applets is the same as on the CMU"
    else
        split_helps "$here/help.txt" "$tmp/help.cmu"
        split_helps "$tmp/help.txt" "$tmp/help.this"
        differ=$(for f in "$tmp/help.cmu"/* "$tmp/help.this"/*; do basename "$f"; done | sort -u |
            while IFS= read -r applet; do
                cmp -s "$tmp/help.cmu/$applet" "$tmp/help.this/$applet" 2>/dev/null || printf '%s ' "$applet"
            done)
        count=$(printf '%s' "$differ" | wc -w)
        shown=$(printf '%s' "$differ" | tr ' ' '\n' | head -n 15 | tr '\n' ' ')
        if [ "$count" -gt 15 ]; then shown="$shown... ($count applets)"; fi
        fail "the help of these applets differs from help.txt: $shown"
        first=${differ%% *}
        echo "      $first (< CMU, > this program):"
        diff "$tmp/help.cmu/$first" "$tmp/help.this/$first" 2>&1 | grep '^[<>]' | head -n 10
    fi
fi

# ---------------------------------------------------------------------------------------------------------
say "3/4 Commands: CMU vs PC (cmu-vs-pc.cases)"

# run_case NAME RC EXPECT BODY: runs BODY in the program's own sh and compares its exit code with RC and its
# output (stdout and stderr together) with EXPECT: "has=TEXT" (contains TEXT) or "out=TEXT" (is exactly TEXT).
# Each case gets an empty folder of its own as working and home folder, an empty environment except PATH
# (only the applets), HOME and TERM, no input, and at most case_timeout seconds.
run_case() {
    name=$1 want_rc=$2 expect=$3 body=$4
    total=$((total + 1))
    home=$tmp/case-$total
    mkdir "$home"
    (cd "$home" && isolated "$tmp/bin/sh" -c "$body") >"$tmp/output" 2>&1
    rc=$?
    if [ "$rc" = 124 ] && [ "$want_rc" != 124 ]; then
        fail "$name: did not end within $case_timeout s"
        return
    fi
    if [ "$rc" != "$want_rc" ]; then
        fail "$name: exit code $rc, expected $want_rc; output: $(oneline "$tmp/output")"
        return
    fi
    case $expect in
        has=*)
            text=${expect#has=}
            if ! grep -qF -- "$text" "$tmp/output"; then
                fail "$name: the output does not contain '$text'; it is: $(oneline "$tmp/output")"
                return
            fi ;;
        out=*)
            text=${expect#out=}
            if [ "$(cat "$tmp/output")" != "$text" ]; then
                fail "$name: the output is '$(oneline "$tmp/output")', expected '$text'"
                return
            fi ;;
    esac
    passed=$((passed + 1))
}

# Read the cases. A case starts with a header "### NAME | rc=N | has=TEXT" (or "out=TEXT"); the lines after
# it, up to the next header, are its body. Comment lines (#) and empty lines outside a body are skipped.
total=0 passed=0
# nl holds one newline, to join the lines of a body.
nl='
'
name='' want_rc='' expect='' body=''
run_pending() {
    if [ -n "$name" ]; then run_case "$name" "$want_rc" "$expect" "$body"; fi
    name='' body=''
}
if [ ! -f "$here/cmu-vs-pc.cases" ]; then
    fail "cmu-vs-pc.cases is missing"
else
    while IFS= read -r line || [ -n "$line" ]; do
        case $line in
            '### '*)
                run_pending
                header=${line#'### '}
                name=${header%% | *}
                rest=${header#* | }
                rc_field=${rest%% | *}
                expect=${rest#* | }
                case $rc_field in rc=[0-9]*) want_rc=${rc_field#rc=} ;; *) want_rc='' ;; esac
                case $expect in has=*|out=*) ;; *) expect='' ;; esac
                if [ -z "$want_rc" ] || [ -z "$expect" ] || [ "$rest" = "$header" ]; then
                    fail "bad case header (expected '### NAME | rc=N | has=TEXT' or 'out=TEXT'): $line"
                    name=''
                fi ;;
            '#'*|'') ;;
            *) body="$body$line$nl" ;;
        esac
    done <"$here/cmu-vs-pc.cases"
fi
run_pending
if [ "$total" = 0 ]; then
    fail "no case was run: cmu-vs-pc.cases holds no valid case"   # a check that checked nothing must not pass
elif [ "$passed" = "$total" ]; then
    ok "all $total cases"
else
    echo "      $passed of $total cases passed"
fi

# ---------------------------------------------------------------------------------------------------------
say "4/4 ELF attributes"
# The attributes that describe the processor, its floating point unit and the calling convention, and the ELF
# header flags. Tag_ABI_align_preserved is left out: the CMU's newer compiler writes it, gcc 4.4.5 does not.
tags='Tag_(CPU_name|CPU_arch|CPU_arch_profile|ARM_ISA_use|THUMB_ISA_use|FP_arch|Advanced_SIMD_arch|ABI_)'
if ! command -v readelf >/dev/null 2>&1; then
    echo "skip  readelf is missing (package binutils)"
elif ! readelf -h "$bb" | grep -q 'Machine:.*ARM'; then
    echo "skip  not an ARM program"
else
    {
        readelf -A "$bb" | grep -E "$tags" | grep -v Tag_ABI_align_preserved
        readelf -h "$bb" | grep 'Flags:'
    } | sed 's/^ *//' >"$tmp/attributes"
    if cmp -s "$here/elf-attributes.txt" "$tmp/attributes"; then
        ok "the same as the CMU binary's"
    else
        fail "the attributes differ from elf-attributes.txt (< CMU, > this program):"
        diff "$here/elf-attributes.txt" "$tmp/attributes" | grep '^[<>]'
    fi
fi

echo
echo "CHECK failed=$fails"
[ "$fails" = 0 ]
