/**
 * GUI SDK: usb/lib/gui-runtime/sdk.js.
 *
 * Tests the MzdGuiModule API inside the iframe view:
 * - token extraction
 * - service requests, responses, timeouts, validation and disposal cancellation
 * - notifications (mzd-gui-notify)
 * - units handshake (mzd-gui-units-request / mzd-gui-units)
 * - log messages
 * - layout, lifecycle, input, language and cleanup
 *
 * Uses the built-in Node test runner (node:test).
 * Run: node --test tests/installer/test-gui-sdk.cjs
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const sdkFile = path.join(__dirname, "../../usb/lib/gui-runtime/sdk.js");
const sdkSource = fs.readFileSync(sdkFile, "utf8");

function clean(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function createView(hash = "#mzdgui=test-view-token-123") {
  const sent = [];
  const listeners = {};
  const timers = new Map();
  let timerId = 0;

  const parent = {
    postMessage(data, targetOrigin) {
      sent.push({ data: clean(data), targetOrigin });
    }
  };

  const window = {
    location: { hash },
    parent,
    setTimeout(fn, ms) {
      const id = ++timerId;
      timers.set(id, { fn, ms });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    addEventListener(event, fn) {
      (listeners[event] = listeners[event] || []).push(fn);
    },
    removeEventListener(event, fn) {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter(f => f !== fn);
      }
    }
  };

  vm.runInNewContext(sdkSource, { window, Date }, { filename: sdkFile });

  function receive(data, source = parent) {
    const list = listeners.message || [];
    for (const fn of list.slice()) {
      fn({ source, data });
    }
  }

  function fireTimeout(id) {
    const t = timers.get(id);
    if (t) {
      timers.delete(id);
      t.fn();
    }
  }

  return {
    sdk: window.MzdGuiModule,
    window,
    sent,
    timers,
    receive,
    fireTimeout
  };
}

test("MzdGuiModule token and basic messages", async (t) => {
  await t.test("extracts token from hash and exposes it", () => {
    const v = createView("#mzdgui=custom-token-xyz");
    assert.equal(v.sdk.token, "custom-token-xyz");
  });

  await t.test("extracts token from complex query hash", () => {
    const v = createView("#section=main&mzdgui=mid-token&debug=1");
    assert.equal(v.sdk.token, "mid-token");
  });

  await t.test("handles absent token", () => {
    const v = createView("");
    assert.equal(v.sdk.token, "");
    v.sdk.ready();
    assert.equal(v.sent.length, 0, "No messages sent when token is absent");
  });

  await t.test("log sends mzd-gui-log message", () => {
    const v = createView();
    v.sdk.log("System initialized");
    assert.equal(v.sent.length, 1);
    assert.deepEqual(v.sent[0].data, {
      type: "mzd-gui-log",
      token: "test-view-token-123",
      message: "System initialized"
    });
  });

  await t.test("notify sends mzd-gui-notify message", () => {
    const v = createView();
    v.sdk.notify("Settings saved", false);
    assert.equal(v.sent.length, 1);
    assert.deepEqual(v.sent[0].data, {
      type: "mzd-gui-notify",
      token: "test-view-token-123",
      text: "Settings saved",
      isError: false
    });

    v.sdk.notify("Disk full", true);
    assert.equal(v.sent.length, 2);
    assert.deepEqual(v.sent[1].data, {
      type: "mzd-gui-notify",
      token: "test-view-token-123",
      text: "Disk full",
      isError: true
    });

    v.sdk.notify("");
    assert.equal(v.sent.length, 2, "Empty notification is not sent");
  });

  await t.test("getUnits requests units and delivers response", () => {
    const v = createView();
    let unitsResult = null;
    v.sdk.getUnits((units) => {
      unitsResult = units;
    });

    assert.equal(v.sent.length, 1);
    assert.deepEqual(v.sent[0].data, {
      type: "mzd-gui-units-request",
      token: "test-view-token-123",
      message: ""
    });

    const sampleUnits = {
      speedUnit: "mph",
      distanceUnit: "mi",
      tempUnit: "F",
      language: "en_US"
    };
    v.receive({
      type: "mzd-gui-units",
      token: "test-view-token-123",
      value: sampleUnits
    });

    assert.deepEqual(clean(unitsResult), sampleUnits);
  });
});

test("MzdGuiModule service requests", async (t) => {
  await t.test("validates operation name", () => {
    const v = createView();
    const invalidOps = ["", "123bad", "invalid_underscore", "UPPERCASE", "way-too-long-operation-name-exceeding-thirty-two-characters"];
    for (const op of invalidOps) {
      let errResult = null;
      v.sdk.request(op, {}, (err) => {
        errResult = err;
      });
      assert.equal(errResult, "Invalid service operation.", `Failed for: ${op}`);
    }
    assert.equal(v.sent.length, 0, "No messages sent for invalid operations");
  });

  await t.test("sends valid request with args and handles success result", () => {
    const v = createView();
    let cbCalled = false, cbError = null, cbResult = null;
    v.sdk.request("get-settings", { group: "display" }, (err, res) => {
      cbCalled = true;
      cbError = err;
      cbResult = res;
    });

    assert.equal(v.sent.length, 1);
    const reqData = v.sent[0].data;
    assert.equal(reqData.type, "mzd-gui-service-request");
    assert.equal(reqData.token, "test-view-token-123");
    assert.equal(reqData.operation, "get-settings");
    assert.deepEqual(reqData.args, { group: "display" });
    assert.equal(typeof reqData.id, "number");

    v.receive({
      type: "mzd-gui-service-result",
      token: "test-view-token-123",
      id: reqData.id,
      error: null,
      result: { brightness: 80 }
    });

    assert(cbCalled);
    assert.equal(cbError, null);
    assert.deepEqual(clean(cbResult), { brightness: 80 });
  });

  await t.test("handles error result", () => {
    const v = createView();
    let cbCalled = false, cbError = null, cbResult = null;
    v.sdk.request("save", { val: 1 }, (err, res) => {
      cbCalled = true;
      cbError = err;
      cbResult = res;
    });

    const reqData = v.sent[0].data;
    v.receive({
      type: "mzd-gui-service-result",
      token: "test-view-token-123",
      id: reqData.id,
      error: "Write error",
      result: null
    });

    assert(cbCalled);
    assert.equal(cbError, "Write error");
    assert.equal(cbResult, null);
  });

  await t.test("supports optional args and custom timeout", () => {
    const v = createView();
    let timedOut = false;
    v.sdk.request("sync", (err) => {
      if (err === "Service request timed out.") timedOut = true;
    }, 5000);

    assert.equal(v.sent.length, 1);
    const reqData = v.sent[0].data;
    assert.deepEqual(reqData.args, {});

    const timerId = [...v.timers.keys()][0];
    assert.equal(v.timers.get(timerId).ms, 5000);

    v.fireTimeout(timerId);
    assert(timedOut, "Callback called on timeout");
  });

  await t.test("cancels pending requests on dispose", () => {
    const v = createView();
    let cancelledA = null, cancelledB = null;
    v.sdk.request("first", {}, (err) => { cancelledA = err; });
    v.sdk.request("second", {}, (err) => { cancelledB = err; });

    assert.equal(v.timers.size, 2);
    v.sdk._dispose();

    assert.equal(cancelledA, "Module view closed.");
    assert.equal(cancelledB, "Module view closed.");
    assert.equal(v.timers.size, 0, "Timers cleared on dispose");

    let postDisposeErr = null;
    v.sdk.request("third", {}, (err) => { postDisposeErr = err; });
    assert.equal(postDisposeErr, "Module view is unavailable.");
  });
});

test("MzdGuiModule layout, lifecycle, input, language and ready/close", async (t) => {
  await t.test("setLayout sends mzd-gui-layout only for supported values", () => {
    const v = createView();
    v.sdk.setLayout("fullscreen");
    v.sdk.setLayout("with-status-bar");
    v.sdk.setLayout("invalid");
    assert.equal(v.sent.length, 2);
    assert.equal(v.sent[0].data.message, "fullscreen");
    assert.equal(v.sent[1].data.message, "with-status-bar");
  });

  await t.test("lifecycle suspend and resume", () => {
    const v = createView();
    let suspended = 0, resumed = 0;
    v.sdk.onSuspend(() => { suspended++; });
    v.sdk.onResume(() => { resumed++; });

    assert.equal(v.sent.length, 1);
    assert.deepEqual(v.sent[0].data, {
      type: "mzd-gui-lifecycle",
      token: "test-view-token-123",
      message: "phone"
    });

    v.receive({ type: "mzd-gui-suspend", token: "test-view-token-123" });
    assert.equal(suspended, 1);

    v.receive({ type: "mzd-gui-resume", token: "test-view-token-123" });
    assert.equal(resumed, 1);
  });

  await t.test("loadLanguage, language() and t() translation", () => {
    const v = createView();
    let langCb = null, dirCb = null;
    v.sdk.loadLanguage((lang, dir) => {
      langCb = lang;
      dirCb = dir;
    });

    assert.equal(v.sent.length, 1);
    assert.deepEqual(v.sent[0].data, {
      type: "mzd-gui-language-request",
      token: "test-view-token-123",
      message: ""
    });

    v.receive({
      type: "mzd-gui-language",
      token: "test-view-token-123",
      value: {
        language: "de_DE",
        direction: "ltr",
        texts: {
          greeting: "Hallo {name}!",
          farewell: "Auf Wiedersehen"
        }
      }
    });

    assert.equal(langCb, "de_DE");
    assert.equal(dirCb, "ltr");
    assert.equal(v.sdk.language(), "de_DE");
    assert.equal(v.sdk.t("greeting", "Hello {name}!", { name: "Max" }), "Hallo Max!");
    assert.equal(v.sdk.t("farewell", "Goodbye"), "Auf Wiedersehen");
    assert.equal(v.sdk.t("unknown", "Fallback"), "Fallback");
  });

  await t.test("input callback receives normalized actions and phases", () => {
    const v = createView();
    const inputs = [];
    v.sdk.onInput((action, phase) => {
      inputs.push({ action, phase });
      return true;
    });

    v.receive({ type: "mzd-gui-input", token: "test-view-token-123", action: "select", phase: "press" });
    v.receive({ type: "mzd-gui-input", token: "test-view-token-123", action: "rotateRight", phase: "step" });
    v.receive({ type: "mzd-gui-input", token: "test-view-token-123", action: "back", phase: "release" });
    v.receive({ type: "mzd-gui-input", token: "test-view-token-123", action: "invalid", phase: "press" });

    assert.deepEqual(inputs, [
      { action: "select", phase: "press" },
      { action: "rotateRight", phase: "step" },
      { action: "back", phase: "release" }
    ]);
  });

  await t.test("ready and close", () => {
    const v = createView();
    v.sdk.ready();
    v.sdk.close();
    assert.equal(v.sent.length, 2);
    assert.deepEqual(v.sent[0].data, { type: "mzd-gui-ready", token: "test-view-token-123", message: "" });
    assert.deepEqual(v.sent[1].data, { type: "mzd-gui-close", token: "test-view-token-123", message: "" });
  });
});
