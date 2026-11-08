/**
 * Early error reporting of the installer page: usb/ui/index-template.html.
 *
 * Parse failures in app.js must be reportable before app.js initializes the UI.
 *
 * The early error code keeps state for the life of the page (a counter, a queue, readiness), so that life is
 * one chain of named steps on one page. Independent cases are separate tests.
 *
 * Uses the built-in Node test runner (node:test). Plain `node` runs it too, as CI does.
 * Run:      node --test tests/installer/test-startup-errors.cjs
 * Coverage: node --test --experimental-test-coverage tests/installer/test-startup-errors.cjs
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const file = path.join(__dirname, "../../usb/ui/index-template.html");
const html = fs.readFileSync(file, "utf8");

// One <script> of the page, as code that keeps the positions of the file: everything else is blanked (newlines
// kept), so errors and coverage point at the right line of index-template.html.
function scriptOf(page, wanted) {
  const match = Array.from(page.matchAll(/<script>([\s\S]*?)<\/script>/g)).find(
    (m) => wanted(m[1])
  );
  const start = match.index + "<script>".length;
  const end = start + match[1].length;
  const blank = (text) => text.replace(/[^\n]/g, " ");
  return blank(page.slice(0, start)) + match[1] + blank(page.slice(end));
}

const source = scriptOf(html, (code) => code.includes("window.onerror"));

const ORIGIN = "http://127.0.0.1:1234";
const TOKEN = "test-token";
const TRANSPORT = ORIGIN + "/#" + TOKEN;

// A fresh page: the early error code with a fake window, document and transport frame.
function boot() {
  const sent = [];
  const listeners = {};
  const frame = {
    src: "",
    contentWindow: {
      postMessage(job, origin) {
        sent.push({ job, origin });
      }
    }
  };
  const window = {
    installerConfig: { origin: ORIGIN, token: TOKEN },
    addEventListener(name, fn) {
      listeners[name] = fn;
    }
  };
  const document = {
    getElementById(id) {
      assert.equal(id, "transport");
      return frame;
    }
  };
  vm.runInNewContext(source, { window, document }, { filename: file });
  // The transport frame says it is ready.
  function ready(origin = ORIGIN, token = TOKEN, sender = frame.contentWindow) {
    listeners.message({
      origin,
      source: sender,
      data: { type: "shell-ready", token }
    });
  }

  return { window, frame, sent, ready };
}

test("page lifecycle after a parse error in app.js", async (t) => {
  const x = boot();

  await t.test("does nothing before an error", () => {
    assert.equal(x.sent.length, 0);
    assert.equal(x.frame.src, "");
  });

  await t.test(
    "an error opens the transport but sends nothing before it is ready",
    () => {
      x.window.onerror("Syntax error", "file:///tmp/ui/app.js#private", 198);
      assert.equal(x.frame.src, TRANSPORT);
      assert.equal(x.sent.length, 0);
    }
  );

  await t.test(
    "ignores readiness from a wrong origin, with a wrong token or from another window",
    () => {
      x.ready("http://wrong");
      x.ready(undefined, "wrong");
      x.ready(undefined, undefined, {});
      assert.equal(x.sent.length, 0);
    }
  );

  await t.test(
    "sends the error as a ui-error event without private parts of the path",
    () => {
      x.ready();
      assert.equal(x.sent.length, 1);
      const job = x.sent[0].job;
      assert.deepEqual(Array.from(job.args).slice(0, 3), [
        "./installer.sh",
        "event",
        "ui-error"
      ]);
      assert.match(job.args[3], /Syntax error.*app.js.*line=198/);
      assert(!job.args[3].includes("private"));
      assert.equal(job.program, "/bin/sh");
      assert(job.id < 0);
    }
  );

  await t.test("repeated readiness does not replay logged errors", () => {
    x.ready();
    assert.equal(
      x.sent.length,
      1,
      "Repeated readiness must not replay logged errors"
    );
  });

  await t.test("error logging is bounded", () => {
    for (let i = 0; i < 20; i++)
      x.window.onerror("Repeated error", "app.js", 1);
    assert.equal(x.sent.length, 5, "Error logging is bounded");
  });
});

test("uses a transport that is already open and ready", () => {
  const x = boot();
  x.frame.src = TRANSPORT;
  x.ready();
  x.window.onerror("Runtime error", "app.js", 3);
  assert.equal(x.sent.length, 1);
  assert.equal(x.frame.src, TRANSPORT);
});
