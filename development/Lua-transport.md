# CMU Lua transport

Runs on the factory Lua 5.1, LuaPOSIX 5.1.19 and LuaSocket 2.0.2 runtime.
No downloaded modules or custom ARM executables are needed on the CMU.

- server.lua: loopback HTTP on a random port; session token and Host/Origin checks.
- process.lua: direct fork/exec, concurrent output capture, exit/signal handling.
- protocol.lua: request arguments and byte-preserving JSON encoding for the UI.

Arguments stay separate; no os.execute, io.popen or shell command concatenation.
Both output streams are bounded at 64 KiB. A disconnect or server termination
does not abort an active modifying worker. Only recognized read-only status
requests have a 30-second deadline (90 seconds for grouped `details`) and their
own process group, with TERM then KILL after two seconds. This includes the
`manifests` scan. A failed, timed-out or truncated aggregate response falls back
to individual UI queries with their original per-query limits. Read-only details
never acquire the global package mutation lock. Install/uninstall/restore/Run
are never timed out here.

Detailed HTTP/process diagnostics require logging=debug in installer.conf.
Normal operation records startup/shutdown and failed worker output in RAM,
including early preflight/Restore refusals before a worker report exists.
stdout/stderr diagnostics are JSON-escaped and capped at 4096 bytes per stream;
start failures are recorded too. Successful workers with stderr also retain that
diagnostic output. Per-request/process traces still require debug logging;
the launcher saves session logs on Exit/failure. Off disables USB diagnostics.

The transport and styled menu are separate processes. The existing installer
and tweak contract remains unchanged. No permanent transport daemon is installed.
See [original-runtime tests](testing/Original-runtime.md) and
[vehicle evidence](test-runs/README.md). This implementation was inspired by the LuaSocket example in
AutoX System Tools; it does not use that example's CGI routing.
