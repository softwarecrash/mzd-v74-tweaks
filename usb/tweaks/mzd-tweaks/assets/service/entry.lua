-- Runtime settings manager for MZD Tweaks.
-- settings.js is the saved source of truth. resident.js loads it at boot so
-- the patched OEM controls have the saved values before this service is running.
local DEFAULTS = {
    main_menu_loop = false,
    list_loop = false,
    list_beep = true,
    short_delay = false
}

local KEYS = {
    'main_menu_loop',
    'list_loop',
    'list_beep',
    'short_delay'
}

return function(context)
    local fs = context.files
    local settings_path = assert(type(context.config) == 'table' and context.config.settings or context.config, 'settings config path is not configured')
    local dir = settings_path:match('^(.*)/[^/]+$')

    local function read_settings()
        local settings = {}
        for _, k in ipairs(KEYS) do
            settings[k] = DEFAULTS[k]
        end
        if not fs.exists(settings_path) then
            return settings
        end
        local content = fs.read(settings_path, 65536)
        for _, k in ipairs(KEYS) do
            local val = content:match('"' .. k .. '"%s*:%s*([a-z]+)')
            if val == 'true' then
                settings[k] = true
            elseif val == 'false' then
                settings[k] = false
            end
        end
        return settings
    end

    local function serialize_js(settings)
        local lines = { 'window.mzdTweaks = {' }
        for i, k in ipairs(KEYS) do
            local val = settings[k]
            if val == nil then val = DEFAULTS[k] end
            local comma = (i < #KEYS) and ',' or ''
            lines[#lines + 1] = '    "' .. k .. '": ' .. (val and 'true' or 'false') .. comma
        end
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
                local settings = read_settings()
                if not fs.exists(settings_path) then
                    write_settings(settings)
                end
                return { settings = settings }
            elseif operation == 'set' then
                assert(type(args) == 'table', 'Invalid arguments.')
                if type(args.key) ~= 'string' or DEFAULTS[args.key] == nil then
                    error('Unknown setting: ' .. tostring(args.key), 0)
                end
                if type(args.value) ~= 'boolean' then
                    error('Invalid setting value.', 0)
                end
                local settings = read_settings()
                settings[args.key] = args.value
                write_settings(settings)
                return { settings = settings }
            else
                error('Unknown operation: ' .. tostring(operation), 0)
            end
        end
    }
end
