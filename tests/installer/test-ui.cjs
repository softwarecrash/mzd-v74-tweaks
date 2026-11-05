/**
 * Installer UI: usb/ui/app.js, with a minimal DOM and simulated worker replies.
 *
 * This is not a rendering test and never executes a vehicle patch.
 *
 * One test per area, named after the marker it printed before node:test (for example INSTALLER_UI_TESTS).
 * Inside each test the code is split into named steps that run in order on the same page. The tests share
 * the page variable x and the helpers, so they must run in this order (the default).
 *
 * Uses the built-in Node test runner (node:test). Plain `node` runs it too, as CI does.
 * Run:      node --test tests/installer/test-ui.cjs
 */
const test = require("node:test");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm"),
  assert = require("node:assert/strict");
const ROOT = path.join(__dirname, "../../usb");

class Node {
  constructor(tag, doc) {
    this.tagName = tag;
    this.doc = doc;
    this.children = [];
    this.className = "";
    this.disabled = false;
    this.scrollTop = 0;
    this._text = "";
    this.attributes = {};
    this.style = {};
  }
  appendChild(node) {
    this.children.push(node);
    node.parentNode = this;
    return node;
  }
  removeChild(node) {
    this.children.splice(this.children.indexOf(node), 1);
  }
  get firstChild() {
    return this.children[0] || null;
  }
  set textContent(t) {
    this._text = String(t);
    this.children = [];
  }
  get textContent() {
    return this._text + this.children.map((n) => n.textContent).join("");
  }
  setAttribute(k, v) {
    this.attributes[k] = v;
  }
  focus() {
    this.doc.activeElement = this;
  }
  getElementsByTagName(tag) {
    let all = [];
    for (const n of this.children) {
      if (n.tagName === tag) all.push(n);
      all = all.concat(n.getElementsByTagName(tag));
    }
    return all;
  }
}

function boot(
  manifestVersion,
  includeCommand,
  keepDisclaimer,
  includeExports,
  includeSettings,
  includeBundle
) {
  const usb = {
      ids: null,
      manifests: {},
      installedVersions: {},
      updateOffers: {}
    },
    recovery = {},
    restoreOutcomes = {},
    recoveryHints = {},
    savedSettings = {},
    preflight = {},
    savedUninstall = {};
  const nodes = {},
    jobs = [],
    calls = [],
    timers = [],
    intervals = [],
    listeners = {},
    states = {
      "restore-originals": "uninstalled",
      "backup-jci": "uninstalled",
      "logs-collector": "uninstalled",
      hello: "uninstalled",
      "list-beep": "uninstalled",
      "main-menu-loop": "installed",
      ssh: "error"
    },
    outcomes = {},
    reasons = { ssh: "A required component is missing." };
  if (includeSettings) states["settings-example"] = "uninstalled";
  if (includeBundle) states["bundle-example"] = "uninstalled";
  const doc = {
    activeElement: null,
    createElement(t) {
      return new Node(t, doc);
    },
    getElementById(id) {
      return (
        nodes[id] ||
        walk(nodes.app)
          .concat(walk(nodes.overlay))
          .find((n) => n.id === id) ||
        null
      );
    }
  };

  function walk(n) {
    return [n].concat(n.children.flatMap(walk));
  }

  for (const id of [
    "app",
    "header",
    "system-info",
    "tabs",
    "content",
    "cards",
    "empty",
    "footer-status",
    "list-position",
    "refresh",
    "exit",
    "overlay",
    "dialog",
    "detail-loading",
    "detail-loading-text",
    "dialog-heading",
    "dialog-dot",
    "dialog-title",
    "dialog-body",
    "dialog-state",
    "dialog-description",
    "dialog-settings",
    "dialog-contributors",
    "dialog-meta",
    "dialog-output",
    "dialog-actions",
    "back",
    "uninstall-action",
    "update-action",
    "restore-action",
    "action",
    "result-ok",
    "transport"
  ]) {
    nodes[id] = new Node("div", doc);
    nodes[id].id = id;
  }
  for (const id of [
    "refresh",
    "exit",
    "back",
    "uninstall-action",
    "update-action",
    "restore-action",
    "action",
    "result-ok"
  ])
    nodes[id].tagName = "button";
  nodes.app.appendChild(nodes.header);
  nodes.header.appendChild(nodes.refresh);
  nodes.header.appendChild(nodes.exit);
  nodes.app.appendChild(nodes.tabs);
  nodes.app.appendChild(nodes.content);
  nodes.content.appendChild(nodes.cards);
  nodes.overlay.appendChild(nodes.dialog);
  nodes.dialog.appendChild(nodes["detail-loading"]);
  nodes["detail-loading"].appendChild(nodes["detail-loading-text"]);
  nodes["detail-loading"].className = "hidden";
  nodes.dialog.appendChild(nodes["dialog-body"]);
  for (const id of [
    "dialog-state",
    "dialog-description",
    "dialog-settings",
    "dialog-contributors",
    "dialog-meta",
    "dialog-output"
  ])
    nodes["dialog-body"].appendChild(nodes[id]);
  nodes.dialog.appendChild(nodes["dialog-actions"]);
  for (const id of [
    "back",
    "uninstall-action",
    "update-action",
    "restore-action",
    "action",
    "result-ok"
  ])
    nodes["dialog-actions"].appendChild(nodes[id]);
  nodes["update-action"].className = "primary hidden";
  nodes["restore-action"].className = "hidden";
  nodes["uninstall-action"].className = "hidden";
  nodes.overlay.className = "hidden";
  nodes["result-ok"].className = "primary hidden";
  nodes.transport.contentWindow = {
    postMessage(job, origin) {
      assert.equal(origin, "http://127.0.0.1:1234");
      jobs.push(job);
    }
  };
  const win = {
    installerConfig: { origin: "http://127.0.0.1:1234", token: "secret" },
    innerWidth: 800,
    innerHeight: 480,
    setTimeout(fn) {
      timers.push(fn);
    },
    setInterval(fn) {
      intervals.push(fn);
      return intervals.length - 1;
    },
    clearInterval(id) {
      intervals[id] = null;
    },
    addEventListener(n, f) {
      listeners[n] = f;
    }
  };
  const ctx = {
    window: win,
    document: doc,
    escape,
    unescape,
    encodeURIComponent,
    decodeURIComponent,
    WaylandManager: function () {
      this.SetRequiredSurfaces = (...a) => calls.push(["visible", ...a]);
      this.SetKeyboardFocus = (...a) => calls.push(["focus", ...a]);
    }
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(ROOT, "ui/app.js"), "utf8"),
    ctx,
    { filename: path.join(ROOT, "ui/app.js") }
  );

  function event(
    data,
    origin = "http://127.0.0.1:1234",
    source = nodes.transport.contentWindow
  ) {
    listeners.message({ source, origin, data });
  }

  function ok(stdout = "", code = 0, stderr = "") {
    return {
      started: true,
      exitCode: code,
      signal: null,
      stdout,
      stderr,
      startError: "",
      stdoutTruncated: false,
      stderrTruncated: false
    };
  }

  let background = null,
    polls = 0;

  function process(job) {
    assert.equal(job.program, "/bin/sh");
    assert.equal(job.args[0], "./installer.sh");
    const a = job.args.slice(1);
    calls.push(a);
    if (a[0] === "manifests" && usb.manifestBatchFailure)
      return usb.manifestBatchFailure;
    if (a[0] === "details" && usb.detailBatchFailure)
      return usb.detailBatchFailure;
    if (a[0] === "manifests") {
      const ids = process({
        program: job.program,
        args: ["./installer.sh", "list"]
      })
        .stdout.trim()
        .split("\n")
        .filter(Boolean);
      return ok(
        ids
          .map((key) => {
            const r = process({
              program: job.program,
              args: ["./installer.sh", "manifest", key]
            });
            return JSON.stringify({
              key,
              exitCode: r.exitCode,
              stdout: r.stdout,
              stderr: r.stderr
            });
          })
          .join("\n") + (ids.length ? "\n" : "")
      );
    }
    if (a[0] === "details")
      return ok(
        a[2]
          .split(" ")
          .map((key) => {
            const r = process({
              program: job.program,
              args: ["./installer.sh", key, a[1]]
            });
            return JSON.stringify({
              key,
              exitCode: r.exitCode,
              stdout: r.stdout,
              stderr: r.stderr
            });
          })
          .join("\n") + "\n"
      );
    if (a[0] === "config-info")
      return ok(usb.configPresent ? "present\n" : "none\n");
    if (a[0] === "event" && a[1] === "focus-poll") {
      const requested = usb.refocusRequested;
      usb.refocusRequested = false;
      return ok(requested ? "requested\n" : "");
    }
    if (a[0] === "event") return ok();
    if (a[0] === "uninstall-check")
      return (
        savedUninstall[a[1]] || ok("", 1, "No saved uninstaller is available.")
      );
    if (a[0] === "restore-check")
      return recovery[a[1]]
        ? ok(recovery[a[1]])
        : ok("", 1, "No verified original backup is available.");
    if (a[0] === "restore-original") {
      const code = restoreOutcomes[a[1]] || 0;
      if (!code) {
        states[a[1]] = "uninstalled";
        delete recovery[a[1]];
      }
      return ok(
        code ? "" : "Original file restored. You can now retry Install.",
        code,
        code === 2
          ? "Restore cleanup failed. Do NOT reboot."
          : code
            ? "Restore refused: file changed."
            : ""
      );
    }
    if (a[0] === "preflight-info") return preflight[a[1]] || ok();
    if (a[0] === "settings-info") {
      if (a[1] === "bundle-example") {
        const text = fs.readFileSync(
          path.join(ROOT, "../development/examples/bundle/manifest.conf"),
          "utf8"
        );
        return ok(
          "settings_saved=" +
            (states[a[1]] === "installed" ? "true" : "false") +
            "\n" +
            text.slice(text.indexOf("settings=")) +
            "value.hud_display_language=off\n"
        );
      }
      if (a[1] !== "settings-example")
        return ok("settings_saved=true\nsettings=\n");
      const text =
        savedSettings.schemaText ||
        fs.readFileSync(
          path.join(ROOT, "../development/examples/settings/manifest.conf"),
          "utf8"
        );
      const defs = text.slice(text.indexOf("settings="));
      return ok(
        "settings_saved=" +
          (savedSettings[a[1]] ? "true" : "false") +
          "\n" +
          defs +
          "value.log_limit_mb=" +
          (savedSettings[a[1]] || "20") +
          "\nvalue.compress=true\nvalue.profile=" +
          (/setting.profile.default=([^\r\n]+)/.exec(text) || [])[1] +
          "\n"
      );
    }
    if (a[0] === "update-info")
      return usb.updateOffers[a[1]] || ok("", 1, "Update not available.");
    if (a[0] === "package-info")
      return ok(
        states[a[1]] === "installed"
          ? (usb.installedVersions[a[1]] || "0.7.0") + "\tinstalled\n"
          : ""
      );
    if (a[0] === "metrics")
      return ok(
        "cpu\t1000\t700\t" +
          (a[1] === "0" ? "-" : "30") +
          "\ndisk\t/\t42\ndisk\t/tmp/mnt/resources\t18\ndisk\t/tmp/mnt/sdb1\t80\n"
      );
    if (a[0] === "start-run") {
      background = a[1];
      polls = 0;
      return ok("job.test01\n");
    }
    if (a[0] === "job-status") {
      polls++;
      return ok(
        polls === 1
          ? "running\n0\n0\nCreating archive\n"
          : polls === 2
            ? "running\n5\n10\nCopying files\n"
            : "done\n" + (outcomes[background] || 0) + "\n"
      );
    }
    if (a[0] === "job-output")
      return ok(
        a[2] === "stdout" ? "Saved to USB: /mnt/sdb1/exports/" + background : ""
      );
    if (a[0] === "list" && usb.ids !== null)
      return ok(usb.ids.join("\n") + "\n");
    if (a[0] === "list")
      return ok(
        (includeBundle ? "bundle-example\n" : "") +
          (includeSettings ? "settings-example\n" : "") +
          "list-beep\nmain-menu-loop\nssh\nbroken\n" +
          (includeCommand ? "hello\n" : "") +
          (includeExports
            ? "backup-jci\nlogs-collector\nrestore-originals\n"
            : "")
      );
    if (a[0] === "manifest") {
      if (Object.prototype.hasOwnProperty.call(usb.manifests, a[1]))
        return ok(usb.manifests[a[1]]);
      if (a[1] === "bundle-example")
        return ok(
          fs.readFileSync(
            path.join(ROOT, "../development/examples/bundle/manifest.conf"),
            "utf8"
          )
        );
      if (a[1] === "settings-example")
        return ok(
          fs.readFileSync(
            path.join(ROOT, "../development/examples/settings/manifest.conf"),
            "utf8"
          )
        );
      if (a[1] === "broken") return ok("{broken");
      let m = fs.readFileSync(
        a[1] === "hello"
          ? path.join(ROOT, "../development/examples/hello/manifest.conf")
          : path.join(ROOT, "tweaks", a[1], "manifest.conf"),
        "utf8"
      );
      if (a[1] === "list-beep")
        m =
          m.replace(/^contributors=.*\r?\n?/gm, "") +
          "contributors=Original author; port by Example <developer>\n";
      if (manifestVersion)
        m = m.replace(
          /^contract_version=.*$/m,
          "contract_version=" + manifestVersion
        );
      return ok(m);
    }
    if (a[0] === "statuses")
      return ok(
        a[1]
          .split(" ")
          .map(
            (id) =>
              id +
              "\t" +
              (states[id] === "error" ? "error" : states[id]) +
              "\t" +
              (states[id] === "error"
                ? "Patch state is ambiguous."
                : ["unavailable", "broken"].includes(states[id])
                  ? reasons[id] || ""
                  : "") +
              "\n"
          )
          .join("")
      );
    if (a[2] === "status")
      return states[a[1]] === "error"
        ? ok("", 1, "Patch state is ambiguous.")
        : ok(
            states[a[1]] + "\n",
            0,
            ["unavailable", "broken"].includes(states[a[1]])
              ? reasons[a[1]] || ""
              : ""
          );
    const code = outcomes[a[1]] || 0;
    if (code === 0)
      states[a[1]] = ["install", "update"].includes(a[2])
        ? "installed"
        : "uninstalled";
    return ok(
      code
        ? code === 1 && recovery[a[1]] && recoveryHints[a[1]] !== false
          ? "MZD_RECOVERY_CANDIDATE\n"
          : ""
        : a[2] + " completed. Other changes were preserved.",
      code,
      code === 2
        ? "Rollback failed. Do NOT reboot."
        : code
          ? "Installation rejected."
          : ""
    );
  }

  function pump() {
    let count = 0;
    while (jobs.length) {
      if (++count > 100) throw new Error("request loop");
      const j = jobs.shift();
      event({
        type: "shell-result",
        token: "secret",
        id: j.id,
        result: process(j),
        error: null
      });
    }
  }

  event({ type: "shell-ready", token: "wrong" });
  event({ type: "shell-ready", token: "secret" }, "http://wrong");
  assert.equal(jobs.length, 0);
  event({ type: "shell-ready", token: "secret" });
  pump();
  if (!keepDisclaimer) {
    nodes.action.onclick();
    pump();
  }
  const click = (id) => {
    if (
      [
        "action",
        "back",
        "update-action",
        "uninstall-action",
        "restore-action"
      ].includes(id) &&
      !nodes["detail-loading"].className.includes("hidden")
    )
      pump();
    const n = doc.getElementById(id);
    assert(n, "missing " + id);
    assert(!n.disabled, "disabled " + id);
    n.onclick();
  };
  return {
    usb,
    nodes,
    doc,
    jobs,
    calls,
    states,
    outcomes,
    reasons,
    recovery,
    restoreOutcomes,
    recoveryHints,
    savedSettings,
    preflight,
    savedUninstall,
    timers,
    intervals,
    pump,
    step() {
      const j = jobs.shift();
      assert(j);
      event({
        type: "shell-result",
        token: "secret",
        id: j.id,
        result: process(j),
        error: null
      });
    },
    click,
    ok,
    event
  };
}

