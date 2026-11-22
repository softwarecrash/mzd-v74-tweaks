-- Runtime settings manager for MZD Tweaks.
-- settings.js is the saved source of truth. resident.js loads it at boot so
-- runtime hooks have the saved values before this service is running.
local BOOL_DEFAULTS = {
    main_menu_loop = false,
    main_menu_coins_glow = true,
    list_loop = false,
    list_beep = true,
    short_delay = false,
    bluetooth_notification = true,
    main_menu_order_custom = false,
    audio_order_custom = false
}

local BOOL_KEYS = {
    'main_menu_loop',
    'main_menu_coins_glow',
    'list_loop',
    'list_beep',
    'short_delay',
    'bluetooth_notification',
    'main_menu_order_custom',
    'audio_order_custom'
}

-- Status bar date: off, weekday (Mon 15), month_text (Nov 15) or month_numeric
-- (11/15). true and false from older settings.js files read as weekday and off.
local VALID_DATE_MODES = {
    off = true,
    weekday = true,
    month_text = true,
    month_numeric = true
}

local VALID_THEMES = {
    red = true,
    blue = true,
    green = true,
    orange = true,
    purple = true,
    pink = true,
    silver = true,
    gold = true,
    cyan = true
}

local VALID_COINS_SIZES = {
    [100] = true,
    [80] = true,
    [60] = true
}

local VALID_COINS_LAYOUTS = {
    ellipse = true,
    flat = true
}

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

local AUDIO_DEFAULTS = {}
for i, k in ipairs(AUDIO_KEYS) do
    AUDIO_DEFAULTS[k] = i - 1
end

-- Seconds the Fuel Consumption Ending Screen stays on. The value is read by
-- that tweak's ecoenergyApp.js patch; the row is offered only while a version
-- of the tweak that reads it is installed.
local FUEL_KEY = 'fuel_ending_delay'
local FUEL_DEFAULT, FUEL_MIN, FUEL_MAX = 7, 5, 30
local FUEL_PACKAGE = '/tmp/mnt/data_persist/mzd-tweaks/installed/fuel-consumption-ending'
local FUEL_MIN_VERSION = { 1, 1, 0 }

local function valid_delay(v)
    return type(v) == 'number' and v == v and math.floor(v) == v and v >= FUEL_MIN and v <= FUEL_MAX
end

local MAIN_MENU_KEYS = {
    'main_menu_app',
    'main_menu_ent',
    'main_menu_com',
    'main_menu_nav',
    'main_menu_set'
}

local MAIN_MENU_DEFAULTS = {}
for i, k in ipairs(MAIN_MENU_KEYS) do
    MAIN_MENU_DEFAULTS[k] = i - 1
end

