# Issue 35: temporary startup diagnostics

Standalone investigation for [issue #35](https://github.com/softwarecrash/mzd-v74-tweaks/issues/35),
not an installer tweak or a proposed workaround. No boot hook is installed.
It does not change OEM files, settings, mounts, logging levels or services,
send GUI/native events, open another MMUI WebSocket, or inject/grab input.
It only creates a private report in `/tmp` and reads existing sources.

## Capture while the screen is stuck

Copy `collect.sh` to `/tmp/issue35-collect.sh` over SSH. Run:

```sh
sh /tmp/issue35-collect.sh collect 60
```

The printed report path looks like `/tmp/mzd-issue35.ABC123`.
The default is 60 seconds; supported range: 4–180 seconds. Duration is approximate:
sampling and final copying add some overhead. It requires at least 48 MiB free in
`/tmp`. Output is capped per source (roughly 36 MiB maximum total).

1. Initially leave the screen untouched for about 10 seconds.
2. In a second SSH session, using the **actual printed report path**:

   ```sh
   sh /tmp/issue35-collect.sh mark /tmp/mzd-issue35.ABC123 before-controller
   ```

   Try one controller input. Mark `after-controller` and then `still-stuck` or
   `released-by-controller` according to what is visible.
3. If still stuck, mark `before-touch`, touch once, then mark `after-touch`
   and `released-by-touch` or `still-stuck`. The human marks bracket the action;
   the raw evdev capture supplies the actual input timestamps where available.
4. Let collection finish. Ctrl+C also stops input readers and retains partial data.
5. Download the entire report directory before rebooting; `/tmp` is volatile.
   For comparison, capture an unaffected start with the same script.

Disconnecting SSH stops collection and keeps a partial report. The script does
not detach or arrange execution on subsequent boots. Starting after SSH becomes
available can miss early events; retained boot logs may cover them.

## Contents and interpretation

- `timeline.txt`: UTC and uptime boundaries/observation marks. Uptime is useful
  even when the CMU wall clock starts at 1970. Mark delays are not event timings.
- `before.txt`, `after.txt`: firmware, mounts, input topology, processes and hashes
  of relevant GUI/startup files. No scripts from installed tweaks are executed.
- `sample-N.txt`: every approximately two seconds, CPU/load/memory/interrupt
  counters, relevant process CPU counters/status/wait channels, and the last
  32 KiB of active system logs. Log windows deliberately overlap: deduplicate by
  complete line and timestamp when examining context/event order. CPU percentages
  require counter deltas; these are not precomputed `top` percentages.
- Boot log archives: up to eight lexically ordered `log_*.tar.gz` files per
  boundary, at most 1 MiB each. `log-sources.txt` records skipped large files.
  Active logs are copied separately with a 1 MiB tail limit. Rotation can race
  a read; the two boundary sets and sampled active logs provide overlap, not a
  guarantee that every original log line was captured.
- `dmesg-*.txt`: kernel log tails if accessible.
- `input-nodes.txt`, `eventN.bin`: up to eight touch/commander/rotary/joystick
  evdev nodes, including the stock virtual/filtered keyboard and mouse nodes used
  for commander input, capped at 128 KiB each. Reads are independent and do not consume
  events from MMUI's own evdev clients. No input device is grabbed. Unknown names
  are inventoried but not captured; an empty capture can mean no matching node,
  insufficient permission, no events, or failure before the input subsystem.
- `errors.txt`: optional-source/read errors. Missing optional sources do not
  abort the capture. Commands may still require the CMU's normal SSH/root access.

Decode a capture on your computer (Python 3):

```sh
python decode-input.py /path/to/report/event0.bin > event0.csv
```

The decoder assumes the CMU's ARM32 little-endian 16-byte `input_event` layout.
Do not use it for arbitrary 64-bit PC captures. Input timestamp clock selection
is not changed; compare its values with both uptime and the wall clock rather
than assuming a clock source.

Look for `IntroAnimation`, `Disclaimer`, `HomeScreen`, `DisposeIntroVideo`,
`NotifyDisclaimerEnd`, context transitions, surface/focus changes and LVDS/touch
errors before/after the observed release. A running process or active input node
does not prove JS timers/controller callbacks ran. This script cannot directly
inspect the primary Opera JS heap/current context or measure timers absent from
existing logs. If those remain unknown, targeted instrumentation is a separate
experiment, not a reason to infer that synthetic touch would fix the symptom.

Reports can contain device identifiers and information already present in system
logs. Review them before sharing. The tool does not read credential/key files or complete settings/configuration
files and never uploads anything. Raw input can include virtual keyboard events;
do not enter passwords on the display during capture.

## Local checks

`python tests/contract/test_issue35_diagnostics.py` exercises disposable sources,
marks, byte limits, interruption, unchanged source files and input decoding.
Run through `sh tools/test-in-container.sh run`, as for other repository checks.
The test also accepts an optional path to a CMU-like BusyBox and uses its shell
and applets. These are isolated fixture checks, not vehicle evidence.