// The page of the current test; every test starts its own with boot().
let x;

// Exercise the production manifest parser directly with literal text values.
const appSource = fs.readFileSync(path.join(ROOT, "ui/app.js"), "utf8");
const manifestFunction = appSource.slice(
  appSource.indexOf("    function settingDefinitions("),
  appSource.indexOf("    function discover(")
);
const parseConf = vm.runInNewContext(
  '(function(){function trim(v){return String(v||" ").replace(/^\\s+|\\s+$/g,"");}' +
    manifestFunction +
    ";return parseManifest;}())"
);
// Parser cases control attribution explicitly, regardless of current tweak credits.
const rawConf = fs
  .readFileSync(path.join(ROOT, "tweaks/list-beep/manifest.conf"), "utf8")
  .replace(/^contributors=.*\r?\n?/gm, "");
const literal = 'Text = # "quotes" $(not_a_command) `not_a_command`';

function controller(type, key, whichOnly = false) {
  let prevented = false;
  const event = {
    preventDefault() {
      prevented = true;
    }
  };
  event[whichOnly ? "which" : "keyCode"] = key;
  x.doc[type](event);
  assert.equal(prevented, true);
}

function finishPatch(action = "install", code = 0) {
  const y = boot();
  y.nodes.tabs.children
    .find((n) => n.textContent.indexOf("Interface") === 0)
    .onclick();
  const id = action === "uninstall" ? "main-menu-loop" : "list-beep";
  y.outcomes[id] = code;
  y.click("tweak-" + id);
  y.click("action");
  y.pump();
  y.click("result-ok");
  y.pump();
  return y;
}

function brokenSaved(reply) {
  const y = boot();
  y.states.ssh = "broken";
  y.reasons.ssh = "Saved installation state: failed.";
  if (reply) y.savedUninstall.ssh = reply;
  y.click("refresh");
  y.pump();
  assert(
    !y.calls.some((a) => a[0] === "uninstall-check"),
    "Eligibility must not slow the menu scan"
  );
  y.nodes.tabs.children
    .find((n) => n.textContent.indexOf("System") === 0)
    .onclick();
  y.click("tweak-ssh");
  return y;
}

function recoveryOffer(
  raw = "available\t" + "a".repeat(32) + "\t/jci/test.js\n"
) {
  const r = boot();
  r.recovery["list-beep"] = raw;
  r.states["list-beep"] = "broken";
  r.reasons["list-beep"] = "An existing modification was detected.";
  r.click("refresh");
  r.pump();
  r.nodes.tabs.children
    .find((n) => n.textContent.indexOf("Interface") === 0)
    .onclick();
  r.click("tweak-list-beep");
  r.pump();
  return r;
}

function updateOffer(usbVersion, installedVersion) {
  const r = boot();
  r.usb.manifests["list-beep"] = fs
    .readFileSync(path.join(ROOT, "tweaks/list-beep/manifest.conf"), "utf8")
    .replace(/^version=.*$/m, "version=" + usbVersion);
  r.usb.installedVersions["list-beep"] = installedVersion;
  r.usb.updateOffers["list-beep"] = r.ok(
    "available\t" + installedVersion + "\t" + usbVersion + "\n"
  );
  r.states["list-beep"] = "installed";
  r.click("refresh");
  r.pump();
  r.nodes.tabs.children
    .find((n) => n.textContent.indexOf("Interface") === 0)
    .onclick();
  r.click("tweak-list-beep");
  r.pump();
  return r;
}

function installedWithConfig() {
  const r = boot();
  r.usb.configPresent = true;
  r.states["list-beep"] = "installed";
  r.click("refresh");
  r.pump();
  r.nodes.tabs.children
    .find((n) => n.textContent.indexOf("Interface") === 0)
    .onclick();
  r.click("tweak-list-beep");
  r.pump();
  r.click("action");
  r.pump();
  return r;
}

test("INSTALLER_UI_TESTS", async (t) => {
  await t.test(
    "starts with one manifest and one status query, without per-tweak status queries",
    () => {
      x = boot();
      assert.equal(x.calls.filter((a) => a[0] === "manifests").length, 1);
      assert.equal(x.calls.filter((a) => a[0] === "statuses").length, 1);
      assert.equal(
        x.calls.filter((a) => a[0] === "action" && a[2] === "status").length,
        0
      );
    }
  );

  await t.test(
    "shows three tabs and the broken tweak first, with an error dot and no action",
    () => {
      assert.equal(x.nodes.tabs.children.length, 3); // Errors, Interface, System.
      assert.equal(x.nodes.cards.firstChild.id, "tweak-broken");
      assert.equal(x.nodes.cards.firstChild.children[0].className, "dot error");
      x.click("tweak-broken");
      assert.equal(x.nodes.action.disabled, true);
      x.click("back");
    }
  );

  await t.test("shows installed and uninstalled dots", () => {
    x.nodes.tabs.children
      .find((n) => n.textContent.indexOf("Interface") === 0)
      .onclick();
    assert.equal(
      x.doc.getElementById("tweak-main-menu-loop").children[0].className,
      "dot installed"
    );
    assert.equal(
      x.doc.getElementById("tweak-list-beep").children[0].className,
      "dot uninstalled"
    );
  });

  await t.test("shows the details of a tweak", () => {
    x.click("tweak-list-beep");
    assert.equal(x.nodes.action.textContent, "Install");
    assert.match(x.nodes["dialog-description"].textContent, /beeps/);
    assert.match(x.nodes["dialog-meta"].textContent, /Restart required:Yes/);
  });

  await t.test(
    "installs: locks the dialog, animates the state and shows the completion",
    () => {
      x.click("action");
      assert.equal(x.nodes["dialog-state"].textContent, "Installing");
      assert.equal(x.nodes.back.disabled, true);
      assert.equal(x.nodes.exit.disabled, true);
      const installAnimation = x.intervals[x.intervals.length - 1],
        requestsBeforeAnimation = x.jobs.length;
      installAnimation();
      assert.equal(x.nodes["dialog-state"].textContent, "Installing.");
      installAnimation();
      assert.equal(x.nodes["dialog-state"].textContent, "Installing..");
      installAnimation();
      assert.equal(x.nodes["dialog-state"].textContent, "Installing...");
      installAnimation();
      assert.equal(x.nodes["dialog-state"].textContent, "Installing");
      assert.equal(x.jobs.length, requestsBeforeAnimation);
      x.pump();
      assert.equal(x.intervals[x.intervals.length - 1], null);
      installAnimation();
      assert.equal(x.nodes["dialog-state"].textContent, "Install completed");
      assert.match(
        x.nodes["dialog-title"].textContent,
        /^.+ - Operation completed$/
      );
      assert.equal(x.nodes["dialog-state"].textContent, "Install completed");
      assert.doesNotMatch(
        x.nodes["dialog-output"].textContent,
        /install in progress|install completed/i
      );
    }
  );

  await t.test("OK returns to the list with the new state", () => {
    x.click("result-ok");
    x.pump();
    assert.equal(
      x.doc.getElementById("tweak-list-beep").children[0].className,
      "dot installed"
    );
  });

  await t.test("uninstalls", () => {
    x.click("tweak-list-beep");
    assert.equal(x.nodes.action.textContent, "Uninstall");
    x.click("action");
    assert.equal(x.nodes["dialog-state"].textContent, "Checking configuration");
    x.pump();
    assert.equal(x.nodes["dialog-state"].textContent, "Uninstall completed");
    x.click("result-ok");
    x.pump();
    assert.equal(x.states["list-beep"], "uninstalled");
  });

  await t.test("reports a failed install", () => {
    x.outcomes["list-beep"] = 1;
    x.click("tweak-list-beep");
    x.click("action");
    x.pump();
    assert.match(
      x.nodes["dialog-title"].textContent,
      /^.+ - Operation failed$/
    );
    assert.equal(x.nodes["dialog-state"].textContent, "Install failed");
    x.click("result-ok");
    x.pump();
    assert.equal(x.nodes.refresh.disabled, false);
  });

  await t.test("offers Retry status for an ambiguous status", () => {
    x.nodes.tabs.children
      .find((n) => n.textContent.indexOf("System") === 0)
      .onclick();
    x.click("tweak-ssh");
    assert.equal(x.nodes.action.textContent, "Retry status");
    assert.match(x.nodes["dialog-state"].textContent, /ambiguous/);
    x.click("back");
  });

  await t.test(
    "a critical failure asks for a manual check and locks the installer",
    () => {
      x.nodes.tabs.children
        .find((n) => n.textContent.indexOf("Interface") === 0)
        .onclick();
      x.outcomes["list-beep"] = 2;
      x.click("tweak-list-beep");
      x.click("action");
      x.pump();
      assert.match(
        x.nodes["dialog-title"].textContent,
        /^.+ - Manual check required$/
      );
      assert.match(x.nodes["dialog-description"].textContent, /Do NOT reboot/);
      x.click("result-ok");
      assert.equal(x.nodes.refresh.disabled, true);
      x.click("tweak-main-menu-loop");
      assert.equal(x.nodes.action.disabled, true);
      x.click("back");
    }
  );

  await t.test("Exit gives the focus back to the OEM UI", () => {
    x.click("exit");
    x.pump();
    assert.deepEqual(x.calls.filter((a) => a[0] === "focus").at(-1), [
      "focus",
      "JCI_OPERA_PRIMARY"
    ]);
  });

  await t.test(
    "a start failure is reported without a false rollback warning",
    () => {
      // A known start failure cannot have changed the target and must not falsely
      // claim that manual rollback or a no-reboot state is required.
      x = boot();
      x.nodes.tabs.children
        .find((n) => n.textContent.indexOf("Interface") === 0)
        .onclick();
      x.click("tweak-list-beep");
      x.click("action");
      let request = x.jobs.pop();
      assert.equal(request.args[1], "action");
      x.event({
        type: "shell-result",
        token: "secret",
        id: request.id,
        error: null,
        result: {
          started: false,
          exitCode: null,
          signal: null,
          stdout: "",
          stderr: "",
          startError: "Missing executable"
        }
      });
      assert.match(
        x.nodes["dialog-title"].textContent,
        /^.+ - Operation failed$/
      );
      x.click("result-ok");
      x.pump();
      assert.equal(x.nodes.refresh.disabled, false);
    }
  );
});

