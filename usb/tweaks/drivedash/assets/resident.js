/* Local prototype adapter delegating to the shared native menu factory. */
(function (global) {
    'use strict';
    function create(options) {
        options = options || {};
        options.prefix = 'drivedash';
        if (global.MzdGuiResidents && typeof global.MzdGuiResidents.createNativeMenu === 'function') {
            return global.MzdGuiResidents.createNativeMenu(options);
        }
        throw new Error('MzdGuiResidents native menu factory unavailable.');
    }
    global.DriveDashNativeMenu = {create:create};
}(window));

(function (global) {
    'use strict';
    global.MzdGuiResidents.register('drivedash', function (context) {
        var nativeMenu = global.DriveDashNativeMenu.create(), sampling = false;

        context.onServiceRequest(function (operation, args, callback) {
            if (operation === 'sample') {
                if (sampling) { callback('Data reader is busy.'); return; }
                sampling = true;
                context.service.request('sample', {}, function (error, result) {
                    sampling = false;
                    callback(error, result);
                });
                return;
            }
            context.service.request(operation, args, callback);
        });

        context.onMessage(function (event) {
            var value = event.data, current = context.view(), frame = null, frames, i;
            if (!value) { return; }
            if (value.type === 'drivedash-native-release' && nativeMenu.owns(event.source, value.token)) {
                nativeMenu.close(false);
                return;
            }
            if (!current || current.source !== event.source || current.token !== value.token) { return; }
            frames = document.getElementsByTagName('iframe');
            for (i = 0; i < frames.length; i += 1) {
                if (frames[i].contentWindow === event.source) { frame = frames[i]; break; }
            }
            if (!frame) { return; }
            try {
                if (value.type === 'drivedash-native-render') {
                    nativeMenu.render(frame, value.token, value.menu);
                } else if (value.type === 'drivedash-native-input') {
                    nativeMenu.input(frame, value.token, value.action, value.phase);
                }
            } catch (failure) {
                nativeMenu.close(false);
                event.source.postMessage({ type: 'drivedash-native-error', token: value.token }, '*');
            }
        });

        context.onViewClose(function () { nativeMenu.close(false); });
        context.onDispose(function () { nativeMenu.close(false); });
    });
}(window));
