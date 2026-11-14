/**
 * Shell transport of the installer page: usb/ui/transport.html.
 *
 * The transport keeps state (a queue, one active request), so its life is one chain of named steps on one
 * page. The report shows which step failed.
 *
 * Uses the built-in Node test runner (node:test). Plain `node` runs it too, as CI does.
 * Run:      node --test tests/installer/test-transport.cjs
 * Coverage: node --test --experimental-test-coverage tests/installer/test-transport.cjs
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const file = path.join(__dirname, "../../usb/ui/transport.html");
const html = fs.readFileSync(file, "utf8");

// The <script> of the page, as code that keeps the positions of the file: everything else is blanked (newlines
// kept), so errors and coverage point at the right line of transport.html.
function scriptOf(page) {
  const match = page.match(/<script>([\s\S]*?)<\/script>/);
  const start = match.index + "<script>".length;
  const end = start + match[1].length;
  const blank = (text) => text.replace(/[^\n]/g, " ");
  return blank(page.slice(0, start)) + match[1] + blank(page.slice(end));
}

const source = scriptOf(html);

// A fresh transport page with a fake parent window and a fake XMLHttpRequest.
function transport() {
  const replies = [];
  const requests = [];
  const listeners = {};
  const parent = {
    postMessage(message) {
      replies.push(message);
    }
  };

  function XHR() {
    requests.push(this);
    this.headers = {};
    this.open = (method, url) => {
      this.method = method;
      this.url = url;
    };
    this.setRequestHeader = (key, value) => {
      this.headers[key] = value;
    };
    this.send = (body) => {
      this.body = body;
    };
  }

  const context = {
    location: { hash: "#secret" },
    XMLHttpRequest: XHR,
    window: {
      parent,
      addEventListener(name, fn) {
        listeners[name] = fn;
      }
    }
  };
  vm.runInNewContext(source, context, { filename: file });
  // The parent asks to run a shell command.
  function send(id, token = "secret", sender = parent) {
    listeners.message({
      source: sender,
      data: {
        type: "shell-exec",
        token,
        id,
        program: "/bin/sh",
        args: ["./installer.sh", "manifest", "ssh"]
      }
    });
  }

  // The local server answers the request number `index`.
  function answer(index, status, text) {
    Object.assign(requests[index], { status, readyState: 4 });
    if (text !== undefined) requests[index].responseText = text;
    requests[index].onreadystatechange();
  }

  return { replies, requests, send, answer };
}

test("transport lifecycle", async (t) => {
  const x = transport();

  await t.test("announces that it is ready", () => {
    assert.equal(x.replies[0].type, "shell-ready");
  });

  await t.test("ignores a wrong token and a foreign window", () => {
    x.send(1, "wrong");
    x.send(1, "secret", {});
    assert.equal(x.requests.length, 0);
  });

  await t.test(
    "sends one request at a time, with the token and the program",
    () => {
      x.send(1);
      x.send(2);
      assert.equal(x.requests.length, 1);
      assert.equal(x.requests[0].headers["X-Poc-Token"], "secret");
      assert.match(x.requests[0].body, /program=%2Fbin%2Fsh/);
    }
  );

  await t.test(
    "passes a critical exit code to the parent and starts the queued request",
    () => {
      x.answer(
        0,
        200,
        '{"started":true,"exitCode":2,"stdout":"","stderr":"critical"}'
      );
      assert.equal(x.replies.at(-1).id, 1);
      assert.equal(x.replies.at(-1).result.exitCode, 2);
      assert.equal(x.requests.length, 2);
    }
  );

  await t.test(
    "reports an unknown outcome when the server fails the queued request",
    () => {
      x.answer(1, 502);
      assert.match(x.replies.at(-1).error, /Outcome may be unknown/);
    }
  );
});
