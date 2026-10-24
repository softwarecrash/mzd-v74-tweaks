# HELLO command worker

This complete folder is a harmless, independently runnable example for Terminal
and other one-shot commands. It requires only a POSIX shell, makes no system
changes and does not open a dialog or request a reboot. The example can also be
run on a development computer; it does not depend on CMU firmware.

```sh
sh examples/worker-feedback/hello/run.sh run
# stdout: HELLO followed by a newline
# stderr: empty
# exit code: 0
```

The launcher may show an **OPEN** button for the declared `run` action. The button
label and shell action name do not have to match. There is no installed state,
so this worker deliberately does not implement `install`, `uninstall` or `status`.
No argument or `--help` prints usage. Unsupported actions or extra arguments
produce stderr and exit `1`.

## JavaScript caller

Use `WorkerFeedback` from the parent example with the actual process adapter:

```js
WorkerFeedback.call(executeProcess,
    "/tmp/mnt/sdb1/examples/worker-feedback/hello/run.sh", "run",
    function (error, outcome) {
        if (error) {
            display(error.message);
            return;
        }
        display(outcome.message); // HELLO on success.
    });
```

`executeProcess` is the adapter described in the parent README, not an existing
browser API. `display` is supplied by the launcher. The worker itself is real
and can be run directly without that future JavaScript integration.

## Proposed command manifest

The manifest illustrates the command extension discussed in issue #22:
`actions` contains only `run`, and installation-specific `status_scope` is absent.
Its proposed schema version `7` distinguishes it from the existing version `6`
patch contract, which still requires install/uninstall/status. Version `7` is
an example proposal, not an implemented or agreed project schema. This example
does not silently change the existing schema or production launcher.

The firmware entry describes the intended CMU integration target, not a runtime
restriction for this harmless HELLO worker. Adjacent MD5 files are included to
follow the existing package layout.
