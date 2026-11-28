-- MZD Tweaks settings service (usb/tweaks/mzd-tweaks/assets/service/entry.lua)
-- with an in-memory files table. Isolated evidence only; no CMU.
-- Run: lua5.1 tests/tweaks/mzd-tweaks/service.lua <path to entry.lua>
local entry = assert(arg[1], 'usage: service.lua <entry.lua>')
local factory = assert(loadfile(entry))()

local SETTINGS_PATH = '/data/mzd-tweaks/settings.js'

-- others: other files by path (the installed Fuel Consumption Ending Screen package).
local function fake_files(initial, others)
    local fs = { content = initial, temp = nil, fail = nil, serial = 0, syncs = 0, others = others or {}, reads = {} }
    fs.exists = function(path)
        if fs.others[path] ~= nil then return true end
        return path:match('%.tmp$') and fs.temp ~= nil or (path == SETTINGS_PATH and fs.content ~= nil)
    end
    fs.read = function(path, limit)
        fs.reads[#fs.reads + 1] = path
        if path ~= SETTINGS_PATH then
            local other = fs.others[path]
            if other == nil then error('Missing path: ' .. path, 0) end
            assert(#other <= limit, 'File is too large.')
            return other
        end
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
    return factory({ files = fs, config = SETTINGS_PATH })
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

local MAIN_MENU_KEYS = {
    'main_menu_app',
    'main_menu_ent',
    'main_menu_com',
    'main_menu_nav',
    'main_menu_set'
}

local DEFAULTS = {
    main_menu_loop = false,
    main_menu_coins_layout = 'ellipse',
    main_menu_coins_size = 100,
    main_menu_coins_glow = true,
    list_loop = false,
    list_beep = true,
    short_delay = false,
    statusbar_date = 'off',
    bluetooth_notification = true,
    theme = 'red',
    main_menu_order_custom = false,
    skip_usb_reconnect = false,
    audio_order_custom = false,
    fuel_ending_delay = 7
}
local DEFAULT_MAIN_MENU_ORDER = {}
for i, k in ipairs(MAIN_MENU_KEYS) do
    DEFAULTS['main_menu_order.' .. k] = i - 1
    DEFAULT_MAIN_MENU_ORDER[k] = i - 1
end
DEFAULTS.main_menu_order = DEFAULT_MAIN_MENU_ORDER
local DEFAULT_AUDIO_ORDER = {}
for i, k in ipairs(AUDIO_KEYS) do
    DEFAULTS['audio_order.' .. k] = i - 1
    DEFAULT_AUDIO_ORDER[k] = i - 1
end
DEFAULTS.audio_order = DEFAULT_AUDIO_ORDER

local function js(a, b, c, d, custom, audio_table, statusbar_date, theme, main_menu_coins_glow, coins_size, coins_layout, bluetooth_notification, main_menu_custom, main_menu_table, fuel_delay, skip)
    skip = skip or 'false'
    main_menu_coins_glow = main_menu_coins_glow or 'true'
    custom = custom or 'false'
    main_menu_custom = main_menu_custom or 'false'
    theme = theme or 'red'
    coins_size = coins_size or 100
    coins_layout = coins_layout or 'ellipse'
    bluetooth_notification = bluetooth_notification or 'true'
    local lines = {
        'window.mzdTweaks = {',
        '    "main_menu_loop": ' .. a .. ',',
        '    "main_menu_coins_glow": ' .. main_menu_coins_glow .. ',',
        '    "list_loop": ' .. b .. ',',
        '    "list_beep": ' .. c .. ',',
        '    "short_delay": ' .. d .. ',',
        '    "bluetooth_notification": ' .. bluetooth_notification .. ',',
        '    "main_menu_order_custom": ' .. main_menu_custom .. ',',
        '    "skip_usb_reconnect": ' .. skip .. ',',
        '    "audio_order_custom": ' .. custom .. ',',
        '    "statusbar_date": "' .. (statusbar_date or 'off') .. '",',
        '    "main_menu_coins_layout": "' .. coins_layout .. '",',
        '    "main_menu_coins_size": ' .. tostring(coins_size) .. ',',
        '    "theme": "' .. theme .. '",',
        '    "fuel_ending_delay": ' .. tostring(fuel_delay or 7) .. ',',
        '    "main_menu_order": {'
    }
    for i, k in ipairs(MAIN_MENU_KEYS) do
        local val = (main_menu_table and main_menu_table[k] ~= nil) and main_menu_table[k] or (i - 1)
        local comma = (i < #MAIN_MENU_KEYS) and ',' or ''
        lines[#lines + 1] = '        "' .. k .. '": ' .. tostring(val) .. comma
    end
    lines[#lines + 1] = '    },'
    lines[#lines + 1] = '    "audio_order": {'
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
    local custom_js = js('true', 'false', 'false', 'true', 'true', custom_audio, nil, nil, 'false', nil, nil, nil, nil, nil, nil, 'true')
    local expected = {
        main_menu_loop = true,
        main_menu_coins_layout = 'ellipse',
        main_menu_coins_size = 100,
        main_menu_coins_glow = false,
        list_loop = false,
        list_beep = false,
        short_delay = true,
        statusbar_date = 'off',
        bluetooth_notification = true,
        theme = 'red',
        main_menu_order_custom = false,
        main_menu_order = DEFAULT_MAIN_MENU_ORDER,
        skip_usb_reconnect = true,
        audio_order_custom = true,
        fuel_ending_delay = 7,
        audio_order = custom_audio
    }
    for i, k in ipairs(MAIN_MENU_KEYS) do
        expected['main_menu_order.' .. k] = i - 1
    end
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

-- set main_menu_coins_glow toggles main menu icon glow.
do
    local fs = fake_files(js('false', 'false', 'true', 'false'))
    local svc = service(fs)
    local res = svc.request('set', { key = 'main_menu_coins_glow', value = false })
    assert(res.settings.main_menu_coins_glow == false)
    assert(fs.content:match('"main_menu_coins_glow"%s*:%s*false'))
end

-- set audio_order_custom toggles feature flag.
do
    local fs = fake_files(js('false', 'false', 'true', 'false'))
    local svc = service(fs)
    local res = svc.request('set', { key = 'audio_order_custom', value = true })
    assert(res.settings.audio_order_custom == true)
    assert(fs.content:match('"audio_order_custom"%s*:%s*true'))
end

-- set bluetooth_notification toggles bluetooth connection notification.
do
    local fs = fake_files(js('false', 'false', 'true', 'false'))
    local svc = service(fs)
    local res = svc.request('set', { key = 'bluetooth_notification', value = false })
    assert(res.settings.bluetooth_notification == false)
    assert(fs.content:match('"bluetooth_notification"%s*:%s*false'))
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

-- set main_menu_order saves and rejects invalid/partial orders.
do
    local fs = fake_files(js('false', 'false', 'true', 'false'))
    local svc = service(fs)
    local res = svc.request('set', { key = 'main_menu_order_custom', value = true })
    assert(res.settings.main_menu_order_custom == true)

    local new_order = {
        main_menu_app = 4,
        main_menu_ent = 3,
        main_menu_com = 2,
        main_menu_nav = 1,
        main_menu_set = 0
    }
    res = svc.request('set', { key = 'main_menu_order', value = new_order })
    assert(res.settings.main_menu_order.main_menu_set == 0)
    assert(res.settings['main_menu_order.main_menu_app'] == 4)

    local ok, err = pcall(svc.request, 'set', { key = 'main_menu_order', value = { main_menu_app = 0 } })
    assert(not ok and tostring(err):match('Invalid setting value'), 'partial main_menu_order refused: ' .. tostring(err))

    ok, err = pcall(svc.request, 'set', { key = 'main_menu_order', value = {
        main_menu_app = 5, main_menu_ent = 1, main_menu_com = 2, main_menu_nav = 3, main_menu_set = 4
    } })
    assert(not ok and tostring(err):match('Invalid setting value'), 'out-of-range main_menu_order refused: ' .. tostring(err))
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

-- set theme saves valid theme and rejects invalid theme.
do
    local fs = fake_files(js('false', 'false', 'true', 'false'))
    local svc = service(fs)
    local expected = {}
    for k, v in pairs(DEFAULTS) do expected[k] = v end
    expected.theme = 'blue'
    same(svc.request('set', { key = 'theme', value = 'blue' }).settings, expected, 'theme set to blue')
    assert(fs.content == js('false', 'false', 'true', 'false', 'false', nil, nil, 'blue'), 'theme blue written')

    -- Invalid theme string refused
    local ok, err = pcall(svc.request, 'set', { key = 'theme', value = 'neon' })
    assert(not ok and tostring(err):match('Invalid setting value'), 'invalid theme refused: ' .. tostring(err))

    -- Non-string refused
    ok, err = pcall(svc.request, 'set', { key = 'theme', value = 123 })
    assert(not ok and tostring(err):match('Invalid setting value'), 'numeric theme refused')
end

-- set main_menu_coins_size saves valid size and rejects invalid size.
do
    local fs = fake_files(js('false', 'false', 'true', 'false'))
    local svc = service(fs)
    local expected = {}
    for k, v in pairs(DEFAULTS) do expected[k] = v end
    expected.main_menu_coins_size = 80
    same(svc.request('set', { key = 'main_menu_coins_size', value = 80 }).settings, expected, 'coins size set to 80')
    assert(fs.content == js('false', 'false', 'true', 'false', 'false', nil, nil, 'red', 'true', 80), 'coins size 80 written')

    expected.main_menu_coins_size = 60
    same(svc.request('set', { key = 'main_menu_coins_size', value = 60 }).settings, expected, 'coins size set to 60')
    assert(fs.content == js('false', 'false', 'true', 'false', 'false', nil, nil, 'red', 'true', 60), 'coins size 60 written')

    -- Invalid coins size refused
    local ok, err = pcall(svc.request, 'set', { key = 'main_menu_coins_size', value = 25 })
    assert(not ok and tostring(err):match('Invalid setting value'), 'invalid coins size refused: ' .. tostring(err))

    -- Non-number (string) refused
    ok, err = pcall(svc.request, 'set', { key = 'main_menu_coins_size', value = '80' })
    assert(not ok and tostring(err):match('Invalid setting value'), 'string coins size refused')
end

-- set main_menu_coins_layout saves valid layout and rejects invalid layout.
do
    local fs = fake_files(js('false', 'false', 'true', 'false'))
    local svc = service(fs)
    local expected = {}
    for k, v in pairs(DEFAULTS) do expected[k] = v end
    expected.main_menu_coins_layout = 'flat'
    same(svc.request('set', { key = 'main_menu_coins_layout', value = 'flat' }).settings, expected, 'coins layout set to flat')
    assert(fs.content == js('false', 'false', 'true', 'false', 'false', nil, nil, 'red', 'true', 100, 'flat'), 'coins layout flat written')

    -- Invalid layout refused
    local ok, err = pcall(svc.request, 'set', { key = 'main_menu_coins_layout', value = 'round' })
    assert(not ok and tostring(err):match('Invalid setting value'), 'invalid coins layout refused: ' .. tostring(err))

    -- Non-string refused
    ok, err = pcall(svc.request, 'set', { key = 'main_menu_coins_layout', value = true })
    assert(not ok and tostring(err):match('Invalid setting value'), 'boolean coins layout refused')
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

-- set refuses when existing settings.js is unreadable or malformed, leaving it untouched.
do
    local corrupt_js = 'window.mzdTweaks = { corrupt syntax ...'
    local fs = fake_files(corrupt_js)
    local svc = service(fs)
    for _, req in ipairs({
        { key = 'main_menu_loop', value = true },
        { key = 'theme', value = 'blue' },
        { key = 'main_menu_coins_size', value = 80 },
        { key = 'main_menu_coins_layout', value = 'flat' },
        { key = 'statusbar_date', value = 'weekday' },
        { key = 'fuel_ending_delay', value = 10 }
    }) do
        local ok, err = pcall(svc.request, 'set', req)
        assert(not ok and tostring(err):match('Cannot read saved settings'), 'malformed file refuses set for ' .. req.key)
    end
    local valid_order = {}
    for i, k in ipairs(AUDIO_KEYS) do valid_order[k] = i - 1 end
    local ok_audio, err_audio = pcall(svc.request, 'set', { key = 'audio_order', value = valid_order })
    assert(not ok_audio and tostring(err_audio):match('Cannot read saved settings'), 'malformed file refuses set for audio_order')
    assert(fs.content == corrupt_js, 'malformed file left untouched by set')

    local saved_js = js('true', 'false', 'true', 'false')
    local fs_io = fake_files(saved_js)
    fs_io.read = function() error('Injected I/O read failure', 0) end
    local svc_io = service(fs_io)
    local ok, err = pcall(svc_io.request, 'set', { key = 'theme', value = 'blue' })
    assert(not ok and tostring(err):match('Cannot read saved settings'), 'unreadable file refuses set')
    assert(fs_io.content == saved_js, 'unreadable file left untouched by set')
end

-- Status bar date: four modes; true/false from older files read as weekday/off.
do
    local function read(content)
        return service(fake_files(content)).request('get').settings.statusbar_date
    end
    for _, mode in ipairs({ 'off', 'weekday', 'month_text', 'month_numeric' }) do
        assert(read(js('false', 'false', 'true', 'false', nil, nil, mode)) == mode, 'reads ' .. mode)
    end
    local plain = js('false', 'false', 'true', 'false')
    local old_true = plain:gsub('"statusbar_date": "off"', '"statusbar_date": true')
    local old_false = plain:gsub('"statusbar_date": "off"', '"statusbar_date": false')
    local unknown = plain:gsub('"statusbar_date": "off"', '"statusbar_date": "stacked"')
    local missing = plain:gsub('    "statusbar_date": "off",\n', '')
    assert(read(old_true) == 'weekday', 'old true reads weekday')
    assert(read(old_false) == 'off', 'old false reads off')
    assert(read(unknown) == 'off', 'unknown mode reads off')
    assert(not missing:find('statusbar_date') and read(missing) == 'off', 'missing key reads off')

    local fs = fake_files(old_true)
    local svc = service(fs)
    local res = svc.request('set', { key = 'statusbar_date', value = 'month_text' })
    assert(res.settings.statusbar_date == 'month_text' and res.settings.list_beep == true, 'set month_text keeps other values')
    assert(fs.content == js('false', 'false', 'true', 'false', nil, nil, 'month_text'), 'js written with month_text')
    svc.request('set', { key = 'statusbar_date', value = 'month_numeric' })
    assert(service(fs).request('get').settings.statusbar_date == 'month_numeric', 'a fresh service reads month_numeric back')
    local saved = fs.content
    for _, bad in ipairs({ true, false, 'on', 'month', 'Weekday', 1 }) do
        local ok, err = pcall(svc.request, 'set', { key = 'statusbar_date', value = bad })
        assert(not ok and tostring(err):match('Invalid setting value'), 'refused ' .. tostring(bad) .. ': ' .. tostring(err))
    end
    assert(fs.content == saved, 'refused values change nothing')
    svc.request('set', { key = 'list_loop', value = true })
    assert(fs.content == js('false', 'true', 'true', 'false', nil, nil, 'month_numeric'), 'mode kept on other saves')
end

-- Fuel ending screen time: read, defaults for missing or bad values, saved within 5-30 s.
do
    -- settings.js from MZD Tweaks 1.0.x has no fuel_ending_delay: 7 s.
    local old = js('false', 'false', 'true', 'false'):gsub('    "fuel_ending_delay": 7,\n', '')
    assert(not old:find('fuel_ending_delay'), 'old file without the key')
    assert(service(fake_files(old)).request('get').settings.fuel_ending_delay == 7, 'missing key reads 7')
    assert(service(fake_files(js('false', 'false', 'true', 'false', nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, 12))).request('get').settings.fuel_ending_delay == 12, 'saved 12 is read')
    for _, bad in ipairs({ '4', '31', '0', '999' }) do
        local content = js('false', 'false', 'true', 'false'):gsub('"fuel_ending_delay": 7', '"fuel_ending_delay": ' .. bad)
        assert(service(fake_files(content)).request('get').settings.fuel_ending_delay == 7, 'out of range ' .. bad .. ' reads 7')
    end

    local fs = fake_files(js('false', 'false', 'true', 'false'))
    local svc = service(fs)
    local res = svc.request('set', { key = 'fuel_ending_delay', value = 5 })
    assert(res.settings.fuel_ending_delay == 5 and res.settings.list_beep == true, 'set 5 keeps other values')
    assert(fs.content == js('false', 'false', 'true', 'false', nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, 5), 'js written with 5')
    svc.request('set', { key = 'fuel_ending_delay', value = 30 })
    assert(fs.content == js('false', 'false', 'true', 'false', nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, 30), 'js written with 30')
    assert(service(fs).request('get').settings.fuel_ending_delay == 30, 'a fresh service reads 30 back')
    local saved = fs.content
    for _, bad in ipairs({ 4, 31, 7.5, -1, 0 / 0, math.huge, '10', true }) do
        local ok, err = pcall(svc.request, 'set', { key = 'fuel_ending_delay', value = bad })
        assert(not ok and tostring(err):match('Invalid setting value'), 'refused ' .. tostring(bad) .. ': ' .. tostring(err))
    end
    assert(fs.content == saved, 'refused values change nothing')
    -- A boolean setting saved later keeps the time.
    svc.request('set', { key = 'list_loop', value = true })
    assert(fs.content == js('false', 'true', 'true', 'false', nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, 30), 'time kept on other saves')
end

-- The row is offered (limits) only while Fuel Consumption Ending Screen 1.1.0 or later is installed.
do
    local PKG = '/tmp/mnt/data_persist/mzd-tweaks/installed/fuel-consumption-ending'
    local STATE, MANIFEST = PKG .. '/state.conf', PKG .. '/package/tweaks/fuel-consumption-ending/manifest.conf'
    local INSTALLED = 'format=1\nstate=installed\n'
    local function manifest(version)
        return 'contract_version=1\nid=fuel-consumption-ending\nname=Fuel Consumption Ending Screen\nversion=' .. version .. '\ntype=files\n'
    end
    local function limits(others)
        local res = service(fake_files(js('false', 'false', 'true', 'false'), others)).request('get')
        return res.limits and res.limits.fuel_ending_delay
    end
    local l = limits({ [STATE] = INSTALLED, [MANIFEST] = manifest('1.1.0') })
    assert(l and l.min == 5 and l.max == 30 and l.step == 1, 'installed 1.1.0 offers 5-30 s')
    assert(limits({ [STATE] = INSTALLED, [MANIFEST] = manifest('1.10.2') }), 'later minor version')
    assert(limits({ [STATE] = INSTALLED, [MANIFEST] = manifest('2.0.0') }), 'later major version')
    assert(not limits({}), 'not installed: no row')
    assert(not limits({ [STATE] = INSTALLED, [MANIFEST] = manifest('1.0.0') }), '1.0.0 does not read the time: no row')
    assert(not limits({ [STATE] = INSTALLED, [MANIFEST] = manifest('0.9.9') }), 'older version: no row')
    for _, state in ipairs({ 'prepared', 'installing', 'uninstalling', 'restoring', 'failed' }) do
        assert(not limits({ [STATE] = 'format=1\nstate=' .. state .. '\n', [MANIFEST] = manifest('1.1.0') }), state .. ': no row')
    end
    assert(not limits({ [STATE] = INSTALLED }), 'missing manifest: no row')
    assert(not limits({ [STATE] = INSTALLED, [MANIFEST] = 'id=fuel-consumption-ending\n' }), 'no version: no row')
    assert(not limits({ [STATE] = 'format=1\nxstate=installed\n', [MANIFEST] = manifest('1.1.0') }), 'only a whole state line counts')
    -- The package is read on get only; a save does not read it.
    local fs = fake_files(js('false', 'false', 'true', 'false'), { [STATE] = INSTALLED, [MANIFEST] = manifest('1.1.0') })
    local svc = service(fs)
    fs.reads = {}
    local res = svc.request('set', { key = 'fuel_ending_delay', value = 9 })
    assert(res.limits == nil, 'set returns no limits; the host keeps the last ones')
    for _, path in ipairs(fs.reads) do assert(path == SETTINGS_PATH, 'set read ' .. path) end
end

-- A settings.js saved before skip_usb_reconnect existed keeps its values; the new key is off.
do
    local old_js = js('true', 'true', 'false', 'true'):gsub('    "skip_usb_reconnect": false,\n', '')
    assert(not old_js:find('skip_usb_reconnect'), 'old format has no skip_usb_reconnect line')
    local fs = fake_files(old_js)
    local settings = service(fs).request('get').settings
    assert(settings.skip_usb_reconnect == false, 'missing skip_usb_reconnect reads as false')
    assert(settings.main_menu_loop == true and settings.list_loop == true and settings.short_delay == true, 'old values kept')
    local res = service(fs).request('set', { key = 'skip_usb_reconnect', value = true })
    assert(res.settings.skip_usb_reconnect == true and res.settings.main_menu_loop == true, 'set keeps the other values')
    assert(fs.content == js('true', 'true', 'false', 'true', 'false', nil, nil, nil, nil, nil, nil, nil, nil, nil, nil, 'true'), 'skip_usb_reconnect written')
    local ok, err = pcall(service(fs).request, 'set', { key = 'skip_usb_reconnect', value = 1 })
    assert(not ok and tostring(err):match('Invalid setting value'), 'non-boolean skip_usb_reconnect refused')
end

print('MZD_TWEAKS_SERVICE_PASSED: old settings.js without skip_usb_reconnect, fuel ending time read/saved within 5-30 s and offered only with Fuel Consumption Ending Screen 1.1.0+, status bar date modes and old true/false, defaults, parsing, audio order, js written, refusals change nothing, failed temp write and failed publish keep the saved settings.')
