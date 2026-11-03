# CMU-like BusyBox for tests

Tweaks run on the CMU's BusyBox 1.19.2 (`/bin/sh` and the everyday commands), not on the shell and tools of a
PC or of a CI runner. A tweak that uses a command or an option the CMU lacks (`grep -x`, `sed -E`,
`timeout 5`, `sha256sum`, 64-bit arithmetic, ...) passes a test on a PC and breaks on the car.

The CMU's BusyBox is a program from the car's firmware: it cannot be shared, and its configuration is not
available. So we reconstructed it. Our BusyBox is built from the official 1.19.2 source, the version the
CMU's is based on, with the applets and options found by comparing with the CMU binary, compilers of the
same period and the CMU's processor flags. In our tests it behaves like the CMU's.

## Use

To test tweaks with it, run the worker suite the way CI does:

```sh
sh tools/test-in-container.sh workers                              # build and check once, then the test
sh tools/test-in-container.sh busybox sh -c 'busybox | head -n 1'  # any command in the test image
```

Both call `prepare.sh`, `image/make-image.sh` and `image/run.sh`, the scripts the CI jobs call. To work on the
BusyBox itself:

```sh
sh tools/busybox/prepare.sh                                 # build and all checks, skipped if nothing changed
sh tools/busybox/build.sh                                   # only the build: about 30 s on ARM, 3 to 8 minutes under emulation
sh tools/busybox/tests/check.sh .cache/cmu-busybox/busybox  # only the check: must end with "CHECK failed=0"
```

Needs Docker, and a way to run 32-bit ARM programs:

