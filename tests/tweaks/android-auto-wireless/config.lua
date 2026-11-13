local root='development/candidates/android-auto-wireless/'
local config=assert(loadfile(root..'assets/service/config.lua'))()
local file=assert(io.open(root..'assets/libpatch.conf'));local template=file:read('*a');file:close()
local defaults=config.read(template);assert(not defaults.wireless and defaults.aa_psk=='' and defaults.aa_channel==36)
local original=template..'\n# Keep other AA Mod choices\ntouch = true\ncustom_value = keep=unchanged\n'
local updated=config.update(original,{wireless=true,aa_psk='test key 123',aa_ssid='My Mazda',aa_channel=44})
local values=config.read(updated);assert(values.wireless and values.aa_ssid=='My Mazda' and values.aa_channel==44)
assert(updated:find('touch = true',1,true) and updated:find('custom_value = keep=unchanged',1,true) and updated:find('# Keep other AA Mod choices',1,true))
assert(config.read(updated:gsub('\n','\r\n')).aa_psk=='test key 123')
for _,changes in ipairs({{wireless=true},{aa_psk='short'},{aa_psk='1234567\n8'},{aa_psk='1234567#8'},{aa_channel=165},{aa_channel='36'},{aa_iface='wlan0'},{aa_ap_ip='10.0.0.1'},{aa_ssid=string.rep('a',33)},{aa_ssid=' bad'},{aa_ssid='bad#ssid'}})do assert(not pcall(config.update,template,changes))end
assert(not pcall(config.read,template..'aa_ssid = duplicate\n'))
assert(not pcall(config.read,template:gsub('aa_iface = wlan1','aa_iface = wlan0')))
assert(not pcall(config.read,'$(touch /tmp/no)\n'..template))
local stopped=config.update(updated,{wireless=false});assert(not config.read(stopped).wireless and config.read(stopped).aa_psk=='test key 123')
print('WIRELESS_CONFIG_PASSED: safe defaults, shared parser, partial updates, unrelated settings, CRLF and fixed internal transport.')
