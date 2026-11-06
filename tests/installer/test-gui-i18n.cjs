/**
 * Translations of GUI modules: usb/lib/gui-runtime/i18n.js and the Tetris catalog.
 *
 * The translations keep state for the life of the page (the loaded dictionary, the startup language, the
 * callbacks), so that life is one chain of named steps. The other cases use a fresh page each and are
 * separate tests. The Tetris catalog is checked locale by locale.
 *
 * Uses the built-in Node test runner (node:test). Plain `node` runs it too, as CI does.
 * Run:      node --test tests/installer/test-gui-i18n.cjs
 * Coverage: node --test --experimental-test-coverage tests/installer/test-gui-i18n.cjs
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const file = path.join(__dirname, "../../usb/lib/gui-runtime/i18n.js");
const tetrisFile = path.join(
  __dirname,
  "../../usb/tweaks/tetris/assets/i18n.js"
);
const source = fs.readFileSync(file, "utf8");

// A fresh page with fake timers, head and Opera framework, and the translations code loaded into it.
function fixture(language = "de_DE") {
  const intervals = new Map();
  const timers = new Map();
  const loads = [];
  const events = {};
  let serial = 0;
  let logs = 0;
  const head = {
    appendChild(script) {
      script.parentNode = head;
      loads.push(script);
    },
    removeChild(script) {
      script.parentNode = null;
    }
  };
  const doc = { head, createElement: () => ({}), documentElement: head };
  const win = {
    framework: {
      localize: {
        getCurrentLanguage: () => language,
        getLangInGuiFormat: () => "de_DE"
      }
    },
    log: { info: () => logs++ },
    addEventListener: (name, f) => (events[name] = f),
    setInterval: (f) => {
      intervals.set(++serial, f);
      return serial;
    },
    clearInterval: (n) => intervals.delete(n),
    setTimeout: (f) => {
      timers.set(++serial, f);
      return serial;
    },
    clearTimeout: (n) => timers.delete(n)
  };
  vm.runInNewContext(
    source,
    { window: win, document: doc },
    { filename: file }
  );
  const api = win.MzdGuiI18n;
  return {
    api,
    loads,
    intervals,
    timers,
    events,
    get logs() {
      return logs;
    },
    setLanguage(value) {
      language = value;
    },
    // The dictionary script of the module registers its value and finishes loading.
    complete(value) {
      api.register("test", value);
      loads.at(-1).onload();
    }
  };
}

// A GUI module entry with a translations file.
const entry = {
  id: "test",
  translations: "/data/integration/mzd-gui-modules/test/assets/i18n.js"
};

test("translations lifecycle", async (t) => {
  const f = fixture();
  const changes = [];
  let off;

  await t.test("does no work for a module without translations", () => {
    f.api.start([{ id: "plain" }]);
    assert.equal(f.loads.length, 0);
    assert.equal(f.intervals.size, 0, "no manifest declaration, no work");
  });

  await t.test(
    "loads the dictionary script and uses the default text until it arrives",
    () => {
      f.api.start([entry]);
      assert.equal(f.loads.length, 1);
      assert.equal(f.api.text("test", "start", "Start"), "Start");
    }
  );

  await t.test("waits for the dictionary before calling back", () => {
    off = f.api.load("test", (v) => changes.push(v));
    assert.equal(
      changes.length,
      0,
      "wait for dictionary before choosing texts"
    );
  });

  await t.test(
    "chooses exact, base language, English and default texts, with placeholders",
    () => {
      f.complete({
        version: 1,
        languages: {
          en_US: {
            start: "Start",
            missing: "English",
            result: "Score {score}"
          },
          de: { base: "Basis" },
          de_DE: { start: "Starten", result: "Punkte {score}" },
          ar_SA: { start: "ابدأ" }
        }
      });
      assert.equal(f.api.text("test", "start", "Default"), "Starten");
      assert.equal(f.api.text("test", "base", "Default"), "Basis");
      assert.equal(f.api.text("test", "missing", "Default"), "English");
      assert.equal(
        f.api.text("test", "result", "Default", { score: 123 }),
        "Punkte 123"
      );
    }
  );

  await t.test("keeps the existing text for an unknown key", () => {
    assert.equal(
      f.api.text("test", "unknown", "Existing text"),
      "Existing text"
    );
  });

  await t.test(
    "an opened view keeps its startup language; texts follow the current language",
    () => {
      f.setLanguage("zz_ZZ");
      assert.equal(
        changes[0].language,
        "de_DE",
        "opened view keeps its startup selection"
      );
      assert.equal(f.api.text("test", "start", "Default"), "Start");
      f.setLanguage("de_AT");
      assert.equal(f.api.text("test", "start", "Default"), "Starten");
    }
  );

  await t.test(
    "reports right-to-left languages and normalizes language names",
    () => {
      f.setLanguage("ar_SA");
      assert.equal(f.api.snapshot("test").direction, "rtl");
      f.setLanguage("LANGS_DE_GERMAN");
      assert.equal(f.api.snapshot("test").language, "de_DE");
    }
  );

  await t.test(
    "calls back once, can be cancelled, does not poll and is silent about missing texts",
    () => {
      const count = changes.length;
      assert.equal(count, 1, "one callback after dictionary load");
      off();
      f.setLanguage("en_US");
      assert.equal(changes.length, count);
      assert.equal(f.intervals.size, 0, "no language polling");
      for (let i = 0; i < 100; i++) f.api.text("test", "absent", "Fallback");
      assert.equal(f.logs, 0, "missing translations stay silent");
    }
  );

  await t.test("cleans up on unload", () => {
    f.events.unload();
    assert.equal(f.intervals.size, 0);
  });
});

for (const text of ["not json", "[]", '{"version":2,"languages":{}}']) {
  test("ignores an invalid dictionary: " + text, () => {
    const f = fixture();
    f.api.start([entry]);
    f.complete(text);
    assert.equal(f.api.text("test", "start", "Start"), "Start");
    assert.equal(f.logs, 0);
    f.events.unload();
  });
}

test("gives up on a dictionary that does not load in time", () => {
  const f = fixture();
  f.api.start([entry]);
  for (const fn of [...f.timers.values()]) fn();
  assert.equal(f.loads[0].parentNode, null);
  assert.equal(f.api.text("test", "start", "Start"), "Start");
  f.events.unload();
});

test("refuses a translations path outside the module", () => {
  const f = fixture();
  f.api.start([
    {
      id: "test",
      translations: "/data/integration/mzd-gui-modules/test/assets/../other.js"
    }
  ]);
  assert.equal(f.loads.length, 0);
});

test("a dictionary that fails to load falls back silently", () => {
  const f = fixture();
  f.api.start([entry]);
  let fallbackReady = 0;
  f.api.load("test", (value) => {
    fallbackReady++;
    assert.equal(value.language, "de_DE");
  });
  assert.equal(f.loads[0].charset, "utf-8");
  f.loads[0].onerror({ preventDefault() {} });
  assert.equal(fallbackReady, 1);
  assert.equal(f.logs, 0);
});

test("a cancelled load is not called back", () => {
  const f = fixture();
  f.api.start([entry]);
  let cancelled = 0;
  const cancel = f.api.load("test", () => cancelled++);
  cancel();
  f.complete({ version: 1, languages: { de_DE: { start: "Starten" } } });
  assert.equal(cancelled, 0);
});

test("the Tetris catalog has 41 complete locales", async (t) => {
  let catalog;
  vm.runInNewContext(
    fs.readFileSync(tetrisFile, "utf8"),
    {
      window: {
        MzdGuiI18n: {
          register(id, value) {
            assert.equal(id, "tetris");
            catalog = value;
          }
        }
      }
    },
    { filename: tetrisFile }
  );
  const english = catalog.languages.en_US;
  const keys = Object.keys(english).sort();
  assert.equal(Object.keys(catalog.languages).length, 41);
  for (const [locale, texts] of Object.entries(catalog.languages)) {
    await t.test(locale, () => {
      assert.deepEqual(
        Object.keys(texts).sort(),
        keys,
        locale + " missing keys"
      );
      for (const key of keys) {
        assert.equal(typeof texts[key], "string");
        assert(texts[key].length > 0);
        assert(
          !texts[key].includes("\uFFFD"),
          locale + " replacement character"
        );
        assert.deepEqual(
          (texts[key].match(/\{\w+\}/g) || []).sort(),
          (english[key].match(/\{\w+\}/g) || []).sort(),
          locale + " placeholders " + key
        );
      }
    });
  }
});
