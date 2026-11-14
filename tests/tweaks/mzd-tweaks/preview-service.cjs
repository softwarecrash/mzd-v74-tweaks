const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict'), test = require('node:test');
const source = fs.readFileSync(path.resolve(__dirname, '../../../tools/preview-gui-services.js'), 'utf8');

function fixture(storage, defaults) {
    const window = {
        mzdPreviewServiceDefaults: defaults || {},
        localStorage: {
            getItem(key) { return storage[key] || null; },
            setItem(key, value) { storage[key] = value; }
        },
        setTimeout(fn) { return setTimeout(fn, 0); },
        setInterval(fn) { return setInterval(fn, 0); },
        clearInterval(id) { clearInterval(id); }
    };
    const document = {
        createElement(name) {
            return {};
        }
    };
    vm.runInNewContext(source, { window: window, document: document, JSON: JSON, Array: Array, Object: Object, Error: Error, String: String });
    return { window: window, services: window.MzdGuiServices };
}

function request(services, operation, args) {
    return new Promise((resolve, reject) => {
        services.request('mzd-tweaks', operation, args, (error, result) => error ? reject(new Error(error)) : resolve(result));
    });
}

test('emulated MZD Tweaks service', async t => {
    const storage = {}, env = fixture(storage, {
        'mzd-tweaks': {
            main_menu_loop: false,
            list_loop: false,
            list_beep: true,
            short_delay: false
        }
    });

    await t.test('populates window.mzdTweaks and returns default settings', async () => {
        assert.equal(env.window.mzdTweaks.main_menu_loop, false);
        assert.equal(env.window.mzdTweaks.list_loop, false);
        assert.equal(env.window.mzdTweaks.list_beep, true);
        assert.equal(env.window.mzdTweaks.short_delay, false);

        const res = await request(env.services, 'get', {});
        assert.equal(res.settings.main_menu_loop, false);
        assert.equal(res.settings.list_loop, false);
        assert.equal(res.settings.list_beep, true);
        assert.equal(res.settings.short_delay, false);
    });

    await t.test('updates setting, applies in-flight global and persists', async () => {
        const updated = await request(env.services, 'set', { key: 'main_menu_loop', value: true });
        assert.equal(updated.settings.main_menu_loop, true);
        assert.equal(env.window.mzdTweaks.main_menu_loop, true);

        // Verify persistence across reload
        const reloaded = fixture(storage);
        assert.equal(reloaded.window.mzdTweaks.main_menu_loop, true);
        const fetched = await request(reloaded.services, 'get', {});
        assert.equal(fetched.settings.main_menu_loop, true);
    });

    await t.test('rejects invalid key and non-boolean value', async () => {
        await assert.rejects(
            () => request(env.services, 'set', { key: 'nonexistent', value: true }),
            /Invalid setting/
        );
        await assert.rejects(
            () => request(env.services, 'set', { key: 'list_loop', value: 'yes' }),
            /Invalid setting/
        );
    });
});
