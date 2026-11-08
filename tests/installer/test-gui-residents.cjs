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

// A fresh page with fake timers, document head and GUI services, and the residents code loaded into it.
function page() {
  const timers = new Map();
  const events = {};
  const scripts = [];
  const calls = [];
  let next = 0;
  const head = {
    appendChild(x) {
      scripts.push(x);
      x.parentNode = this;
    },
    removeChild(x) {
      scripts.splice(scripts.indexOf(x), 1);
      x.parentNode = null;
    }
  };
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
    }
  };
  const document = {
    head,
    createElement() {
      return {};
    }
  };
  vm.runInNewContext(
    fs.readFileSync(file, "utf8"),
    { window, document },
    { filename: file }
  );
  return { api: window.MzdGuiResidents, timers, scripts, calls };
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