test("CONTRACT_V1_UI", async (t) => {
  await t.test(
    "an unavailable or broken tweak shows its reason and offers Retry status",
    async (t) => {
      // A blocked or broken state is a valid inspection, with a required reason.
      for (const state of ["unavailable", "broken"]) {
        await t.test(state, () => {
          x = boot();
          x.states.ssh = state;
          x.click("refresh");
          x.pump();
          x.nodes.tabs.children
            .find((n) => n.textContent.indexOf("System") === 0)
            .onclick();
          assert.equal(
            x.doc.getElementById("tweak-ssh").children[0].className,
            "dot " + state
          );
          x.click("tweak-ssh");
          assert.equal(x.nodes.action.textContent, "Retry status");
          assert.match(
            x.nodes["dialog-state"].textContent,
            /required component/
          );
          x.click("back");
          assert.equal(x.nodes.refresh.disabled, false);
        });
      }
    }
  );

  await t.test("a state without a reason is reported as such", () => {
    x = boot();
    x.states.ssh = "unavailable";
    x.reasons.ssh = "";
    x.click("refresh");
    x.pump();
    x.nodes.tabs.children
      .find((n) => n.textContent.indexOf("System") === 0)
      .onclick();
    x.click("tweak-ssh");
    assert.match(x.nodes["dialog-state"].textContent, /without a reason/);
  });

  await t.test(
    "an unsupported contract version shows only what it can handle and allows no action",
    () => {
      x = boot(99);
      assert.equal(x.nodes.tabs.children.length, 1);
      x.click("tweak-list-beep");
      assert.equal(x.nodes.action.disabled, true);
    }
  );
});

test("COMMAND_UI", async (t) => {
  await t.test("shows a command tweak with a Run action", () => {
    x = boot(undefined, true);
    x.nodes.tabs.children
      .find((n) => n.textContent.indexOf("Examples") === 0)
      .onclick();
    x.click("tweak-hello");
    assert.equal(x.nodes.action.textContent, "Run");
  });

  await t.test("Run runs the command and the status stays uninstalled", () => {
    x.click("action");
    x.pump();
    assert(
      x.calls.some(
        (a) => a[0] === "action" && a[1] === "hello" && a[2] === "run"
      )
    );
    x.click("result-ok");
    x.pump();
    assert.equal(x.states.hello, "uninstalled");
  });
});

test("MULTICONTROLLER", async (t) => {
  await t.test(
    "rotate and tilt move the focus between the toolbar buttons",
    () => {
      // Real CMU controller codes: rotate M/N, tilt arrows, Backspace on release.
      x = boot(undefined, false, false, true);
      x.nodes.refresh.focus();
      controller("onkeydown", 77);
      assert.equal(x.doc.activeElement, x.nodes.exit);
      controller("onkeydown", 78, true);
      assert.equal(x.doc.activeElement, x.nodes.refresh);
      controller("onkeydown", 40);
      assert.equal(x.doc.activeElement, x.nodes.exit);
      controller("onkeydown", 38);
      assert.equal(x.doc.activeElement, x.nodes.refresh);
    }
  );

  await t.test("rotate moves between the tabs and press selects one", () => {
    const interfaceTab = x.nodes.tabs.children.find(
      (n) => n.textContent.indexOf("Interface") === 0
    );
    const systemTab = x.nodes.tabs.children.find(
      (n) => n.textContent.indexOf("System") === 0
    );
    interfaceTab.onclick();
    assert.equal(x.doc.activeElement, interfaceTab);
    controller("onkeydown", 77);
    assert.equal(x.doc.activeElement, systemTab);
    controller("onkeydown", 13);
    assert.equal(x.doc.activeElement, systemTab);
    assert.equal(systemTab.attributes["aria-selected"], "true");
    assert.equal(interfaceTab.attributes["aria-selected"], "false");
    controller("onkeydown", 78);
    assert.equal(x.doc.activeElement, interfaceTab);
    controller("onkeydown", 13);
    assert.equal(x.doc.activeElement, interfaceTab);
    systemTab.onclick();
    assert.equal(x.doc.activeElement, systemTab);
  });

  await t.test("rotate moves from the tabs into the list", () => {
    controller("onkeydown", 77);
    assert.equal(x.doc.activeElement, x.nodes.cards.children[0]);
  });

  await t.test(
    "in the detail view rotate and tilt move between the buttons",
    () => {
      x.nodes.tabs.children
        .find((n) => n.textContent.indexOf("Interface") === 0)
        .onclick();
      x.click("tweak-list-beep");
      x.pump();
      controller("onkeydown", 77);
      assert.equal(x.doc.activeElement, x.nodes.action);
      controller("onkeydown", 78);
      assert.equal(x.doc.activeElement, x.nodes.back);
      const top = x.nodes["dialog-body"].scrollTop;
      controller("onkeydown", 40);
      assert.equal(x.doc.activeElement, x.nodes.action);
      controller("onkeydown", 38);
      assert.equal(x.doc.activeElement, x.nodes.back);
    }
  );

  await t.test(
    "rotate reaches the description sections and scrolls them into view",
    () => {
      controller("onkeydown", 77);
      controller("onkeydown", 77);
      assert.equal(
        x.doc.activeElement,
        x.nodes["dialog-description"].children[0]
      );
      const section = x.doc.activeElement;
      section.offsetParent = x.nodes["dialog-body"];
      section.offsetTop = 300;
      section.offsetHeight = 70;
      x.nodes["dialog-body"].clientHeight = 200;
      section.onfocus();
      assert.equal(x.nodes["dialog-body"].scrollTop, 170);
      controller("onkeydown", 77);
      assert.equal(x.doc.activeElement, x.nodes["dialog-meta"]);
    }
  );

  await t.test("Back closes the detail view on release", () => {
    controller("onkeydown", 8);
    assert(!x.nodes.overlay.className.includes("hidden"));
    controller("onkeyup", 8);
    assert(x.nodes.overlay.className.includes("hidden"));
  });

  await t.test("Back cannot dismiss an operation or skip its result", () => {
    // Back cannot dismiss an in-flight operation or skip result acknowledgement.
    x.click("tweak-list-beep");
    x.click("action");
    controller("onkeydown", 8);
    controller("onkeyup", 8);
    assert(!x.nodes.overlay.className.includes("hidden"));
    x.pump();
    controller("onkeyup", 8);
    assert.match(
      x.nodes["dialog-title"].textContent,
      /^.+ - Operation completed$/
    );
  });

  await t.test(
    "Back on the result offers a restart, then closes the installer",
    () => {
      x.click("result-ok");
      x.pump();
      controller("onkeydown", 8);
      controller("onkeyup", 8);
      x.pump();
      assert.equal(x.nodes["dialog-title"].textContent, "Restart recommended");
      controller("onkeyup", 8);
      x.pump();
      assert(x.calls.some((a) => a[0] === "event" && a[1] === "close"));
    }
  );
});

test("MANIFEST_UI", async (t) => {
  await t.test("reads literal values, lists and booleans", () => {
    const parsedConf = parseConf(
      "list-beep",
      rawConf.replace(/^name=.*$/m, "name=" + literal)
    );
    assert.equal(parsedConf.name, literal);
    assert.equal(parsedConf.actions.join(" "), "install uninstall status");
    assert.equal(parsedConf.requires.length, 0);
    assert.equal(parsedConf.reboot_required, true);
  });

  await t.test(
    "refuses a duplicate, an unknown or a missing key and a control character",
    () => {
      for (const raw of [
        rawConf + "id=list-beep\n",
        rawConf + "unknown=value\n",
        rawConf.replace(/^id=.*\n/m, ""),
        rawConf + "# tab\t\n"
      ]) {
        assert.throws(() => parseConf("list-beep", raw));
      }
    }
  );
});

test("STARTUP_NOTICE", async (t) => {
  await t.test("shows the notice with OK and Exit before anything runs", () => {
    // Startup is entirely in the styled UI; no discovery or worker runs before OK.
    x = boot(undefined, false, true);
    assert.equal(
      x.nodes["dialog-title"].textContent,
      "MZD Tweaks - Before you begin"
    );
    assert.equal(x.nodes.action.textContent, "OK");
    assert.equal(x.nodes.back.textContent, "Exit");
    assert.equal(x.doc.activeElement, x.nodes.action);
    assert.equal(x.nodes.refresh.disabled, true);
    assert(!x.calls.some((a) => ["list", "manifest", "action"].includes(a[0])));
  });

  await t.test("rotate moves between OK and Exit", () => {
    controller("onkeydown", 77);
    assert.equal(x.doc.activeElement, x.nodes.back);
    controller("onkeydown", 78);
    assert.equal(x.doc.activeElement, x.nodes.action);
  });

  await t.test("OK starts the discovery", () => {
    controller("onkeydown", 13);
    x.pump();
    assert.equal(x.calls.filter((a) => a[0] === "list").length, 1);
    assert.equal(x.nodes.back.textContent, "Back");
    assert.equal(x.nodes.refresh.disabled, false);
  });

  await t.test("Exit closes the installer without any discovery", () => {
    x = boot(undefined, false, true);
    x.click("back");
    x.pump();
    assert(x.calls.some((a) => a[0] === "event" && a[1] === "close"));
    assert(!x.calls.some((a) => ["list", "manifest", "action"].includes(a[0])));
  });

  await t.test("Back closes on release and a late OK starts nothing", () => {
    x = boot(undefined, false, true);
    controller("onkeydown", 8);
    assert(!x.calls.some((a) => a[0] === "event" && a[1] === "close"));
    controller("onkeyup", 8);
    x.pump();
    assert(x.calls.some((a) => a[0] === "event" && a[1] === "close"));
    x.nodes.action.onclick();
    x.pump();
    assert(!x.calls.some((a) => a[0] === "list"));
  });

  await t.test("Escape closes the installer", () => {
    x = boot(undefined, false, true);
    controller("onkeydown", 27);
    x.pump();
    assert(x.calls.some((a) => a[0] === "event" && a[1] === "close"));
  });

  await t.test("autorun.sh uses no native dialog", () => {
    assert(
      !fs
        .readFileSync(path.join(ROOT, "autorun.sh"), "utf8")
        .includes("/jci/tools/jci-dialog")
    );
  });
});

test("EXPORT_PROGRESS_UI", async (t) => {
  await t.test(
    "an export runs in the background and shows its progress and output",
    async (t) => {
      // Export jobs release the serial bridge and update progress between polls.
      for (const id of ["backup-jci", "logs-collector"]) {
        await t.test(id, () => {
          x = boot(undefined, false, false, true);
          x.nodes.tabs.children
            .find((n) => n.textContent.indexOf("System") === 0)
            .onclick();
          x.click("tweak-" + id);
          assert.equal(x.nodes.action.textContent, "Run");
          x.click("action");
          x.pump();
          assert.match(x.nodes["dialog-state"].textContent, /Creating archive/);
          assert.equal(x.nodes.exit.disabled, true);
          assert.equal(x.timers.length, 1);
          x.timers.shift()();
          x.pump();
          assert.match(x.nodes["dialog-state"].textContent, /5\/10/);
          x.timers.shift()();
          x.pump();
          assert.match(
            x.nodes["dialog-title"].textContent,
            /^.+ - Operation completed$/
          );
          assert.match(x.nodes["dialog-output"].textContent, /Saved to USB/);
          x.click("result-ok");
          x.pump();
          assert.equal(x.nodes.exit.disabled, false);
          assert(
            !x.calls.some(
              (a) => a[0] === "action" && a[1] === id && a[2] === "run"
            )
          );
        });
      }
    }
  );
});

