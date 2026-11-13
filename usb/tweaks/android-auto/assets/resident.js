/*
 * Android Auto Settings resident. The shared settings host owns the OEM List2
 * menu, the OEM Dialog3 confirmation, the save queue, status bar notifications
 * and the reboot request. These texts are used until the view sends localized ones.
 */
(function (global) {
    'use strict';

    global.MzdGuiResidents.register('android-auto', function (context) {
        if (!global.MzdSettingsHost) {
            // settings-host.js did not load. The runtime logs this and stops only this resident.
            throw new Error('Shared settings code is unavailable.');
        }
        global.MzdSettingsHost.create(context, {
            prefix: 'aa',
            dialog: true,
            reboot: true,
            texts: {
                saveError: 'Failed to save settings',
                reboot: 'Reboot to apply changes',
                rebootFallback: 'Hold NAV + MUTE to reboot'
            }
        });
    });
}(window));
