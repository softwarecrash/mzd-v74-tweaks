/* Developer-only offline bridge. Never loaded by the USB installer. */
(function () {
    "use strict";
    var frame = document.getElementById("transport"), manifests = window.previewManifests;
    var states = {"list-beep":"installed", "list-loop":"unavailable", "shorter-delay":"broken"};
    if (window.previewBrokenUninstallDemo) states.ssh = "broken";
    if (window.previewRecoveryDemo) states["main-menu-loop"] = "broken";
    if (window.previewRecoveryDeniedDemo) states["list-beep"] = "unavailable";
    var jobs = {}, nextJob = 0, sample = 0;
    var oldModification = true, recoveryHash = "0123456789abcdef0123456789abcdef";
    function reply(data) {
        window.dispatchEvent(new MessageEvent("message", {
            source:frame.contentWindow, origin:"preview", data:data
        }));
    }
    function ok(stdout, code, stderr) {
        return {started:true, exitCode:code || 0, signal:null, stdout:stdout || "", stderr:stderr || "",
            stdoutTruncated:false, stderrTruncated:false};
    }
    function process(args) {
        var id = args[1], action = args[2], state, job, raw;
        if (args[0] === "event") {
            if (id === "restart") {
                document.body.innerHTML = '<p style="padding:35px">restart requested. No device is restarted. Reload to restart the preview.</p>';
            }
            if (id === "close") {
                document.body.innerHTML = '<p style="padding:35px">Preview closed. Reload to restart.</p>';
            }
            return ok();
        }
        if (args[0] === "metrics") {
            sample++;
            return ok("cpu\t" + (1000+sample*100) + "\t" + (700+sample*70) + "\t" +
                (args[1] === "0" ? "-" : "30") + "\ndisk\t/\t42\ndisk\t/jci\t18\ndisk\t/data\t65\ndisk\t/tmp/mnt/sdb1\t80\n");
        }
        if(args[0]==="manifests" || args[0]==="details") {
            var keys=args[0]==="manifests"?Object.keys(manifests):args[2].split(" ");
            return ok(keys.map(function(key){
                var value=process(args[0]==="manifests"?["manifest",key]:[key,id]);
                return JSON.stringify({key:key,exitCode:value.exitCode,stdout:value.stdout,stderr:value.stderr});
            }).join("\n")+(keys.length?"\n":""));
        }
        if(args[0]==="update-info")return ok("",1,"No update in the offline preview.");
        if (args[0] === "list") return ok(Object.keys(manifests).join("\n")+"\n");
        // Demonstrate an old unmanaged JS patch without touching vehicle files.
        if (args[0] === "restore-check" && window.previewRecoveryDeniedDemo && id === "list-beep")
            return ok("",1,"Restore: The .org backup has an unexpected MD5.\nExpected MD5: e111883b9dcbeb6bb154521826fcacac\nActual MD5: bb290d22840f82b1be14400ddb41f1b0");
        if (args[0] === "restore-check") return id === "main-menu-loop" && oldModification ?
            ok("available\t"+recoveryHash+"\t/jci/gui/apps/system/controls/MainMenu/js/MainMenuCtrl.js\n") : ok("",1,"No verified original backup is available.");
        if (args[0] === "restore-original") {
            if (id !== "main-menu-loop" || !oldModification || args[2] !== recoveryHash) return ok("",1,"The file changed; inspect it again.");
            oldModification = false; states[id] = "uninstalled";
            return ok("PREVIEW ONLY: Original file restored. You can now retry Install. No files were changed.");
        }
        if (args[0] === "package-info") return ok(states[id] === "installed" ? "0.7.0\tinstalled\n" : "");
        if (args[0] === "uninstall-check") return (id === "shorter-delay" || (id === "ssh" && window.previewBrokenUninstallDemo)) && states[id] === "broken" ?
            ok("available\t"+(id === "ssh" ? "0.8.3" : "0.8.1")+"\tfailed\n") : ok("",1,"No verified saved uninstaller is available.");
        if (args[0] === "preflight-info") return ok("");
        if (args[0] === "settings-info") {
            var rows=(manifests[id]||"").split("\n"),schema=[],values=[];
            for(var n=0;n<rows.length;n++) {
                var line=rows[n].replace(/\r$/,"");
                if(line.indexOf("settings=")===0 || line.indexOf("setting.")===0)schema.push(line);
                var def=/^setting\.([a-z][a-z0-9_]*)\.default=(.*)$/.exec(line);
                if(def)values.push("value."+def[1]+"="+def[2]);
            }
            if(!schema.length)schema.push("settings=");
            return ok("settings_saved="+(states[id]==="installed"?"true":"false")+"\n"+schema.join("\n")+"\n"+values.join("\n")+"\n");
        }
        if (args[0] === "manifest") return manifests[id] ? ok(manifests[id]) : ok("",1,"Missing preview manifest.");
        if (args[0] === "statuses") return ok(args[1].split(" ").map(function (entry) {
            var value = states[entry] || "uninstalled";
            var reason = value === "broken" ? (entry === "main-menu-loop" ? "an old unmanaged modification was detected." : "incomplete installation detected.") : value === "unavailable" ? "target file does not match this patch." : "";
            if (window.previewRecoveryDeniedDemo && entry === "list-beep") reason = "installation blocked because the .org backup has an unexpected MD5.";
            return entry + "\t" + value + "\t" + reason + "\n";
        }).join(""));
        if (args[0] === "action") {
            if (action === "status") {
                state = states[id] || "uninstalled";
                if (window.previewRecoveryDeniedDemo && id === "list-beep")
                    return ok("unavailable\n",0,"installation blocked because the .org backup has an unexpected MD5.");
                return ok(state+"\n",0,state === "unavailable" ? "target file does not match this patch." :
                    state === "broken" ? "incomplete installation detected." : "");
            }
            if (id === "main-menu-loop" && action === "install" && oldModification)
                return ok("MZD_RECOVERY_CANDIDATE\n",1,"the target contains an old unmanaged patch.");
            states[id] = action === "install" ? "installed" : "uninstalled";
            return ok("PREVIEW ONLY: " + action + " completed. No files were changed.");
        }
        if (args[0] === "start-run") {
            raw = "job.preview" + (++nextJob); jobs[raw] = {polls:0,tweak:id,values:args.slice(2)}; return ok(raw+"\n");
        }
        if (args[0] === "job-status") {
            job = ++jobs[id].polls;
            return ok(job < 4 ? "running\n"+job+"\n4\nSimulating export (preview only)\n" : "done\n0\n");
        }
        if (args[0] === "job-output") return ok(action === "stdout" ? (jobs[id].tweak==="settings-example"?"PREVIEW ONLY: Selected values\n"+jobs[id].values.join("\n"):"PREVIEW ONLY: Export completed. Nothing was written to USB.") : "");
        return ok("",1,"Unsupported preview request.");
    }
    // Keep the real app unchanged. Replace only this preview iframe's transport.
    frame.contentWindow.postMessage = function (message) {
        if (message.type !== "shell-exec") return;
        var args = message.args.slice(1);
        var delay = (args[0] === "action" && args[2] !== "status") || args[0] === "restore-original" ? 8000 : 120;
        if (window.previewRecoveryDemo && args[0] === "action" && args[1] === "main-menu-loop" && args[2] === "install" && oldModification) delay = 120;
        window.setTimeout(function () {
            reply({type:"shell-result", token:"preview", id:message.id, result:process(args)});
        },delay);
    };
    Object.defineProperty(frame,"src",{set:function () {
        window.setTimeout(function () {reply({type:"shell-ready",token:"preview"});},0);
    }});
}());