test("SYSTEM_METRICS_UI", async (t) => {
  await t.test("shows CPU and free space and refreshes them", () => {
    // Read-only header telemetry, periodic refresh and no polling during a worker.
    x = boot();
    assert.match(x.nodes["system-info"].textContent, /CPU: --/);
    assert.match(x.nodes["system-info"].textContent, /Resources: 18% free/);
    x.intervals[0]();
    x.pump();
    assert.match(x.nodes["system-info"].textContent, /CPU: 30%/);
  });

  await t.test(
    "pauses the metrics during an operation and resumes after it",
    () => {
      x.nodes.tabs.children
        .find((n) => n.textContent.indexOf("Interface") === 0)
        .onclick();
      x.click("tweak-list-beep");
      x.click("action");
      let metricCount = x.calls.filter((a) => a[0] === "metrics").length;
      x.intervals[0]();
      x.pump();
      assert.equal(
        x.calls.filter((a) => a[0] === "metrics").length,
        metricCount
      );
      x.click("result-ok");
      x.pump();
      x.intervals[0]();
      x.pump();
      assert.equal(
        x.calls.filter((a) => a[0] === "metrics").length,
        metricCount + 1
      );
    }
  );
});

test("RESTORE_UI", async (t) => {
  await t.test("Restore asks for a confirmation and Back cancels it", () => {
    // Restore is a deliberate second confirmation and refreshes every tweak afterwards.
    x = boot(undefined, false, false, true);
    x.nodes.tabs.children
      .find((n) => n.textContent.indexOf("System") === 0)
      .onclick();
    x.click("tweak-restore-originals");
    x.click("action");
    assert.match(x.nodes["dialog-title"].textContent, /Confirm:/);
    assert.match(
      x.nodes["dialog-description"].textContent,
      /Tweak services may stop/
    );
    assert.equal(x.nodes.action.textContent, "Continue");
    assert(!x.calls.some((a) => a[0] === "start-run"));
    x.click("back");
    assert.equal(x.nodes.action.textContent, "Run");
  });

  await t.test("Restore runs and then refreshes every status", () => {
    x.click("action");
    x.click("action");
    x.pump();
    while (x.timers.length) {
      x.timers.shift()();
      x.pump();
    }
    assert.match(
      x.nodes["dialog-title"].textContent,
      /^.+ - Operation completed$/
    );
    let statusBefore = x.calls.filter((a) => a[0] === "statuses").length;
    x.click("result-ok");
    x.pump();
    assert.equal(
      x.calls.filter((a) => a[0] === "statuses").length,
      statusBefore + 1
    );
  });

  await t.test("Exit after Restore recommends a restart", () => {
    x.click("exit");
    assert.equal(x.nodes["dialog-title"].textContent, "Restart recommended");
    x.click("back");
    x.pump();
  });

  await t.test(
    "a blocked tweak points to System > Restore originals",
    async (t) => {
      for (const blockedState of ["broken", "unavailable"]) {
        await t.test(blockedState, () => {
          x = boot();
          x.states["list-beep"] = blockedState;
          x.reasons["list-beep"] = "Target mismatch";
          x.click("refresh");
          x.pump();
          x.nodes.tabs.children
            .find((n) => n.textContent.indexOf("Interface") === 0)
            .onclick();
          x.click("tweak-list-beep");
          assert.match(
            x.nodes["dialog-description"].textContent,
            /System > Restore originals/
          );
          assert.match(
            x.nodes["dialog-description"].textContent,
            /ALL patches/
          );
        });
      }
    }
  );
});

test("RESTART_UI", async (t) => {
  await t.test(
    "after an install or uninstall Exit recommends a restart and Exit closes",
    async (t) => {
      for (const action of ["install", "uninstall"]) {
        await t.test(action, () => {
          x = finishPatch(action);
          x.click("exit");
          x.pump();
          assert.equal(
            x.nodes["dialog-title"].textContent,
            "Restart recommended"
          );
          assert.equal(x.nodes.back.textContent, "Exit");
          assert.equal(x.nodes.action.textContent, "Restart");
          assert.equal(
            x.doc.activeElement,
            x.nodes.action,
            "recommended restart is selected"
          );
          assert(
            !x.calls.some(
              (a) => a[0] === "event" && ["restart", "close"].includes(a[1])
            )
          );
          x.click("back");
          x.pump();
          assert(x.calls.some((a) => a[0] === "event" && a[1] === "close"));
          assert(!x.calls.some((a) => a[0] === "event" && a[1] === "restart"));
        });
      }
    }
  );

  await t.test("Restart restarts the CMU", () => {
    x = finishPatch();
    x.click("exit");
    x.click("action");
    x.pump();
    assert(x.calls.some((a) => a[0] === "event" && a[1] === "restart"));
  });

  await t.test(
    "after a failed or critical action Exit closes without a restart",
    async (t) => {
      for (const code of [1, 2]) {
        await t.test("exit code " + code, () => {
          x = finishPatch("install", code);
          x.click("exit");
          x.pump();
          assert(x.calls.some((a) => a[0] === "event" && a[1] === "close"));
          assert(!x.calls.some((a) => a[0] === "event" && a[1] === "restart"));
        });
      }
    }
  );

  await t.test("without changes Exit closes", () => {
    x = boot();
    x.click("exit");
    x.pump();
    assert(x.calls.some((a) => a[0] === "event" && a[1] === "close"));
  });

  await t.test("a tweak that needs no restart closes without asking", () => {
    x = boot();
    x.states.ssh = "uninstalled";
    x.click("refresh");
    x.pump();
    x.nodes.tabs.children
      .find((n) => n.textContent.indexOf("System") === 0)
      .onclick();
    x.click("tweak-ssh");
    x.click("action");
    x.pump();
    x.click("result-ok");
    x.pump();
    x.click("exit");
    x.pump();
    assert(x.calls.some((a) => a[0] === "event" && a[1] === "close"));
    assert(!x.calls.some((a) => a[0] === "event" && a[1] === "restart"));
  });

  await t.test("a rejected restart request leaves both choices usable", () => {
    // A rejected restart request leaves both choices usable.
    x = finishPatch();
    x.click("exit");
    x.click("action");
    let restartRequest = x.jobs.shift();
    assert.equal(restartRequest.args[2], "restart");
    x.event({
      type: "shell-result",
      token: "secret",
      id: restartRequest.id,
      result: x.ok("", 1, "Restart unavailable")
    });
    assert.equal(x.nodes.back.disabled, false);
    assert.equal(x.nodes.action.disabled, false);
    x.click("back");
    x.pump();
    assert(x.calls.some((a) => a[0] === "event" && a[1] === "close"));
  });
});

test("SCAN_EXIT", async (t) => {
  await t.test(
    "Exit during the scan closes without starting a status scan",
    () => {
      // Read-only scanning does not trap the user in the installer.
      x = boot();
      let beforeScan = x.calls.filter((a) => a[0] === "statuses").length;
      x.click("refresh");
      assert.equal(x.nodes.exit.disabled, false);
      x.click("exit");
      x.pump();
      assert(x.calls.some((a) => a[0] === "event" && a[1] === "close"));
      assert.equal(
        x.calls.filter((a) => a[0] === "statuses").length,
        beforeScan,
        "Exit during discovery must not start a status scan"
      );
    }
  );
});

test("SCAN_RESTART_GUARD", async (t) => {
  await t.test(
    "Restart waits for the scan and stays locked after a critical result",
    () => {
      // Exiting a scan is safe, but Restart must wait for its result.
      x = finishPatch();
      x.click("refresh");
      x.click("exit");
      assert.equal(x.nodes.action.disabled, true);
      let pendingStatus = x.jobs.shift();
      x.event({
        type: "shell-result",
        token: "secret",
        id: pendingStatus.id,
        result: x.ok("", 2, "Critical status result")
      });
      assert.equal(x.nodes.action.disabled, true);
      x.click("back");
      x.pump();
      assert(!x.calls.some((a) => a[0] === "event" && a[1] === "restart"));
    }
  );
});

test("SAVED_VERSION_UI", async (t) => {
  await t.test(
    "the details show the installed and the USB version, with Uninstall",
    () => {
      // A newer USB manifest does not replace the installed version in the details.
      x = boot();
      x.nodes.tabs.children
        .find((n) => n.textContent.indexOf("Interface") === 0)
        .onclick();
      x.click("tweak-main-menu-loop");
      x.pump();
      assert.match(
        x.nodes["dialog-meta"].textContent,
        /0\.7\.0 installed \/ [0-9]+\.[0-9]+\.[0-9]+ on USB/
      );
      assert.equal(x.nodes.action.textContent, "Uninstall");
    }
  );
});

test("BROKEN_SAVED_UNINSTALL_UI", async (t) => {
  await t.test(
    "without a saved uninstaller only Retry status is offered",
    () => {
      // A broken receipt may still contain a verified matching uninstaller.
      x = brokenSaved();
      assert(x.nodes["uninstall-action"].className.includes("hidden"));
      x.pump();
      assert(x.nodes["uninstall-action"].className.includes("hidden"));
      assert.equal(x.nodes.action.textContent, "Retry status");
      assert.match(
        x.nodes["dialog-description"].textContent,
        /Saved uninstall unavailable:[\s\S]*No saved uninstaller/
      );
    }
  );

  await t.test(
    "a saved uninstaller is offered next to Retry status, with its version",
    () => {
      x = brokenSaved();
      x.savedUninstall.ssh = x.ok("available\t0.8.3\tfailed\n");
      x.pump();
      assert(!x.nodes["uninstall-action"].className.includes("hidden"));
      assert.equal(x.doc.activeElement, x.nodes.back);
      assert.equal(x.nodes.action.textContent, "Retry status");
      assert.match(
        x.nodes["dialog-meta"].textContent,
        /0\.8\.3 saved \/ .* on USB/
      );
      assert(!x.calls.some((a) => a[0] === "action" && a[2] === "uninstall"));
    }
  );

  await t.test(
    "the saved uninstaller runs from the controller and the tweak becomes installable",
    () => {
      controller("onkeydown", 77);
      assert.equal(x.doc.activeElement, x.nodes["uninstall-action"]);
      controller("onkeydown", 13);
      assert(x.nodes["uninstall-action"].className.includes("hidden"));
      x.pump();
      assert(
        x.calls.some(
          (a) => a[0] === "action" && a[1] === "ssh" && a[2] === "uninstall"
        )
      );
      assert.equal(x.nodes["dialog-state"].textContent, "Uninstall completed");
      x.click("result-ok");
      x.pump();
      assert.equal(x.states.ssh, "uninstalled");
      assert(!x.calls.some((a) => a[0] === "action" && a[2] === "install"));
      x.click("tweak-ssh");
      assert.equal(x.nodes.action.textContent, "Install");
      assert(x.nodes["uninstall-action"].className.includes("hidden"));
    }
  );

  await t.test(
    "an invalid answer about the saved uninstaller is refused",
    () => {
      for (const raw of [
        "available\tbad\tfailed\n",
        "available\t0.8.3\tfailed",
        "available\t0.8.3\tfailed\nextra\n"
      ]) {
        x = brokenSaved();
        x.savedUninstall.ssh = x.ok(raw);
        x.pump();
        assert(x.nodes["uninstall-action"].className.includes("hidden"));
      }
    }
  );

  await t.test(
    "a stale answer cannot offer the saved uninstaller in another view",
    () => {
      x = brokenSaved();
      x.savedUninstall.ssh = x.ok("available\t0.8.3\tfailed\n");
      const staleUninstall = x.jobs.find((j) => j.args[1] === "details");
      x.jobs.splice(x.jobs.indexOf(staleUninstall), 1);
      x.nodes.back.onclick();
      assert(!x.nodes["detail-loading"].className.includes("hidden"));
      x.event({
        type: "shell-result",
        token: "secret",
        id: staleUninstall.id,
        result: x.ok(
          JSON.stringify({
            key: "uninstall-check",
            exitCode: 0,
            stdout: x.savedUninstall.ssh.stdout,
            stderr: ""
          }) + "\n"
        )
      });
      x.pump();
      x.click("back");
      x.event({
        type: "shell-result",
        token: "secret",
        id: staleUninstall.id,
        result: x.savedUninstall.ssh
      });
      assert(x.nodes["uninstall-action"].className.includes("hidden"));
    }
  );

  await t.test(
    "a critical failure of the saved uninstall locks the installer",
    () => {
      x = brokenSaved();
      x.savedUninstall.ssh = x.ok("available\t0.8.3\tfailed\n");
      x.pump();
      x.outcomes.ssh = 2;
      x.click("uninstall-action");
      x.pump();
      assert.match(x.nodes["dialog-description"].textContent, /Do NOT reboot/);
      x.click("result-ok");
      assert.equal(x.nodes.refresh.disabled, true);
    }
  );
});

