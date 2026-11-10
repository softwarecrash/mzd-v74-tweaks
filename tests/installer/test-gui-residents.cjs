/**
 * Resident code of GUI modules: usb/lib/gui-runtime/residents.js.
 *
 * Residents keep state for the life of the page (booted scripts, registrations, views, timers), so that life
 * is one chain of named steps on one page. The report shows which step failed.
 *
 * Uses the built-in Node test runner (node:test). Plain `node` runs it too, as CI does.
 * Run:      node --test tests/installer/test-gui-residents.cjs
 * Coverage: node --test --experimental-test-coverage tests/installer/test-gui-residents.cjs
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const file = path.join(__dirname, "../../usb/lib/gui-runtime/residents.js");

function createNode(tag) {
  const children = [];
  return {
    tag,
    id: "",
    style: {},
    children,
    className: "",
    textContent: "",
    parentNode: null,
    appendChild(x) {
      children.push(x);
      x.parentNode = this;
    },
    removeChild(x) {
      const idx = children.indexOf(x);
      if (idx >= 0) children.splice(idx, 1);
      x.parentNode = null;
    },
    set innerHTML(v) {
      for (const c of children) c.parentNode = null;
      children.length = 0;
    }
  };
}

// A fresh page with fake timers, document head and GUI services, and the residents code loaded into it.
function page(customFw) {
  const timers = new Map();
  const events = {};
  const scripts = [];
  const calls = [];
  let next = 0;

  const head = createNode("head");
  head.appendChild = function (x) {
    scripts.push(x);
    this.children.push(x);
    x.parentNode = this;
  };
  head.removeChild = function (x) {
    const idx = scripts.indexOf(x);
    if (idx >= 0) scripts.splice(idx, 1);
    const cIdx = this.children.indexOf(x);
    if (cIdx >= 0) this.children.splice(cIdx, 1);
    x.parentNode = null;
  };

  const body = createNode("body");
  const elementsById = {};

  const window = {
    setTimeout(fn) {
      timers.set(++next, fn);
      return next;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    addEventListener(name, fn) {
      events[name] = fn;
    },
    MzdGuiServices: {
      request(id, op, args, cb) {
        calls.push({ id, op, args });
        cb(null, { ok: true });
      }
    },
    framework: customFw || null
  };

  const document = {
    head,
    body,
    documentElement: {
      contains(node) {
        let cur = node;
        while (cur) {
          if (cur === document.documentElement || cur === head || cur === body) return true;
          cur = cur.parentNode;
        }
        return true;
      }
    },
    createElement(tag) {
      const el = createNode(tag);
      return el;
    },
    getElementById(id) {
      if (elementsById[id]) return elementsById[id];
      function findIn(node) {
        if (!node) return null;
        if (node.id === id) return node;
        if (node.children) {
          for (const c of node.children) {
            const found = findIn(c);
            if (found) return found;
          }
        }
        return null;
      }
      return findIn(head) || findIn(body);
    },
    getElementsByTagName(name) {
      if (name === "head") return [head];
      if (name === "body") return [body];
      return [];
    }
  };

  vm.runInNewContext(
    fs.readFileSync(file, "utf8"),
    { window, document },
    { filename: file }
  );

  return { api: window.MzdGuiResidents, window, document, timers, scripts, calls, elementsById };
}

// A GUI module entry with a resident script and a service.
const entry = (id) => ({
  id,
  resident: "/data/integration/mzd-gui-modules/" + id + "/assets/resident.js",
  service: "assets/service.lua"
});

test("residents lifecycle", async (t) => {
  const { api, timers, scripts, calls } = page();
  let context;
  let stops = 0;
  let messages = 0;
  let closed = 0;
  const source = {};
  const view = { source, token: "token" };

  await t.test("boots only the modules that have a resident script", () => {
    api.start([entry("one"), entry("two"), { id: "lazy" }]);
    assert.equal(scripts.length, 2);
  });

  await t.test(
    "registers a booted resident once, refuses a second and an unknown one",
    () => {
      assert(
        api.register("one", (ctx) => {
          context = ctx;
          ctx.onDispose(() => stops++);
          ctx.onMessage(() => messages++);
          ctx.onViewClose(() => closed++);
        })
      );
      assert(!api.register("one", () => {}));
      assert(!api.register("unknown", () => {}));
    }
  );

  await t.test("does not boot a resident twice", () => {
    api.start([entry("one")]);
    assert.equal(scripts.length, 2, "no duplicate boot");
  });

  await t.test(
    "accepts view messages only from the view's window with its token",
    () => {
      api.view("one", view);
      api.message("one", { source: {}, data: { token: "token" } });
      api.message("one", { source, data: { token: "wrong" } });
      assert.equal(messages, 0);
      api.message("one", { source, data: { token: "token" } });
      assert.equal(messages, 1);
    }
  );

  await t.test("scopes service requests to the resident", () => {
    context.service.request("get", {}, (err, result) => assert(result.ok));
    assert.equal(calls[0].id, "one");
  });

  await t.test(
    "closing the view notifies the resident but does not stop it",
    () => {
      api.view("one", null);
      assert.equal(closed, 1);
      assert.equal(stops, 0, "closing a view does not stop its resident");
      assert.equal(context.view(), null);
      api.message("one", { source, data: { token: "token" } });
      assert.equal(messages, 1);
    }
  );

  await t.test("refuses a late registration after the boot timeout", () => {
    assert.equal(timers.size, 1);
    [...timers.values()][0]();
    assert(
      !api.register("two", () => {}),
      "late registration after timeout refused"
    );
  });

  await t.test("stopping is idempotent and removes the script", () => {
    api.stop("one");
    api.stop("one");
    assert.equal(stops, 1);
    assert.equal(scripts.length, 0);
  });

  await t.test("a failing registration is refused and disposed", () => {
    api.start([entry("bad")]);
    assert(
      !api.register("bad", (ctx) => {
        ctx.onDispose(() => stops++);
        throw Error("fixture");
      })
    );
    assert.equal(stops, 2);
  });

  await t.test("disposing is idempotent and clears the timers", () => {
    api.dispose();
    api.dispose();
    assert.equal(stops, 2);
    assert.equal(timers.size, 0);
  });
});

test("residents service request bridge", async (t) => {
  const { api, window } = page();
  const source = {
    sent: [],
    postMessage(data) {
      this.sent.push(data);
    }
  };
  const token = "srv-token-456";
  let residentContext;

  api.start([
    { id: "srv-mod", resident: "/data/integration/mzd-gui-modules/srv-mod/assets/resident.js", service: "service.lua" },
    { id: "fallback-mod", resident: "/data/integration/mzd-gui-modules/fallback-mod/assets/resident.js", service: "service.lua" },
    { id: "no-srv-mod", resident: "/data/integration/mzd-gui-modules/no-srv-mod/assets/resident.js" }
  ]);

  api.register("srv-mod", (ctx) => {
    residentContext = ctx;
    ctx.onServiceRequest((op, args, cb) => {
      if (op === "success") {
        cb(null, { answer: args.input * 2 });
      } else if (op === "fail") {
        cb("Operation refused");
      } else if (op === "crash") {
        throw new Error("Handler exploded");
      } else if (op === "falsy-bool") {
        cb(null, false);
      } else if (op === "falsy-zero") {
        cb(null, 0);
      } else if (op === "falsy-str") {
        cb(null, "");
      }
    });
  });

  api.register("fallback-mod", () => {});
  api.register("no-srv-mod", () => {});

  api.view("srv-mod", { source, token });

  await t.test("dispatches request to resident handler and returns result", () => {
    source.sent.length = 0;
    api.message("srv-mod", {
      source,
      data: {
        type: "mzd-gui-service-request",
        token,
        id: 101,
        operation: "success",
        args: { input: 21 }
      }
    });

    assert.equal(source.sent.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(source.sent[0])), {
      type: "mzd-gui-service-result",
      token,
      id: 101,
      error: null,
      result: { answer: 42 }
    });
  });

  await t.test("returns error when resident callback returns error", () => {
    source.sent.length = 0;
    api.message("srv-mod", {
      source,
      data: {
        type: "mzd-gui-service-request",
        token,
        id: 102,
        operation: "fail",
        args: {}
      }
    });

    assert.equal(source.sent.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(source.sent[0])), {
      type: "mzd-gui-service-result",
      token,
      id: 102,
      error: "Operation refused",
      result: null
    });
  });

  await t.test("catches thrown handler exception and returns error message", () => {
    source.sent.length = 0;
    api.message("srv-mod", {
      source,
      data: {
        type: "mzd-gui-service-request",
        token,
        id: 103,
        operation: "crash",
        args: {}
      }
    });

    assert.equal(source.sent.length, 1);
    assert.equal(source.sent[0].type, "mzd-gui-service-result");
    assert.equal(source.sent[0].id, 103);
    assert.equal(source.sent[0].error, "Handler exploded");
  });

  await t.test("mzd-gui-notify does not leak into resident onMessage handler", () => {
    let receivedMessage = null;
    residentContext.onMessage((ev) => {
      receivedMessage = ev.data;
    });
    api.message("srv-mod", {
      source,
      data: {
        type: "mzd-gui-notify",
        token,
        text: "Test notification",
        isError: false
      }
    });
    assert.equal(receivedMessage, null, "mzd-gui-notify must not leak into resident onMessage");
  });

  await t.test("resident handler returns valid falsy results (false, 0, '') without coercion to null", () => {
    const cases = [
      { op: "falsy-bool", expected: false },
      { op: "falsy-zero", expected: 0 },
      { op: "falsy-str", expected: "" }
    ];
    let reqId = 200;
    for (const c of cases) {
      source.sent.length = 0;
      api.message("srv-mod", {
        source,
        data: {
          type: "mzd-gui-service-request",
          token,
          id: ++reqId,
          operation: c.op,
          args: {}
        }
      });

      assert.equal(source.sent.length, 1);
      assert.equal(source.sent[0].type, "mzd-gui-service-result");
      assert.equal(source.sent[0].id, reqId);
      assert.equal(source.sent[0].error, null);
      assert.strictEqual(source.sent[0].result, c.expected);
    }
  });

  await t.test("falls back to MzdGuiServices when no serviceRequest handler registered", () => {
    const fbSource = {
      sent: [],
      postMessage(data) { this.sent.push(data); }
    };
    api.view("fallback-mod", { source: fbSource, token: "fb-token" });

    api.message("fallback-mod", {
      source: fbSource,
      data: {
        type: "mzd-gui-service-request",
        token: "fb-token",
        id: 104,
        operation: "stock-op",
        args: { a: 1 }
      }
    });

    assert.equal(fbSource.sent.length, 1);
    assert.deepEqual(JSON.parse(JSON.stringify(fbSource.sent[0])), {
      type: "mzd-gui-service-result",
      token: "fb-token",
      id: 104,
      error: null,
      result: { ok: true }
    });
  });

  await t.test("MzdGuiServices fallback preserves valid falsy results (false, 0, '') without coercion to null", () => {
    const fbSource = {
      sent: [],
      postMessage(data) { this.sent.push(data); }
    };
    api.view("fallback-mod", { source: fbSource, token: "fb-token" });

    const falsyCases = [false, 0, ""];
    let reqId = 300;
    for (const val of falsyCases) {
      fbSource.sent.length = 0;
      const origReq = window.MzdGuiServices.request;
      window.MzdGuiServices.request = (id, op, args, cb) => { cb(null, val); };

      api.message("fallback-mod", {
        source: fbSource,
        data: {
          type: "mzd-gui-service-request",
          token: "fb-token",
          id: ++reqId,
          operation: "falsy-op",
          args: {}
        }
      });

      assert.equal(fbSource.sent.length, 1);
      assert.equal(fbSource.sent[0].error, null);
      assert.strictEqual(fbSource.sent[0].result, val);
      window.MzdGuiServices.request = origReq;
    }
  });

  await t.test("returns unavailable error when module has no service", () => {
    const noSrvSource = {
      sent: [],
      postMessage(data) { this.sent.push(data); }
    };
    api.view("no-srv-mod", { source: noSrvSource, token: "no-token" });

    api.message("no-srv-mod", {
      source: noSrvSource,
      data: {
        type: "mzd-gui-service-request",
        token: "no-token",
        id: 105,
        operation: "any-op",
        args: {}
      }
    });

    assert.equal(noSrvSource.sent.length, 1);
    assert.equal(noSrvSource.sent[0].error, "Module service is unavailable.");
  });
});

test("residents notifications, units and applications context", async (t) => {
  const sbns = [];
  const systemApp = {
    _currentContextTemplate: {
      lastEvent: null,
      handleControllerEvent(e) { this.lastEvent = e; },
      list2Ctrl: {
        restoredLines: false,
        setLineNumbers() { this.restoredLines = true; }
      }
    }
  };

  const fw = {
    currApp: "system",
    currCtxt: "Applications",
    getCurrentApp() { return this.currApp; },
    getCurrCtxtId() { return this.currCtxt; },
    getAppInstance(app) {
      if (app === "system") return systemApp;
      return null;
    },
    common: {
      sbName: "",
      setSbName(v) { this.sbName = v; },
      setSbNameId(app, id) { this.sbName = id; },
      startTimedSbn(uiaId, sbnId, type, props) {
        sbns.push({ uiaId, sbnId, type, props });
      }
    },
    localize: {
      getDistanceUnit() { return "Miles"; },
      getTemperatureUnit() { return "Fahrenheit"; },
      getCurrentLanguage() { return "en_US"; }
    }
  };

  const { api, document } = page(fw);

  await t.test("inApplications returns true only when app=system and ctxt=Applications", () => {
    assert.equal(api.inApplications(), true);
    fw.currApp = "settings";
    assert.equal(api.inApplications(), false);
    fw.currApp = "system";
    fw.currCtxt = "Diagnostics";
    assert.equal(api.inApplications(), false);
    fw.currCtxt = "Applications";
    assert.equal(api.inApplications(), true);
  });

  await t.test("inApplications safely returns false when fw.getCurrCtxtId is not a function", () => {
    const origGetCtxt = fw.getCurrCtxtId;
    delete fw.getCurrCtxtId;
    assert.doesNotThrow(() => {
      assert.equal(api.inApplications(), false);
    });
    fw.getCurrCtxtId = "not-a-function";
    assert.doesNotThrow(() => {
      assert.equal(api.inApplications(), false);
    });
    fw.getCurrCtxtId = origGetCtxt;
    assert.equal(api.inApplications(), true);
  });

  await t.test("notify creates Style02 SBN for short text without font override", () => {
    sbns.length = 0;
    const ok = api.notify("test-app", "Short notice", false);
    assert.equal(ok, true);
    assert.equal(sbns.length, 1);
    assert.equal(sbns[0].uiaId, "test-app");
    assert.equal(sbns[0].type, "typeD");
    assert.equal(sbns[0].props.sbnStyle, "Style02");
    assert.equal(sbns[0].props.text1, "Short notice");

    const style = document.getElementById("mzd-gui-sbn-style");
    assert(style);
    assert.equal(style.textContent, "");
  });

  await t.test("notify successfully starts SBN toast for non-resident module ID", () => {
    sbns.length = 0;
    // Calling notify for a non-resident module ID (e.g. game or simple extension without resident.js)
    const ok = api.notify("minesweeper", "New high score!", false);
    assert.equal(ok, true);
    assert.equal(sbns.length, 1);
    assert.equal(sbns[0].uiaId, "minesweeper");
    assert.equal(sbns[0].type, "typeD");
    assert.equal(sbns[0].props.text1, "New high score!");

    const okErr = api.notify("tetris", "Score save error", true);
    assert.equal(okErr, true);
    assert.equal(sbns.length, 2);
    assert.equal(sbns[1].uiaId, "tetris");
    assert.equal(sbns[1].type, "errorNotification");
    assert.equal(sbns[1].props.text1, "Score save error");
    assert.equal(sbns[1].props.imagePath1, "common/images/icons/IcnSbnSystemError.png");
  });

  await t.test("notify applies 26px font override for text exceeding 34 chars", () => {
    sbns.length = 0;
    const exact34 = "1234567890123456789012345678901234";
    api.notify("test-app", exact34, false);
    let style = document.getElementById("mzd-gui-sbn-style");
    assert.equal(style.textContent, "");

    const exact35 = "Select at least one slideshow image";
    api.notify("test-app", exact35, true);
    assert.equal(sbns.length, 2);
    assert.equal(sbns[1].type, "errorNotification");
    assert.equal(sbns[1].props.text1, exact35);

    style = document.getElementById("mzd-gui-sbn-style");
    assert(style);
    assert(style.textContent.includes("font-size: 26px !important"));
  });

  await t.test("units converts framework localization values", () => {
    const u1 = api.units("mod");
    assert.equal(u1.speedUnit, "mph");
    assert.equal(u1.distanceUnit, "mi");
    assert.equal(u1.tempUnit, "F");
    assert.equal(u1.language, "en_US");

    fw.localize.getDistanceUnit = () => "Kilometers";
    fw.localize.getTemperatureUnit = () => "Celsius";
    fw.localize.getCurrentLanguage = () => "de_DE";

    const u2 = api.units("mod");
    assert.equal(u2.speedUnit, "kmh");
    assert.equal(u2.distanceUnit, "km");
    assert.equal(u2.tempUnit, "C");
    assert.equal(u2.language, "de_DE");
  });

  await t.test("returnToApplications hands focus back to template and sets Applications title", () => {
    fw.currApp = "system";
    fw.currCtxt = "Applications";
    api.returnToApplications();
    const appInst = fw.getAppInstance("system");
    assert.equal(appInst._currentContextTemplate.lastEvent, "acceptFocusFromLeft");
    assert.equal(appInst._currentContextTemplate.list2Ctrl.restoredLines, true);
    assert.equal(fw.common.sbName, "Applications");
  });
});

test("createNativeMenu full features", async (t) => {
  let instantiatedControl = null;
  const controlEvents = [];
  const appTemplateEvents = [];
  let appLinesRestored = 0;
  let instantiatedTemplate = null;
  let capturedContext = { focussedItem: 0, topItem: 0 };
  let statusTitle = "";

  const customFw = {
    currApp: "system",
    currCtxt: "Applications",
    getCurrentApp() { return this.currApp; },
    getCurrCtxtId() { return this.currCtxt; },
    getAppInstance() {
      return {
        _currentContextTemplate: {
          handleControllerEvent(e) { appTemplateEvents.push(e); },
          list2Ctrl: { setLineNumbers() { appLinesRestored++; } }
        }
      };
    },
    common: {
      setSbName(name) { statusTitle = name; },
      setSbNameId(app, id) { statusTitle = id; }
    },
    _templatesLoaded: { Dialog3Tmplt: { isLoaded: true } },
    _controlsLoaded: { Dialog3Ctrl: { isLoaded: true }, ButtonCtrl: { isLoaded: true } },
    instantiateControl(app, container, type, config) {
      instantiatedControl = {
        container,
        type,
        config,
        handleControllerEvent(event) {
          controlEvents.push(event);
          return "consumed";
        },
        getContextCapture() {
          return capturedContext;
        },
        restoreContext(ctx) {
          capturedContext = ctx;
        },
        setDataListAndUpdateItems(dl) {
          this.dataList = dl;
        }
      };
      return instantiatedControl;
    },
    destroyControl(ctrl) {
      if (ctrl === instantiatedControl) instantiatedControl = null;
    },
    instantiateTemplate(app, container, type, config) {
      instantiatedTemplate = {
        container,
        type,
        config,
        dialog3Ctrl: config.Dialog3Ctrl,
        handleControllerEvent(event) {
          controlEvents.push("dialog:" + event);
          return "consumed";
        },
        cleanUp() {
          this.cleanedUp = true;
        }
      };
      return instantiatedTemplate;
    }
  };

  const { api, window, timers } = page(customFw);
  window.Dialog3Tmplt = function () {};

  function makeFrame() {
    const parent = createNode("div");
    const frame = createNode("iframe");
    frame.contentWindow = {
      messages: [],
      postMessage(msg) { this.messages.push(msg); }
    };
    parent.appendChild(frame);
    return { parent, frame };
  }

  await t.test("renders menu items, formats labels and handles selection", () => {
    const { frame } = makeFrame();
    const menu = api.createNativeMenu({ prefix: "custom" });
    const token = "tok-menu-1";

    menu.render(frame, token, {
      title: "WallpaperConfig.png",
      page: "main",
      index: 1,
      rows: [
        { label: "Option 1" },
        { label: "Option 2", checkable: true, checked: true, radio: true },
        { label: "Option 3", detail: "Subtitle detail", caret: true },
        { label: "Option 4", disabled: true }
      ]
    });

    assert.equal(statusTitle, "WallpaperConfig");
    assert(instantiatedControl);
    assert.equal(instantiatedControl.config.focussedItem, 1);

    const items = instantiatedControl.config.dataList.items;
    assert.equal(items.length, 4);
    assert.equal(items[0].text1, "Option 1");
    assert.equal(items[0].itemStyle, "style01");

    assert.equal(items[1].text1, "Option 2");
    assert.equal(items[1].itemStyle, "style03");
    assert.equal(items[1].image1, "radio");
    assert.equal(items[1].checked, true);

    assert.equal(items[2].text1, "Option 3");
    assert.equal(items[2].label1, "Subtitle detail");
    assert.equal(items[2].itemStyle, "style06");
    assert.equal(items[2].hasCaret, true);

    assert.equal(items[3].disabled, true);

    // Test selection callback triggering postMessage
    instantiatedControl.config.selectCallback(instantiatedControl, { itemIndex: 2 });
    assert.equal(timers.size, 1);
    const cb = [...timers.values()][0];
    cb();

    assert.equal(frame.contentWindow.messages.length, 1);
    assert.equal(frame.contentWindow.messages[0].type, "custom-native-select");
    assert.equal(frame.contentWindow.messages[0].token, token);
    assert.equal(frame.contentWindow.messages[0].index, 2);

    menu.close();
  });

  await t.test("dispatches rotary and directional input to control", () => {
    const { frame } = makeFrame();
    const menu = api.createNativeMenu({ prefix: "custom" });
    const token = "tok-input";

    menu.render(frame, token, {
      title: "InputTest",
      page: "main",
      rows: [{ label: "Row 1" }, { label: "Row 2" }]
    });

    controlEvents.length = 0;
    frame.contentWindow.messages.length = 0;

    menu.input(frame, token, "rotateRight", "step");
    assert(controlEvents.includes("cw"));

    menu.input(frame, token, "rotateLeft", "step");
    assert(controlEvents.includes("ccw"));

    menu.input(frame, token, "down", "step");
    assert(controlEvents.includes("downStart"));
    assert(controlEvents.includes("down"));

    assert.equal(frame.contentWindow.messages.length, 3);
    assert.equal(frame.contentWindow.messages[2].type, "custom-native-focus");
    assert.equal(frame.contentWindow.messages[2].index, 0);

    menu.close();
  });

  await t.test("split preview pane renders safe image and ignores untrusted URL", () => {
    const { frame } = makeFrame();
    const menu = api.createNativeMenu({ prefix: "custom", split: true });
    const token = "tok-split";

    menu.render(frame, token, {
      title: "SplitTest",
      page: "split",
      split: true,
      rows: [{ label: "Item" }],
      rightPreview: {
        url: "http://localhost:8091/usb-image/sample.jpg",
        label: "Sample Wallpaper"
      }
    });

    const session = menu.getSession();
    assert(session.previewPane);
    const img = session.previewPane.children.find((c) => c.tag === "img");
    assert(img);
    assert.equal(img.src, "http://localhost:8091/usb-image/sample.jpg");

    const caption = session.previewPane.children.find((c) => c.tag === "div");
    assert(caption);
    assert.equal(caption.textContent, "Sample Wallpaper");

    // Untrusted URL should not render an img tag
    menu.render(frame, token, {
      title: "SplitTest",
      page: "split-untrusted",
      split: true,
      rows: [{ label: "Item" }],
      rightPreview: {
        url: "https://evil.example.com/exploit.jpg",
        error: "Untrusted source"
      }
    });

    const untrustedImg = session.previewPane.children.find((c) => c.tag === "img");
    assert.equal(untrustedImg, undefined);
    const errorCaption = session.previewPane.children.find((c) => c.tag === "div");
    assert.equal(errorCaption.textContent, "Untrusted source");

    // Base64 PNG data URL generated by preview services should be accepted
    const base64Url = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    menu.render(frame, token, {
      title: "SplitTest",
      page: "split-base64",
      split: true,
      rows: [{ label: "Item" }],
      rightPreview: {
        url: base64Url,
        label: "Preview Artwork.png"
      }
    });

    const b64Img = session.previewPane.children.find((c) => c.tag === "img");
    assert(b64Img);
    assert.equal(b64Img.src, base64Url);
    const b64Caption = session.previewPane.children.find((c) => c.tag === "div");
    assert(b64Caption);
    assert.equal(b64Caption.textContent, "Preview Artwork", "caption strips file extension");

    // Untrusted data scheme (non-PNG) should not render an img tag
    menu.render(frame, token, {
      title: "SplitTest",
      page: "split-bad-data",
      split: true,
      rows: [{ label: "Item" }],
      rightPreview: {
        url: "data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==",
        error: "Bad data URL"
      }
    });

    const badDataImg = session.previewPane.children.find((c) => c.tag === "img");
    assert.equal(badDataImg, undefined);

    // Leaving split view must reset container class name and hide preview pane
    menu.render(frame, token, {
      title: "NormalView",
      page: "home",
      split: false,
      rows: [{ label: "Home Item" }]
    });
    assert.equal(session.container.className, "TemplateWithStatusLeft List2Tmplt");
    assert.equal(session.previewPane.style.display, "none");

    menu.close();
  });

  await t.test("splitClass customizes split container class name and style rules", () => {
    const { frame } = makeFrame();
    const menu = api.createNativeMenu({ prefix: "custom", splitClass: "customSplitClass" });
    const token = "tok-custom-split";

    menu.render(frame, token, {
      title: "CustomSplitTest",
      page: "split",
      split: true,
      rows: [{ label: "Item" }]
    });

    const session = menu.getSession();
    assert.equal(session.container.className, "TemplateWithStatusLeft List2Tmplt customSplitClass");
    assert(session.splitStyle);
    assert(session.splitStyle.textContent.indexOf(".customSplitClass .List2Ctrl") >= 0);

    menu.close();
  });

  await t.test("splitClass sanitizes leading dots, whitespace, and falls back to default", () => {
    const { frame: frame1 } = makeFrame();
    const menuDot = api.createNativeMenu({ prefix: "custom", splitClass: "  .dottedSplit  " });
    const token1 = "tok-dot-split";

    menuDot.render(frame1, token1, {
      title: "DotSplitTest",
      page: "split",
      split: true,
      rows: [{ label: "Item" }]
    });

    const session1 = menuDot.getSession();
    assert.equal(session1.container.className, "TemplateWithStatusLeft List2Tmplt dottedSplit");
    assert(session1.splitStyle.textContent.indexOf(".dottedSplit .List2Ctrl") >= 0);
    menuDot.close();

    const { frame: frame2 } = makeFrame();
    const menuBlank = api.createNativeMenu({ prefix: "custom", split: true, splitClass: "   " });
    const token2 = "tok-blank-split";

    menuBlank.render(frame2, token2, {
      title: "BlankSplitTest",
      page: "split",
      split: true,
      rows: [{ label: "Item" }]
    });

    const session2 = menuBlank.getSession();
    assert.equal(session2.container.className, "TemplateWithStatusLeft List2Tmplt wallpaperImportSplit");
    assert(session2.splitStyle.textContent.indexOf(".wallpaperImportSplit .List2Ctrl") >= 0);
    menuBlank.close();
  });

  await t.test("confirmation dialog lifecycle and select callback", () => {
    const { frame } = makeFrame();
    const menu = api.createNativeMenu({ prefix: "custom", dialog: true });
    const token = "tok-dialog";

    menu.render(frame, token, {
      title: "DialogTest",
      page: "p1",
      rows: [{ label: "Show Dialog" }]
    });

    frame.contentWindow.messages.length = 0;

    menu.dialog(frame, token, {
      text: "Confirm delete?",
      initialFocus: 1,
      buttons: [
        { value: "cancel", label: "Cancel" },
        { value: "confirm", label: "Delete" }
      ]
    });

    assert(instantiatedTemplate);
    assert.equal(instantiatedTemplate.dialog3Ctrl.buttonCount, 2);
    assert.equal(instantiatedTemplate.dialog3Ctrl.initialFocus, 1);
    assert.equal(instantiatedTemplate.dialog3Ctrl.text1, "Confirm delete?");

    // Simulate clicking Confirm
    instantiatedTemplate.dialog3Ctrl.defaultSelectCallback(null, "confirm");

    assert.equal(frame.contentWindow.messages.length, 1);
    assert.equal(frame.contentWindow.messages[0].type, "custom-native-dialog-select");
    assert.equal(frame.contentWindow.messages[0].value, "confirm");

    // Close dialog
    menu.dialog(frame, token, null);
    assert.equal(menu.getSession().dialog, null);
    assert.equal(menu.getSession().signature, null, "dialog destruction clears signature to allow DOM check state resync");

    // Re-rendering after dialog destruction must call setDataListAndUpdateItems even with identical menu
    let itemsUpdated = false;
    instantiatedControl.setDataListAndUpdateItems = () => { itemsUpdated = true; };
    menu.render(frame, token, {
      title: "DialogTest",
      page: "p1",
      rows: [{ label: "Show Dialog" }]
    });
    assert.equal(itemsUpdated, true, "render resynchronizes items when signature was cleared by dialog destroy");

    // selectCallback on control must also clear session.signature
    assert.notEqual(menu.getSession().signature, null);
    instantiatedControl.config.selectCallback(instantiatedControl, { appData: { index: 0 } });
    assert.equal(menu.getSession().signature, null, "selectCallback clears signature");

    menu.close();
  });

  await t.test("close() defaults leaving to true and returns to Applications", () => {
    const { frame } = makeFrame();
    const menu = api.createNativeMenu({ prefix: "custom" });
    const token = "tok-close";

    menu.render(frame, token, {
      title: "CloseTest",
      page: "p1",
      rows: [{ label: "Row" }]
    });

    appTemplateEvents.length = 0;
    appLinesRestored = 0;
    statusTitle = "CloseTest";

    // close() without arguments defaults leaving to true
    menu.close();

    assert.equal(statusTitle, "Applications");
    assert(appTemplateEvents.includes("acceptFocusFromLeft"));
    assert.equal(appLinesRestored, 1);
  });

  await t.test("close(false) does not return to Applications", () => {
    const { frame } = makeFrame();
    const menu = api.createNativeMenu({ prefix: "custom" });
    const token = "tok-close-false";

    menu.render(frame, token, {
      title: "StayOpen",
      page: "p1",
      rows: [{ label: "Row" }]
    });

    appTemplateEvents.length = 0;
    appLinesRestored = 0;
    statusTitle = "StayOpen";

    // close(false) should NOT restore Applications
    menu.close(false);

    assert.equal(statusTitle, "StayOpen");
    assert.equal(appTemplateEvents.length, 0);
    assert.equal(appLinesRestored, 0);

    // close(false) followed by close() restores Applications
    const menuSecond = api.createNativeMenu({ prefix: "custom" });
    menuSecond.render(frame, token, {
      title: "SecondMenu",
      page: "p1",
      rows: [{ label: "Row" }]
    });

    statusTitle = "SecondMenu";
    appTemplateEvents.length = 0;
    appLinesRestored = 0;

    menuSecond.close(false);

    assert.equal(statusTitle, "SecondMenu");
    assert.equal(appTemplateEvents.length, 0);
    assert.equal(appLinesRestored, 0);

    // close() without arguments restores Applications
    menuSecond.close();
    assert.equal(statusTitle, "Applications");
    assert(appTemplateEvents.includes("acceptFocusFromLeft"));
    assert.equal(appLinesRestored, 1);
  });
});
