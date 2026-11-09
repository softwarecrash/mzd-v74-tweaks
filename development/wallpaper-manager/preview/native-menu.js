/* Local prototype adapter delegating to the shared native menu factory. */
(function (global) {
    'use strict';
    function create(options) {
        options = options || {};
        options.prefix = 'wallpaper';
        options.split = true;
        options.alwaysRestoreApplications = true;
        if (global.MzdGuiResidents && typeof global.MzdGuiResidents.createNativeMenu === 'function') {
            return global.MzdGuiResidents.createNativeMenu(options);
        }
        throw new Error('MzdGuiResidents native menu factory unavailable.');
    }
    global.WallpaperNativeMenu = {create:create};
}(window));
