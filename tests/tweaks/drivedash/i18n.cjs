const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assets = path.resolve(__dirname, '../../../usb/tweaks/drivedash/assets');
let registered;
const window = {MzdGuiI18n:{register(id, value){assert.equal(id,'drivedash');registered=value;}}};
vm.runInNewContext(fs.readFileSync(path.join(assets,'i18n.js'),'utf8'),{window});
vm.runInNewContext(fs.readFileSync(path.join(assets,'data.js'),'utf8'),{window});
const expected = 'ar_SA bg_BG cn_HK cs_CS da_DK de_DE el_GR en_AU en_UK en_US es_ES es_MX et_EE fi_FI fr_CN fr_FR he_IL hr_HR hu_HU id_ID it_IT ja_JP lt_LT lv_LV mn_TW ms_MY nl_NL no_NO pl_PL pt_BR pt_PT ro_RO ru_RU sk_SK sr_RS sv_SE th_TH tr_TR uk_UA zh_CN zh_TW'.split(' ');
const languages=window.DriveDashLanguages, keys=Object.keys(languages.en_US).sort();
assert.deepEqual(Object.keys(window.DriveDashLanguageNames).sort(),expected);
for(const name of Object.values(window.DriveDashLanguageNames)){assert.equal(typeof name,'string');assert(name.trim());assert(!/[\u0000-\u001f\ufffd?]/.test(name));}
assert.equal(registered.version,1);assert.equal(registered.languages,languages);
assert.deepEqual(Object.keys(languages).sort(),expected);
for(const code of expected){
    const dictionary=languages[code];
    assert.deepEqual(Object.keys(dictionary).sort(),keys,code+' has every key');
    for(const key of keys){
        assert.equal(typeof dictionary[key],'string');
        assert(dictionary[key].trim().length>0,code+': '+key);
        assert(!/[\u0000-\u001f\ufffd]/.test(dictionary[key]),code+': invalid text '+key);
        assert(!dictionary[key].includes('?'),code+': unexpected encoding substitution '+key);
        assert.equal(dictionary[key].trim(),dictionary[key]);
    }
    for(const field of window.DriveDashData.fields)assert(dictionary['data.'+field.key]);
    assert(!Object.keys(dictionary).some(key=>key.startsWith('language.')),'Native names are not duplicated in dictionaries');
    assert.equal(dictionary['gui.label'],'DriveDash');assert.equal(dictionary.title,'DriveDash');
    if(!/^en_/.test(code))assert.notEqual(dictionary.settings,languages.en_US.settings,code+' is translated');
}
assert.equal(languages.pl_PL.settings,'Ustawienia');
assert.equal(languages.fr_CN.settings,'Paramètres');
assert.equal(languages.pt_BR.settings,'Configurações');
assert.equal(languages.zh_CN['data.coolantC'],'冷却液温度');
assert.equal(languages.mn_TW.settings,languages.zh_TW.settings);
assert.equal(languages.cn_HK.settings,languages.zh_TW.settings);
assert.equal(languages.de_DE.decimal,',');assert.equal(languages.en_US.decimal,'.');
console.log('DRIVEDASH_I18N_PASSED: exact 41 Mazda locale codes, complete UI/data/native-name dictionaries and regional variants.');
