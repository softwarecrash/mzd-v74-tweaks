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
            main_menu_coins_layout: 'ellipse',
            main_menu_coins_size: 100,
            main_menu_coins_glow: true,
            list_loop: false,
            list_beep: true,
            short_delay: false,
            statusbar_date: false,
            bluetooth_notification: true,
            theme: 'red'
        }
    });

    await t.test('populates window.mzdTweaks and returns default settings', async () => {
        assert.equal(env.window.mzdTweaks.main_menu_loop, false);
        assert.equal(env.window.mzdTweaks.main_menu_coins_layout, 'ellipse');
        assert.equal(env.window.mzdTweaks.main_menu_coins_size, 100);
        assert.equal(env.window.mzdTweaks.main_menu_coins_glow, true);
        assert.equal(env.window.mzdTweaks.list_loop, false);
        assert.equal(env.window.mzdTweaks.list_beep, true);
        assert.equal(env.window.mzdTweaks.short_delay, false);
        assert.equal(env.window.mzdTweaks.statusbar_date, false);
        assert.equal(env.window.mzdTweaks.bluetooth_notification, true);
        assert.equal(env.window.mzdTweaks.theme, 'red');

        const res = await request(env.services, 'get', {});
        assert.equal(res.settings.main_menu_loop, false);
        assert.equal(res.settings.main_menu_coins_layout, 'ellipse');
        assert.equal(res.settings.main_menu_coins_size, 100);
        assert.equal(res.settings.main_menu_coins_glow, true);
        assert.equal(res.settings.list_loop, false);
        assert.equal(res.settings.list_beep, true);
        assert.equal(res.settings.short_delay, false);
        assert.equal(res.settings.statusbar_date, false);
        assert.equal(res.settings.bluetooth_notification, true);
        assert.equal(res.settings.theme, 'red');
    });

    await t.test('updates setting, applies in-flight global and persists', async () => {
        const updated = await request(env.services, 'set', { key: 'main_menu_loop', value: true });
        assert.equal(updated.settings.main_menu_loop, true);
        assert.equal(env.window.mzdTweaks.main_menu_loop, true);

        const updatedBt = await request(env.services, 'set', { key: 'bluetooth_notification', value: false });
        assert.equal(updatedBt.settings.bluetooth_notification, false);
        assert.equal(env.window.mzdTweaks.bluetooth_notification, false);

        // Verify persistence across reload
        const reloaded = fixture(storage);
        assert.equal(reloaded.window.mzdTweaks.main_menu_loop, true);
        const fetched = await request(reloaded.services, 'get', {});
        assert.equal(fetched.settings.main_menu_loop, true);
    });

    await t.test('rejects invalid key, type, and out-of-allowlist values', async () => {
        await assert.rejects(
            () => request(env.services, 'set', { key: 'nonexistent', value: true }),
            /Invalid setting/
        );
        await assert.rejects(
            () => request(env.services, 'set', { key: 'list_loop', value: 'yes' }),
            /Invalid setting/
        );
        await assert.rejects(
            () => request(env.services, 'set', { key: 'theme', value: 123 }),
            /Invalid setting/
        );
        await assert.rejects(
            () => request(env.services, 'set', { key: 'theme', value: 'neon' }),
            /Invalid setting/
        );
        await assert.rejects(
            () => request(env.services, 'set', { key: 'main_menu_coins_layout', value: 'round' }),
            /Invalid setting/
        );
        await assert.rejects(
            () => request(env.services, 'set', { key: 'main_menu_coins_layout', value: true }),
            /Invalid setting/
        );
        await assert.rejects(
            () => request(env.services, 'set', { key: 'main_menu_coins_size', value: 25 }),
            /Invalid setting/
        );
        await assert.rejects(
            () => request(env.services, 'set', { key: 'main_menu_coins_size', value: '80' }),
            /Invalid setting/
        );
    });

    await t.test('updates theme, coins layout, and coins size settings and applies globals', async () => {
        const updatedTheme = await request(env.services, 'set', { key: 'theme', value: 'blue' });
        assert.equal(updatedTheme.settings.theme, 'blue');
        assert.equal(env.window.mzdTweaks.theme, 'blue');

        const updatedLayout = await request(env.services, 'set', { key: 'main_menu_coins_layout', value: 'flat' });
        assert.equal(updatedLayout.settings.main_menu_coins_layout, 'flat');
        assert.equal(env.window.mzdTweaks.main_menu_coins_layout, 'flat');

        const updatedSize80 = await request(env.services, 'set', { key: 'main_menu_coins_size', value: 80 });
        assert.equal(updatedSize80.settings.main_menu_coins_size, 80);
        assert.equal(env.window.mzdTweaks.main_menu_coins_size, 80);

        const updatedSize60 = await request(env.services, 'set', { key: 'main_menu_coins_size', value: 60 });
        assert.equal(updatedSize60.settings.main_menu_coins_size, 60);
        assert.equal(env.window.mzdTweaks.main_menu_coins_size, 60);

        const restoredLayout = await request(env.services, 'set', { key: 'main_menu_coins_layout', value: 'ellipse' });
        assert.equal(restoredLayout.settings.main_menu_coins_layout, 'ellipse');
        assert.equal(env.window.mzdTweaks.main_menu_coins_layout, 'ellipse');

        const updatedMainMenuCustom = await request(env.services, 'set', { key: 'main_menu_order_custom', value: true });
        assert.equal(updatedMainMenuCustom.settings.main_menu_order_custom, true);
        assert.equal(env.window.mzdTweaks.main_menu_order_custom, true);

        const updatedMainMenuOrder = await request(env.services, 'set', {
            key: 'main_menu_order',
            value: {
                main_menu_set: 0,
                main_menu_nav: 1,
                main_menu_com: 2,
                main_menu_ent: 3,
                main_menu_app: 4
            }
        });
        assert.equal(updatedMainMenuOrder.settings.main_menu_order.main_menu_set, 0);
        assert.equal(updatedMainMenuOrder.settings['main_menu_order.main_menu_set'], 0);
        assert.equal(env.window.mzdTweaks.main_menu_order.main_menu_app, 4);
    });

    await t.test('sanitizes invalid stored or initial values against allowlists', async () => {
        const badStorage = {
            'mzd-preview-mzd-tweaks': JSON.stringify({
                theme: 'neon',
                main_menu_coins_layout: 'round',
                main_menu_coins_size: 25,
                main_menu_loop: 'invalid'
            })
        };
        const sanitized = fixture(badStorage, {
            'mzd-tweaks': {
                theme: 'bogus',
                main_menu_coins_layout: 'circle',
                main_menu_coins_size: 50
            }
        });
        assert.equal(sanitized.window.mzdTweaks.theme, 'red');
        assert.equal(sanitized.window.mzdTweaks.main_menu_coins_layout, 'ellipse');
        assert.equal(sanitized.window.mzdTweaks.main_menu_coins_size, 100);
        assert.equal(sanitized.window.mzdTweaks.main_menu_loop, false);
        const res = await request(sanitized.services, 'get', {});
        assert.equal(res.settings.theme, 'red');
        assert.equal(res.settings.main_menu_coins_layout, 'ellipse');
        assert.equal(res.settings.main_menu_coins_size, 100);
    });
});
