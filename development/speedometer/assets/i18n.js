(function (global) {
    'use strict';
    var data = {version:1,languages:{
        en_US:{'gui.label':'Speedometer',title:'Speedometer',settings:'Settings',back:'Back',design:'Design','design.bm2014':'Mazda 3 BM · 2014',speedUnits:'Speed units',temperatureUnits:'Temperature units',auto:'Automatic',demo:'DEMO DATA',animate:'Animate demo',on:'On',off:'Off',rpm:'rpm',outside:'Outside',coolant:'Coolant',average:'Average',trip:'Trip',fuel:'Fuel',speed:'Speed',simulated:'Simulated vehicle data',decimal:'.',kmh:'km/h',mph:'mph',celsius:'°C',fahrenheit:'°F',km:'km',mi:'mi',l100:'L/100 km',mpg:'mpg (US)',unitsNote:'CMU units (demo: metric)'},
        de_DE:{'gui.label':'Tacho',title:'Tacho',settings:'Einstellungen',back:'Zurück',design:'Design','design.bm2014':'Mazda 3 BM · 2014',speedUnits:'Geschwindigkeitseinheit',temperatureUnits:'Temperatureinheit',auto:'Automatisch',demo:'DEMOWERTE',animate:'Demowerte bewegen',on:'Ein',off:'Aus',rpm:'U/min',outside:'Außen',coolant:'Kühlmittel',average:'Durchschnitt',trip:'Strecke',fuel:'Tank',speed:'Geschwindigkeit',simulated:'Simulierte Fahrzeugdaten',decimal:',',kmh:'km/h',mph:'mph',celsius:'°C',fahrenheit:'°F',km:'km',mi:'mi',l100:'L/100 km',mpg:'mpg (US)',unitsNote:'CMU-Einheiten (Demo: metrisch)'}
    }};
    global.SpeedometerLanguages = data.languages;
    if (global.MzdGuiI18n) { global.MzdGuiI18n.register('speedometer',data); }
}(window));
