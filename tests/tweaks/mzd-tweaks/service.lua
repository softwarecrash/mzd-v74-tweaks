-- MZD Tweaks settings service (usb/tweaks/mzd-tweaks/assets/service/entry.lua)
-- with an in-memory files table. Isolated evidence only; no CMU.
-- Run: lua5.1 tests/tweaks/mzd-tweaks/service.lua <path to entry.lua>
local entry = assert(arg[1], 'usage: service.lua <entry.lua>')
local factory = assert(loadfile(entry))()

local CONF = '/data/mzd-tweaks/settings.conf'
local JS = '/data/mzd-tweaks/settings.js'

local function fake_files()
    local fs = { data = {}, fail = {}, serial = 0, syncs = 0 }
    local function check(name, path)
        local rule = fs.fail[name]
        if rule and path:match(rule) then error('Injected ' .. name .. ' failure: ' .. path, 0) end
    end
    fs.exists = function(path) return fs.data[path] ~= nil end
    fs.read = function(path, limit)
        local value = fs.data[path]
        assert(value, 'Cannot read file.')
        assert(#value <= limit, 'File is too large.')
        return value
    end
    fs.write_new = function(path, value)
        assert(fs.data[path] == nil, 'File already exists.')
        check('write_new', path)
        fs.data[path] = value
    end
    fs.rename = function(source, target)
        assert(fs.data[source], 'Cannot publish file.')
        check('rename', target)
        fs.data[target] = fs.data[source]
        fs.data[source] = nil
    end
    fs.remove_if_exists = function(path) fs.data[path] = nil end
    fs.sync_directory = function() fs.syncs = fs.syncs + 1 end
    fs.random = function() fs.serial = fs.serial + 1; return 'r' .. fs.serial end
    return fs
end

local function service(fs)
    return factory({ files = fs, config = { settings = CONF, script = JS } })
end

local function temps(fs)
    local found = {}
    for path in pairs(fs.data) do
        if path:match('%.tmp$') then found[#found + 1] = path end
    end
    return found
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
local DEFAULT_CONF = 'main_menu_loop=false\nlist_loop=false\nlist_beep=true\nshort_delay=false\n'
local function js(a, b, c, d)
    return 'window.mzdTweaks = {\n    "main_menu_loop": ' .. a .. ',\n    "list_loop": ' .. b ..
        ',\n    "list_beep": ' .. c .. ',\n    "short_delay": ' .. d .. '\n};\n'
end

-- Defaults without a file; get writes settings.js so the next boot has it.
do
    local fs = fake_files()
    same(service(fs).request('get').settings, DEFAULTS, 'defaults')
    assert(fs.data[JS] == js('false', 'false', 'true', 'false'), 'get creates settings.js')
    assert(fs.data[CONF] == nil, 'get does not create settings.conf')
    assert(#temps(fs) == 0)
end

-- Parsing: CRLF, comments, case, spacing, yes/on/0 and unknown values.
do
    local fs = fake_files()
    fs.data[CONF] = '# saved\r\nMAIN_MENU_LOOP = yes\r\nlist_loop=on # note\r\nlist_beep=0\r\nshort_delay=maybe\r\nother=true\r\n'
    same(service(fs).request('get').settings,
        { main_menu_loop = true, list_loop = true, list_beep = false, short_delay = false }, 'parsed')
end

-- set writes both files in the formats resident.js and settings.js expect.
do
    local fs = fake_files()
    fs.data[CONF] = DEFAULT_CONF
    local svc = service(fs)
    same(svc.request('set', { key = 'list_loop', value = true }).settings,
        { main_menu_loop = false, list_loop = true, list_beep = true, short_delay = false }, 'set result')
    assert(fs.data[CONF] == 'main_menu_loop=false\nlist_loop=true\nlist_beep=true\nshort_delay=false\n', 'conf written')
    assert(fs.data[JS] == js('false', 'true', 'true', 'false'), 'js written')
    assert(fs.syncs > 0, 'the directory is synced')
    assert(#temps(fs) == 0, 'no temp files remain')
    same(service(fs).request('get').settings,
        { main_menu_loop = false, list_loop = true, list_beep = true, short_delay = false }, 'a fresh service reads it back')
end

-- Unknown keys, bad values and unknown operations are refused; nothing changes.
do
    local fs = fake_files()
    fs.data[CONF] = DEFAULT_CONF
    fs.data[JS] = js('false', 'false', 'true', 'false')
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
    assert(fs.data[CONF] == DEFAULT_CONF and fs.data[JS] == js('false', 'false', 'true', 'false'), 'both files unchanged')
end

-- A failed write of the second temp file leaves both saved files untouched.
do
    local fs = fake_files()
    fs.data[CONF] = DEFAULT_CONF
    fs.data[JS] = js('false', 'false', 'true', 'false')
    fs.fail.write_new = '^/data/mzd%-tweaks/settings%.js%.'
    local ok = pcall(service(fs).request, 'set', { key = 'short_delay', value = true })
    assert(not ok, 'the save fails')
    assert(fs.data[CONF] == DEFAULT_CONF, 'conf untouched when the js temp cannot be written')
    assert(fs.data[JS] == js('false', 'false', 'true', 'false'), 'js untouched')
    assert(#temps(fs) == 0, 'the first temp file is removed')
end

-- A failed publish of settings.js puts the previous settings.conf back.
do
    local fs = fake_files()
    fs.data[CONF] = DEFAULT_CONF
    fs.data[JS] = js('false', 'false', 'true', 'false')
    fs.fail.rename = '^/data/mzd%-tweaks/settings%.js$'
    local ok, err = pcall(service(fs).request, 'set', { key = 'main_menu_loop', value = true })
    assert(not ok and tostring(err):match('Injected rename failure'), 'the original error is raised: ' .. tostring(err))
    assert(fs.data[CONF] == DEFAULT_CONF, 'the previous conf is restored')
    assert(fs.data[JS] == js('false', 'false', 'true', 'false'), 'js untouched')
    assert(#temps(fs) == 0, 'no temp files remain')
end

-- get repairs a settings.js that differs from settings.conf, and reports a failed repair.
do
    local fs = fake_files()
    fs.data[CONF] = 'main_menu_loop=true\nlist_loop=false\nlist_beep=true\nshort_delay=false\n'
    fs.data[JS] = js('false', 'false', 'true', 'false')
    service(fs).request('get')
    assert(fs.data[JS] == js('true', 'false', 'true', 'false'), 'stale settings.js is rewritten')

    fs.data[JS] = js('false', 'false', 'true', 'false')
    fs.fail.rename = '^/data/mzd%-tweaks/settings%.js$'
    local ok = pcall(service(fs).request, 'get')
    assert(not ok, 'a failed repair is reported, not ignored')
    assert(#temps(fs) == 0)
end

print('MZD_TWEAKS_SERVICE_PASSED: defaults, parsing, both files written, refusals change nothing, failed temp write and failed publish keep the saved settings, stale settings.js repaired.')
