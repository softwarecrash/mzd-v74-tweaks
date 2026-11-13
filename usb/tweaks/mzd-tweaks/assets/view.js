(function () {
    'use strict';
    var sdk = window.MzdGuiModule, View = window.MzdSettingsView, status = document.getElementById('status');
    if (!sdk) { if (status) { status.textContent = 'Open through Applications.'; } return; }
    if (!View) {
        // settings-view.js did not load: say so and let the driver go back.
        if (status) { status.textContent = sdk.t('menuError', 'The Mazda menu could not be opened. Please reopen the app.'); }
        sdk.ready();
        return;
    }

    View.create(sdk, {
        prefix: 'mzd-tweaks',
        statusElement: status,
        title: function (tr) { return tr('title', 'MZD Tweaks'); },
        entries: function (state, tr) {
            return [
                { key: 'main_menu_loop', type: 'bool', label: tr('main_menu_loop', 'Main menu loop') },
                { key: 'list_loop', type: 'bool', label: tr('list_loop', 'List menu loop') },
                { key: 'list_beep', type: 'bool', label: tr('list_beep', 'List menu beep'), defaultValue: true },
                { key: 'short_delay', type: 'bool', label: tr('short_delay', 'Shorter list menu delay') }
            ];
        }
    });
}());
