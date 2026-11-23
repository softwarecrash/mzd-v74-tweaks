-- Runtime settings manager for MZD Tweaks.
-- settings.js is the saved source of truth. resident.js loads it at boot so
-- runtime hooks have the saved values before this service is running.
local BOOL_DEFAULTS = {
    main_menu_loop = false,
    coins_glow = true,
    list_loop = false,
    list_beep = true,
    short_delay = false,
    statusbar_date = false,
    audio_order_custom = false
}

local BOOL_KEYS = {
    'main_menu_loop',
    'coins_glow',
    'list_loop',
    'list_beep',
    'short_delay',
    'statusbar_date',
    'audio_order_custom'
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

return function(context)
    local fs = context.files
    local settings_path = assert(type(context.config) == 'table' and context.config.settings or context.config, 'settings config path is not configured')
    local dir = settings_path:match('^(.*)/[^/]+$')

    local function read_settings()
        local settings = {}
        local audio_order = {}
        for _, k in ipairs(BOOL_KEYS) do
            settings[k] = BOOL_DEFAULTS[k]
        end
        settings.theme = 'red'
        for _, k in ipairs(AUDIO_KEYS) do
            local default_val = AUDIO_DEFAULTS[k]
            settings['audio_order.' .. k] = default_val
            audio_order[k] = default_val
        end
        settings.audio_order = audio_order

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

        local theme_val = content:match('"theme"%s*:%s*"([a-z]+)"')
        if theme_val and VALID_THEMES[theme_val] then
            settings.theme = theme_val
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
        local theme = settings.theme
        if not VALID_THEMES[theme] then theme = 'red' end
        lines[#lines + 1] = '    "theme": "' .. theme .. '",'
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
                return { settings = settings }
            elseif operation == 'set' then
                assert(type(args) == 'table', 'Invalid arguments.')
                if type(args.key) ~= 'string' then
                    error('Unknown setting: ' .. tostring(args.key), 0)
                end
                if args.key == 'theme' then
                    if type(args.value) ~= 'string' or not VALID_THEMES[args.value] then
                        error('Invalid setting value.', 0)
                    end
                    local settings = read_settings()
                    settings.theme = args.value
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
                    local settings = read_settings()
                    for _, k in ipairs(AUDIO_KEYS) do
                        settings['audio_order.' .. k] = order_map[k]
                        settings.audio_order[k] = order_map[k]
                    end
                    write_settings(settings)
                    return { settings = settings }
                elseif BOOL_DEFAULTS[args.key] ~= nil then
                    if type(args.value) ~= 'boolean' then
                        error('Invalid setting value.', 0)
                    end
                    local settings = read_settings()
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
