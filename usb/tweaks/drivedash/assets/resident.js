/* DriveDash settings use the shared SDK native-menu factory. */
(function (global) {
    'use strict';
    global.MzdGuiResidents.register('drivedash',function (context) {
        var menu = context.createNativeMenu({prefix:'drivedash',onClose:global.MzdGuiResidents.releaseBackButton}), sampling = false;
        context.onMessage(function (event) {
            var value = event.data, current = context.view(), frame = null, frames, i;
            if (!value) { return; }
            if (value.type === 'drivedash-native-release' && menu.owns(event.source,value.token)) { menu.close(false); return; }
            if (!current || current.source !== event.source || current.token !== value.token) { return; }
            if (value.type === 'drivedash-system-settings') {
                var localize = global.framework && global.framework.localize, settings = {}, distance, temperature, fields = value.fields || {};
                try { if (fields.language === true) { settings.language = context.language(); } } catch (ignoreLanguage) {}
                try { if (fields.speedUnit === true) { distance = localize && localize.getDistanceUnit(); } } catch (ignoreDistance) {}
                try { if (fields.tempUnit === true) { temperature = localize && localize.getTemperatureUnit(); } } catch (ignoreTemperature) {}
                if (distance === 'Miles' || distance === 'Kilometers') { settings.speedUnit = distance === 'Miles' ? 'mph' : 'kmh'; }
                if (temperature === 'Fahrenheit' || temperature === 'Celsius') { settings.tempUnit = temperature === 'Fahrenheit' ? 'F' : 'C'; }
                current.source.postMessage({type:'drivedash-system-settings-result',token:current.token,settings:settings},'*');
                return;
            }
            if (value.type === 'drivedash-preferences' && typeof value.id === 'number') {
                context.service.request('preferences',value.values ? {values:value.values} : {},function (error,result) {
                    if (context.view() !== current) { return; }
                    current.source.postMessage({type:'drivedash-preferences-result',token:current.token,id:value.id,error:error || '',result:result},'*');
                });
                return;
            }
            if (value.type === 'drivedash-sample' && typeof value.id === 'number') {
                if (sampling) { current.source.postMessage({type:'drivedash-sample-result',token:current.token,id:value.id,error:'Data reader is busy.'},'*'); return; }
                sampling = true;
                context.service.request('sample',{},function (error,result) {
                    sampling = false;
                    if (context.view() !== current) { return; }
                    current.source.postMessage({type:'drivedash-sample-result',token:current.token,id:value.id,error:error || '',result:result},'*');
                });
                return;
            }
            frames = document.getElementsByTagName('iframe');
            for (i = 0; i < frames.length; i += 1) { if (frames[i].contentWindow === event.source) { frame = frames[i]; break; } }
            if (!frame) { return; }
            try {
                if (value.type === 'drivedash-native-render') { menu.render(frame,value.token,value.menu); }
                else if (value.type === 'drivedash-native-input') { menu.input(frame,value.token,value.action,value.phase); }
            } catch (failure) {
                menu.close(false);
                event.source.postMessage({type:'drivedash-native-error',token:value.token},'*');
            }
        });
        context.onViewClose(function () { menu.close(false); });
        context.onDispose(function () { menu.close(false); });
    });
}(window));