test("TARGET_RECOVERY_UI", async (t) => {
  await t.test(
    "Install is allowed for a stock target and blocked while Restore is required",
    async (t) => {
      // A stock target permits Install; a verified recovery offer requires Restore first.
      for (const raw of [
        "original\n",
        "available\t" + "a".repeat(32) + "\t/jci/test.js\n"
      ]) {
        await t.test(
          raw === "original\n" ? "stock target" : "recovery offer",
          () => {
            x = boot();
            x.recovery["list-beep"] = raw;
            x.nodes.tabs.children
              .find((n) => n.textContent.indexOf("Interface") === 0)
              .onclick();
            x.click("tweak-list-beep");
            x.pump();
            assert.equal(x.nodes.action.textContent, "Install");
            assert.equal(x.nodes.action.disabled, raw !== "original\n");
            assert.equal(
              x.nodes["restore-action"].className.includes("hidden"),
              raw === "original\n"
            );
            assert.doesNotMatch(
              x.nodes["dialog-description"].textContent,
              /Restore original unavailable/
            );
            if (raw === "original\n")
              assert.doesNotMatch(
                x.nodes["dialog-description"].textContent,
                /Restore original resets/
              );
            else {
              assert.match(
                x.nodes["dialog-description"].textContent,
                /Restore original resets ALL changes/
              );
              const installs = x.calls.filter(
                (a) => a[0] === "action" && a[2] === "install"
              ).length;
              x.nodes.action.disabled = false;
              x.nodes.action.onclick();
              x.pump();
              assert.equal(
                x.calls.filter((a) => a[0] === "action" && a[2] === "install")
                  .length,
                installs,
                "action guard must also reject Install while Restore is required"
              );
            }
          }
        );
      }
    }
  );

  await t.test(
    "a broken tweak offers Restore next to Retry status, without moving the focus",
    () => {
      x = recoveryOffer();
      assert.equal(
        x.nodes["dialog-title"].textContent,
        "No List Beep - Broken installation"
      );
      assert(!x.nodes["restore-action"].className.includes("hidden"));
      assert.equal(x.nodes.action.textContent, "Retry status");
      assert.equal(
        x.nodes.action.disabled,
        false,
        "Restore offer must not disable Retry status"
      );
      assert.equal(
        x.doc.activeElement,
        x.nodes.back,
        "Showing Restore must not move focus"
      );
      assert(
        !x.calls.some((a) => a[0] === "action" && a[2] === "install"),
        "Broken tweaks need no attempted install"
      );
      assert(!x.calls.some((a) => a[0] === "restore-original"));
    }
  );

  await t.test("Restore asks for a confirmation and Back cancels it", () => {
    x.click("restore-action");
    assert.equal(x.nodes["dialog-title"].textContent, "Restore original file?");
    assert.match(x.nodes["dialog-description"].textContent, /ALL tweaks/);
    assert.match(x.nodes["dialog-description"].textContent, /saved to USB/);
    assert(x.nodes["restore-action"].className.includes("hidden"));
    assert(!x.calls.some((a) => a[0] === "restore-original"));
    x.click("back");
    x.pump();
    assert.equal(
      x.nodes["dialog-title"].textContent,
      "No List Beep - Broken installation"
    );
    assert(!x.calls.some((a) => a[0] === "restore-original"));
  });

  await t.test(
    "the controller opens the Restore confirmation and Back closes it",
    () => {
      x = recoveryOffer();
      controller("onkeydown", 77);
      assert.equal(x.doc.activeElement, x.nodes["restore-action"]);
      controller("onkeydown", 13);
      assert.equal(
        x.nodes["dialog-title"].textContent,
        "Restore original file?"
      );
      controller("onkeyup", 8);
      x.pump();
      assert.equal(
        x.nodes["dialog-title"].textContent,
        "No List Beep - Broken installation"
      );
    }
  );

  await t.test(
    "Restore restores the original and Install becomes available",
    () => {
      x = recoveryOffer();
      x.click("restore-action");
      x.click("action");
      x.pump();
      assert.deepEqual(
        Array.from(x.calls.find((a) => a[0] === "restore-original")),
        ["restore-original", "list-beep", "a".repeat(32)]
      );
      assert.equal(x.nodes["dialog-state"].textContent, "Restore completed");
      assert.equal(
        x.calls.filter((a) => a[0] === "action" && a[2] === "install").length,
        0,
        "Restore must not automatically reinstall"
      );
      x.click("result-ok");
      x.pump();
      x.outcomes["list-beep"] = 0;
      x.click("tweak-list-beep");
      assert.equal(x.nodes.action.textContent, "Install");
      x.pump();
      assert(x.nodes["restore-action"].className.includes("hidden"));
      assert.equal(
        x.nodes.action.disabled,
        false,
        "Install becomes available after successful Restore"
      );
    }
  );

  await t.test("a critical Restore failure locks the installer", () => {
    x = recoveryOffer();
    x.restoreOutcomes["list-beep"] = 2;
    x.click("restore-action");
    x.click("action");
    x.pump();
    assert.match(x.nodes["dialog-description"].textContent, /Do NOT reboot/);
    x.click("result-ok");
    assert.equal(x.nodes.refresh.disabled, true);
  });

  await t.test("an invalid recovery answer offers no Restore", () => {
    for (const raw of [
      "",
      "original",
      "original\nextra\n",
      "available\tbad-hash\t/jci/test.js\n",
      "available\t" + "a".repeat(32) + "\t/jci/test.js",
      "available\t" + "a".repeat(32) + "\t/jci/test.js\nextra\n"
    ]) {
      x = recoveryOffer(raw);
      assert.match(
        x.nodes["dialog-description"].textContent,
        /Restore original unavailable:/
      );
      assert.equal(
        x.nodes["dialog-title"].textContent,
        "No List Beep - Broken installation"
      );
      assert(x.nodes["restore-action"].className.includes("hidden"));
      assert(!x.calls.some((a) => a[0] === "restore-original"));
    }
  });

  await t.test(
    "an old detail-view answer cannot reveal Restore; a refused check keeps the focus",
    () => {
      // Eligibility is not required to arrive before the user navigates elsewhere.
      x = recoveryOffer();
      x.click("back");
      x.click("tweak-list-beep");
      let oldRecovery = x.jobs.shift();
      x.click("back");
      x.click("tweak-list-beep");
      x.event({
        type: "shell-result",
        token: "secret",
        id: oldRecovery.id,
        result: x.ok("available\t" + "a".repeat(32) + "\t/jci/test.js\n")
      });
      assert(
        x.nodes["restore-action"].className.includes("hidden"),
        "An older detail-view response must not reveal Restore"
      );
      delete x.recovery["list-beep"];
      x.pump();
      assert(x.nodes["restore-action"].className.includes("hidden"));
      assert.match(
        x.nodes["dialog-description"].textContent,
        /Restore original unavailable:[\s\S]*No verified original backup is available/
      );
      assert.equal(
        x.doc.activeElement,
        x.nodes.back,
        "A refused restore check must preserve focus"
      );
    }
  );

  await t.test(
    "a blocked install returns to the details after OK and offers Restore",
    () => {
      // A blocked install returns to details after OK, without opening confirmation.
      x = boot();
      x.outcomes["list-beep"] = 1;
      x.nodes.tabs.children
        .find((n) => n.textContent.indexOf("Interface") === 0)
        .onclick();
      x.click("tweak-list-beep");
      x.pump();
      x.recovery["list-beep"] =
        "available\t" + "a".repeat(32) + "\t/jci/test.js\n";
      x.click("action");
      x.pump();
      assert.match(
        x.nodes["dialog-title"].textContent,
        /^.+ - Operation failed$/
      );
      x.click("result-ok");
      x.pump();
      assert.equal(
        x.nodes["dialog-title"].textContent,
        "No List Beep - Not installed"
      );
      assert(!x.nodes["restore-action"].className.includes("hidden"));
      assert(!x.calls.some((a) => a[0] === "restore-original"));
    }
  );

  await t.test("a later settings answer cannot re-enable Install", () => {
    // A later settings reply must not re-enable Install after Restore was offered.
    x = boot();
    x.usb.manifests["list-beep"] =
      fs.readFileSync(
        path.join(ROOT, "tweaks/list-beep/manifest.conf"),
        "utf8"
      ) +
      "\nsettings=flag\nsetting.flag.type=boolean\nsetting.flag.label=Flag\nsetting.flag.default=false\n";
    x.click("refresh");
    x.pump();
    x.recovery["list-beep"] =
      "available\t" + "a".repeat(32) + "\t/jci/test.js\n";
    x.nodes.tabs.children
      .find((n) => n.textContent.indexOf("Interface") === 0)
      .onclick();
    x.click("tweak-list-beep");
    assert.equal(x.jobs.filter((j) => j.args[1] === "details").length, 1);
    x.pump();
    assert(x.nodes.action.disabled);
    assert(!x.nodes["restore-action"].className.includes("hidden"));
    // Both sections settle in one response; Settings cannot override Restore.
    assert(
      x.nodes.action.disabled,
      "settings must preserve the Restore requirement"
    );
  });
});

test("CHOICE_PICKER_UI", async (t) => {
  await t.test(
    "shows the declared settings and runs with the chosen values",
    () => {
      // Generic controls use real manifest declarations, not a preview-only widget.
      x = boot(null, false, false, false, true);
      x.nodes.tabs.children
        .find((n) => n.textContent.indexOf("System") === 0)
        .onclick();
      x.click("tweak-settings-example");
      assert(x.nodes.action.disabled);
      x.pump();
      assert.match(x.nodes["dialog-settings"].textContent, /Log storage limit/);
      assert.equal(
        x.nodes["dialog-settings"]
          .getElementsByTagName("button")
          .find((n) => n.id === "setting-profile-choice").textContent,
        "Stock"
      );
      x.click("setting-log_limit_mb-plus");
      x.click("setting-compress-toggle");
      x.click("setting-profile-choice");
      x.click("choice-option-1");
      assert.equal(
        x.nodes["dialog-settings"]
          .getElementsByTagName("button")
          .find((n) => n.id === "setting-profile-choice").textContent,
        "Medium"
      );
      x.click("action");
      x.pump();
      assert.deepEqual(Array.from(x.calls.find((a) => a[0] === "start-run")), [
        "start-run",
        "settings-example",
        "log_limit_mb=25",
        "compress=false",
        "profile=medium"
      ]);
    }
  );

  await t.test(
    "the saved settings of an installed tweak are shown read-only",
    () => {
      x = boot(null, false, false, false, true);
      x.states["settings-example"] = "installed";
      x.savedSettings["settings-example"] = "35";
      x.click("refresh");
      x.pump();
      x.nodes.tabs.children
        .find((n) => n.textContent.indexOf("System") === 0)
        .onclick();
      x.click("tweak-settings-example");
      x.pump();
      assert.match(
        x.nodes["dialog-settings"].textContent,
        /INSTALLED SETTINGS/
      );
      assert.match(x.nodes["dialog-settings"].textContent, /35 MB/);
      assert.equal(
        x.nodes["dialog-settings"].getElementsByTagName("button").length,
        0
      );
    }
  );

  await t.test(
    "closing the dialog discards a draft; the controller reaches the settings",
    () => {
      // Closing/reopening discards a draft; stale replies cannot populate another dialog.
      x = boot(null, false, false, false, true);
      x.nodes.tabs.children
        .find((n) => n.textContent.indexOf("System") === 0)
        .onclick();
      x.click("tweak-settings-example");
      x.pump();
      x.click("setting-log_limit_mb-minus");
      x.click("back");
      x.click("tweak-settings-example");
      x.pump();
      assert.match(x.nodes["dialog-settings"].textContent, /20 MB/);
      for (
        let n = 0;
        n < 8 && !(x.doc.activeElement.id || "").startsWith("setting-");
        n++
      )
        controller("onkeydown", 78);
      assert(x.doc.activeElement.id.indexOf("setting-") === 0);
    }
  );

  await t.test(
    "the choice picker opens on the current value; Back closes it without a change",
    () => {
      // Choice navigation is a local transaction: focus, cancel, commit and stale handlers.
      x = boot(null, false, false, false, true);
      x.nodes.tabs.children
        .find((n) => n.textContent.indexOf("System") === 0)
        .onclick();
      x.click("tweak-settings-example");
      x.pump();
      x.click("setting-profile-choice");
      assert.equal(x.doc.activeElement.id, "choice-option-0");
      let picker = x.doc.getElementById("choice-picker");
      assert(picker);
      let callsBeforePicker = x.calls.length;
      controller("onkeydown", 77);
      assert.equal(x.doc.activeElement.id, "choice-option-1");
      controller("onkeyup", 8);
      assert(!x.doc.getElementById("choice-picker"));
      assert.equal(x.doc.activeElement.id, "setting-profile-choice");
      assert.equal(x.doc.activeElement.textContent, "Stock");
      assert.equal(x.calls.length, callsBeforePicker);
    }
  );

  await t.test(
    "the controller commits a choice; an old option handler changes nothing",
    () => {
      x.click("setting-profile-choice");
      let staleChoice = x.doc.getElementById("choice-option-2").onclick;
      controller("onkeydown", 77);
      controller("onkeydown", 13);
      assert.equal(x.doc.activeElement.id, "setting-profile-choice");
      assert.equal(x.doc.activeElement.textContent, "Medium");
      assert(!x.doc.getElementById("choice-picker"));
      x.click("setting-profile-choice");
      assert.equal(x.doc.activeElement.id, "choice-option-1");
      x.click("choice-cancel");
      assert.equal(x.doc.activeElement.textContent, "Medium");
      staleChoice();
      assert.equal(x.doc.activeElement.textContent, "Medium");
    }
  );

  await t.test("Escape closes the picker and gives the focus back", () => {
    x.click("setting-profile-choice");
    controller("onkeydown", 27);
    assert(!x.doc.getElementById("choice-picker"));
    assert.equal(x.doc.activeElement.id, "setting-profile-choice");
  });
});