return function(context)
    local fs = context.files
    local settings_path = assert(type(context.config) == 'table' and context.config.settings or context.config, 'settings config path is not configured')
    local dir = settings_path:match('^(.*)/[^/]+$')

    local function read_settings()
        local settings = {}
        local audio_order = {}
        local main_menu_order = {}
        for _, k in ipairs(BOOL_KEYS) do
            settings[k] = BOOL_DEFAULTS[k]
        end
        settings.statusbar_date = 'off'
        settings.theme = 'red'
        settings.main_menu_coins_size = 100
        settings.main_menu_coins_layout = 'ellipse'
        for _, k in ipairs(MAIN_MENU_KEYS) do
            local default_val = MAIN_MENU_DEFAULTS[k]
            settings['main_menu_order.' .. k] = default_val
            main_menu_order[k] = default_val
        end
        settings.main_menu_order = main_menu_order

        for _, k in ipairs(AUDIO_KEYS) do
            local default_val = AUDIO_DEFAULTS[k]
            settings['audio_order.' .. k] = default_val
            audio_order[k] = default_val
        end
        settings.audio_order = audio_order
        settings[FUEL_KEY] = FUEL_DEFAULT

        if not fs.exists(settings_path) then
            return settings, true
        end

        local ok, content = pcall(fs.read, settings_path, 65536)
        if not ok or not content or not content:find('window%.mzdTweaks%s*=') or not content:find('};%s*$') then
            return settings, false
        end

        for _, k in ipairs(BOOL_KEYS) do
            local val = content:match('"' .. k .. '"%s*:%s*([a-z]+)')
            if val == 'true' then
                settings[k] = true
            elseif val == 'false' then
                settings[k] = false
            end
        end

        local date_val = content:match('"statusbar_date"%s*:%s*"([a-z_]+)"')
        if date_val and VALID_DATE_MODES[date_val] then
            settings.statusbar_date = date_val
        else
            local date_bool = content:match('"statusbar_date"%s*:%s*([a-z]+)')
            if date_bool == 'true' then
                settings.statusbar_date = 'weekday'
            end
        end

        local theme_val = content:match('"theme"%s*:%s*"([a-z]+)"')
        if theme_val and VALID_THEMES[theme_val] then
            settings.theme = theme_val
        end

        local coins_size_val = content:match('"main_menu_coins_size"%s*:%s*(%d+)')
        if coins_size_val then
            local num = tonumber(coins_size_val)
            if num and VALID_COINS_SIZES[num] then
                settings.main_menu_coins_size = num
            end
        end

        local coins_layout_val = content:match('"main_menu_coins_layout"%s*:%s*"([a-z]+)"')
        if coins_layout_val and VALID_COINS_LAYOUTS[coins_layout_val] then
            settings.main_menu_coins_layout = coins_layout_val
        end

        local delay = tonumber(content:match('"' .. FUEL_KEY .. '"%s*:%s*(%d+)') or '')
        if valid_delay(delay) then
            settings[FUEL_KEY] = delay
        end

        for _, k in ipairs(MAIN_MENU_KEYS) do
            local val = content:match('"' .. k .. '"%s*:%s*(%d+)')
            if val then
                local num = tonumber(val)
                settings['main_menu_order.' .. k] = num
                main_menu_order[k] = num
            end
        end

        for _, k in ipairs(AUDIO_KEYS) do
            local val = content:match('"' .. k .. '"%s*:%s*(%d+)')
            if val then
                local num = tonumber(val)
                settings['audio_order.' .. k] = num
                audio_order[k] = num
            end
        end

        return settings, true
    end

    local function serialize_js(settings)
        local lines = { 'window.mzdTweaks = {' }
        for _, k in ipairs(BOOL_KEYS) do
            local val = settings[k]
            if val == nil then val = BOOL_DEFAULTS[k] end
            lines[#lines + 1] = '    "' .. k .. '": ' .. (val and 'true' or 'false') .. ','
        end

        local date_mode = settings.statusbar_date
        if not VALID_DATE_MODES[date_mode] then date_mode = 'off' end
        lines[#lines + 1] = '    "statusbar_date": "' .. date_mode .. '",'

        local coins_layout = settings.main_menu_coins_layout
        if not VALID_COINS_LAYOUTS[coins_layout] then coins_layout = 'ellipse' end
        lines[#lines + 1] = '    "main_menu_coins_layout": "' .. coins_layout .. '",'

        local coins_size = settings.main_menu_coins_size
        if not VALID_COINS_SIZES[coins_size] then coins_size = 100 end
        lines[#lines + 1] = '    "main_menu_coins_size": ' .. tostring(coins_size) .. ','

        local theme = settings.theme
        if not VALID_THEMES[theme] then theme = 'red' end
        lines[#lines + 1] = '    "theme": "' .. theme .. '",'
        local delay = settings[FUEL_KEY]
        if not valid_delay(delay) then delay = FUEL_DEFAULT end
        lines[#lines + 1] = '    "' .. FUEL_KEY .. '": ' .. tostring(delay) .. ','
        lines[#lines + 1] = '    "main_menu_order": {'
        for i, k in ipairs(MAIN_MENU_KEYS) do
            local dot_k = 'main_menu_order.' .. k
            local val = settings[dot_k]
            if val == nil and type(settings.main_menu_order) == 'table' then
                val = settings.main_menu_order[k]
            end
            if val == nil then val = MAIN_MENU_DEFAULTS[k] end
            local comma = (i < #MAIN_MENU_KEYS) and ',' or ''
            lines[#lines + 1] = '        "' .. k .. '": ' .. tostring(val) .. comma
        end
        lines[#lines + 1] = '    },'
        lines[#lines + 1] = '    "audio_order": {'
        for i, k in ipairs(AUDIO_KEYS) do
            local dot_k = 'audio_order.' .. k
            local val = settings[dot_k]
            if val == nil and type(settings.audio_order) == 'table' then
                val = settings.audio_order[k]
            end
            if val == nil then val = AUDIO_DEFAULTS[k] end
            local comma = (i < #AUDIO_KEYS) and ',' or ''
            lines[#lines + 1] = '        "' .. k .. '": ' .. tostring(val) .. comma
        end
        lines[#lines + 1] = '    }'
        lines[#lines + 1] = '};'
        return table.concat(lines, '\n') .. '\n'
    end

    -- Read only on a full read (boot and every time the view opens).
    local function fuel_ending_installed()
        local ok, result = pcall(function()
            local state = fs.read(FUEL_PACKAGE .. '/state.conf', 4096)
            if not ('\n' .. state):find('\nstate=installed\n', 1, true) then return false end
            local manifest = fs.read(FUEL_PACKAGE .. '/package/tweaks/fuel-consumption-ending/manifest.conf', 65536)
            local a, b, c = ('\n' .. manifest):match('\nversion=(%d+)%.(%d+)%.(%d+)')
            if not a then return false end
            local version = { tonumber(a), tonumber(b), tonumber(c) }
            for i = 1, 3 do
                if version[i] ~= FUEL_MIN_VERSION[i] then return version[i] > FUEL_MIN_VERSION[i] end
            end
            return true
        end)
        return ok and result == true
    end

    local function temp_for(target_path)
        return target_path .. '.' .. fs.random() .. '.tmp'
    end

    local function write_settings(settings)
        local tmp = temp_for(settings_path)
        local content = serialize_js(settings)
        local ok, err = pcall(fs.write_new, tmp, content)
        if not ok then
            pcall(fs.remove_if_exists, tmp)
            error(err, 0)
        end
        ok, err = pcall(fs.rename, tmp, settings_path)
        if not ok then
            pcall(fs.remove_if_exists, tmp)
            error(err, 0)
        end
        fs.sync_directory(dir)
    end

    return {
        request = function(operation, args)
            if operation == 'get' then
                local settings, valid = read_settings()
                if not fs.exists(settings_path) or not valid then
                    write_settings(settings)
                end
                local limits = {}
                if fuel_ending_installed() then
                    limits[FUEL_KEY] = { min = FUEL_MIN, max = FUEL_MAX, step = 1 }
                end
                return { settings = settings, limits = limits }
            elseif operation == 'set' then
                assert(type(args) == 'table', 'Invalid arguments.')
                if type(args.key) ~= 'string' then
                    error('Unknown setting: ' .. tostring(args.key), 0)
                end
                if args.key == 'statusbar_date' then
                    if type(args.value) ~= 'string' or not VALID_DATE_MODES[args.value] then
                        error('Invalid setting value.', 0)
                    end
                    local settings, valid = read_settings()
                    if not valid then error('Cannot read saved settings.', 0) end
                    settings.statusbar_date = args.value
                    write_settings(settings)
                    return { settings = settings }
                elseif args.key == 'theme' then
                    if type(args.value) ~= 'string' or not VALID_THEMES[args.value] then
                        error('Invalid setting value.', 0)
                    end
                    local settings, valid = read_settings()
                    if not valid then error('Cannot read saved settings.', 0) end
                    settings.theme = args.value
                    write_settings(settings)
                    return { settings = settings }
                elseif args.key == 'main_menu_coins_size' then
                    if type(args.value) ~= 'number' or not VALID_COINS_SIZES[args.value] then
                        error('Invalid setting value.', 0)
                    end
                    local settings, valid = read_settings()
                    if not valid then error('Cannot read saved settings.', 0) end
                    settings.main_menu_coins_size = args.value
                    write_settings(settings)
                    return { settings = settings }
                elseif args.key == 'main_menu_coins_layout' then
                    if type(args.value) ~= 'string' or not VALID_COINS_LAYOUTS[args.value] then
                        error('Invalid setting value.', 0)
                    end
                    local settings, valid = read_settings()
                    if not valid then error('Cannot read saved settings.', 0) end
                    settings.main_menu_coins_layout = args.value
                    write_settings(settings)
                    return { settings = settings }
                elseif args.key == 'main_menu_order' then
                    if type(args.value) ~= 'table' then
                        error('Invalid setting value.', 0)
                    end
                    local order_map = {}
                    for _, k in ipairs(MAIN_MENU_KEYS) do
                        local v = args.value[k]
                        if v == nil then v = args.value['main_menu_order.' .. k] end
                        if type(v) ~= 'number' or v ~= v or v < 0 or v > (#MAIN_MENU_KEYS - 1) or math.floor(v) ~= v or v == math.huge or v == -math.huge then
                            error('Invalid setting value.', 0)
                        end
                        order_map[k] = v
                    end
                    local settings, valid = read_settings()
                    if not valid then error('Cannot read saved settings.', 0) end
                    for _, k in ipairs(MAIN_MENU_KEYS) do
                        settings['main_menu_order.' .. k] = order_map[k]
                        settings.main_menu_order[k] = order_map[k]
                    end
                    write_settings(settings)
                    return { settings = settings }
                elseif args.key == 'audio_order' then
                    if type(args.value) ~= 'table' then
                        error('Invalid setting value.', 0)
                    end
                    local order_map = {}
                    for _, k in ipairs(AUDIO_KEYS) do
                        local v = args.value[k]
                        if v == nil then v = args.value['audio_order.' .. k] end
                        if type(v) ~= 'number' or v ~= v or v < 0 or v > (#AUDIO_KEYS - 1) or math.floor(v) ~= v or v == math.huge or v == -math.huge then
                            error('Invalid setting value.', 0)
                        end
                        order_map[k] = v
                    end
                    local settings, valid = read_settings()
                    if not valid then error('Cannot read saved settings.', 0) end
                    for _, k in ipairs(AUDIO_KEYS) do
                        settings['audio_order.' .. k] = order_map[k]
                        settings.audio_order[k] = order_map[k]
                    end
                    write_settings(settings)
                    return { settings = settings }
                elseif args.key == FUEL_KEY then
                    if not valid_delay(args.value) then
                        error('Invalid setting value.', 0)
                    end
                    local settings, valid = read_settings()
                    if not valid then error('Cannot read saved settings.', 0) end
                    settings[FUEL_KEY] = args.value
                    write_settings(settings)
                    return { settings = settings }
                elseif BOOL_DEFAULTS[args.key] ~= nil then
                    if type(args.value) ~= 'boolean' then
                        error('Invalid setting value.', 0)
                    end
                    local settings, valid = read_settings()
                    if not valid then error('Cannot read saved settings.', 0) end
                    settings[args.key] = args.value
                    write_settings(settings)
                    return { settings = settings }
                else
                    error('Unknown setting: ' .. tostring(args.key), 0)
                end
            else
                error('Unknown operation: ' .. tostring(operation), 0)
            end
        end
    }
end
