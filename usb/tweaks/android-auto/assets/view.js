/*
 * Android Auto Settings view. The shared settings view renders the OEM list;
 * this file declares the rows and the Android Auto row types: the HUD
 * distance sub-page and the HUD transport.
 */
(function () {
    'use strict';
    var sdk = window.MzdGuiModule, View = window.MzdSettingsView, status = document.getElementById('status');
    if (!sdk) {
        if (status) { status.textContent = 'Open through Applications.'; }
        return;
    }
    if (!View) {
        // settings-view.js did not load: say so and let the driver go back.
        if (status) { status.textContent = sdk.t('menuError', 'The Mazda menu could not be opened. Please reopen the app.'); }
        sdk.ready();
        return;
    }
    var tr = sdk.t;
    var DISTANCES = [0, 500, 1000, 1500, 2000, 3000, 5000, 7500, 10000, 20000];

    var SETTINGS = [
        { key: 'touch', type: 'bool' },
        { key: 'hud', type: 'bool' },
        { key: 'hud_transport', type: 'transport' },
        { key: 'force_street_name', type: 'bool' },
        { key: 'hud_fold_latin', type: 'bool' },
        { key: 'use_protocol_v1_6', type: 'bool' },
        { key: 'roundabout_prepend_exit_number', type: 'bool' },
        { key: 'hud_maneuver_max_distance_m', type: 'distance' },
        { key: 'compass_always_on', type: 'bool' },
        { key: 'bt_pairing_bypass_all_devices', type: 'bool' },
        { key: 'bt_pairing_show_device_notification', type: 'bool' },
        { key: 'mute_pauses_phone', type: 'bool' },
        { key: 'unmute_starts_playback', type: 'bool' },
        { key: 'block_headunit_media_play', type: 'bool' },
        { key: 'aa_audio_low_latency', type: 'bool' }
    ];

    function formatDistance(meters) {
        var m = Number(meters) || 0;
        if (!m) {
            return tr('always', 'Always');
        }
        if (m >= 1000) {
            return (m / 1000) + ' km';
        }
        return m + ' m';
    }

    function distance(api, key) {
        var state = api.state();
        return (state && typeof state[key] === 'number') ? state[key] : 0;
    }

    var TYPES = {
        // HUD over SvcNavi (on) or VBS (off).
        transport: {
            row: function (def, api) {
                var state = api.state();
                return { itemStyle: 'styleOnOff', checked: !!(state && state[def.key] === 'svcnavi') };
            },
            activate: function (def, row, params, api) {
                api.save(def.key, row.checked ? 'vbs' : 'svcnavi');
            }
        },
        // Shows the current distance and opens a radio list of distances.
        distance: {
            row: function (def, api) {
                return { detail: formatDistance(distance(api, def.key)), caret: true };
            },
            activate: function (def, row, params, api) {
                var current = distance(api, def.key);
                api.openPage({
                    id: 'distance',
                    title: def.label,
                    index: Math.max(0, DISTANCES.indexOf(current)),
                    entries: function () {
                        var list = [], i;
                        for (i = 0; i < DISTANCES.length; i += 1) {
                            list.push(distanceOption(def.key, DISTANCES[i], distance(api, def.key)));
                        }
                        return list;
                    }
                });
            }
        }
    };

    function distanceOption(key, meters, current) {
        return {
            id: 'dist-' + meters,
            label: formatDistance(meters),
            checkable: true,
            checked: current === meters,
            select: function (api) {
                api.back(true);
                if (distance(api, key) !== meters) {
                    api.save(key, meters);
                } else {
                    api.render();
                }
            }
        };
    }

    View.create(sdk, {
        prefix: 'aa',
        statusElement: status,
        types: TYPES,
        title: function (t) { return t('title', 'Android Auto Settings'); },
        entries: function (state, t) {
            var list = [{
                key: 'resolution_dpi',
                type: 'step',
                label: t('resolution_dpi', 'Resolution DPI'),
                defaultValue: 141,
                min: 100,
                max: 160,
                increment: 1,
                savingSpinner: true,
                savingDisabled: true,
                busyDisabled: true
            }], i;
            for (i = 0; i < SETTINGS.length; i += 1) {
                list.push({ key: SETTINGS[i].key, type: SETTINGS[i].type, label: t(SETTINGS[i].key, SETTINGS[i].key) });
            }
            list.push({
                type: 'reboot',
                id: 'reboot',
                label: t('reboot', 'Reboot to apply changes'),
                question: t('rebootQuestion', 'Do you want to reboot MZD to apply Android Auto settings?')
            });
            return list;
        }
    });
}());
