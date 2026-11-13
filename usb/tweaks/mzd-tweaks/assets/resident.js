/*
 * MZD Tweaks resident. The shared settings host owns the native menu and the
 * save queue; this file keeps window.mzdTweaks in sync for the patched OEM code.
 */
(function (global) {
    'use strict';

    if (!global.mzdTweaks) {
        global.mzdTweaks = {
            main_menu_loop: false,
            list_loop: false,
            list_beep: true,
            short_delay: false
        };
    }

    try {
        var bootScript = document.createElement('script');
        bootScript.type = 'text/javascript';
        bootScript.src = '/tmp/mnt/data_persist/mzd-tweaks/data/mzd-tweaks/settings.js';
        bootScript.onerror = function (event) {
            if (event && event.preventDefault) { event.preventDefault(); }
            return true;
        };
        (document.head || document.documentElement).appendChild(bootScript);
    } catch (ignore) {}

    global.MzdGuiResidents.register('mzd-tweaks', function (context) {
        if (!global.MzdSettingsHost) {
            // settings-host.js did not load. The runtime logs this and stops only this resident.
            throw new Error('Shared settings code is unavailable.');
        }
        function applyGlobals(settings) {
            var k;
            if (!global.mzdTweaks) { global.mzdTweaks = {}; }
            for (k in settings) {
                if (Object.prototype.hasOwnProperty.call(settings, k)) {
                    global.mzdTweaks[k] = settings[k];
                }
            }
        }

        var initial = {};
        for (var key in global.mzdTweaks) {
            if (Object.prototype.hasOwnProperty.call(global.mzdTweaks, key)) {
                initial[key] = global.mzdTweaks[key];
            }
        }

        global.MzdSettingsHost.create(context, {
            prefix: 'mzd-tweaks',
            initialState: initial,
            syncOnStart: true,
            onState: applyGlobals
        });
    });
}(window));
