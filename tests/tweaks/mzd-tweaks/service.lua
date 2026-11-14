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
        if actual[k] ~= v then error(message .. ': ' .. k .. ' is ' .. tostring(actual[k]), 2) end
    end
    for k in pairs(actual) do
        if expected[k] == nil then error(message .. ': unexpected ' .. k, 2) end
    end
end

local DEFAULTS = { main_menu_loop = false, list_loop = false, list_beep = true, short_delay = false }
local function js(a, b, c, d)
    return 'window.mzdTweaks = {\n    "main_menu_loop": ' .. a .. ',\n    "list_loop": ' .. b ..
        ',\n    "list_beep": ' .. c .. ',\n    "short_delay": ' .. d .. '\n};\n'
end

-- Defaults without a file; get writes settings.js so the next boot has it.
do
    local fs = fake_files()
    same(service(fs).request('get').settings, DEFAULTS, 'defaults')
    assert(fs.content == js('false', 'false', 'true', 'false'), 'get creates settings.js')
    assert(fs.temp == nil)
end

-- Parsing boolean values from JS object.
do
    local fs = fake_files('// saved\r\nwindow.mzdTweaks = {\r\n    "main_menu_loop": true,\r\n    "list_loop": false,\r\n    "list_beep": false,\r\n    "short_delay": true\r\n};\r\n')
    same(service(fs).request('get').settings,
        { main_menu_loop = true, list_loop = false, list_beep = false, short_delay = true }, 'parsed')
end

-- set writes settings.js in the format resident.js expects.
do
    local fs = fake_files(js('false', 'false', 'true', 'false'))
    local svc = service(fs)
    same(svc.request('set', { key = 'list_loop', value = true }).settings,
        { main_menu_loop = false, list_loop = true, list_beep = true, short_delay = false }, 'set result')
    assert(fs.content == js('false', 'true', 'true', 'false'), 'js written')
    assert(fs.syncs > 0, 'the directory is synced')
    assert(fs.temp == nil, 'no temp file remains')
    same(service(fs).request('get').settings,
        { main_menu_loop = false, list_loop = true, list_beep = true, short_delay = false }, 'a fresh service reads it back')
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

print('MZD_TWEAKS_SERVICE_PASSED: defaults, parsing, js written, refusals change nothing, failed temp write and failed publish keep the saved settings.')
