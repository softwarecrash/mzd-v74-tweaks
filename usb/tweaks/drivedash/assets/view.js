(function () {
    'use strict';
    var sdk = window.MzdGuiModule, model = window.DriveDashModel, skins = window.DriveDashSkins;
    var session = window.DriveDashData.createSession();
    var needle = new window.DriveDashNeedle(), needleTimer = null;
    var source, data = null, ended = false, suspended = false, initialized = false, page = 'gauge', focus = 0;
    var storageKey = 'mzd-drivedash-design-preview-v1', language = 'en_US', context = document.getElementById('gauge').getContext('2d');
    var token = (sdk && sdk.token) ? sdk.token : ((/(?:^|[&#])mzdgui=([a-zA-Z0-9-]+)(?:&|$)/.exec(window.location.hash) || ['',''])[1]);
    var live = window.location.protocol === 'file:' || /[?&]data=cmu(?:&|$)/.test(window.location.search);
    var loadingPreferences = live, preferenceError = '';
    var preferences = new window.DriveDashPreferences(function (args, callback) {
        if (sdk && sdk.request) {
            sdk.request('preferences', args, callback, 10000);
        } else {
            callback('Preferences service unavailable.');
        }
    });
    var system = {language:'en_US'}, systemPending = false, systemRead = false, systemTimer = null;
    var nativeMenu = !!token, config, stored = null, languageMatch = /[?&]lang=([a-zA-Z_]+)/.exec(window.location.search);
    source = live ? new window.DriveDashLive(function (callback) {
        if (sdk && sdk.request) {
            sdk.request('sample', {}, callback, 5000);
        } else {
            callback('Data reader unavailable.');
        }
    }) : new window.DriveDashDemo();
    function t(key) { var all = window.DriveDashLanguages, dictionary = all[language] || all[language.split('_')[0] === 'de' ? 'de_DE' : 'en_US']; return dictionary[key] || all.en_US[key] || key; }
    function post(value) { value.token = token; window.parent.postMessage(value,'*'); }
    function designIds() { return skins.list().map(function (skin) { return skin.id; }); }
    try { if (!live) { stored = JSON.parse(window.localStorage.getItem(storageKey) || 'null'); } } catch (ignore) {}
    config = model.settings(stored,designIds(),Object.keys(window.DriveDashLanguages));
    function applyLanguage() {
        language = config.language === 'auto' ? system.language : config.language;
        document.documentElement.lang = language.replace('_','-');
    }
    applyLanguage();
    function applyUnits(units) {
        if (units) {
            if (units.speedUnit === 'kmh' || units.speedUnit === 'mph') { system.speedUnit = units.speedUnit; }
            if (units.tempUnit === 'C' || units.tempUnit === 'F') { system.tempUnit = units.tempUnit; }
            if (typeof units.language === 'string' && /^[a-z]{2,3}(_[a-zA-Z]{2})?$/.test(units.language)) { system.language = units.language; }
        }
    }
    function finishStartup() {
        if (ended || suspended || initialized || loadingPreferences || systemPending) { return; }
        applyLanguage(); initialized = true; start();
        document.getElementById('stage').style.visibility = 'visible';
    }
    function requestSystem() {
        var needs = config.language === 'auto' || config.speedUnit === 'auto' || config.tempUnit === 'auto';
        if (!token || systemPending || systemRead || !needs) { return; }
        systemPending = true;
        systemTimer = window.setTimeout(function () {
            if (ended) { return; }
            systemPending = false; systemRead = true; finishStartup();
        }, 5000);
        if (sdk && sdk.getUnits) {
            sdk.getUnits(function (units) {
                if (ended || !systemPending) { return; }
                window.clearTimeout(systemTimer); systemTimer = null;
                systemPending = false; systemRead = true;
                applyUnits(units);
                applyLanguage(); finishStartup();
                if (page === 'gauge') { renderGauge(); } else { renderMenu(); }
            });
        } else {
            window.clearTimeout(systemTimer); systemTimer = null;
            systemPending = false; systemRead = true; finishStartup();
        }
    }
    function save() {
        if (live) {
            preferences.save(config,function (error) {
                preferenceError = error ? 'settingsNotSaved' : '';
                if (!ended && page !== 'gauge') { renderMenu(); }
            });
        } else { try { window.localStorage.setItem(storageKey,JSON.stringify(config)); } catch (ignore) {} }
    }
    function fit() {
        var scale = Math.min(1,(window.innerWidth || 800)/800,(window.innerHeight || 416)/416), stage = document.getElementById('stage');
        stage.style.transform = scale === 1 ? 'none' : 'scale('+scale+')'; stage.style.OTransform = stage.style.transform;
        stage.style.left = Math.max(0,((window.innerWidth || 800)-800*scale)/2)+'px'; stage.style.top = Math.max(0,((window.innerHeight || 416)-416*scale)/2)+'px';
    }
    function renderGauge() {
        if (ended || suspended || !initialized || page !== 'gauge') { return; }
        var now = new Date().getTime(), display = model.display(data,config,t,system);
        display.rpm = needle.value(now);
        skins.get(config.design).draw(context,display,t);
        if (needle.moving(now) && needleTimer === null) {
            needleTimer = window.setTimeout(function () { needleTimer = null; renderGauge(); },33);
        }
        document.getElementById('settings').textContent = t('settings'); document.getElementById('demo').textContent = t(loadingPreferences ? 'loadingSettings' : live ? data && data.available ? 'live' : 'unavailable' : 'demo');
        document.getElementById('gauge').setAttribute('aria-label',t('title')+' - '+t(live ? 'live' : 'demo'));
    }
    function stopNeedle() { window.clearTimeout(needleTimer); needleTimer = null; needle.reset(); }
    function start() { source.start(function (value) {
        data = session.update(value); needle.set(data && data.rpm,new Date().getTime()); renderGauge();
    },config.animated); }
    function rows() {
        var result = [], values, i;
        if (page === 'settings') {
            var settings = [{id:'design',label:t('design'),detail:t(skins.get(config.design).labelKey),caret:true},
                {id:'speed',label:t('speedUnits'),detail:t(config.speedUnit),caret:true},
                {id:'temperature',label:t('temperatureUnits'),detail:config.tempUnit === 'auto' ? t('auto') : t(config.tempUnit === 'F' ? 'fahrenheit' : 'celsius'),caret:true},
                {id:'language',label:t('language'),detail:config.language === 'auto' ? t('auto') : t('language.'+config.language),caret:true}];
            if (preferenceError) { settings.splice(0,0,{id:'settingsError',label:t(preferenceError),disabled:true}); }
            if (!live) { settings.splice(4,0,{id:'animated',label:t('animate'),detail:t(config.animated ? 'on' : 'off')}); }
            return settings;
        }
        if (page === 'language') {
            values = ['auto'].concat(Object.keys(window.DriveDashLanguages));
            for (i = 0; i < values.length; i += 1) { result.push({id:values[i],label:t(values[i] === 'auto' ? 'auto' : 'language.'+values[i]),radio:true,checkable:true,checked:config.language === values[i]}); }
        } else if (page === 'design') {
            values = skins.list(); for (i = 0; i < values.length; i += 1) { result.push({id:values[i].id,label:t(values[i].labelKey),radio:true,checkable:true,checked:config.design === values[i].id}); }
        } else {
            values = page === 'speed' ? ['auto','kmh','mph'] : ['auto','C','F'];
            for (i = 0; i < values.length; i += 1) { result.push({id:values[i],label:t(values[i] === 'C' ? 'celsius' : values[i] === 'F' ? 'fahrenheit' : values[i]),radio:true,checkable:true,checked:(page === 'speed' ? config.speedUnit : config.tempUnit) === values[i]}); }
        }
        return result;
    }
    function renderMenu() {
        if (ended || suspended) { return; }
        var list = rows(), title = t(page === 'settings' ? 'settings' : page === 'speed' ? 'speedUnits' : page === 'temperature' ? 'temperatureUnits' : page === 'language' ? 'language' : 'design');
        var root = document.getElementById('menu-rows'), i, row, label, detail;
        document.getElementById('settings').textContent = t('settings');
        if (focus >= list.length) { focus = 0; }
        if (nativeMenu) { post({type:'drivedash-native-render',menu:{page:page,title:title,rows:list,index:focus}}); return; }
        document.getElementById('fallback-menu').style.display = 'block'; document.getElementById('menu-title').textContent = title;
        document.getElementById('menu-back').textContent = t('back'); root.innerHTML = '';
        for (i = 0; i < list.length; i += 1) {
            row = document.createElement('div'); row.className = 'menu-row'+(i === focus ? ' selected' : ''); row.setAttribute('role','button');
            label = document.createElement('span'); label.textContent = (list[i].checkable && list[i].checked ? '\u2713 ' : '')+list[i].label; row.appendChild(label);
            detail = document.createElement('span'); detail.className = 'menu-detail'; detail.textContent = list[i].detail || ''; row.appendChild(detail);
            row.onclick = (function (position) { return function () { choose(position); }; }(i)); root.appendChild(row);
        }
    }
    function open(next) { source.stop(); stopNeedle(); session.pause(); page = next; focus = 0; renderMenu(); }
    function resume() {
        if (nativeMenu) { post({type:'drivedash-native-release'}); }
        if (sdk && sdk.setLayout) { sdk.setLayout('with-status-bar'); }
        document.getElementById('fallback-menu').style.display = 'none'; page = 'gauge'; start();
    }
    function back() { if (page === 'gauge') { return false; } if (page === 'settings') { resume(); } else { open('settings'); } return true; }
    function choose(position) {
        var row = rows()[position]; if (!row || row.disabled || ended) { return; } focus = position;
        if (page === 'settings') {
            if (row.id === 'animated') { config.animated = !config.animated; save(); renderMenu(); return; }
            open(row.id); return;
        }
        if (page === 'language') { config.language = row.id; applyLanguage(); } else if (page === 'design') { config.design = row.id; } else if (page === 'speed') { config.speedUnit = row.id; } else { config.tempUnit = row.id; }
        save(); requestSystem(); renderMenu();
    }
    function input(action, phase) {
        if (ended || suspended) { return false; }
        if (!initialized) { return action !== 'back'; }
        if (action === 'back') { return phase === 'press' ? page !== 'gauge' : back(); }
        if (page === 'gauge') { if (action === 'select' && phase !== 'press') { open('settings'); } return true; }
        if (nativeMenu) { post({type:'drivedash-native-input',action:action,phase:phase}); return true; }
        if (phase === 'press') { return true; }
        if (action === 'select') { choose(focus); }
        else if (['up','down','rotateLeft','rotateRight'].indexOf(action) >= 0) { focus = (focus + (action === 'up' || action === 'rotateLeft' ? -1 : 1)+rows().length)%rows().length; renderMenu(); }
        return true;
    }
    function receive(event) {
        var value = event.data;
        if (event.source !== window.parent || !value || value.token !== token || ended) { return; }
        if (value.type === 'drivedash-native-error') { nativeMenu = false; renderMenu(); }
        if (value.type === 'drivedash-native-select') { choose(value.index); }
        if (value.type === 'drivedash-native-focus') { focus = value.index; }
    }
    function dispose() {
        if (ended) { return; } source.stop(); stopNeedle(); session.pause(); window.clearTimeout(systemTimer);
        if (nativeMenu) { post({type:'drivedash-native-release'}); } ended = true;
        window.removeEventListener('message',receive,false); window.removeEventListener('resize',fit,false);
    }
    document.getElementById('settings').onclick = function () { open('settings'); };
    document.getElementById('menu-back').onclick = back;
    window.addEventListener('message',receive,false); window.addEventListener('resize',fit,false); window.addEventListener('unload',dispose,false);
    if (sdk && sdk.setLayout) { sdk.setLayout('with-status-bar'); }
    if (sdk && sdk.onSuspend && sdk.onResume) {
        sdk.onSuspend(function () { suspended = true; source.stop(); stopNeedle(); session.pause(); });
        sdk.onResume(function () {
            if (ended) { return; } suspended = false;
            if (sdk.setLayout) { sdk.setLayout('with-status-bar'); }
            if (!initialized) { finishStartup(); }
            else if (page === 'gauge') { start(); } else { renderMenu(); }
        });
    }
    if (sdk) { sdk.onInput(input); sdk.onDispose(dispose); sdk.ready(); }
    fit();
    if (!token && languageMatch) { system.language = languageMatch[1]; applyLanguage(); }
    if (live) {
        preferences.load(function (error,value) {
            if (ended) { return; }
            loadingPreferences = false; preferenceError = error ? 'settingsLoadFailed' : '';
            config = model.settings(error ? null : value,designIds(),Object.keys(window.DriveDashLanguages));
            applyLanguage(); requestSystem(); finishStartup();
        });
    } else { requestSystem(); finishStartup(); }
}());
