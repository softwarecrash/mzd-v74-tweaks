/* ES5 example. No process/native API is assumed to exist on the CMU. */
var WorkerFeedback = (function () {
    function interpret(action, result) {
        if (!result || typeof result.exitCode !== "number" ||
                typeof result.stdout !== "string" || typeof result.stderr !== "string") {
            throw new Error("Invalid process result; outcome unknown.");
        }
        var failed = result.exitCode !== 0;
        var outcome = {
            exitCode: result.exitCode,
            stdout: result.stdout,
            stderr: result.stderr,
            message: failed ? (result.stderr || "Worker failed.") : result.stdout,
            stopQueue: failed,
            critical: result.exitCode === 2,
            state: null
        };
        if (!failed && action === "status") {
            if (result.stdout !== "installed\n" && result.stdout !== "uninstalled\n") {
                throw new Error("Invalid status response; do not assume uninstalled.");
            }
            outcome.state = result.stdout === "installed\n" ? "installed" : "uninstalled";
        }
        return outcome;
    }

    function call(executeProcess, workerPath, action, callback) {
        // executeProcess is supplied by the actual launcher/native bridge.
        // A worker exit of 1/2 is a normal callback result, NOT transport error.
        executeProcess("sh", [workerPath, action], function (error, result) {
            if (error) { callback(error); return; }
            var outcome;
            try { outcome = interpret(action, result); }
            catch (parseError) { callback(parseError); return; }
            callback(null, outcome);
        });
    }
    return {call: call, interpret: interpret};
}());

/* Runnable JS-only illustration; this adapter does not execute a real worker.
   Call showFeedbackExample(function (message) { ...display message... });
   Replace the fake adapter with the real process bridge for CMU integration. */
function showFeedbackExample(display) {
    function fakeProcessBridge(executable, args, done) {
        done(null, {
            exitCode: 2,
            stdout: "install in progress.\n",
            stderr: "Write AND rollback failed. Do NOT reboot the CMU.\n"
        });
    }
    WorkerFeedback.call(fakeProcessBridge,
        "/tmp/mnt/sdb1/tweaks/main-menu-loop/run.sh", "install",
        function (error, outcome) {
            if (error) { display(error.message); return; }
            display(outcome.message);
            // outcome.stopQueue === true; outcome.critical === true.
            // Stop remaining actions and do not offer reboot.
        });
}
