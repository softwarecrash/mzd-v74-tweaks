/* Optional shared hook. Lazy views; resident code runs only when declared. */
(function () {
    'use strict';
    if (window.mzdGuiBootRequested) { return; }
    window.mzdGuiBootRequested = true;
    // Always continues with next, also when the script is missing or fails to load,
    // so that one broken optional script cannot keep the runtime from starting.
    function load(path, next) {
        function proceed() { if (next) { next(); } }
        try {
            var script = document.createElement('script');
            script.type = 'text/javascript'; script.async = true; script.src = path;
            script.onload = proceed;
            script.onerror = function (event) { if (event && event.preventDefault) { event.preventDefault(); } proceed(); return true; };
            (document.head || document.getElementsByTagName('head')[0] || document.documentElement).appendChild(script);
        } catch (ignore) { proceed(); }
    }
    load('/data/integration/mzd-gui-registry.js', function () {
        var entries = window.mzdGuiRegistry && window.mzdGuiRegistry.modules || [], resident = false, service = false, translations = false, i;
        for (i = 0; i < entries.length; i += 1) {
            resident = resident || !!entries[i].resident; service = service || !!entries[i].service;
            translations = translations || !!entries[i].translations;
        }
        function runtime() {
            function run() { load('/data/integration/mzd-gui-runtime/runtime.js'); }
            if (translations) { load('/data/integration/mzd-gui-runtime/i18n.js',run); } else { run(); }
        }
        function services() { if (service) { load('/data/integration/mzd-gui-runtime/services.js',runtime); } else { runtime(); } }
        function shared() { load('/data/integration/mzd-gui-runtime/settings-host.js',services); }
        if (resident) { load('/data/integration/mzd-gui-runtime/residents.js',shared); } else { runtime(); }
    });
}());