test("COMPATIBILITY_UI", async (t) => {
  await t.test("the shim example manifest declares its service", () => {
    assert.equal(
      parseConf(
        "shim-example",
        fs.readFileSync(
          path.join(ROOT, "../development/examples/shim/manifest.conf"),
          "utf8"
        )
      ).shim_service,
      "jciMMUI"
    );
  });

  await t.test(
    "the scan runs no compatibility check; a hard block disables Install",
    () => {
      // Compatibility belongs to details, not the fast scan; warnings remain actionable.
      x = boot(null, false, false, false, false, true);
      assert(!x.calls.some((a) => a[0] === "preflight-info"));
      x.nodes.tabs.children
        .find((n) => n.textContent.indexOf("System") === 0)
        .onclick();
      x.preflight["bundle-example"] = x.ok("block\tNo compatible HUD.\n", 1);
      x.click("tweak-bundle-example");
      assert(x.nodes.action.disabled);
      x.pump();
      assert(x.nodes.action.disabled);
      assert.match(
        x.nodes["dialog-description"].textContent,
        /Cannot install: No compatible HUD/
      );
    }
  );

  await t.test("a warning keeps Install available", () => {
    x.click("back");
    x.preflight["bundle-example"] = x.ok(
      "warning\tNo extra function in this region.\n"
    );
    x.click("tweak-bundle-example");
    x.pump();
    assert(!x.nodes.action.disabled);
    assert.match(
      x.nodes["dialog-description"].textContent,
      /Note: No extra function/
    );
  });

  await t.test("an info message keeps Install available", () => {
    x.click("back");
    x.preflight["bundle-example"] = x.ok("info\tSupported HUD detected.\n");
    x.click("tweak-bundle-example");
    x.pump();
    assert(!x.nodes.action.disabled);
    assert.match(
      x.nodes["dialog-description"].textContent,
      /Info: Supported HUD detected/
    );
  });

  await t.test("an info message and a warning are shown together", () => {
    x.click("back");
    x.preflight["bundle-example"] = x.ok(
      "info\tSupported HUD detected.\nwarning\tLimited functionality in this region.\n"
    );
    x.click("tweak-bundle-example");
    x.pump();
    assert(!x.nodes.action.disabled);
    assert.match(
      x.nodes["dialog-description"].textContent,
      /Info: Supported HUD detected/
    );
    assert.match(
      x.nodes["dialog-description"].textContent,
      /Note: Limited functionality in this region/
    );
  });

  await t.test(
    "an info message and a block are shown together and Install is disabled",
    () => {
      x.click("back");
      x.preflight["bundle-example"] = x.ok(
        "info\tSupported HUD detected.\nblock\tIncompatible hardware.\n",
        1
      );
      x.click("tweak-bundle-example");
      x.pump();
      assert(x.nodes.action.disabled);
      assert.match(
        x.nodes["dialog-description"].textContent,
        /Info: Supported HUD detected/
      );
      assert.match(
        x.nodes["dialog-description"].textContent,
        /Cannot install: Incompatible hardware/
      );
    }
  );

  await t.test("a stale block cannot lock the newly opened view", () => {
    x.click("back");
    x.preflight["bundle-example"] = x.ok("info\tSupported HUD detected.\n");
    // A stale blocked result must not lock the newly opened view.
    x.click("back");
    x.click("tweak-bundle-example");
    const stale = x.jobs.splice(0);
    x.click("back");
    x.click("tweak-bundle-example");
    for (const job of stale)
      x.event({
        type: "shell-result",
        token: "secret",
        id: job.id,
        result: x.ok("block\tStale HUD failure.\n", 1)
      });
    x.pump();
    assert(!x.nodes.action.disabled);
    assert.doesNotMatch(x.nodes["dialog-description"].textContent, /Stale HUD/);
  });

  await t.test("a saved uninstall needs no compatibility check", () => {
    x.click("back");
    x.states["bundle-example"] = "installed";
    x.click("refresh");
    x.pump();
    x.nodes.tabs.children
      .find((n) => n.textContent.indexOf("System") === 0)
      .onclick();
    const before = x.calls.filter((a) => a[0] === "preflight-info").length;
    x.click("tweak-bundle-example");
    x.pump();
    assert.equal(x.nodes.action.textContent, "Uninstall");
    assert(!x.nodes.action.disabled);
    assert.equal(
      x.calls.filter((a) => a[0] === "preflight-info").length,
      before,
      "Hardware failure must not block saved uninstall"
    );
  });
});

test("CLUSTER_MANIFEST_UI", async (t) => {
  await t.test(
    "Touchscreen While Driving: an info message keeps Install available",
    () => {
      // Non-bundle tweak preflight info (Touchscreen While Driving)
      x = boot(null, false, false, false, false, false);
      x.usb.ids = ["touch-while-driving"];
      x.states["touch-while-driving"] = "uninstalled";
      x.preflight["touch-while-driving"] = x.ok(
        "info\tTouchscreen while driving is already enabled. Install to disable additional menu operation restriction.\n"
      );
      x.click("refresh");
      x.pump();
      x.click("tweak-touch-while-driving");
      x.pump();
      assert(!x.nodes.action.disabled);
      assert.match(
        x.nodes["dialog-description"].textContent,
        /Info: Touchscreen while driving is already enabled/
      );
    }
  );

  await t.test(
    "Touchscreen While Driving: without a message nothing extra is shown",
    () => {
      x.click("back");
      x.preflight["touch-while-driving"] = x.ok();
      x.click("tweak-touch-while-driving");
      x.pump();
      assert(!x.nodes.action.disabled);
      assert.doesNotMatch(
        x.nodes["dialog-description"].textContent,
        /Info: Touchscreen while driving/
      );
    }
  );

  await t.test(
    "Touchscreen While Driving: an unreadable setting disables Install",
    () => {
      x.click("back");
      x.preflight["touch-while-driving"] = x.ok(
        "",
        1,
        "Cannot read valid speed restriction settings."
      );
      x.click("tweak-touch-while-driving");
      x.pump();
      assert(x.nodes.action.disabled);
      assert.match(
        x.nodes["dialog-description"].textContent,
        /Cannot read valid speed restriction settings/
      );
    }
  );

  await t.test(
    "Touchscreen While Driving: the manifest requires a boolean preflight",
    () => {
      const touchManifest = parseConf(
        "touch-while-driving",
        fs.readFileSync(
          path.join(ROOT, "tweaks/touch-while-driving/manifest.conf"),
          "utf8"
        )
      );
      assert.equal(touchManifest.preflight, true);
      assert.throws(() =>
        parseConf(
          "touch-while-driving",
          fs
            .readFileSync(
              path.join(ROOT, "tweaks/touch-while-driving/manifest.conf"),
              "utf8"
            )
            .replace("preflight=true", "preflight=yes")
        )
      );
    }
  );

  await t.test(
    "HUD Street Name: a compatible HUD keeps Install available",
    () => {
      // Non-bundle tweak preflight info (HUD Street Name)
      x = boot(null, false, false, false, false, false);
      x.usb.ids = ["hud-street-name"];
      x.states["hud-street-name"] = "uninstalled";
      x.recovery["hud-street-name"] = "original\n";
      x.preflight["hud-street-name"] = x.ok(
        "info\tDetected compatible color Windshield HUD.\n"
      );
      x.click("refresh");
      x.pump();
      x.click("tweak-hud-street-name");
      x.pump();
      assert(!x.nodes.action.disabled);
      assert.match(
        x.nodes["dialog-description"].textContent,
        /Info: Detected compatible color Windshield HUD/
      );
    }
  );

  await t.test("HUD Street Name: an unsupported HUD disables Install", () => {
    x.click("back");
    x.preflight["hud-street-name"] = x.ok(
      "block\tDetected unsupported Combiner HUD (monochrome).\n",
      1
    );
    x.click("tweak-hud-street-name");
    x.pump();
    assert(x.nodes.action.disabled);
    assert.match(
      x.nodes["dialog-description"].textContent,
      /Cannot install: Detected unsupported Combiner HUD/
    );
  });

  await t.test(
    "HUD Street Name: the manifest requires a boolean preflight",
    () => {
      const hudManifest = parseConf(
        "hud-street-name",
        fs.readFileSync(
          path.join(ROOT, "tweaks/hud-street-name/manifest.conf"),
          "utf8"
        )
      );
      assert.equal(hudManifest.preflight, true);
      assert.throws(() =>
        parseConf(
          "hud-street-name",
          fs
            .readFileSync(
              path.join(ROOT, "tweaks/hud-street-name/manifest.conf"),
              "utf8"
            )
            .replace("preflight=true", "preflight=yes")
        )
      );
    }
  );

  await t.test(
    "Cluster Language: the manifest declares its setting and components",
    () => {
      const clusterManifest = parseConf(
        "cluster-language",
        fs.readFileSync(
          path.join(ROOT, "tweaks/cluster-language/manifest.conf"),
          "utf8"
        )
      );
      assert.equal(clusterManifest.settingDefs[0].key, "hud_display_language");
      assert.equal(clusterManifest.settingDefs[0].default, "off");
      assert.equal(clusterManifest.settingDefs[0].choices.slice(0, 4).join(" "), "off en-uk en-us en-au");
      assert.equal(clusterManifest.components, "components.tsv");
    }
  );
});

test("DETAIL_SECTIONS", async (t) => {
  let chunks;

  await t.test(
    "a long status message is split into bounded, focusable sections",
    () => {
      // Long status messages retain all text in small, controller-reachable sections.
      x = boot();
      x.states.ssh = "unavailable";
      x.reasons.ssh =
        "A long diagnostic line with details. ".repeat(18) +
        "Final diagnostic details";
      x.click("refresh");
      x.pump();
      x.nodes.tabs.children
        .find((n) => n.textContent.indexOf("System") === 0)
        .onclick();
      x.click("tweak-ssh");
      x.pump();
      chunks = x.nodes["dialog-state"].children;
      assert(chunks.length > 1);
      for (const chunk of chunks) {
        assert(chunk.textContent.length <= 361);
        assert.equal(chunk.tagName, "button");
      }
    }
  );

  await t.test(
    "the sections keep the whole text, headed DETAILS and CONTINUED",
    () => {
      assert(x.nodes["dialog-state"].textContent.includes(x.reasons.ssh));
      assert.equal(chunks[0].attributes["data-heading"], "DETAILS");
      for (const chunk of chunks.slice(1))
        assert.equal(chunk.attributes["data-heading"], "CONTINUED");
    }
  );
});

test("LIST_POSITION", async (t) => {
  await t.test("one segment per entry of the tab", () => {
    x = boot();
    x.nodes.tabs.children
      .find((n) => n.textContent.indexOf("Interface") === 0)
      .onclick();
    assert.equal(
      x.nodes["list-position"].children.length,
      x.nodes.cards.children.length
    );
  });

  await t.test(
    "the focused entry has the only, enlarged active segment and no footer prompt",
    () => {
      x.nodes.cards.children[1].onfocus();
      assert.equal(
        x.nodes["list-position"].children.filter((n) =>
          n.className.includes("active")
        ).length,
        1
      );
      assert(x.nodes["list-position"].children[1].className.includes("active"));
      assert(
        parseFloat(x.nodes["list-position"].children[1].style.height) >
          parseFloat(x.nodes["list-position"].children[0].style.height)
      );
      assert.equal(x.nodes["footer-status"].textContent, "");
    }
  );

  await t.test("another tab rebuilds the segments", () => {
    x.nodes.tabs.children
      .find((n) => n.textContent.indexOf("System") === 0)
      .onclick();
    assert.equal(
      x.nodes["list-position"].children.length,
      x.nodes.cards.children.length
    );
    assert.equal(
      x.nodes["list-position"].children.filter((n) =>
        n.className.includes("active")
      ).length,
      1
    );
  });
});

