(function () {
    'use strict';
    var sdk = window.MzdGuiModule, model = window.SpeedometerModel, skins = window.SpeedometerSkins;
    var source = new window.SpeedometerDemo(), data = null, ended = false, page = 'gauge', focus = 0;
    var storageKey = 'mzd-speedometer-design-preview-v1', language = 'en_US', context = document.getElementById('gauge').getContext('2d');
    var match = /(?:^|[&#])mzdgui=([a-zA-Z0-9-]+)(?:&|$)/.exec(window.location.hash), token = match ? match[1] : '';
    var nativeMenu = !!token, config, stored = null, languageMatch = /[?&]lang=([a-zA-Z_]+)/.exec(window.location.search);
    function t(key) { var all = window.SpeedometerLanguages, dictionary = all[language] || all[language.split('_')[0] === 'de' ? 'de_DE' : 'en_US']; return dictionary[key] || all.en_US[key] || key; }
    function post(value) { value.token = token; window.parent.postMessage(value,'*'); }
    function designIds() { return skins.list().map(function (skin) { return skin.id; }); }
    try { stored = JSON.parse(window.localStorage.getItem(storageKey) || 'null'); } catch (ignore) {}
    config = model.settings(stored,designIds());
    function save() { try { window.localStorage.setItem(storageKey,JSON.stringify(config)); } catch (ignore) {} }
    function fit() {
        var scale = Math.min((window.innerWidth || 800)/800,(window.innerHeight || 480)/480), stage = document.getElementById('stage');
        stage.style.transform = scale === 1 ? 'none' : 'scale('+scale+')'; stage.style.OTransform = stage.style.transform;
        stage.style.left = Math.max(0,((window.innerWidth || 800)-800*scale)/2)+'px'; stage.style.top = Math.max(0,((window.innerHeight || 480)-480*scale)/2)+'px';
    }
    function renderGauge() {
        if (ended || page !== 'gauge') { return; }
        skins.get(config.design).draw(context,model.display(data,config,t),t);
        document.getElementById('settings').textContent = t('settings'); document.getElementById('demo').textContent = t('demo');
        document.getElementById('gauge').setAttribute('aria-label',t('title')+' - '+t('demo'));
    }
    function start() { source.start(function (value) { data = value; renderGauge(); },config.animated); }
    function rows() {
        var result = [], values, i;
        if (page === 'settings') {
            return [{id:'design',label:t('design'),detail:t(skins.get(config.design).labelKey),caret:true},
                {id:'speed',label:t('speedUnits'),detail:t(config.speedUnit),caret:true},
                {id:'temperature',label:t('temperatureUnits'),detail:config.tempUnit === 'auto' ? t('auto') : t(config.tempUnit === 'F' ? 'fahrenheit' : 'celsius'),caret:true},
                {id:'animated',label:t('animate'),detail:t(config.animated ? 'on' : 'off')},
                {id:'return',label:t('back')}];
        }
        if (page === 'design') {
            values = skins.list(); for (i = 0; i < values.length; i += 1) { result.push({id:values[i].id,label:t(values[i].labelKey),radio:true,checkable:true,checked:config.design === values[i].id}); }
        } else {
            values = page === 'speed' ? ['auto','kmh','mph'] : ['auto','C','F'];
            for (i = 0; i < values.length; i += 1) { result.push({id:values[i],label:t(values[i] === 'C' ? 'celsius' : values[i] === 'F' ? 'fahrenheit' : values[i]),radio:true,checkable:true,checked:(page === 'speed' ? config.speedUnit : config.tempUnit) === values[i]}); }
        }
        return result;
    }
    function renderMenu() {
        var list = rows(), title = t(page === 'settings' ? 'settings' : page === 'speed' ? 'speedUnits' : page === 'temperature' ? 'temperatureUnits' : 'design');
        var root = document.getElementById('menu-rows'), i, row, label, detail;
        if (focus >= list.length) { focus = 0; }
        if (nativeMenu) { post({type:'speedo-native-render',menu:{page:page,title:title,rows:list,index:focus}}); return; }
        document.getElementById('fallback-menu').style.display = 'block'; document.getElementById('menu-title').textContent = title;
        document.getElementById('menu-back').textContent = t('back'); root.innerHTML = '';
        for (i = 0; i < list.length; i += 1) {
            row = document.createElement('div'); row.className = 'menu-row'+(i === focus ? ' selected' : ''); row.setAttribute('role','button');
            label = document.createElement('span'); label.textContent = (list[i].checkable && list[i].checked ? '\u2713 ' : '')+list[i].label; row.appendChild(label);
            detail = document.createElement('span'); detail.className = 'menu-detail'; detail.textContent = list[i].detail || ''; row.appendChild(detail);
            row.onclick = (function (position) { return function () { choose(position); }; }(i)); root.appendChild(row);
        }
    }
    function open(next) { source.stop(); page = next; focus = 0; renderMenu(); }
    function resume() {
        if (nativeMenu) { post({type:'speedo-native-release'}); }
        document.getElementById('fallback-menu').style.display = 'none'; page = 'gauge'; start();
    }
    function back() { if (page === 'gauge') { return false; } if (page === 'settings') { resume(); } else { open('settings'); } return true; }
    function choose(position) {
        var row = rows()[position]; if (!row || ended) { return; } focus = position;
        if (page === 'settings') {
            if (row.id === 'return') { resume(); return; }
            if (row.id === 'animated') { config.animated = !config.animated; save(); renderMenu(); return; }
            open(row.id); return;
        }
        if (page === 'design') { config.design = row.id; } else if (page === 'speed') { config.speedUnit = row.id; } else { config.tempUnit = row.id; }
        save(); resume();
    }
    function input(action, phase) {
        if (ended) { return false; }
        if (action === 'back') { return phase === 'press' ? page !== 'gauge' : back(); }
        if (page === 'gauge') { if (action === 'select' && phase !== 'press') { open('settings'); } return true; }
        if (nativeMenu) { post({type:'speedo-native-input',action:action,phase:phase}); return true; }
        if (phase === 'press') { return true; }
        if (action === 'select') { choose(focus); }
        else if (['up','down','rotateLeft','rotateRight'].indexOf(action) >= 0) { focus = (focus + (action === 'up' || action === 'rotateLeft' ? -1 : 1)+rows().length)%rows().length; renderMenu(); }
        return true;
    }
    function receive(event) {
        var value = event.data;
        if (event.source !== window.parent || !value || value.token !== token || ended) { return; }
        if (value.type === 'speedo-native-error') { nativeMenu = false; renderMenu(); }
        if (value.type === 'speedo-native-select') { choose(value.index); }
        if (value.type === 'speedo-native-focus') { focus = value.index; }
    }
    function dispose() {
        if (ended) { return; } source.stop();
        if (nativeMenu) { post({type:'speedo-native-release'}); } ended = true;
        window.removeEventListener('message',receive,false); window.removeEventListener('resize',fit,false);
    }
    document.getElementById('settings').onclick = function () { open('settings'); };
    document.getElementById('menu-back').onclick = back;
    window.addEventListener('message',receive,false); window.addEventListener('resize',fit,false); window.addEventListener('unload',dispose,false);
    if (sdk) { sdk.onInput(input); sdk.onDispose(dispose); sdk.ready(); }
    fit();
    if (nativeMenu && sdk && sdk.loadLanguage) {
        sdk.loadLanguage(function (code) { language = code; document.documentElement.lang = code.replace('_','-'); renderGauge(); });
    } else if (languageMatch) { language = languageMatch[1]; }
    start();
}());
