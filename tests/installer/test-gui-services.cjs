/**
 * Services of GUI modules: usb/lib/gui-runtime/services.js and service/bridge.js.
 *
 * Two independent parts, each with its own page: the services client of the GUI page and the bridge inside
 * the service frame. Both keep state (connection, token, pending requests), so each is one chain of named
 * steps. The report shows which step failed.
 *
 * Uses the built-in Node test runner (node:test). Plain `node` runs it too, as CI does.
 * Run:      node --test tests/installer/test-gui-services.cjs
 * Coverage: node --test --experimental-test-coverage tests/installer/test-gui-services.cjs
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const clientFile = path.join(
  __dirname,
  "../../usb/lib/gui-runtime/services.js"
);
const bridgeFile = path.join(
  __dirname,
  "../../usb/lib/gui-runtime/service/bridge.js"
);

const TOKEN_A = "a".repeat(48);
const TOKEN_B = "b".repeat(48);
const ORIGIN_A = "http://127.0.0.1:43210";
const ORIGIN_B = "http://127.0.0.1:43211";

// A fresh GUI page with fake timers, head, body and frames, and the services client loaded into it.
function clientPage() {
  let serial = 0;
  const timers = new Map();
  const events = {};
  const scripts = [];
  const frames = [];
  const sent = [];

  function parent(list) {
    return {
      appendChild(x) {
        x.parentNode = this;
        list.push(x);
      },
      removeChild(x) {
        list.splice(list.indexOf(x), 1);
        x.parentNode = null;
      }
    };
  }

  const window = {
    setTimeout(f) {
      timers.set(++serial, f);
      return serial;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    setInterval(f) {
      window.poll = f;
      return 1;
    },
    clearInterval() {},
    addEventListener(name, f) {
      events[name] = f;
    },
    removeEventListener(name) {
      delete events[name];
    }
  };
  const document = {
    head: parent(scripts),
    body: parent(frames),
    createElement() {
      return {
        style: {},
        contentWindow: {
          postMessage(data, origin) {
            sent.push({ data, origin });
          }
        }
      };
    }
  };
  vm.runInNewContext(
    fs.readFileSync(clientFile, "utf8"),
    { window, document, Date },
    { filename: clientFile }
  );
  // The service frame posts a message to the page.
  function deliver(data, source = frames[0].contentWindow, origin = ORIGIN_A) {
    events.message({ source, origin, data });
  }

  return {
    api: window.MzdGuiServices,
    window,
    timers,
    scripts,
    frames,
    sent,
    deliver
  };
}

test("services client lifecycle", async (t) => {
  const { api, window, timers, scripts, frames, sent, deliver } = clientPage();
  let error;
  let result;
  let connections = 0;
  api.onReady(() => connections++);

  await t.test(
    "refuses a request while starting and loads the connection script",
    () => {
      api.request("one", "get", {}, (e) => (error = e));
      assert.match(error, /starting/);
      assert(scripts[0].src.startsWith("/tmp/mzd-gui-service/connection.js"));
    }
  );

  await t.test("opens one service frame when the connection is known", () => {
    window.mzdGuiServiceConnection = { origin: ORIGIN_A, token: TOKEN_A };
    scripts[0].onload();
    assert.equal(frames.length, 1);
  });

  await t.test("ignores readiness with a wrong token", () => {
    deliver({ type: "mzd-service-ready", token: "wrong" });
    api.request("one", "get", {}, (e) => (error = e));
    assert.match(error, /starting/);
  });

  await t.test("becomes ready with the right token", () => {
    deliver({ type: "mzd-service-ready", token: TOKEN_A });
    assert.equal(connections, 1);
  });

  await t.test(
    "sends a request to the service origin with the module name",
    () => {
      api.request("one", "get", { value: 1 }, (e, r) => {
        error = e;
        result = r;
      });
      assert.equal(sent[0].origin, ORIGIN_A);
      assert.equal(sent[0].data.module, "one");
    }
  );

  await t.test("ignores a result from another window", () => {
    const id = sent[0].data.id;
    deliver(
      { type: "mzd-service-result", token: TOKEN_A, id, result: { ok: true } },
      {}
    );
    assert.equal(result, undefined);
  });

  await t.test(
    "accepts the result from the service frame and clears its timer",
    () => {
      const id = sent[0].data.id;
      deliver({
        type: "mzd-service-result",
        token: TOKEN_A,
        id,
        result: { ok: true }
      });
      assert(result.ok);
      assert.equal(timers.size, 0);
    }
  );

  await t.test(
    "a new connection fails the pending request and replaces the frame",
    () => {
      api.request("one", "get", {}, (e) => (error = e));
      window.mzdGuiServiceConnection = { origin: ORIGIN_B, token: TOKEN_B };
      window.poll();
      scripts[0].onload();
      assert.match(error, /restarted/);
      assert.equal(frames.length, 1);
    }
  );

  await t.test("becomes ready again on the new connection", () => {
    deliver(
      { type: "mzd-service-ready", token: TOKEN_B },
      frames[0].contentWindow,
      ORIGIN_B
    );
    assert.equal(connections, 2);
  });

  await t.test("a request without an answer times out", () => {
    api.request("one", "get", {}, (e) => (error = e));
    [...timers.values()][0]();
    assert.match(error, /timed out/);
  });

  await t.test(
    "disposing is idempotent and removes frames, scripts and timers",
    () => {
      api.dispose();
      api.dispose();
      assert.equal(frames.length, 0);
      assert.equal(scripts.length, 0);
      assert.equal(timers.size, 0);
    }
  );
});

test("service bridge", async (t) => {
  const TOKEN_C = "c".repeat(48);
  const posted = [];
  const handlers = {};
  let xhr;

  function XHR() {
    xhr = this;
    this.headers = {};
    this.open = (method, url) => {
      this.method = method;
      this.path = url;
    };
    this.setRequestHeader = (key, value) => (this.headers[key] = value);
    this.send = (body) => (this.body = body);
  }

  const parentWindow = { postMessage: (data) => posted.push(data) };
  const bridge = {
    location: { hash: "#" + TOKEN_C },
    parent: parentWindow,
    addEventListener: (name, f) => (handlers[name] = f)
  };
  const request = {
    type: "mzd-service-request",
    token: TOKEN_C,
    id: 1,
    module: "one",
    operation: "get",
    args: { value: "literal" }
  };

  await t.test("announces that it is ready", () => {
    vm.runInNewContext(
      fs.readFileSync(bridgeFile, "utf8"),
      { window: bridge, XMLHttpRequest: XHR },
      { filename: bridgeFile }
    );
    assert.equal(posted[0].type, "mzd-service-ready");
  });

  await t.test("ignores a request from another window", () => {
    handlers.message({ source: {}, data: request });
    assert.equal(xhr, undefined);
  });

  await t.test(
    "forwards a request as POST /rpc with the token and the arguments",
    () => {
      handlers.message({ source: parentWindow, data: request });
      assert.equal(xhr.method, "POST");
      assert.equal(xhr.path, "/rpc");
      assert.equal(xhr.headers["X-Mzd-Gui-Token"], TOKEN_C);
      assert.equal(JSON.parse(xhr.body).args.value, "literal");
    }
  );

  await t.test("posts the result back once", () => {
    xhr.status = 200;
    xhr.responseText = JSON.stringify({ result: { ok: true } });
    xhr.onload();
    xhr.onerror();
    assert.equal(posted.length, 2);
    assert(posted[1].result.ok);
    assert.equal(posted[1].id, 1);
  });
});
