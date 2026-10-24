# Returning worker results to the launcher

The current launcher is **shell code**, not a JavaScript installer:

```text
run.sh -> sh launcher.sh -> sh selected-script.sh
                          -> /jci/tools/jci-dialog
```

`js/run.js` triggers diagnostic events. It does not launch the tweak workers or
capture their results. Also, the current `run_script()` returns menu-navigation
codes; it does not propagate the selected script's actual exit status.

## Current shell launcher

`capture-worker.sh` demonstrates an actual call to the standalone Main Menu Loop
worker and captures its output. It defaults to no action; invoke it explicitly:

```sh
# Inspect status without changing the target file:
sh examples/worker-feedback/capture-worker.sh status

# These perform the real requested operation on a compatible CMU:
sh examples/worker-feedback/capture-worker.sh install
sh examples/worker-feedback/capture-worker.sh uninstall
```

Each invocation saves `stdout.txt`, `stderr.txt` and `exit-code.txt` in a unique
directory under the repository's `reports/`. The script prints the captured
message and returns the worker's exit code. It never reboots or opens a dialog.
Status probes still create USB reports, as documented by the worker.

The essential launcher code is:

```sh
if sh "$worker" "$action" > "$result_dir/stdout.txt" 2> "$result_dir/stderr.txt"
then
  code=0
else
  code=$?
fi
# Show stdout for success, stderr for failure using the launcher's own dialog.
# Decide whether to continue from code, never from human-readable messages.
```

Descriptors `3` and `4` are internal saved copies of the worker's original
stdout/stderr. The caller does not need to capture them separately:

```sh
exec 3>&1 4>&2             # Save the destinations selected by the caller.
exec > "$report/run.log" 2>&1
printf 'Completed.\n' >&3  # Still reaches the caller's stdout.txt.
printf 'Failed.\n' >&4     # Still reaches the caller's stderr.txt.
```

## Future JavaScript launcher

`worker-feedback.js` contains the call and result handling. Its process adapter
must supply this interface:

```js
executeProcess("sh", [workerPath, action], function (error, result) {
    // error: failed/unknown process transport, NOT a nonzero worker exit.
    // result: { exitCode: 0, stdout: "...", stderr: "..." }
});
```

**`executeProcess` is an injected adapter contract, not an existing CMU API.**
Browser JavaScript cannot start shell processes by itself. The eventual native
bridge must implement this function, or deliver equivalent results from the
shell capture above. No Python, Node.js, HTTP server or additional runtime is
required by these examples. The actual CMU JS/native transport is not implemented
here. The adapter must pass arguments without building an unescaped shell string,
capture stdout/stderr separately and invoke the callback once after process exit.

Example integration (the supplied `processBridge` and `gui` belong to the future
launcher; their names are illustrative):

```js
WorkerFeedback.call(processBridge.executeProcess,
    "/tmp/mnt/sdb1/tweaks/main-menu-loop/run.sh", "install",
    function (error, outcome) {
        if (error) {
            gui.showError(error.message); // Unknown outcome: no automatic retry.
            return;
        }
        gui.showMessage(outcome.message);
        if (outcome.stopQueue) {
            gui.stopRemainingActions();
        }
        // outcome.state is available for a successful status call.
        // outcome.critical must suppress any reboot offer.
    });
```

The names `gui.showMessage`, etc. are integration placeholders, not claimed
existing methods. The runnable JavaScript-only example in the file demonstrates
the callback with a fake adapter, without accessing any CMU files.

For Main Menu Loop, `0` means success, `1` ordinary failure and `2` critical
failure requiring manual intervention. Other nonzero exits also fail. A status
failure must never be displayed as "uninstalled". Completion is only final once
the process exits, even if earlier stdout contains progress text.

`update` can use the same call/result interface once a worker supports it. It is
not currently supported by Main Menu Loop; this example does not add that action.

These files are examples only. The production launcher and worker are unchanged.
