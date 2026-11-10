/**
 * GUI runtime: usb/lib/gui-runtime/runtime.js, sdk.js, menu paths, the native list, the language
 * handshake and the Hello World example, with DOM mocks.
 *
 * Every new harness is a separate test. Where the code keeps state over several steps, the steps are one
 * chain of named subtests on one harness. The report shows which step failed.
 *
 * Uses the built-in Node test runner (node:test). Plain `node` runs it too, as CI does.
 * Run:      node --test tests/installer/test-gui-runtime.cjs
 * Coverage: node --test --experimental-test-coverage tests/installer/test-gui-runtime.cjs
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const ROOT = path.join(__dirname, "../..");
const RUNTIME = path.join(ROOT, "usb/lib/gui-runtime/runtime.js");
const SDK = path.join(ROOT, "usb/lib/gui-runtime/sdk.js");
const I18N = path.join(ROOT, "usb/lib/gui-runtime/i18n.js");
const HELLO_VIEW = path.join(
  ROOT,
  "development/examples/gui-hello-world/assets/view.js"
);
const HELLO_I18N = path.join(
  ROOT,
  "development/examples/gui-hello-world/assets/i18n.js"
);
const runtime = fs.readFileSync(RUNTIME, "utf8");
const sdk = fs.readFileSync(SDK, "utf8");

// Run a file of the project in a context; the file name keeps errors and coverage on the right lines.
function load(file, code, context) {
  vm.runInNewContext(code, context, { filename: file });
}

// The Back key, as the runtime receives it.
const BACK = { keyCode: 8, preventDefault() {}, stopImmediatePropagation() {} };

// A fresh CMU page with the OEM framework, the system app and two GUI modules (and any extra ones), with the
// runtime loaded into it. failStartup: the framework throws on start; unavailable: there is no framework yet.
function harness(failStartup = false, unavailable = false, extraModules = []) {
  const listeners = {},
    timeouts = new Map(),
    delays = new Map(),
    intervals = new Map(),
    controls = [];
  let selecting = false;
  let serial = 0,
    context = "Applications",
    currentApp = "system",
    sequence = 66,
    disposed = 0;

  function node(tag) {
    const e = {
      tag,
      style: {},
      children: [],
      parentNode: null,
      appendChild(c) {
        this.children.push(c);
        c.parentNode = this;
      },
      removeChild(c) {
        this.children.splice(this.children.indexOf(c), 1);
        c.parentNode = null;
      }
    };
    Object.defineProperty(e, "innerHTML", {
      set() {
        for (const c of this.children) c.parentNode = null;
        this.children = [];
      }
    });
    if (tag === "iframe")
      e.contentWindow = {
        postMessage() {},
        focus() {},
        MzdGuiModule: {
          _dispose() {
            disposed++;
          }
        }
      };
    return e;
  }

  const baseTemplate = {
    divElt: { style: { visibility: "visible" } },
    list2Ctrl: {
      setLineNumbers() {
        this.restored = true;
      }
    }
  };
  const app = {
    _currentContextTemplate: baseTemplate,
    _masterApplicationDataList: { items: [{ stock: true }] },
    _applicationsCtxtWiseAppNames: { Applications: ["stock"] }
  };

  function System() {}

  System.prototype._initApplicationsDataList = function () {
    return 17;
  };
  System.prototype._updateApplicationStructure = function () {
    return 18;
  };
  let sbName = "Applications";
  const sent = [];
  const sbns = [];
  const fw = {
    common: {
      setSbName(name) {
        sbName = name;
      },
      setSbNameId(uia, id) {
        sbName = id;
      },
      startTimedSbn(uiaId, sbnId, type, props) {
        sbns.push({ uiaId, sbnId, type, props });
      }
    },
    _frameworkState: "idle",
    getCurrentApp: () => currentApp,
    getCurrCtxtId: () => context,
    getCurrCtxtSeqNo: () => sequence,
    getAppInstance() {
      if (failStartup) throw Error("startup failure");
      return app;
    },
    sendEventToMmui() {
      sent.push([...arguments]);
      return 19;
    }
  };
  fw.instantiateControl = function (uia, parent, name, properties) {
    const c = {
      name,
      properties,
      divElt: node("native-list"),
      events: [],
      handleControllerEvent(event) {
        this.events.push(event);
      }
    };
    controls.push(c);
    parent.appendChild(c.divElt);
    return c;
  };
  fw.destroyControl = function (c) {
    assert(
      !selecting,
      "native callback must finish before control destruction"
    );
    c.destroyed = true;
    if (c.divElt.parentNode) c.divElt.parentNode.removeChild(c.divElt);
  };
  const original = {
    init: System.prototype._initApplicationsDataList,
    structure: System.prototype._updateApplicationStructure,
    send: fw.sendEventToMmui
  };
  const win = {
    framework: unavailable ? undefined : fw,
    systemApp: System,
    mzdGuiRegistry: {
      api: 1,
      modules: [
        {
          id: "one",
          menuPath: "",
          label: "One",
          entrypoint: "/data/integration/mzd-gui-modules/one/assets/view.html"
        },
        {
          id: "two",
          menuPath: "Games",
          label: "Two",
          entrypoint: "/data/integration/mzd-gui-modules/two/assets/view.html"
        }
      ].concat(extraModules)
    },
    addEventListener(k, f) {
      (listeners[k] || (listeners[k] = [])).push(f);
    },
    removeEventListener(k, f) {
      listeners[k] = (listeners[k] || []).filter((x) => x !== f);
    },
    setTimeout(f, ms) {
      timeouts.set(++serial, f);
      delays.set(serial, ms);
      return serial;
    },
    clearTimeout(id) {
      timeouts.delete(id);
    },
    setInterval(f) {
      intervals.set(++serial, f);
      return serial;
    },
    clearInterval(id) {
      intervals.delete(id);
    }
  };
  const headNode = node("head");
  const doc = {
    head: headNode,
    body: node("body"),
    createElement: node,
    getElementsByTagName(name) {
      if (name === "head") return [headNode];
      return [];
    },
    getElementById(id) {
      function find(n) {
        if (!n) return null;
        if (n.id === id) return n;
        for (const c of n.children || []) {
          const f = find(c);
          if (f) return f;
        }
        return null;
      }
      return find(headNode) || find(this.body);
    },
    activeElement: { focus() {} }
  };
  load(RUNTIME, runtime, { window: win, document: doc });

  function event(k, data) {
    for (const fn of [...(listeners[k] || [])]) fn(data);
  }

  return {
    win,
    doc,
    app,
    original,
    System,
    sent,
    sbns: () => sbns,
    listeners,
    timeouts,
    intervals,
    controls,
    // Select row `index` of the newest native list, then run the deferred (0 ms) transitions.
    choose(index) {
      const c = controls.filter((x) => !x.destroyed).at(-1);
      selecting = true;
      try {
        c.properties.selectCallback(
          c,
          c.properties.dataList.items[index].appData,
          {}
        );
      } finally {
        selecting = false;
      }
      for (const [id, fn] of [...timeouts])
        if (delays.get(id) === 0) {
          timeouts.delete(id);
          fn();
        }
    },
    title() {
      return sbName;
    },
    open(id) {
      fw.sendEventToMmui(
        "system",
        "MzdGui.Open." + (id === "games" ? "menu.0" : "module." + id)
      );
    },
    context(v, app = "system", seq = sequence) {
      context = v;
      currentApp = app;
      sequence = seq;
    },
    event,
    get disposed() {
      return disposed;
    },
    frame() {
      return (
        doc.body.children[0] &&
        doc.body.children[0].children.find((x) => x.tag === "iframe")
      );
    }
  };
}

test("runtime lifecycle", async (t) => {
  const h = harness();
  let f;

  await t.test(
    "loads no view at boot, adds its rows once and delegates to the stock code",
    () => {
      assert.equal(h.doc.body.children.length, 0, "no view loaded at boot");
      assert.equal(h.app._masterApplicationDataList.items.length, 3);
      assert.equal(
        h.System.prototype._initApplicationsDataList.call(h.app),
        17
      );
      assert.equal(
        h.app._masterApplicationDataList.items.length,
        3,
        "no duplicate rows"
      );
      assert.equal(
        h.win.framework.sendEventToMmui("system", "NativeEvent"),
        19
      );
      assert.deepEqual(h.sent, [["system", "NativeEvent"]]);
    }
  );

  await t.test(
    "opens a view and accepts readiness only from it, with its token",
    () => {
      h.open("one");
      f = h.frame();
      assert(f);
      const token = f.src.split("#mzdgui=")[1];
      h.event("message", {
        source: {},
        data: { type: "mzd-gui-ready", token }
      });
      assert.equal(h.timeouts.size, 1, "foreign source rejected");
      h.event("message", {
        source: f.contentWindow,
        data: { type: "mzd-gui-ready", token: "wrong" }
      });
      assert.equal(h.timeouts.size, 1);
      h.event("message", {
        source: f.contentWindow,
        data: { type: "mzd-gui-ready", token }
      });
      assert.equal(h.timeouts.size, 0);
    }
  );

  await t.test("an error of the view closes it and disposes it once", () => {
    const token = f.src.split("#mzdgui=")[1];
    h.event("message", {
      source: f.contentWindow,
      data: { type: "mzd-gui-error", token, message: "test error" }
    });
    assert.equal(h.doc.body.children.length, 0);
    assert.equal(h.intervals.size, 0);
    assert.equal(h.disposed, 1);
  });

  await t.test(
    "a game that does not start in time returns to the game list",
    () => {
      h.open("games");
      assert(!h.frame());
      h.choose(0);
      f = h.frame();
      const oldError = f.onerror;
      const oldTimeout = [...h.timeouts.values()][0];
      oldTimeout();
      assert(!h.frame(), "game timeout returns to game list");
      assert.equal(h.timeouts.size, 0);
      // The events of the old view must not close the next one.
      h.choose(0);
      const newFrame = h.frame();
      oldError();
      oldTimeout();
      assert.equal(
        h.frame(),
        newFrame,
        "stale view events cannot kill new view"
      );
    }
  );

  await t.test("leaving the Applications context closes everything", () => {
    h.context("Home");
    for (const fn of [...h.intervals.values()]) fn();
    assert.equal(h.doc.body.children.length, 0);
    assert.equal(h.intervals.size, 0);
    assert.equal(h.timeouts.size, 0);
  });
});

test("a failure to deliver input to an unreachable view is contained", () => {
  const h = harness();
  h.open("one");
  h.frame().contentWindow.postMessage = () => {
    throw Error("unreachable view");
  };
  h.event("keyup", BACK);
  assert.equal(h.doc.body.children.length, 0, "input failure contained");
});

test("a partial startup puts the stock code back and removes its listeners", () => {
  const h = harness(true);
  assert.equal(h.win.framework.sendEventToMmui, h.original.send);
  assert.equal(h.System.prototype._initApplicationsDataList, h.original.init);
  assert.equal(
    h.System.prototype._updateApplicationStructure,
    h.original.structure
  );
  assert(
    Object.values(h.listeners).every((x) => x.length === 0),
    "partial startup removes listeners"
  );
});

test("waiting for the framework is bounded", () => {
  const h = harness(false, true);
  assert.equal(h.intervals.size, 1);
  for (let i = 0; i < 120; i++)
    for (const fn of [...h.intervals.values()]) fn();
  assert.equal(h.intervals.size, 0, "framework readiness retries are bounded");
  assert.equal(h.doc.body.children.length, 0);
  assert.equal(h.win.framework, undefined);
});

// SDK validates source/token, contains consumer errors and disposes once.
test("SDK lifecycle", async (t) => {
  const listeners = {};
  const messages = [];
  let cleanup = 0;
  let inputs = 0;
  const parent = {
    postMessage(m) {
      messages.push(m);
    }
  };
  const win = {
    parent,
    location: { hash: "#mzdgui=test-token" },
    addEventListener(k, f) {
      listeners[k] = f;
    },
    removeEventListener(k, f) {
      if (listeners[k] === f) delete listeners[k];
    }
  };
  load(SDK, sdk, { window: win });
  const api = win.MzdGuiModule;
  api.onInput(() => {
    inputs++;
    throw Error("consumer failure");
  });
  api.onDispose(() => {
    cleanup++;
    throw Error("dispose failure");
  });
  const receive = listeners.message;
  const input = {
    type: "mzd-gui-input",
    token: "test-token",
    action: "select",
    phase: "press"
  };

  await t.test("ignores input from another window", () => {
    receive({ source: {}, data: input });
    assert.equal(inputs, 0);
  });

  await t.test(
    "contains a failure of the consumer and reports it to the parent",
    () => {
      receive({ source: parent, data: input });
      assert.equal(inputs, 1);
      assert.equal(messages[0].type, "mzd-gui-error");
    }
  );

  await t.test("survives a parent that is gone", () => {
    parent.postMessage = () => {
      throw Error("parent gone");
    };
    assert.doesNotThrow(() => win.onerror("parent failure"));
  });

  await t.test(
    "disposes once, removes its listeners and restores the error handler",
    () => {
      api._dispose();
      api._dispose();
      assert.equal(cleanup, 1);
      assert.equal(Object.keys(listeners).length, 0);
      receive({ source: parent, data: input });
      assert.equal(inputs, 1);
      assert.equal(win.onerror, undefined, "original error handler restored");
    }
  );
});

test("menu paths", async (t) => {
  const h = harness(false, false, [
    {
      id: "tools-view",
      menuPath: "Tools/Examples",
      label: "Tool",
      entrypoint:
        "/data/integration/mzd-gui-modules/tools-view/assets/view.html"
    },
    {
      id: "other-tool",
      menuPath: "Tools/Examples",
      label: "Other",
      entrypoint:
        "/data/integration/mzd-gui-modules/other-tool/assets/view.html"
    }
  ]);

  await t.test("a shared path creates one top-level entry", () => {
    assert.equal(
      h.app._masterApplicationDataList.items.length,
      4,
      "shared path creates one top-level Tools entry"
    );
    assert.equal(h.app._masterApplicationDataList.items[3].text1, "Tools");
  });

  await t.test("opens the nested menu", () => {
    h.win.framework.sendEventToMmui("system", "MzdGui.Open.menu.1");
    assert(!h.frame());
    h.choose(0);
    assert.equal(h.title(), "Examples");
  });

  await t.test(
    "opens a view of the nested menu and returns to it after an error",
    () => {
      h.choose(0);
      assert(h.frame().src.includes("/tools-view/"));
      h.frame().onerror();
      assert(!h.frame());
      assert(h.title().includes("select an entry"));
    }
  );

  await t.test("Back goes to the parent menu, then out", () => {
    h.event("keyup", BACK);
    assert.equal(h.title(), "Tools");
    h.event("keyup", BACK);
    assert.equal(h.doc.body.children.length, 0);
  });
});

test("a menu path with .. is refused", () => {
  const h = harness(false, false, [
    {
      id: "bad-path",
      menuPath: "Tools/../Examples",
      label: "Invalid",
      entrypoint: "/data/integration/mzd-gui-modules/bad-path/assets/view.html"
    }
  ]);
  assert.equal(h.app._masterApplicationDataList.items.length, 1);
  assert.equal(h.win.framework.sendEventToMmui, h.original.send);
});

test("the Hello World view: ready, input counter, default Back and disposable click handler", () => {
  const helloNodes = { close: {}, input: {}, count: {} };
  const helloApi = {
    onInput(fn) {
      this.input = fn;
    },
    onDispose(fn) {
      this.dispose = fn;
    },
    ready() {
      this.readied = true;
    },
    close() {
      this.closed = true;
    }
  };
  load(HELLO_VIEW, fs.readFileSync(HELLO_VIEW, "utf8"), {
    document: {
      getElementById(id) {
        return helloNodes[id];
      }
    },
    MzdGuiModule: helloApi
  });
  assert(helloApi.readied);
  helloApi.input("select", "press");
  helloApi.input("select", "release");
  assert.equal(helloNodes.count.textContent, "1");
  assert.equal(helloApi.input("back", "step"), false);
  helloNodes.close.onclick();
  assert(helloApi.closed);
  helloApi.dispose();
  assert.equal(helloNodes.close.onclick, null);
});

test("native list", async (t) => {
  const h = harness();
  let native;

  await t.test("only rows with a submenu have an arrow", () => {
    assert.equal(
      h.app._masterApplicationDataList.items[1].hasCaret,
      false,
      "direct view has no submenu arrow"
    );
    assert.equal(h.app._masterApplicationDataList.items[2].hasCaret, true);
  });

  await t.test("a menu is an OEM List2Ctrl without title and arrows", () => {
    h.open("games");
    native = h.controls.at(-1);
    assert.equal(native.name, "List2Ctrl");
    assert.equal(native.properties.titleConfiguration, "noTitle");
    assert.equal(native.properties.dataList.items[0].hasCaret, false);
  });

  await t.test("keys reach the list as native event phases", () => {
    h.event("keydown", {
      keyCode: 40,
      preventDefault() {},
      stopImmediatePropagation() {}
    });
    h.event("keyup", {
      keyCode: 40,
      preventDefault() {},
      stopImmediatePropagation() {}
    });
    assert(
      native.events.includes("downStart") && native.events.includes("down")
    );
  });

  await t.test("Back closes the list and restores the stock screen", () => {
    h.win.framework.sendEventToMmui("system", "Global.GoBack");
    assert.equal(h.doc.body.children.length, 0);
    assert(native.destroyed);
    assert.equal(
      h.app._currentContextTemplate.divElt.style.visibility,
      "visible"
    );
    assert(h.app._currentContextTemplate.list2Ctrl.restored);
    assert.equal(h.title(), "Applications");
    assert.equal(h.sent.length, 0);
  });

  await t.test("the next Back goes to the stock code", () => {
    h.win.framework.sendEventToMmui("system", "Global.GoBack");
    assert.equal(h.sent.length, 1);
  });
});

test("a failing control factory is contained", () => {
  const h = harness();
  h.win.framework.instantiateControl = function () {
    throw Error("factory failed");
  };
  assert.doesNotThrow(() => h.open("games"));
  assert.equal(h.doc.body.children.length, 0);
  assert.equal(h.intervals.size, 0);
  assert.equal(
    h.win.framework.sendEventToMmui("system", "NativeAfterFailure"),
    19
  );
});

test("an invalid returned control is destroyed", () => {
  const h = harness();
  const factory = h.win.framework.instantiateControl;
  h.win.framework.instantiateControl = function () {
    const c = factory.apply(this, arguments);
    delete c.handleControllerEvent;
    return c;
  };
  h.open("games");
  assert.equal(h.doc.body.children.length, 0);
  assert(
    h.controls.every((c) => c.destroyed),
    "invalid returned controls are destroyed"
  );
});

test("no deferred launch after the native context changes", () => {
  const h = harness();
  h.open("games");
  const native = h.controls.at(-1);
  native.properties.selectCallback(
    native,
    native.properties.dataList.items[0].appData,
    {}
  );
  h.context("HomeScreen");
  for (const fn of [...h.timeouts.values()]) fn();
  assert.equal(h.doc.body.children.length, 0);
  assert(!h.frame());
});

// Actual runtime -> SDK -> registered dictionary handshake, including file-origin target.
test("language handshake of runtime, SDK and dictionary", async (t) => {
  const h = harness();
  h.doc.head = {
    appendChild(s) {
      s.parentNode = this;
    },
    removeChild(s) {
      s.parentNode = null;
    }
  };
  h.win.framework.localize = { getCurrentLanguage: () => "de_DE" };
  load(I18N, fs.readFileSync(I18N, "utf8"), { window: h.win, document: h.doc });
  h.win.MzdGuiI18n.start([
    {
      id: "one",
      translations: "/data/integration/mzd-gui-modules/one/assets/i18n.js"
    }
  ]);
  h.open("one");
  const f = h.frame();
  const child = f.contentWindow;
  const childEvents = {};
  const parentProxy = {
    postMessage(data) {
      h.event("message", { source: child, data });
    }
  };
  child.parent = parentProxy;
  child.location = { hash: "#mzdgui=" + f.src.split("#mzdgui=")[1] };
  child.addEventListener = (name, fn) => (childEvents[name] = fn);
  child.removeEventListener = (name) => delete childEvents[name];
  child.postMessage = (data, target) => {
    assert.equal(target, "*");
    if (childEvents.message) childEvents.message({ source: parentProxy, data });
  };
  load(SDK, sdk, { window: child });
  let languageReady = 0;

  await t.test("the view waits for the dictionary", () => {
    child.MzdGuiModule.loadLanguage((language) => {
      languageReady++;
      assert.equal(language, "de_DE");
    });
    assert.equal(languageReady, 0, "startup waits for the dictionary");
  });

  await t.test(
    "the view gets German texts once and keeps defaults for missing ones",
    () => {
      h.win.MzdGuiI18n.register("one", {
        version: 1,
        languages: { en_US: { start: "Start" }, de_DE: { start: "Starten" } }
      });
      assert.equal(languageReady, 1);
      assert.equal(child.MzdGuiModule.t("start", "Start"), "Starten");
      assert.equal(child.MzdGuiModule.t("missing", "Existing"), "Existing");
    }
  );

  await t.test("no language polling", () => {
    assert.equal(
      [...h.intervals.values()].length,
      1,
      "only the existing active-context monitor, no language polling"
    );
  });

  await t.test("an open view keeps its initial language", () => {
    h.win.framework.localize.getCurrentLanguage = () => "en_US";
    assert.equal(
      child.MzdGuiModule.t("start", "Start"),
      "Starten",
      "open view keeps its initial language"
    );
  });

  await t.test("the view can close itself", () => {
    child.MzdGuiModule.close();
    assert.equal(h.doc.body.children.length, 0);
  });
});

test("without translations the runtime still answers a language request with the defaults", () => {
  const h = harness();
  h.open("one");
  const f = h.frame();
  let defaultLanguage;
  f.contentWindow.postMessage = (data, target) => {
    defaultLanguage = data.value;
    assert.equal(target, "*");
  };
  h.event("message", {
    source: f.contentWindow,
    data: {
      type: "mzd-gui-language-request",
      token: f.src.split("#mzdgui=")[1]
    }
  });
  assert.equal(defaultLanguage.language, "en_US");
  assert.deepEqual(Object.keys(defaultLanguage.texts), []);
});

// Translated example: the application changes labels once, preserving local state.
test("the translated Hello World example changes its labels once and keeps its state", () => {
  let exampleDictionary;
  load(HELLO_I18N, fs.readFileSync(HELLO_I18N, "utf8"), {
    window: {
      MzdGuiI18n: {
        register(id, data) {
          assert.equal(id, "gui-hello-world");
          exampleDictionary = data;
        }
      }
    }
  });
  const translatedNodes = {};
  for (const id of [
    "heading",
    "intro",
    "counter-label",
    "back-hint",
    "input",
    "close",
    "count"
  ])
    translatedNodes[id] = { textContent: "" };
  let exampleLocale = "en_US";
  let exampleReady;
  const translatedApi = {
    t(key, fallback, values) {
      const text =
        exampleDictionary.languages[exampleLocale][key] ||
        exampleDictionary.languages.en_US[key] ||
        fallback;
      return text.replace(/\{(\w+)\}/g, (match, name) =>
        values && Object.hasOwn(values, name) ? String(values[name]) : match
      );
    },
    loadLanguage(fn) {
      exampleReady = fn;
    },
    onInput(fn) {
      this.input = fn;
    },
    onDispose(fn) {
      this.dispose = fn;
    },
    ready() {},
    close() {}
  };
  const translatedDocument = {
    documentElement: {},
    getElementById: (id) => translatedNodes[id]
  };
  load(HELLO_VIEW, fs.readFileSync(HELLO_VIEW, "utf8"), {
    document: translatedDocument,
    MzdGuiModule: translatedApi
  });
  translatedApi.input("select", "press");
  exampleLocale = "de_DE";
  exampleReady("de_DE", "ltr");
  assert.equal(translatedNodes.heading.textContent, "Hallo Welt");
  assert.equal(translatedNodes["counter-label"].textContent, "Zähler");
  assert.equal(translatedNodes.close.textContent, "Zurück");
  assert.equal(translatedNodes.count.textContent, "1");
  assert.equal(translatedNodes.input.textContent, "Eingabe: select / press");
  assert.equal(translatedDocument.documentElement.lang, "de-DE");
  assert.equal(translatedApi.input("back", "step"), false);
  translatedApi.dispose();
  assert.equal(translatedNodes.close.onclick, null);
});

test("status-bar layout and phone interruption lifecycle", () => {
// Opt-in status-bar layout uses the authenticated SDK path; other views stay fullscreen.
{
 const h=harness(); h.open('one'); const frame=h.frame(), root=frame.parentNode;
 const token=frame.src.split('#mzdgui=')[1], events={};
 const parent={postMessage(data){h.event('message',{source:frame.contentWindow,data});}};
 const child=frame.contentWindow;
 child.parent=parent;child.location={hash:'#mzdgui='+token};
 child.addEventListener=(name,fn)=>events[name]=fn;child.removeEventListener=name=>delete events[name];
 vm.runInNewContext(sdk,{window:child});
 h.event('message',{source:{},data:{type:'mzd-gui-layout',token,message:'with-status-bar'}});
 assert.notEqual(root.style.top,'64px','foreign frame cannot change layout');
 child.MzdGuiModule.setLayout('with-status-bar');
 assert.equal(root.style.top,'64px');assert.equal(root.style.height,'416px');
 assert.equal(root.style.zIndex,'9','view covers side chrome (8), below status bar (10)');assert.equal(frame.style.height,'416px');assert.equal(h.title(),'One');
 child.MzdGuiModule.setLayout('invalid');assert.equal(root.style.height,'416px');
 child.MzdGuiModule.setLayout('fullscreen');assert.equal(root.style.top,'0px');assert.equal(frame.style.height,'480px');
 child.MzdGuiModule.close();assert.equal(h.title(),'Applications');assert.equal(h.doc.body.children.length,0);
 h.open('games');h.choose(0);assert(h.frame().style.cssText.includes('height:480px'),'next view retains default fullscreen');
}
console.log('GUI_STATUS_BAR_LAYOUT_PASSED: real SDK/runtime opt-in, viewport, title restoration, invalid/foreign requests and unchanged fullscreen defaults.');

// Actual runtime + SDK: retain one opted-in view across a phone interruption.
function callFixture(optIn=true) {
 const h=harness();h.open('one');const frame=h.frame(), child=frame.contentWindow, events={};
 const token=frame.src.split('#mzdgui=')[1], parent={postMessage(data){h.event('message',{source:child,data});}};
 let suspended=0,resumed=0,disposed=0;
 child.parent=parent;child.location={hash:'#mzdgui='+token};
 child.addEventListener=(name,fn)=>events[name]=fn;child.removeEventListener=name=>delete events[name];
 child.postMessage=data=>{if(events.message)events.message({source:parent,data});};
 vm.runInNewContext(sdk,{window:child});
 child.MzdGuiModule.onDispose(()=>disposed++);
 if(optIn){child.MzdGuiModule.onSuspend(()=>suspended++);child.MzdGuiModule.onResume(()=>resumed++);}
 child.MzdGuiModule.ready();
 return {h,frame,child,events,token,parent,tick(){for(const fn of [...h.intervals.values()])fn();},get disposed(){return disposed;},get suspended(){return suspended;},get resumed(){return resumed;}};
}
{
 const c=callFixture();let input=0,consumed=0;c.child.MzdGuiModule.onInput(()=>{input++;return true;});
 c.h.context('ActiveCall','phone',67);c.tick();c.tick();
 assert.equal(c.suspended,1);assert.equal(c.disposed,0);assert.equal(c.frame.parentNode.style.display,'none');
 const key={keyCode:13,preventDefault(){consumed++;},stopImmediatePropagation(){consumed++;}};
 c.h.event('keydown',key);c.events.keydown(key);assert.equal(input,0);assert.equal(consumed,0,'phone input must be released');
 c.h.context('Applications','system',66);c.h.win.framework._frameworkState='transition';c.tick();assert.equal(c.resumed,0);
 const replacement={divElt:{style:{visibility:'visible'}},list2Ctrl:{setLineNumbers(){}}};c.h.app._currentContextTemplate=replacement;
 c.h.win.framework._frameworkState='idle';c.tick();c.tick();
 assert.equal(c.resumed,1);assert.equal(c.h.frame(),c.frame,'same iframe and state retained');assert.equal(replacement.divElt.style.visibility,'hidden');
 c.child.MzdGuiModule.close();assert.equal(c.disposed,1);assert.equal(replacement.divElt.style.visibility,'visible');
}
for(const [context,app,seq] of [['Home','system',68],['NowPlaying','usbaudio',68],['Map','navigation',68],['Applications','system',68],['RecentCalls','phone',68]]) {
 const c=callFixture();c.h.context('IncomingCall','phone',67);c.tick();assert.equal(c.suspended,1);
 c.h.context(context,app,seq);c.tick();assert.equal(c.resumed,0);assert.equal(c.h.doc.body.children.length,0);assert.equal(c.disposed,1);
}
{
 const c=callFixture(false);c.h.context('ActiveCall','phone',67);c.tick();assert.equal(c.h.doc.body.children.length,0,'non-opted-in views still close');
}
{
 const c=callFixture();delete c.h.win.framework.getCurrCtxtSeqNo;c.child.MzdGuiModule.close();c.h.open('one');
 const frame=c.h.frame(), token=frame.src.split('#mzdgui=')[1];
 c.h.event('message',{source:frame.contentWindow,data:{type:'mzd-gui-lifecycle',token,message:'phone'}});
 c.h.event('message',{source:frame.contentWindow,data:{type:'mzd-gui-ready',token}});
 c.h.context('ActiveCall','phone',67);c.tick();assert.equal(c.h.doc.body.children.length,0,'unknown return identity must close safely');
}
console.log('GUI_PHONE_LIFECYCLE_PASSED: actual SDK/runtime suspend/resume, same-frame state, native input release, transition readiness, template replacement, deliberate navigation, no sequence and opt-in only.');

// Mazda ready/displayed callbacks prevent the Applications flash on return.
{
 const c=callFixture(false);let readyCalls=0,displayedCalls=0;
 const originalReady=function(value){readyCalls++;assert.equal(value,'ready-argument');return 17;};
 const originalDisplayed=function(value){displayedCalls++;assert.equal(value,'displayed-argument');return 18;};
 const entry={readyFunction:originalReady,displayedFunction:originalDisplayed};
 c.h.app._contextTable={Applications:entry};
 c.child.MzdGuiModule.onSuspend(()=>{});c.child.MzdGuiModule.onResume(()=>{});
 c.h.context('ActiveCall','phone',67);c.tick();
 c.h.context('Applications','system',66);c.h.win.framework._frameworkState='transition';
 const template={divElt:{className:'List2Tmplt',style:{visibility:'visible'}},list2Ctrl:{setLineNumbers(){}}};
 c.h.app._currentContext={ctxtId:'Applications',contextSeq:66};c.h.app._currentContextTemplate=template;
 assert.equal(entry.readyFunction('ready-argument'),17);assert.equal(readyCalls,1);
 assert(template.divElt.className.includes('MzdGuiReturnMask'),'list masked before its transition begins');
 assert.equal(c.frame.parentNode.style.display,'none','phone remains in front until transition ends');
 c.h.win.framework._frameworkState='idle';
 assert.equal(entry.displayedFunction('displayed-argument'),18);assert.equal(displayedCalls,1);
 assert.equal(c.frame.parentNode.style.display,'','resume is immediate, without waiting for the polling interval');
 assert.equal(template.divElt.style.visibility,'hidden');assert(!template.divElt.className.includes('MzdGuiReturnMask'));
 c.child.MzdGuiModule.close();assert.equal(entry.readyFunction,originalReady);assert.equal(entry.displayedFunction,originalDisplayed);
 assert.equal(template.divElt.style.visibility,'visible');
}
{
 const c=callFixture(false), entry={readyFunction(){}};c.h.app._contextTable={Applications:entry};
 c.child.MzdGuiModule.onSuspend(()=>{});c.child.MzdGuiModule.close();
 assert(!Object.hasOwn(entry,'displayedFunction'),'temporary callback removed exactly on close');
}
console.log('GUI_PHONE_RETURN_TRANSITION_PASSED: masked incoming list, immediate displayed callback, original callback delegation and exact hook cleanup.');

// Real vehicle context names: camera and parking displays share the native return stack.
for (const context of ['BackupCameraDisplay','BUCAndPSMDisplay','ParkingSensorDisplay']) {
 const c=callFixture();c.h.context(context,'backupparking',76);c.tick();
 assert.equal(c.suspended,1);assert.equal(c.disposed,0);assert.equal(c.frame.parentNode.style.display,'none');
 c.h.context('Applications','system',66);c.tick();assert.equal(c.resumed,1);assert.equal(c.h.frame(),c.frame);
 c.child.MzdGuiModule.close();
}
{
 const c=callFixture();
 for (const [context,app,seq] of [['BackupCameraDisplay','backupparking',76],['BUCAndPSMDisplay','backupparking',77],['ParkingSensorDisplay','backupparking',84],['ActiveCall','phone',85],['ParkingSensorDisplay','backupparking',90]]) {
  c.h.context(context,app,seq);c.tick();assert.equal(c.suspended,1);assert.equal(c.resumed,0);assert.equal(c.disposed,0);
 }
 c.h.context('Applications','system',66);c.tick();assert.equal(c.resumed,1);assert.equal(c.h.frame(),c.frame);
 c.child.MzdGuiModule.close();
}
for(const [context,app,seq] of [['HomeScreen','system',93],['Map','navigation',94],['Applications','system',95],['Idle','backupparking',92]]) {
 const c=callFixture();c.h.context('BackupCameraDisplay','backupparking',76);c.tick();
 c.h.context(context,app,seq);c.tick();assert.equal(c.resumed,0);assert.equal(c.disposed,1);
}
for(const [context,app] of [['BackupCameraDisplay','phone'],['OtherDisplay','backupparking']]) {
 const c=callFixture();c.h.context(context,app,76);c.tick();assert.equal(c.disposed,1);
}
{
 const c=callFixture(false);c.h.context('ParkingSensorDisplay','backupparking',90);c.tick();assert.equal(c.disposed,1);
}
console.log('GUI_PARKING_LIFECYCLE_PASSED: three vehicle contexts, chained camera/parking/phone interruptions, same-frame return and safe close on navigation or unrelated contexts.');

});


test("submenu hands focus to the OEM Back arrow and restores Applications", () => {
  const h = harness(), fw = h.win.framework;
  let focused = false, restored = false;
  fw.common.leftBtn = {
    btnInstance: { get hasFocus() { return focused; } },
    handleControllerEvent(event) {
      if (event === "acceptFocusFromRight") { focused = true; return "consumed"; }
      if (event === "lostFocus") { focused = false; return "consumed"; }
      if (event === "right") return "giveFocusRight";
      if (event === "select") { fw.sendEventToMmui("common", "Global.GoBack"); return "consumed"; }
    }
  };
  h.app._currentContextTemplate.handleControllerEvent = event => { restored = event === "acceptFocusFromLeft"; };
  h.open("games");
  const list = h.controls.at(-1);
  assert(list.properties.dataList.items.every(row => row.appData.mzdGuiItem.id !== "exit"), "no redundant Back row");
  list.handleControllerEvent = function(event) {
    this.events.push(event);
    if (event === "leftStart") return "giveFocusLeft";
    return "consumed";
  };
  function key(type, code) { h.event(type,{keyCode:code,preventDefault(){},stopImmediatePropagation(){}}); }
  key("keydown",37); key("keyup",37);
  assert(focused); assert(list.events.includes("lostFocus"));
  key("keydown",39); key("keyup",39);
  assert(!focused); assert(list.events.includes("acceptFocusFromLeft"));
  key("keydown",37); key("keyup",37);
  key("keydown",13); key("keyup",13);
  assert(!focused); assert(restored); assert.equal(h.doc.body.children.length,0);
  assert.equal(h.title(),"Applications");
});

test("toast notifications: routes to MzdGuiResidents when present, falls back to SBN otherwise", async (t) => {
  // Case A: MzdGuiResidents present -> delegated to MzdGuiResidents.notify
  {
    const h = harness();
    h.open("one");
    const f = h.frame();
    const token = f.src.split("#mzdgui=")[1];
    let residentNotified = null;
    h.win.MzdGuiResidents = {
      notify(id, text, isError) {
        residentNotified = { id, text, isError };
        return true;
      }
    };
    h.event("message", {
      source: f.contentWindow,
      data: { type: "mzd-gui-notify", token, text: "Notice from view", isError: false }
    });
    assert.deepEqual(residentNotified, {
      id: "one",
      text: "Notice from view",
      isError: false
    });
    assert.equal(h.sbns().length, 0, "fallback SBN should not be called when MzdGuiResidents.notify is used");
  }

  // Case B: MzdGuiResidents absent -> fallback to startTimedSbn with font-size styling
  {
    const h = harness();
    h.open("one");
    const f = h.frame();
    const token = f.src.split("#mzdgui=")[1];
    delete h.win.MzdGuiResidents;
    const longText = "This notification message is definitely longer than thirty-five characters!";
    h.event("message", {
      source: f.contentWindow,
      data: { type: "mzd-gui-notify", token, text: longText, isError: true }
    });
    assert.equal(h.sbns().length, 1);
    assert.equal(h.sbns()[0].uiaId, "one");
    assert.equal(h.sbns()[0].sbnId, "MzdGuiNotification");
    assert.equal(h.sbns()[0].type, "errorNotification");
    assert.equal(h.sbns()[0].props.sbnStyle, "Style02");
    assert.equal(h.sbns()[0].props.imagePath1, "common/images/icons/IcnSbnSystemError.png");
    assert.equal(h.sbns()[0].props.text1, longText);

    const style = h.doc.head.children.find(e => e.id === "mzd-gui-sbn-style");
    assert(style);
    assert(style.textContent.includes("font-size: 26px !important"));

    // Exact 34 chars with isError: false uses IcnSbnApps.png and resets font override
    const short34 = "1234567890123456789012345678901234";
    h.event("message", {
      source: f.contentWindow,
      data: { type: "mzd-gui-notify", token, text: short34, isError: false }
    });
    assert.equal(h.sbns().length, 2);
    assert.equal(h.sbns()[1].type, "typeD");
    assert.equal(h.sbns()[1].props.imagePath1, "common/images/icons/IcnSbnApps.png");
    assert.equal(h.sbns()[1].props.text1, short34);
    assert.equal(style.textContent, "");

    // Exact 35 chars ("Select at least one slideshow image") switches to 26px font override
    const exact35 = "Select at least one slideshow image";
    h.event("message", {
      source: f.contentWindow,
      data: { type: "mzd-gui-notify", token, text: exact35, isError: true }
    });
    assert.equal(h.sbns().length, 3);
    assert.equal(h.sbns()[2].type, "errorNotification");
    assert.equal(h.sbns()[2].props.imagePath1, "common/images/icons/IcnSbnSystemError.png");
    assert.equal(h.sbns()[2].props.text1, exact35);
    assert(style.textContent.includes("font-size: 26px !important"));
  }
});
