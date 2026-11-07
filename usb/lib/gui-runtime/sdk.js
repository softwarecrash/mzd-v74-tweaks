/* ES5 cooperative view SDK. This is not a security or process sandbox. */
(function () {
    'use strict';
    var match = /(?:^|[&#])mzdgui=([a-zA-Z0-9-]+)(?:&|$)/.exec(window.location.hash);
    var token = match ? match[1] : '', input = null, dispose = null, keys = {}, ended = false, suspended = false, suspendHandler = null, resumeHandler = null, originalError = window.onerror, errorHandler;
    var locale = {language:'en_US',direction:'ltr',texts:{}}, languageHandler = null, moduleMessage = null;
    function send(type, message) { if (token && !ended) { try { window.parent.postMessage({type:'mzd-gui-'+type,token:token,message:String(message || '').substring(0,512)}, '*'); } catch (ignore) {} } }
    function cleanup() {
        if (ended) { return; } ended = true; languageHandler = null; moduleMessage = null; suspendHandler = null; resumeHandler = null;
        if (window.onerror === errorHandler) { window.onerror = originalError; }
        window.removeEventListener('message', receive, false); window.removeEventListener('keydown', down, true); window.removeEventListener('keyup', up, true);
        try { if (dispose) { dispose(); } } catch (ignore) {}
    }
    function handle(action, phase) {
        var handled = false;
        if (ended || suspended) { return; }
        try { if (input) { handled = input(action, phase) === true; } }
        catch (error) { send('error', String(error)); }
        if (action === 'back' && phase !== 'press' && !handled) { send('close'); }
    }
    function receive(event) {
        var data = event.data;
        if (event.source !== window.parent || !data || data.token !== token) { return; }
        if (data.type === 'mzd-gui-suspend' || data.type === 'mzd-gui-resume') {
            var paused = data.type === 'mzd-gui-suspend', handler;
            if (ended || suspended === paused) { return; }
            suspended = paused; keys = {}; handler = paused ? suspendHandler : resumeHandler;
            try { if (handler) { handler(); } } catch (error) { send('error',String(error)); }
            return;
        }
        if (/^mzd-module-/.test(data.type || '') && moduleMessage) { moduleMessage(data);return; }
        if (data.type === 'mzd-gui-language' && data.value && typeof data.value.language === 'string' && data.value.texts && typeof data.value.texts === 'object') {
            locale = data.value; if (languageHandler) { var callback = languageHandler; languageHandler = null; try { callback(locale.language,locale.direction); } catch (ignore) {} } return;
        }
        if (data.type === 'mzd-gui-input' && ['left','right','up','down','select','rotateLeft','rotateRight','back'].indexOf(data.action) >= 0 && ['press','release','step'].indexOf(data.phase) >= 0) { handle(data.action,data.phase); }
    }
    function action(code) { return {37:'left',39:'right',38:'up',40:'down',13:'select',77:'rotateRight',78:'rotateLeft',27:'back'}[code]; }
    function stop(event) { if (event.preventDefault) { event.preventDefault(); } if (event.stopImmediatePropagation) { event.stopImmediatePropagation(); } event.returnValue = false; }
    function down(event) {
        if (ended || suspended) { return; }
        var code = event.keyCode || event.which, name = action(code);
        if (code === 8) { stop(event); return; }
        if (name) { stop(event); if (!keys[code]) { keys[code] = name; handle(name,'press'); } }
    }
    function up(event) {
        if (ended || suspended) { return; }
        var code = event.keyCode || event.which, name = keys[code];
        if (code === 8) { stop(event); handle('back','step'); return; }
        if (name) { stop(event); delete keys[code]; handle(name,'release'); }
    }
    function translate(key, fallback, values) {
        var value = Object.prototype.hasOwnProperty.call(locale.texts,key) && typeof locale.texts[key] === 'string' ? locale.texts[key] : String(fallback || key);
        return value.replace(/\{([a-zA-Z0-9_]+)\}/g,function (match,name) { return values && Object.prototype.hasOwnProperty.call(values,name) ? String(values[name]) : match; });
    }
    window.MzdGuiModule = {
        setLayout:function (layout) { if (layout === 'fullscreen' || layout === 'with-status-bar') { send('layout',layout); } },
        onSuspend:function (fn) { suspendHandler = typeof fn === 'function' ? fn : null; if (suspendHandler) { send('lifecycle','phone'); } },
        onResume:function (fn) { resumeHandler = typeof fn === 'function' ? fn : null; },
        onMessage:function(fn){moduleMessage=typeof fn==='function'?fn:null;},
        send:function(type,value){
            if(!token || ended || !/^[a-z][a-z0-9-]{0,40}$/.test(type))return;
            window.parent.postMessage({type:'mzd-module-'+type,token:token,value:value},'*');
        },t:translate,language:function () { return locale.language; },
        loadLanguage:function (fn) { languageHandler = typeof fn === 'function' ? fn : null; if (languageHandler) { send('language-request'); } },ready:function () { send('ready'); },close:function () { send('close'); },
        onInput:function (fn) { input = typeof fn === 'function' ? fn : null; },
        onDispose:function (fn) { dispose = typeof fn === 'function' ? fn : null; },_dispose:cleanup};
    window.addEventListener('message', receive, false); window.addEventListener('keydown', down, true); window.addEventListener('keyup', up, true);
    errorHandler = function (message) { send('error',message); return true; };
    window.onerror = errorHandler;
}());