- on an ARM machine whose processor runs them directly (GitHub's `ubuntu-24.04-arm` runners, which CI uses),
  nothing else;
- with Docker Desktop (macOS, Windows), nothing else: it runs ARM programs in its Linux machine through qemu;
- on an x86 Linux machine, `qemu-arm` registered for ARM programs (binfmt): on Debian or Ubuntu the package
  `qemu-user-static`.

Under emulation everything is several times slower. `tests/check.sh` runs the BusyBox on the machine itself; where
that is not possible (macOS, Windows), `prepare.sh` runs it in a small Debian container and skips the ELF
attributes there (no `readelf` in it).

If the binfmt registration of your machine cannot start ARM programs inside containers (no `F` flag), give
a static `qemu-arm`: `QEMU_STATIC=/path/to/qemu-arm-static sh tools/test-in-container.sh workers` (all scripts here take it).

### In CI: build and check once, then use

The workflow [`validate-tweaks.yml`](../../.github/workflows/validate-tweaks.yml) separates two stages:

| Stage | Job | What it does | When it does the work |
| --- | --- | --- | --- |
| prepare the BusyBox | `busybox` | `prepare.sh`: builds it (`build.sh`) and runs all checks of the BusyBox itself (`tests/check.sh` and `tests/testsuite.sh`) | only when the build or its checks changed |
| test the tweaks | `workers` (and later other tweak tests) | takes the prepared BusyBox, makes the test image with it (`image/make-image.sh`) and runs the tweak tests in that image (`image/run.sh`); does not check the BusyBox again | on every run |

The cache holds only a BusyBox that passed its checks: GitHub saves the cache only when the job succeeded, so
a BusyBox whose build or checks failed is never kept. Its key is made from the files of the build
(`prepare.sh`, `build.sh`, `in-container.sh`, `source.conf`, `cmu_defconfig`) and of the checks (everything in `tests/`). When
none of them changed, the job takes the BusyBox from the cache and skips the build and the checks. When one
changed, it builds and checks again: a new or changed check always runs against the program before that
program is used. A change of this README or of a tweak test changes nothing here.

Locally `prepare.sh` does the same with a fingerprint instead of the cache: after all checks pass it writes a
sha256 over the same files to `.cache/cmu-busybox/checked`, and the next run skips the build and the checks
when it still matches. A failed build or check leaves no fingerprint.

Where the jobs run: both jobs run on GitHub's ARM runner (`ubuntu-24.04-arm`). Its processor runs the 32-bit ARM
compilers and BusyBox directly, without emulation, so CI needs no qemu. Measured against an x86 runner with qemu:
the build takes 32 s instead of 5.5 min and gives the same program byte for byte, the testsuite 3 s instead of
72 s with the same failing tests, and `test_workers.py` 103 s instead of 676 s. The tests also run on a real ARM
processor instead of an emulator.

## The files

The folder has three parts: what the program is built from (this folder), how a built program is checked
(`tests/`), and the image in which the tweak tests use it (`image/`).

```
tools/busybox/
  README.md
  prepare.sh             builds and checks the program once (build.sh, then tests/); CI and local runs
  build.sh               builds the program (steps 1-3 here, then starts the container)
  in-container.sh        steps 4-8 of the build, inside the container
  source.conf            which official source
  cmu_defconfig          the configuration (the decisions)
  tests/
    check.sh             checks a built program
    applets.txt          expected applet list
    help.txt             expected help text of every applet
    cmu-vs-pc.cases      commands that behave differently on the CMU than on a PC
    elf-attributes.txt   expected processor and ABI attributes
    testsuite.sh         runs the official BusyBox 1.19.2 testsuite
    testsuite-fails.txt  tests that fail on the CMU's BusyBox
  image/
    make-image.sh        makes the Docker image for the tweak tests
    run.sh               runs a command in that image as on the CMU
    links.txt            where the CMU has its links to BusyBox (267 paths)
```

### Build

The naming follows BusyBox (kbuild): a file named `*_defconfig` holds the decisions and is edited by hand;
BusyBox's `make defconfig` reads it and writes the complete configuration, always named `.config`, into the
build folder. `build.sh` saves a copy of that `.config` as `busybox.config` next to the program. Never edit a
`.config`; change `cmu_defconfig`.

#### `build.sh`: builds the BusyBox

The build is made of two scripts: `build.sh`, which you run, and `in-container.sh`, which `build.sh` starts
inside the build container.

What the build uses:

| File | Role |
| --- | --- |
| `build.sh` | the script you run: steps 1 to 3 on your machine, then it starts the container with `in-container.sh` |
| `in-container.sh` | steps 4 to 8, inside the container: installs the compilers, generates and checks the `.config`, compiles, saves the results. Not meant to be run by hand |
| `source.conf` | where to download the source, and its sha256 (steps 1 and 2) |
| `cmu_defconfig` | the decisions (steps 5 and 6) |

What it makes, in the folder given as the first argument (by default `.cache/cmu-busybox/`, git-ignored):

| File | What it is |
| --- | --- |
| `busybox` | the built program |
| `busybox.config` | the complete `.config` the program was built with |
| `make.log` | what the compiler printed |
| `download/` | the source tarball, kept so that the next build does not download it again |
| `src/` | the unpacked source (read-only), made again by every build |

The first three are the result; `download/` and `src/` are working files. After a failed build only part of
the result is there: if step 6 fails, only `busybox.config`, so you can see what the configurator made.

If any step fails, `build.sh` stops at that step with an error and an exit code other than 0; the steps
after it do not run. A result of an earlier run is deleted first, so an old `busybox` never looks like the
result of a failed build. The output shows each step as `== N/8 ...`.

The container sees the source and `cmu_defconfig` read-only and writes only into the output folder; it runs as
root (it installs packages) and gives the files back to you at the end.

**Steps 1 to 3: `build.sh`, on your machine**

1. **Download the source.** Downloads the official BusyBox 1.19.2 source tarball. Its URL and sha256 are in
   `source.conf`. This happens only once; the tarball is kept in `.cache/cmu-busybox/download/`.
2. **Check the download.** Compares the sha256 of the tarball with the one in `source.conf`. If they differ,
   the file is not the official one (or is damaged): it is deleted and the build stops.
3. **Unpack.** Unpacks the source and makes it read-only, so the build cannot change it.
**Steps 4 to 8: [`in-container.sh`](in-container.sh), inside the container**

After step 3, `build.sh` starts a Debian squeeze armel container (`debian/eol:squeeze`, platform
`linux/arm/v5`, pinned by its digest so it cannot change unnoticed) and runs `in-container.sh` in it.

4. **Install the compilers.** Installs gcc 4.4.5 and eglibc 2.11.3, of the period of the CMU firmware. They
   come from the Debian archive, so this step needs network.
5. **Generate the configuration.** BusyBox's own configurator reads `cmu_defconfig` and writes the complete
   `.config` (`make defconfig KBUILD_DEFCONFIG=cmu_defconfig`): our decisions, and BusyBox's default for every
   other option.
6. **Check the configuration. If it is wrong, the build stops here and nothing is compiled.** Every decision
   line of `cmu_defconfig` must appear, exactly, in the generated `.config`. This check is needed because the
   configurator does not stop when it cannot apply a decision; it goes on with the default:
   - *An option whose dependency is off* is set to the default, without any message. Example:
     `CONFIG_FEATURE_FTP_WRITE=y` needs `CONFIG_FTPD`, which is off on the CMU, so the `.config` gets
     `# CONFIG_FEATURE_FTP_WRITE is not set`.
   - *A misspelt option name* only prints a warning and is left out. Example: `CONFIG_FEATURE_GREP_CONTXT=y`
     (the real name is `CONFIG_FEATURE_GREP_CONTEXT`).

   Without this check, both mistakes would give a BusyBox other than intended, and the build would still
   succeed. When the check fails, `build.sh` prints the missing lines and stops; only `busybox.config` is
   left, so you can see what the configurator made of `cmu_defconfig`.

   This step only checks that BusyBox *applied* our decisions. Whether the decisions themselves are right
   (whether the result behaves like the CMU's BusyBox) is checked after the build by `tests/check.sh`.
7. **Compile.** Builds BusyBox with `make`. The build date in the banner (`BusyBox v1.19.2 (DATE) multi-call
   binary.`) is set to the CMU's, `2020-02-14 18:04:06 JST`, without changing the source. What the compiler
   prints goes to `make.log`; if it fails, the last 30 lines are shown.
8. **Save the results.** Copies `busybox` into the output folder. (`busybox.config` was saved there in step 5
   and `make.log` written there in step 7, so both are there also when a later step fails.)

#### `source.conf`: which source

Two lines: `url`, where the official BusyBox source tarball is downloaded from, and `sha256`, its checksum,
which proves the download is that exact file. The version is part of the URL; `build.sh` takes the name of
the source folder from the tarball itself. Changing the version means a new comparison with the CMU, not only
a new URL.

#### `cmu_defconfig`: the configuration (the decisions)

The decisions for BusyBox's configuration questions, written as a file instead of typed into `make menuconfig`:
174 lines, one decision each (an applet or option on or off, the compiler flags, static linking), found by
comparing with the CMU binary. Every question not decided here takes BusyBox's default. This is the file
that decides how close the result is to the CMU; change the configuration only here. The compiler flags are
those of the CMU's processor: `-march=armv7-a -mfpu=neon -mfloat-abi=softfp` (ARMv7-A, VFPv3 and NEON, the
soft-float calling convention of the CMU's libraries).

The complete `.config` (about 1000 lines) is not stored: like the program, it is a result of the build
(`busybox.config` next to it).

### Tests (`tests/`)

`tests/check.sh` checks a built BusyBox against the CMU's BusyBox, without any file of the car. In CI the job
`busybox` runs it after each new build (see [In CI](#in-ci-build-and-check-once-then-use)); locally run it after
`build.sh`. It is the second of two levels: step 6 of the build checks that BusyBox *applied* the decisions of
`cmu_defconfig`; `check.sh` checks that the result *behaves like the CMU's BusyBox*.

| File | Role | Used by |
| --- | --- | --- |
| `check.sh` | the script: runs the four checks and reports | you, the CI job `busybox` |
| `applets.txt` | the 274 applets the program must have | check 1/4 |
| `help.txt` | the help text of every applet, as the CMU's BusyBox prints it | check 2/4 |
| `cmu-vs-pc.cases` | commands that behave differently on the CMU than on a PC, with the CMU's answer | check 3/4 |
| `elf-attributes.txt` | the processor and ABI attributes the program must have | check 4/4 |
| `testsuite.sh` | runs the official BusyBox 1.19.2 testsuite | the testsuite step of the CI job `busybox` |
| `testsuite-fails.txt` | tests that fail on the CMU's BusyBox | the testsuite step |

#### `tests/check.sh`: checks a built program

```sh
sh tools/busybox/tests/check.sh .cache/cmu-busybox/busybox
```

An ARM program needs `qemu-arm` registered for ARM programs, as for the build (see [Use](#use)). The script sets
`QEMU_CPU=cortex-a9`, the CMU's processor. A dynamically linked BusyBox also needs its libraries:
`QEMU_LD_PREFIX=FOLDER`.

The four checks:

1. **Applet list.** The program's `busybox --list`, sorted, must equal `applets.txt`. A change of the
   configuration that adds or drops an applet shows here, with the names that differ.
2. **Help texts.** `busybox APPLET --help` of every applet, with its exit code, must equal `help.txt`. The help
   lists the options compiled into an applet, so this finds what the applet list cannot: an applet that is
   there but has an option too few or too many (for example `grep` without `-A/-B/-C`). It shows which applets
   differ and the lines of the first one.
3. **Commands: CMU vs PC.** Every case of `cmu-vs-pc.cases` must give the CMU's exit code and output. Each case runs
   in the program's own `sh`, so the shell is tested too, with:
   - `PATH` holding only the applets of the program: a command the CMU lacks is "not found", and no tool of
     your machine can stand in for a missing applet;
   - an empty environment apart from `PATH`, `HOME` and `TERM`;
   - an empty folder of its own as working and home folder, so cases cannot affect each other;
   - no input, and at most 20 seconds: a case that hangs fails instead of blocking the run.
4. **ELF attributes.** For an ARM program, the processor, floating point and ABI attributes (`readelf -A`) and
   the header flags (`readelf -h`) must equal `elf-attributes.txt`, so wrong compiler flags show up. Skipped,
   with a `skip` line, for a program that is not ARM or when `readelf` is missing.

Every check runs, also after one failed. The output:

```
== 1/4 Applet list
ok    274 applets, the same as on the CMU

== 2/4 Help texts
ok    the help of all 274 applets is the same as on the CMU

== 3/4 Commands: CMU vs PC (cmu-vs-pc.cases)
ok    all 19 cases

== 4/4 ELF attributes
ok    the same as the CMU binary's

CHECK failed=0
```

A failed check prints `FAIL` and what differs, for example
`FAIL  grep-x: exit code 0, expected 1; output: ab`. Exit code: 0 if everything passed, 1 if a check failed,
2 if the script was started wrongly (no program given).

#### `tests/applets.txt`: the 274 applets

The applet names of the CMU's BusyBox (`busybox --list` on the CMU's program), one per line, sorted. It changes
only if the CMU's BusyBox changes, not to follow a build.

#### `tests/help.txt`: the help text of every applet

For each of the 274 applets: a line `### APPLET`, what `busybox APPLET --help` printed on the CMU's own BusyBox
(stdout and stderr together, with its banner), and a line `[rc=N]` with the exit code (1 for every applet
except `test`, which prints nothing and gives 0). It was made with the same code that checks a build:

```sh
QEMU_LD_PREFIX=FOLDER-WITH-THE-CMU-LIBRARIES sh tools/busybox/tests/check.sh --print-help CMU-BUSYBOX >help.txt
```

`--print-help` refuses to write anything if the program did not run properly (any exit code other than 0 or
1). The texts equal those recorded on the car and those of
[`development/CMU-BusyBox-reference.md`](../../development/CMU-BusyBox-reference.md). Like `applets.txt`, it
changes only if the CMU's BusyBox changes.

#### `tests/cmu-vs-pc.cases`: commands that behave differently on the CMU than on a PC

The commands where tweak authors go wrong, each with the answer of the CMU's own BusyBox. Two kinds:

- **Works on a PC, fails or differs on the CMU** (13 cases), for example `grep -x`, `sed -E`, `timeout 5` (the
  CMU needs `timeout -t 5`), `sha256sum` (missing) and `$((65536*65536))` (0 on the CMU: its shell counts in 32
  bits). A tweak that uses one of them passes a test on a PC and breaks on the car. The BusyBox here must
  answer exactly like the CMU's; if it ever accepted one, the tests that use it would stop catching such
  tweaks.
- **The CMU way** (6 cases): how to write the same thing on the CMU (`timeout -t 5`, `sed -r`, ...). These
  must work; they show that a failure above comes from the command, not from a broken BusyBox.

A case is a header line and the shell lines below it:

```
### grep-x | rc=1 | has=grep: invalid option -- 'x'
echo ab | grep -x ab
```

`rc=N` is the expected exit code. `has=TEXT` means the output (stdout and stderr together) contains TEXT;
`out=TEXT` means the whole output is exactly TEXT. To add a case, run the command with the CMU's own BusyBox
and write down its exit code and output; never take the expected value from our build. If a case fails, our
BusyBox differs from the CMU's: fix the build, not the case.

#### `tests/elf-attributes.txt`: the CMU binary's processor and ABI attributes

The lines of `readelf -A` (CPU 7-A, VFPv3, NEON, ABI tags) and the `Flags:` line of `readelf -h` of the CMU's
BusyBox, with the leading spaces removed. `Tag_ABI_align_preserved` is left out: the CMU's newer compiler
writes it, gcc 4.4.5 does not, and it does not change what the program does.

#### `tests/testsuite.sh`: the official BusyBox 1.19.2 testsuite

```sh
sh tools/busybox/tests/testsuite.sh .cache/cmu-busybox/busybox
```

The BusyBox source comes with its own tests: 509 small shell scripts in its `testsuite/` folder. This script runs
them against a built BusyBox and compares the names of the tests that fail with `testsuite-fails.txt`.

**Why in a closed container.** The testsuite is made of shell scripts, and the shell and tools that run them
change the result. On a GitHub runner they would run under `dash` and GNU tools: the result would differ from the
reference and could change by itself with an update of Ubuntu. So the tests run in a Docker container that holds
nothing but the BusyBox under test: its `sh` runs the scripts and its applets are the only commands. The container
has a read-only root, no network, no special rights, runs as an ordinary user and has an empty `/tmp`. Under qemu
(on an x86 machine) qemu reports the CMU's processor and kernel version; on an ARM machine, as in CI, the program
runs directly and the runner's kernel version shows, which gives the same failing tests (checked). The reference
was taken in exactly this container, so the comparison is fair.

What the script does (shown as `== N/5` in the output):

1. Makes a minimal root folder: the program as `/bin/busybox` and one link per applet, empty `/tmp`, `/work` and
   the other usual folders; nothing else.
2. Turns it into a temporary Docker image (`docker import`); the image is deleted at the end.
3. Copies the `testsuite/` folder of the build's source and the build's `busybox.config` (the testsuite skips the
   tests of switched-off features by reading it) into a writable folder.
4. Runs the testsuite in the container. If it did not really run (far fewer passed tests than normal), the
   script stops with an error instead of reporting a difference.
5. Takes the names of the failing tests from the log and compares them with `testsuite-fails.txt`: it lists the
   tests that fail only here and those that fail only on the CMU.

The log of the run is kept as `testsuite.log` in `BUILD_DIR`, next to the build results, so a failed comparison can
be looked into.

Settings (environment variables):

| Variable | Default | What it is |
| --- | --- | --- |
| `BUILD_DIR` | `.cache/cmu-busybox` | the output folder of `build.sh`: the source and `busybox.config` are taken from it |
| `LIBS` | none | only for a dynamically linked program (the CMU's own): a folder with its libraries, copied into `/lib` of the container |
| `QEMU_STATIC` | none | a static `qemu-arm`, as for `build.sh`, if the binfmt registration cannot start ARM programs inside containers |

It takes about 2 minutes. In CI it runs only when the BusyBox is rebuilt. The last line is `TESTSUITE failed=0`
(the same failing tests as the CMU) or `TESTSUITE failed=1`. Exit code: 0 the same, 1 different or the run did
not work, 2 wrong use.

#### `tests/testsuite-fails.txt`: tests that fail on the CMU's BusyBox

The names of the 35 tests (of 509) that fail on the CMU's own BusyBox, one full name per line, sorted, for
example `cpio lists hardlinks` or `mdev add /block/sda`. A FAIL here is not a problem of our build: these tests
fail on the CMU too, because of old bugs of BusyBox 1.19.2 or features the CMU lacks. Our BusyBox must fail
exactly these tests, no more and no fewer. Only the test names are stored, no output of the car.

It was made with `--print-fails` from the CMU's own BusyBox, which is a dynamically linked program, so its
libraries are given with `LIBS`:

```sh
LIBS=FOLDER-WITH-THE-CMU-LIBRARIES sh tools/busybox/tests/testsuite.sh --print-fails CMU-BUSYBOX >testsuite-fails.txt
```

`--print-fails` writes only the list (its progress goes to stderr) and refuses to write anything if the testsuite
did not really run, so a broken run cannot become the reference. The file changes only if the CMU's BusyBox
changes. If a run of our build differs from it, fix the build, not the file.

### Test image (`image/`)

The tweak tests run the tweak scripts in a Docker image that holds only the CMU-like BusyBox, so that every shell
and every command a script uses is the one of the CMU. For example, `echo $((65536*65536))` prints 0 there, as on
the CMU, and `sed -E` fails with `invalid option -- 'E'`; on a PC or in a common image (Alpine's BusyBox 1.36,
GNU tools) both work, and a tweak that relies on them would pass the test and break on the car.

| In the image | What it is |
| --- | --- |
| `/bin/busybox`, `/bin/sh` | the BusyBox prepared and checked by the job `busybox` |
| `/bin`, `/sbin`, `/usr/bin`, `/usr/sbin` | the 267 links to BusyBox, at the paths the CMU has them (`links.txt`) and nothing else |
| `/usr/local` | Python, for the test driver only (the tests are Python programs); not in the `PATH` the tests give the tweak scripts |
| `/lib`, `/usr/lib` | the shared libraries Python loads; no programs |
| `/etc/passwd`, `/etc/group` | the CMU's: user 0 is called `cmu` (there is no user `root`), and its 12 groups; `id` prints `uid=0(cmu) gid=0(root)` as on the CMU |
| `/root` | the home folder of user 0, empty |
| `/tmp` | empty, writable by everyone |

`image/run.sh` (used by the job `workers` and by `tools/test-in-container.sh`) runs the test the way the CMU runs a tweak: as user 0, with Docker's default capabilities (a
tweak has all capabilities on the CMU; without any, user 0 would be an ordinary user), and with a stack limit of
128 kB (`--ulimit stack=131072:131072`, the CMU's `ulimit -s 128`). Two more things of a tweak's environment
are not reproduced yet: the `umask 077`, which the launcher (`usb/autorun.sh`) sets, not the CMU, so the tests
that stand in for the launcher should take it from there; and the signals the CMU ignores in a tweak
(`SIGINT`, `SIGQUIT`, `SIGPIPE`).

Commands that the CMU has but that are not BusyBox (for example `ip`, `lua`, `zip`, `unzip`, the JCI programs) are
not in the image on purpose: a test that needs one must fake it, as the tests already do for `dbus-send`, `mount`,
`reboot` and the like. A tweak that calls a command missing on the CMU fails with "not found".

#### `image/make-image.sh`: makes the image

```sh
sh tools/busybox/image/make-image.sh .cache/cmu-busybox/busybox cmu-tweak-test:local
```

1. Puts the BusyBox into an empty root folder as `/bin/busybox` and makes the links of `links.txt`, each pointing to
   it the way the CMU's do (`busybox`, `../bin/busybox` or `../../bin/busybox`).
2. Copies Python out of the official image `python:3.12-alpine`, pinned by digest: the interpreter and its standard
   library (`/usr/local`) and only the shared libraries (`*.so*`) of `/lib` and `/usr/lib`, no program of Alpine.
3. Checks that the folders of the `PATH` hold nothing but links to our BusyBox, and stops otherwise.
4. Turns the folder into the image with `docker import` (about 17 MB).

The image is made for the processor of the machine. In CI it runs on the ARM runner, where the 32-bit ARM BusyBox
runs directly; elsewhere it runs through qemu (see [Use](#use); `QEMU_STATIC` works here too).

#### `image/run.sh`: runs a command in the image

```sh
sh tools/busybox/image/run.sh /usr/local/bin/python3 tests/contract/test_workers.py
sh tools/busybox/image/run.sh sh -c 'echo $((65536*65536))'    # prints 0, as on the CMU
```

The repository is mounted read-only at `/repo`, the working folder; `/tmp` is an empty 128 MB tmpfs; there is no
network. The test driver is started as `/usr/local/bin/python3`. `IMAGE` names another image, `CMU_TEST_ONLY` is
passed on to the test, `QEMU_STATIC` as above.

#### `image/links.txt`: the CMU's links to BusyBox

The 267 paths at which the CMU has a link to `/bin/busybox` (89 in `/bin`, 44 in `/sbin`, 119 in `/usr/bin`, 15 in
`/usr/sbin`), one per line, recorded on the car. It also holds the names that the shell has built in (`echo`,
`printf`, `[`, `test`, ...): the CMU has links for them too. The 7 applet names that are other programs on the CMU
(`blkid`, `findfs`, `ip`, `mke2fs`, `mkfs.ext2`, `passwd`, `tune2fs`) are not in it, so they are missing in the
image as well.

## How close it is

Compared with the CMU's own binary, both run under `qemu-arm` (emulated, 2026-11-02): the same 274 applets;
2256 of 2270 behaviour cases give the same output (the rest are live system values, timing, and the vendor's
`cryptpw` default); the official BusyBox 1.19.2 testsuite gives the same PASS and FAIL list (474 PASS, 35 FAIL),
and `testsuite.sh` checks it on every new build; the commands of `cmu-vs-pc.cases` answer in the same way.
Results on the car itself remain the reference.

A modern BusyBox (for example Ubuntu's `busybox-static` 1.36.1) fails `check.sh`: it accepts most of the
commands that fail on the CMU (13 of the 19 cases of `cmu-vs-pc.cases` fail).