test("CONTRIBUTORS", async (t) => {
  await t.test("the details show the contributors as focusable text", () => {
    x = boot();
    x.nodes.tabs.children
      .find((n) => n.textContent.indexOf("Interface") === 0)
      .onclick();
    x.click("tweak-list-beep");
    assert.match(
      x.nodes["dialog-meta"].textContent,
      /Original author; port by Example <developer>/
    );
    assert.equal(x.nodes["dialog-meta"].tabIndex, 0);
    assert.equal(
      x.nodes["dialog-meta"].getElementsByTagName("button").length,
      0
    );
  });

  await t.test("closing the details clears them", () => {
    x.click("back");
    assert.equal(x.nodes["dialog-contributors"].textContent, "");
  });

  await t.test(
    "the manifest keeps contributors literal and refuses a duplicate",
    () => {
      assert.equal(
        parseConf(
          "list-beep",
          rawConf + "contributors=Name $(literal) <text>\n"
        ).contributors,
        "Name $(literal) <text>"
      );
      assert.throws(() =>
        parseConf("list-beep", rawConf + "contributors=A\ncontributors=B\n")
      );
    }
  );
});

test("DYNAMIC_POSITION", async (t) => {
  await t.test("a single entry has one finite segment at the top", () => {
    x = boot();
    assert.equal(x.nodes["list-position"].children.length, 1);
    assert(
      Number.isFinite(
        parseFloat(x.nodes["list-position"].children[0].style.height)
      )
    );
    assert.equal(parseFloat(x.nodes["list-position"].children[0].style.top), 0);
  });
});

test("GUI_MANIFEST_UI", async (t) => {
  let guiConf;

  await t.test("reads the GUI extension example", () => {
    guiConf = fs.readFileSync(
      path.join(ROOT, "../development/examples/gui-extension/manifest.conf"),
      "utf8"
    );
    assert.equal(parseConf("gui-example", guiConf).gui_menu_path, "");
  });

  await t.test(
    "refuses a wrong API, an unsafe menu or view path and a missing reset",
    () => {
      for (const bad of [
        guiConf.replace("gui_api=1", "gui_api=2"),
        guiConf.replace("gui_menu_path=", "gui_menu_path=Tools//Examples"),
        guiConf.replace("assets/view.html", "assets/../view.html"),
        guiConf.replace("reset_entrypoint=reset.sh\n", "")
      ])
        assert.throws(() => parseConf("gui-example", bad));
    }
  );

  await t.test("refuses a reserved ID", () => {
    assert.throws(() =>
      parseConf("games", guiConf.replace("id=gui-example", "id=games"))
    );
  });

  await t.test("accepts a resident with a service", () => {
    assert.equal(
      parseConf(
        "gui-example",
        guiConf +
          "gui_resident=assets/resident.js\ngui_service=assets/service/entry.lua\n"
      ).gui_service,
      "assets/service/entry.lua"
    );
  });

  await t.test("refuses an incomplete or unsafe resident or service", () => {
    for (const extra of [
      "gui_resident=\n",
      "gui_resident=assets/resident.js\ngui_service=\n",
      "gui_service=assets/service.lua\n",
      "gui_resident=assets/../resident.js\n",
      "gui_resident=assets/resident.lua\n",
      "gui_resident=assets/resident.js\ngui_service=assets/service.js\n"
    ])
      assert.throws(() => parseConf("gui-example", guiConf + extra));
  });
});

test("CHOICE_SCROLL_UI", async (t) => {
  await t.test("the picker lists all 64 options", () => {
    const options64 = Array.from(
      { length: 64 },
      (_, i) => "opt" + String(i).padStart(2, "0")
    );
    x = boot(null, false, false, false, true);
    x.savedSettings.schemaText = fs
      .readFileSync(
        path.join(ROOT, "../development/examples/settings/manifest.conf"),
        "utf8"
      )
      .replace("profile.default=stock", "profile.default=opt00")
      .replace("stock medium large", options64.join(" "));
    x.nodes.tabs.children
      .find((n) => n.textContent.indexOf("System") === 0)
      .onclick();
    x.click("tweak-settings-example");
    x.pump();
    x.click("setting-profile-choice");
    assert.equal(
      x.doc.getElementById("choice-picker").getElementsByTagName("button")
        .length,
      65
    );
  });

  await t.test(
    "the controller scrolls to the focused option and selects it",
    () => {
      for (let i = 0; i < 12; i++) controller("onkeydown", 77);
      assert.equal(x.doc.activeElement.id, "choice-option-12");
      assert(x.doc.getElementById("choice-picker").children[1].scrollTop > 0);
      controller("onkeydown", 13);
      assert.equal(x.doc.activeElement.textContent, "Opt12");
    }
  );
});

test("TWO_CHOICE_UI", async (t) => {
  await t.test("pressing changes the value without a picker", () => {
    x = boot(null, false, false, false, true);
    x.savedSettings.schemaText = fs
      .readFileSync(
        path.join(ROOT, "../development/examples/settings/manifest.conf"),
        "utf8"
      )
      .replace("stock medium large", "stock medium");
    x.nodes.tabs.children
      .find((n) => n.textContent.indexOf("System") === 0)
      .onclick();
    x.click("tweak-settings-example");
    x.pump();
    x.click("setting-profile-choice");
    assert(!x.doc.getElementById("choice-picker"));
    assert.equal(
      x.doc.getElementById("setting-profile-choice").textContent,
      "Medium"
    );
  });

  await t.test("pressing again goes back to the first value", () => {
    x.click("setting-profile-choice");
    assert.equal(
      x.doc.getElementById("setting-profile-choice").textContent,
      "Stock"
    );
  });
});

test("DESCRIPTION_FIELD", async (t) => {
  let descriptionParts;

  await t.test("the description is one field with the complete warning", () => {
    // Descriptions are one semantic field regardless of an arbitrary character count.
    x = boot(null, false, false, false, false, true);
    x.preflight["bundle-example"] = x.ok(
      "warning\t" +
        "Language compatibility details ".repeat(11) +
        "overridden\n"
    );
    x.nodes.tabs.children
      .find((n) => n.textContent.indexOf("System") === 0)
      .onclick();
    x.click("tweak-bundle-example");
    x.pump();
    descriptionParts = x.nodes["dialog-description"].children;
    assert.equal(descriptionParts.length, 1);
    assert.equal(descriptionParts[0].attributes["data-heading"], "DESCRIPTION");
    assert(x.nodes["dialog-description"].textContent.includes("overridden"));
  });

  await t.test("the controller scrolls a long description", () => {
    const descriptionField = descriptionParts[0];
    descriptionField.clientHeight = 190;
    descriptionField.scrollHeight = 500;
    descriptionField.focus();
    controller("onkeydown", 40);
    assert.equal(x.doc.activeElement, descriptionField);
    assert.equal(descriptionField.scrollTop, 46);
    controller("onkeydown", 38);
    assert.equal(descriptionField.scrollTop, 0);
  });
});

test("FULL_REFRESH", async (t) => {
  await t.test(
    "Refresh locks the list and rereads the USB list and the manifests",
    () => {
      // Refresh discovers changed USB content rather than only rechecking old states.
      x = boot();
      x.nodes.tabs.children
        .find((n) => n.textContent.indexOf("Interface") === 0)
        .onclick();
      x.click("tweak-list-beep");
      x.click("back");
      x.usb.ids = ["list-beep", "hello"];
      x.states.hello = "uninstalled";
      x.usb.manifests["list-beep"] = fs
        .readFileSync(path.join(ROOT, "tweaks/list-beep/manifest.conf"), "utf8")
        .replace(/^name=.*$/m, "name=Updated tweak")
        .replace(/^description=.*$/m, "description=Updated USB description")
        .replace(/^version=.*$/m, "version=9.8.7")
        .replace(/^group=.*$/m, "group=traffic-jam");
      const beforeRefresh = x.calls.length;
      x.click("refresh");
      assert(x.nodes.refresh.disabled);
      assert(x.nodes.cards.children.every((n) => n.disabled));
      x.pump();
      assert(x.calls.slice(beforeRefresh).some((a) => a[0] === "list"));
      assert.equal(
        x.calls.slice(beforeRefresh).filter((a) => a[0] === "manifest").length,
        2
      );
    }
  );

  await t.test("a changed category rebuilds the tabs", () => {
    assert.equal(x.nodes.tabs.children.length, 2);
    assert(!x.nodes.tabs.textContent.includes("Interface"));
    x.nodes.tabs.children
      .find((n) => n.textContent.indexOf("Traffic Jam") === 0)
      .onclick();
    assert.equal(x.nodes.cards.children.length, 1);
    assert(x.nodes.cards.textContent.includes("Updated tweak"));
  });

  await t.test("the details show the new description and version", () => {
    x.click("tweak-list-beep");
    assert.match(
      x.nodes["dialog-description"].textContent,
      /Updated USB description/
    );
    assert(x.nodes["dialog-meta"].textContent.includes("9.8.7"));
    x.click("back");
  });

  await t.test("a repeated Refresh adds no duplicates", () => {
    x.click("refresh");
    x.pump();
    assert.equal(
      x.nodes.cards.children.length,
      1,
      "repeated discovery must not duplicate tweaks"
    );
  });

  await t.test("a removed tweak disappears", () => {
    x.usb.ids = ["hello"];
    x.click("refresh");
    x.pump();
    assert.equal(x.nodes.tabs.children.length, 1);
    assert.equal(x.nodes.cards.children.length, 1);
    assert.equal(x.nodes.cards.firstChild.id, "tweak-hello");
  });

  await t.test(
    "an empty USB leaves an empty list and Refresh available",
    () => {
      x.usb.ids = [];
      x.click("refresh");
      x.pump();
      assert.equal(x.nodes.tabs.children.length, 0);
      assert.equal(x.nodes.cards.children.length, 0);
      assert.equal(x.nodes.refresh.disabled, false);
    }
  );
});

test("INSTALLER_UPDATES", async (t) => {
  await t.test("no Update for the same or a lower USB version", async (t) => {
    // Updates are offered only for a higher USB version, beside saved Uninstall.
    for (const [u, i] of [
      ["1.2.0", "1.2.0"],
      ["1.2.0", "1.10.0"],
      ["1.0.0", "2.0.0"]
    ]) {
      await t.test(u + " on USB, " + i + " installed", () => {
        const r = updateOffer(u, i);
        assert(r.nodes["update-action"].className.includes("hidden"));
        assert.equal(r.nodes.action.textContent, "Uninstall");
        assert(r.calls.some((a) => a[0] === "details"));
      });
    }
  });

  await t.test(
    "Update is offered for a higher version and Back cancels it",
    () => {
      x = updateOffer("1.10.0", "1.2.0");
      assert(!x.nodes["update-action"].className.includes("hidden"));
      assert(!x.nodes["update-action"].disabled);
      assert.equal(x.nodes.action.textContent, "Uninstall");
      x.click("update-action");
      assert.equal(x.nodes["dialog-title"].textContent, "Update: No List Beep");
      x.click("back");
      x.pump();
      assert.equal(x.nodes.action.textContent, "Uninstall");
      assert(!x.calls.some((a) => a[0] === "action" && a[2] === "update"));
    }
  );

  await t.test("Update runs the version-pinned action", () => {
    x.click("update-action");
    x.click("action");
    assert.equal(x.nodes["dialog-state"].textContent, "Updating");
    x.pump();
    assert(
      x.calls.some(
        (a) =>
          JSON.stringify(a) ===
          JSON.stringify(["action", "list-beep", "update", "1.10.0"])
      )
    );
    assert.equal(x.states["list-beep"], "installed");
    assert.equal(x.nodes["dialog-state"].textContent, "Update completed");
  });

  await t.test("a refused update offer disables Update", () => {
    x = updateOffer("2.0.0", "1.0.0");
    x.usb.updateOffers["list-beep"] = x.ok(
      "",
      1,
      "Dependent package blocks replacement."
    );
    x.click("back");
    x.click("tweak-list-beep");
    x.pump();
    assert(x.nodes["update-action"].disabled);
    assert.match(
      x.nodes["dialog-description"].textContent,
      /Update unavailable/
    );
    assert.equal(x.nodes.action.textContent, "Uninstall");
  });
});

