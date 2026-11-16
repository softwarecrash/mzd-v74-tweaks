-- MZD Tweaks settings service (usb/tweaks/mzd-tweaks/assets/service/entry.lua)
-- with an in-memory files table. Isolated evidence only; no CMU.
-- Run: lua5.1 tests/tweaks/mzd-tweaks/service.lua <path to entry.lua>
local entry = assert(arg[1], 'usage: service.lua <entry.lua>')
local factory = assert(loadfile(entry))()

local function fake_files(initial)
    local fs = { content = initial, temp = nil, fail = nil, serial = 0, syncs = 0 }
    fs.exists = function(path)
        return path:match('%.tmp$') and fs.temp ~= nil or fs.content ~= nil
    end
    fs.read = function(path, limit)
        assert(fs.content, 'Cannot read file.')
        assert(#fs.content <= limit, 'File is too large.')
        return fs.content
    end
    fs.write_new = function(path, value)
        if fs.fail == 'write_new' then error('Injected write_new failure', 0) end
        assert(fs.temp == nil, 'Temp file already exists.')
        fs.temp = value
    end
    fs.rename = function(source, target)
        if fs.fail == 'rename' then error('Injected rename failure', 0) end
        assert(fs.temp, 'Cannot publish file.')
        fs.content = fs.temp
        fs.temp = nil
    end
    fs.remove_if_exists = function(path)
        if path:match('%.tmp$') then fs.temp = nil else fs.content = nil end
    end
    fs.sync_directory = function() fs.syncs = fs.syncs + 1 end
    fs.random = function() fs.serial = fs.serial + 1; return 'r' .. fs.serial end
    return fs
end

local function service(fs)
    return factory({ files = fs, config = '/data/mzd-tweaks/settings.js' })
end

local function same(actual, expected, message)
    for k, v in pairs(expected) do
        if type(v) == 'table' then
            if type(actual[k]) ~= 'table' then error(message .. ': ' .. k .. ' is not a table', 2) end
            same(actual[k], v, message .. '.' .. k)
        elseif actual[k] ~= v then
            error(message .. ': ' .. k .. ' is ' .. tostring(actual[k]), 2)
        end
    end
    for k in pairs(actual) do
        if expected[k] == nil then error(message .. ': unexpected ' .. k, 2) end
    end
end

local AUDIO_KEYS = {
    'audio_traffic_info',
    'audio_fm_radio',
    'audio_am_radio',
    'audio_dab',
    'audio_sat_radio',
    'audio_xm_audio',
    'audio_aha_radio',
    'audio_pandora',
    'audio_stitcher',
    'audio_bt_audio',
    'audio_car_play_wifi',
    'audio_car_play',
    'audio_android_auto',
    'audio_usb_a',
    'audio_usb_b',
    'audio_cd',
    'audio_aux_in',
    'audio_dvd',
    'audio_tv'
}

local DEFAULTS = {
    main_menu_loop = false,
    list_loop = false,
    list_beep = true,
    short_delay = false,
    audio_order_custom = false
}
local DEFAULT_AUDIO_ORDER = {}
for i, k in ipairs(AUDIO_KEYS) do
    DEFAULTS['audio_order.' .. k] = i - 1
    DEFAULT_AUDIO_ORDER[k] = i - 1
end
DEFAULTS.audio_order = DEFAULT_AUDIO_ORDER

local function js(a, b, c, d, custom, audio_table)
    custom = custom or 'false'
    local lines = {
        'window.mzdTweaks = {',
        '    "main_menu_loop": ' .. a .. ',',
        '    "list_loop": ' .. b .. ',',
        '    "list_beep": ' .. c .. ',',
        '    "short_delay": ' .. d .. ',',
        '    "audio_order_custom": ' .. custom .. ',',
        '    "audio_order": {'
    }
    for i, k in ipairs(AUDIO_KEYS) do
        local val = (audio_table and audio_table[k] ~= nil) and audio_table[k] or (i - 1)
        local comma = (i < #AUDIO_KEYS) and ',' or ''
        lines[#lines + 1] = '        "' .. k .. '": ' .. tostring(val) .. comma
    end
    lines[#lines + 1] = '    }'
    lines[#lines + 1] = '};'
    return table.concat(lines, '\n') .. '\n'
end

-- Defaults without a file; get writes settings.js so the next boot has it.
do
    local fs = fake_files()
    same(service(fs).request('get').settings, DEFAULTS, 'defaults')
    assert(fs.content == js('false', 'false', 'true', 'false'), 'get creates settings.js')
    assert(fs.temp == nil)
end

-- Parsing boolean values and audio order from JS object.
do
    local custom_audio = {}
    for i, k in ipairs(AUDIO_KEYS) do
        custom_audio[k] = #AUDIO_KEYS - i
    end
    local custom_js = js('true', 'false', 'false', 'true', 'true', custom_audio)
    local expected = {
        main_menu_loop = true,
        list_loop = false,
        list_beep = false,
        short_delay = true,
        audio_order_custom = true,
        audio_order = custom_audio
    }
    for _, k in ipairs(AUDIO_KEYS) do
        expected['audio_order.' .. k] = custom_audio[k]
    end
    same(service(fake_files(custom_js)).request('get').settings, expected, 'parsed')
end

-- Corrupt settings file auto-heals to defaults and writes valid defaults back to file
do
    local corrupt_js = 'window.mzdTweaks = { corrupt syntax ...'
    local fs = fake_files(corrupt_js)
    local svc = service(fs)
    local res = svc.request('get')
    same(res.settings, DEFAULTS, 'corrupt file heals to defaults')
    assert(fs.content:match('"main_menu_loop"%s*:%s*false'), 'valid defaults rewritten to disk')
end

-- Validating audio_order values: accept only integers from 0 to #AUDIO_KEYS - 1
do
    local fs = fake_files(js('false', 'false', 'true', 'false'))
    local svc = service(fs)

    -- Non-integer refused
    local ok, err = pcall(svc.request, 'set', { key = 'audio_order', value = { audio_fm_radio = 1.5 } })
    assert(not ok and tostring(err):match('Invalid setting value'), 'fractional value refused: ' .. tostring(err))

    -- Negative number refused
    ok, err = pcall(svc.request, 'set', { key = 'audio_order', value = { audio_fm_radio = -1 } })
    assert(not ok and tostring(err):match('Invalid setting value'), 'negative index refused: ' .. tostring(err))

    -- Out of bounds (> #AUDIO_KEYS - 1) refused
    ok, err = pcall(svc.request, 'set', { key = 'audio_order', value = { audio_fm_radio = #AUDIO_KEYS } })
    assert(not ok and tostring(err):match('Invalid setting value'), 'out of range index refused: ' .. tostring(err))

    -- Unknown audio source key refused
    ok, err = pcall(svc.request, 'set', { key = 'audio_order', value = { audio_unknown_src = 0 } })
    assert(not ok and tostring(err):match('Invalid setting value'), 'unknown audio source key refused: ' .. tostring(err))
end

-- set writes settings.js in the format resident.js expects.
do
    local fs = fake_files(js('false', 'false', 'true', 'false'))
    local svc = service(fs)
    local expected = {}
    for k, v in pairs(DEFAULTS) do expected[k] = v end
    expected.list_loop = true
    same(svc.request('set', { key = 'list_loop', value = true }).settings, expected, 'set result')
    assert(fs.content == js('false', 'true', 'true', 'false'), 'js written')
    assert(fs.syncs > 0, 'the directory is synced')
    assert(fs.temp == nil, 'no temp file remains')
    same(service(fs).request('get').settings, expected, 'a fresh service reads it back')
end

-- set audio_order_custom toggles feature flag.
do
    local fs = fake_files(js('false', 'false', 'true', 'false'))
    local svc = service(fs)
    local res = svc.request('set', { key = 'audio_order_custom', value = true })
    assert(res.settings.audio_order_custom == true)
    assert(fs.content:match('"audio_order_custom"%s*:%s*true'))
end

-- set audio_order updates the reordered items.
do
    local fs = fake_files(js('false', 'false', 'true', 'false'))
    local svc = service(fs)
    local full_order = {}
    for i, k in ipairs(AUDIO_KEYS) do
        full_order[k] = i - 1
    end
    full_order.audio_fm_radio = 5
    full_order.audio_am_radio = 0
    local res = svc.request('set', { key = 'audio_order', value = full_order })
    assert(res.settings['audio_order.audio_fm_radio'] == 5)
    assert(res.settings['audio_order.audio_am_radio'] == 0)
    assert(res.settings.audio_order.audio_fm_radio == 5)
    assert(res.settings.audio_order.audio_am_radio == 0)

    -- Partial order missing required keys is refused
    local ok, err = pcall(svc.request, 'set', { key = 'audio_order', value = { audio_fm_radio = 5 } })
    assert(not ok and tostring(err):match('Invalid setting value'), 'partial order refused: ' .. tostring(err))
end

-- Unknown keys, bad values and unknown operations are refused; nothing changes.
do
    local initial = js('false', 'false', 'true', 'false')
    local fs = fake_files(initial)
    local svc = service(fs)
    local ok, err = pcall(svc.request, 'set', { key = 'list_lop', value = true })
    assert(not ok and tostring(err):match('Unknown setting: list_lop'), 'unknown key refused: ' .. tostring(err))
    ok, err = pcall(svc.request, 'set', { value = true })
    assert(not ok and tostring(err):match('Unknown setting'), 'missing key refused')
    ok, err = pcall(svc.request, 'set', { key = 'list_loop', value = 'true' })
    assert(not ok and tostring(err):match('Invalid setting value'), 'non-boolean refused')
    ok, err = pcall(svc.request, 'set', { key = 'audio_order', value = 'not-a-table' })
    assert(not ok and tostring(err):match('Invalid setting value'), 'non-table audio_order refused')
    ok = pcall(svc.request, 'set', 'list_loop')
    assert(not ok, 'non-table arguments refused')
    ok, err = pcall(svc.request, 'drop', {})
    assert(not ok and tostring(err):match('Unknown operation: drop'), 'unknown operation refused')
    assert(fs.content == initial, 'file unchanged')
end

-- A failed write of the temp file leaves the saved file untouched.
do
    local initial = js('false', 'false', 'true', 'false')
    local fs = fake_files(initial)
    fs.fail = 'write_new'
    local ok = pcall(service(fs).request, 'set', { key = 'short_delay', value = true })
    assert(not ok, 'the save fails')
    assert(fs.content == initial, 'js untouched')
    assert(fs.temp == nil, 'the temp file is removed')
end

-- A failed publish of settings.js leaves the saved file untouched.
do
    local initial = js('false', 'false', 'true', 'false')
    local fs = fake_files(initial)
    fs.fail = 'rename'
    local ok, err = pcall(service(fs).request, 'set', { key = 'main_menu_loop', value = true })
    assert(not ok and tostring(err):match('Injected rename failure'), 'the original error is raised: ' .. tostring(err))
    assert(fs.content == initial, 'js untouched')
    assert(fs.temp == nil, 'the temp file is removed')
end

print('MZD_TWEAKS_SERVICE_PASSED: defaults, parsing, audio order, js written, refusals change nothing, failed temp write and failed publish keep the saved settings.')
