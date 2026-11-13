-- Pure config adapter. Never evaluates configuration or starts services.
local M={}
local order={'wireless','aa_ssid','aa_psk','aa_channel'}
local editable={wireless=true,aa_ssid=true,aa_psk=true,aa_channel=true}
local fixed={aa_iface='wlan1',aa_ap_ip='192.168.53.1',aa_tcp_ip='0.0.0.0',aa_tcp_port='5277',aa_security='5',aa_hidden='false'}
local channels={[36]=true,[40]=true,[44]=true,[48]=true}
local function trim(s)return(s:gsub('^%s+',''):gsub('%s+$',''))end
local function lines(text)
    assert(type(text)=='string' and #text<=65536 and not text:find('%z'),'Invalid config file.')
    local rows,values,seen={},{},{}
    for line in (text..'\n'):gmatch('([^\n]*)\n')do
        line=line:gsub('\r$','')
        local key,value=line:match('^%s*([a-z][a-z0-9_]*)%s*=%s*(.-)%s*$')
        if key then
            if editable[key] or fixed[key]then
                assert(not seen[key],'Duplicate wireless config field: '..key)
                seen[key]=true;values[key]=value
            end
        else assert(trim(line)=='' or line:match('^%s*#'),'Invalid config line.')end
        rows[#rows+1]={text=line,key=key}
    end
    return rows,values
end
local function validate(values)
    assert(type(values.wireless)=='boolean','Wireless must be enabled or disabled.')
    assert(type(values.aa_ssid)=='string' and #values.aa_ssid>=1 and #values.aa_ssid<=32 and values.aa_ssid==trim(values.aa_ssid) and not values.aa_ssid:find('[%c#]'),'SSID must contain 1-32 bytes without control characters or #.')
    assert(type(values.aa_psk)=='string','WPA2 password must be text.')
    local password=values.aa_psk
    assert((password=='' and not values.wireless) or (#password>=8 and #password<=63 and password==trim(password) and not password:find('[^ -~]') and not password:find('#',1,true)),'WPA2 password must contain 8-63 printable ASCII characters without # or surrounding spaces.')
    assert(type(values.aa_channel)=='number' and channels[values.aa_channel],'Unsupported 5 GHz channel.')
    return values
end
function M.read(text)
    local _,raw=lines(text)
    for key,value in pairs(fixed)do assert(raw[key]==value,'Unsupported internal transport setting: '..key)end
    assert(raw.wireless=='true' or raw.wireless=='false','Invalid wireless flag.')
    return validate({wireless=raw.wireless=='true',aa_ssid=raw.aa_ssid,aa_psk=raw.aa_psk,aa_channel=tonumber(raw.aa_channel)})
end
function M.update(text,changes)
    assert(type(changes)=='table','Settings changes required.')
    local values=M.read(text)
    for key,value in pairs(changes)do assert(editable[key],'Unknown or internal setting: '..tostring(key));values[key]=value end
    validate(values)
    local rows=lines(text);local output,seen={},{}
    for _,row in ipairs(rows)do
        if editable[row.key]then output[#output+1]=row.key..' = '..tostring(values[row.key]);seen[row.key]=true
        else output[#output+1]=row.text end
    end
    for _,key in ipairs(order)do if not seen[key]then output[#output+1]=key..' = '..tostring(values[key])end end
    return table.concat(output,'\n'):gsub('\n+$','')..'\n'
end
return M
