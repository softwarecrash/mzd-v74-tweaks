(function (global) {
    'use strict';
    var skins = [], records = {};
    global.DriveDashSkins = {
        register:function (skin) {
            if (!skin || !/^[a-z][a-z0-9-]*$/.test(skin.id) || records['$'+skin.id] || typeof skin.draw !== 'function') { throw new Error('Invalid or duplicate drivedash skin.'); }
            records['$'+skin.id] = skin; skins.push(skin);
        },
        list:function () { return skins.slice(0); },
        get:function (id) { return records['$'+id] || records['$oem-style']; }
    };
}(window));
