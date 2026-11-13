/*
 * MZD Tweaks resident. The shared settings host owns the native menu and the
 * save queue; this file keeps window.mzdTweaks in sync for the patched OEM code.
 *
 * Three sources set window.mzdTweaks, in this order:
 * 1. The inline defaults below, so the patched OEM code always finds the object.
 * 2. settings.js, written by the service; it loads asynchronously at boot,
 *    before the service is running, and holds the last saved values.
 * 3. The service, through onConfirmed. It runs after a successful read
 *    (syncOnStart) and after each successful save, never for unsaved values.
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
            if (global.MzdGuiResidents && global.MzdGuiResidents.log) {
                global.MzdGuiResidents.log('mzd-tweaks', 'settings.js could not be loaded; using defaults until the service answers.');
            }
            return true;
        };
        (document.head || document.documentElement).appendChild(bootScript);
    } catch (failure) {
        if (global.MzdGuiResidents && global.MzdGuiResidents.log) {
            global.MzdGuiResidents.log('mzd-tweaks', 'settings.js could not be added: ' + failure);
        }
    }

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

        global.MzdSettingsHost.create(context, {
            prefix: 'mzd-tweaks',
            syncOnStart: true,
            onConfirmed: applyGlobals
        });
    });
}(window));