test("REPLUG_FOCUS_UI", async (t) => {
  let pollFocus, focusBefore;

  await t.test("no focus without a request", () => {
    x = boot();
    pollFocus = x.intervals[1];
    assert.equal(typeof pollFocus, "function");
    focusBefore = x.calls.filter((a) => a[0] === "focus").length;
    pollFocus();
    x.pump();
    assert.equal(x.calls.filter((a) => a[0] === "focus").length, focusBefore);
  });

  await t.test(
    "a request brings the window forward once, even when polled twice",
    () => {
      x.usb.refocusRequested = true;
      pollFocus();
      pollFocus();
      x.pump();
      assert.equal(
        x.calls.filter((a) => a[0] === "focus").length,
        focusBefore + 1
      );
      assert(x.calls.some((a) => a[0] === "event" && a[1] === "refocus-ready"));
    }
  );

  await t.test("no further focus without a new request", () => {
    pollFocus();
    x.pump();
    assert.equal(
      x.calls.filter((a) => a[0] === "focus").length,
      focusBefore + 1
    );
  });

  await t.test("a request during an operation waits until it ends", () => {
    x.nodes.tabs.children
      .find((n) => n.textContent.indexOf("Interface") === 0)
      .onclick();
    x.click("tweak-list-beep");
    x.pump();
    x.click("action");
    x.usb.refocusRequested = true;
    const pendingRequests = x.jobs.length;
    pollFocus();
    assert.equal(
      x.jobs.length,
      pendingRequests,
      "No focus polling during a worker"
    );
    x.pump();
    pollFocus();
    x.pump();
    assert.equal(
      x.calls.filter((a) => a[0] === "focus").length,
      focusBefore + 2
    );
  });
});

test("MUTABLE_CONFIG_UI", async (t) => {
  await t.test("Keep runs the uninstall with --preserve-config", () => {
    x = installedWithConfig();
    assert.equal(x.nodes["dialog-title"].textContent, "Keep configuration?");
    assert(!x.calls.some((a) => a[0] === "action" && a[2] === "uninstall"));
    x.click("action");
    assert.equal(x.nodes["dialog-title"].textContent, "No List Beep");
    assert.equal(x.nodes["dialog-state"].textContent, "Uninstalling");
    x.pump();
    assert(
      x.calls.some(
        (a) =>
          a[0] === "action" &&
          a[2] === "uninstall" &&
          a[3] === "--preserve-config"
      )
    );
  });

  await t.test("Back runs a plain uninstall", () => {
    x = installedWithConfig();
    x.click("back");
    assert.equal(x.nodes["dialog-title"].textContent, "No List Beep");
    assert.equal(x.nodes["dialog-state"].textContent, "Uninstalling");
    x.pump();
    assert(
      x.calls.some(
        (a) => a[0] === "action" && a[2] === "uninstall" && a.length === 3
      )
    );
  });
});

test("DETAIL_LOADING", async (t) => {
  let detailAnimation, detailJobs;

  await t.test("opening the details shows the loading barrier", () => {
    // Delayed detail queries must be a single blocking phase, including nested Update.
    x = updateOffer("2.0.0", "1.0.0");
    x.click("back");
    x.doc.getElementById("tweak-list-beep").onclick();
    assert(!x.nodes["detail-loading"].className.includes("hidden"));
    assert.equal(x.nodes.dialog.attributes["aria-busy"], "true");
  });

  await t.test("the loading text animates without new requests", () => {
    ((detailAnimation = x.intervals[x.intervals.length - 1]),
      (detailJobs = x.jobs.length));
    detailAnimation();
    assert.equal(
      x.nodes["detail-loading-text"].textContent,
      "Reading tweak information.."
    );
    detailAnimation();
    assert.equal(
      x.nodes["detail-loading-text"].textContent,
      "Reading tweak information..."
    );
    detailAnimation();
    assert.equal(
      x.nodes["detail-loading-text"].textContent,
      "Reading tweak information."
    );
    assert.equal(x.jobs.length, detailJobs);
  });

  await t.test("no input or action gets through while loading", () => {
    const mutations = x.calls.filter((a) => a[0] === "action").length;
    x.nodes.action.onclick();
    x.nodes.back.onclick();
    controller("onkeydown", 13);
    controller("onkeydown", 27);
    controller("onkeyup", 8);
    assert(!x.nodes.overlay.className.includes("hidden"));
    assert(!x.nodes["detail-loading"].className.includes("hidden"));
    assert.equal(x.calls.filter((a) => a[0] === "action").length, mutations);
    assert.equal(
      x.jobs.filter((j) => j.args[1] === "details").length,
      1,
      "one bridge request owns all details"
    );
  });

  await t.test(
    "one answer releases all detail queries and the focus goes to Back",
    () => {
      x.step();
      assert(
        x.nodes["detail-loading"].className.includes("hidden"),
        "one aggregate response releases all detail queries"
      );
      x.pump();
      assert(x.nodes["detail-loading"].className.includes("hidden"));
      assert.equal(x.nodes.dialog.attributes["aria-busy"], "false");
      assert(!x.nodes["update-action"].disabled);
      assert.equal(x.doc.activeElement, x.nodes.back);
    }
  );

  await t.test("the animation stays stopped afterwards", () => {
    const settledText = x.nodes["detail-loading-text"].textContent;
    detailAnimation();
    assert.equal(
      x.nodes["detail-loading-text"].textContent,
      settledText,
      "settled animation stays stopped"
    );
  });

  await t.test("a refused update offer is shown without the barrier", () => {
    x.click("back");
    x.usb.updateOffers["list-beep"] = x.ok(
      "",
      1,
      "Update unavailable for this package."
    );
    x.doc.getElementById("tweak-list-beep").onclick();
    x.pump();
    assert(x.nodes["detail-loading"].className.includes("hidden"));
    assert.match(
      x.nodes["dialog-description"].textContent,
      /Update unavailable/
    );
    x.click("back");
  });
});

test("HIDDEN_ACTION_FOCUS", async (t) => {
  await t.test("the focus leaves Update before it is hidden", () => {
    // CMU Presto must lose native button focus before the middle action is hidden.
    x = updateOffer("2.0.0", "1.0.0");
    x.nodes["update-action"].focus();
    const focusPaint = [],
      backFocus = x.nodes.back.focus.bind(x.nodes.back);
    x.nodes.back.focus = function () {
      focusPaint.push(x.nodes["update-action"].className.includes("hidden"));
      backFocus();
    };
    x.click("update-action");
    assert.equal(focusPaint[0], false, "transfer focus before hiding Update");
    assert(x.nodes["update-action"].className.includes("hidden"));
    assert.equal(x.doc.activeElement, x.nodes.back);
    assert.equal(x.nodes.action.textContent, "Update");
  });
});

test("DIALOG_ROW_REPAINT", async (t) => {
  await t.test(
    "the whole action row is repainted before Update is hidden",
    () => {
      x = updateOffer("2.0.0", "1.0.0");
      let rowInvalidations = 0;
      Object.defineProperty(x.nodes["dialog-actions"], "offsetHeight", {
        get() {
          if (x.nodes["dialog-actions"].style.display === "none")
            rowInvalidations++;
          return 60;
        }
      });
      x.nodes["update-action"].focus();
      x.click("update-action");
      assert(rowInvalidations > 0);
      assert.equal(x.nodes["dialog-actions"].style.display, "");
      assert(x.nodes["update-action"].className.includes("hidden"));
    }
  );
});

test("UI_POLISH", async (t) => {
  await t.test("Update starts and Back is locked", () => {
    // One Update request owns the complete uninstall/install transaction in the UI.
    x = updateOffer("2.0.0", "1.0.0");
    x.click("update-action");
    x.click("action");
    const updateWork = x.jobs.find(
      (j) => j.args[1] === "action" && j.args[3] === "update"
    );
    assert(updateWork);
    assert(x.nodes.back.disabled);
    const duringUpdateAnimation = x.intervals[x.intervals.length - 1];
    duringUpdateAnimation();
    assert(x.nodes.back.disabled);
  });

  await t.test("no key or click can leave the dialog during the Update", () => {
    const updateRequests = x.jobs.length;
    controller("onkeyup", 8);
    x.doc.onkeydown({ keyCode: 27, preventDefault() {} });
    assert.equal(x.jobs.length, updateRequests);
    assert(x.nodes.back.disabled);
    x.nodes.back.onclick();
    assert(x.nodes.back.disabled);
    assert.equal(x.nodes["dialog-state"].textContent, "Updating.");
  });

  await t.test("the result has its own title and only OK", () => {
    x.pump();
    assert.equal(
      x.nodes["dialog-title"].textContent,
      "No List Beep - Operation completed"
    );
    assert(x.nodes.back.className.includes("hidden"));
    assert(!x.nodes["result-ok"].disabled);
  });
});

test("AGGREGATE_RECOVERY", async (t) => {
  await t.test(
    "a truncated or timed-out aggregate answer falls back to single queries",
    async (t) => {
      // Aggregate failures must degrade to independent read-only queries.
      for (const failed of [
        Object.assign(boot().ok("partial"), { stdoutTruncated: true }),
        boot().ok("", 1, "Status check timed out.")
      ]) {
        await t.test(
          failed.stdoutTruncated ? "truncated answer" : "timed-out answer",
          () => {
            x = boot();
            x.usb.manifestBatchFailure = failed;
            x.click("refresh");
            x.pump();
            assert(!x.nodes.refresh.disabled);
            x.usb.detailBatchFailure = failed;
            x.nodes.tabs.children
              .find((n) => n.textContent.indexOf("Interface") === 0)
              .onclick();
            x.click("tweak-main-menu-loop");
            x.pump();
            assert(x.nodes["detail-loading"].className.includes("hidden"));
            assert(!x.nodes.back.disabled);
            x.click("back");
          }
        );
      }
    }
  );

  await t.test("a failed detail query keeps Update available", () => {
    x = updateOffer("2.0.0", "1.0.0");
    x.click("back");
    x.usb.detailBatchFailure = x.ok("", 1, "Timed out");
    x.click("tweak-list-beep");
    x.pump();
    assert(!x.nodes["update-action"].disabled);
    x.click("back");
  });

  await t.test(
    "a hardware read failure is shown as such, not as an invalid answer",
    () => {
      x = boot(null, false, false, false, false, true);
      x.usb.detailBatchFailure = x.ok("", 1, "aggregate deadline");
      x.preflight["bundle-example"] = x.ok(
        "",
        1,
        "Cannot read the hardware settings."
      );
      x.nodes.tabs.children
        .find((n) => n.textContent.indexOf("System") === 0)
        .onclick();
      x.click("tweak-bundle-example");
      x.pump();
      assert.match(
        x.nodes["dialog-description"].textContent,
        /Cannot read the hardware settings/
      );
      assert(
        !x.nodes["dialog-description"].textContent.includes(
          "Invalid compatibility response"
        )
      );
      assert(!x.nodes.back.disabled);
    }
  );

  await t.test(
    "a failure while building the details releases the queue and the navigation",
    () => {
      // A building exception must release both the request queue and navigation.
      x = boot();
      x.nodes.tabs.children
        .find((n) => n.textContent.indexOf("Interface") === 0)
        .onclick();
      const appendMeta = x.nodes["dialog-meta"].appendChild.bind(
        x.nodes["dialog-meta"]
      );
      let metaCount = 0;
      x.nodes["dialog-meta"].appendChild = function (node) {
        if (++metaCount === 2) throw new Error("fixture build failure");
        return appendMeta(node);
      };
      x.click("tweak-main-menu-loop");
      assert(x.nodes["detail-loading"].className.includes("hidden"));
      assert.match(
        x.nodes["dialog-description"].textContent,
        /fixture build failure/
      );
      x.click("back");
      x.click("refresh");
      x.pump();
      assert(!x.nodes.refresh.disabled);
    }
  );

  await t.test(
    "a failing callback does not strand the others or the loading barrier",
    () => {
      // One callback failure must not strand the remaining callbacks/loading barrier.
      x = updateOffer("2.0.0", "1.0.0");
      x.click("back");
      x.usb.updateOffers["list-beep"] = x.ok("", 1, "fixture update refusal");
      let thrown = false;
      const appendDescription = x.nodes["dialog-description"].appendChild.bind(
        x.nodes["dialog-description"]
      );
      x.nodes["dialog-description"].appendChild = function (node) {
        if (!thrown && node.textContent.includes("fixture update refusal")) {
          thrown = true;
          throw new Error("fixture handler failure");
        }
        return appendDescription(node);
      };
      x.click("tweak-list-beep");
      x.pump();
      assert(thrown);
      assert(x.nodes["detail-loading"].className.includes("hidden"));
      assert(!x.nodes.back.disabled);
      assert(x.nodes.action.disabled);
      x.click("back");
    }
  );
});


test("SSH_CONDITIONAL_KEY_MANIFEST", () => {
  const raw = fs.readFileSync(path.join(ROOT, "tweaks/ssh/manifest.conf"), "utf8");
  assert.equal(parseConf("ssh", raw).id, "ssh");
  for (const invalid of [
    raw.replace("asset=public.key", "asset=../public.key"),
    raw.replace("asset_source=public.key", "asset_source=../public.key"),
    raw.replace("asset_when=install", "asset_when=unknown"),
    raw.replace(/^setting.ssh_key.asset_source=.*\n/m, ""),
    raw + "setting.ssh_password.asset=public.key\nsetting.ssh_password.asset_source=other.key\nsetting.ssh_password.asset_when=enabled\n"
  ]) assert.throws(() => parseConf("ssh", invalid));
});
