-- Runtime settings manager for MZD Tweaks
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

local function parse_bool(str, default)
    if not str then return default end
    local s = str:lower():match('^%s*(.-)%s*$')
    if s == 'true' or s == '1' or s == 'yes' or s == 'on' then return true end
    if s == 'false' or s == '0' or s == 'no' or s == 'off' then return false end
    return default
end

return function(context)
    local fs = context.files
    local conf_path = assert(context.config and context.config.settings, 'settings config path is not configured')
    local js_path = assert(context.config and context.config.script, 'script config path is not configured')
    local dir = conf_path:match('^(.*)/[^/]+$')

    local function read_settings()
        local settings = {}
        for _, k in ipairs(KEYS) do
            settings[k] = DEFAULTS[k]
        end
        if not fs.exists(conf_path) then
            return settings
        end
        local content = fs.read(conf_path, 65536)
        if not content then
            return settings
        end
        for line in content:gmatch('[^\r\n]+') do
            local clean = line:match('^%s*([^#]+)')
            if clean then
                local k, v = clean:match('^([A-Za-z0-9_]+)%s*=%s*(.*)$')
                if k and v then
                    k = k:lower():match('^%s*(.-)%s*$')
                    v = v:match('^%s*(.-)%s*$')
                    if DEFAULTS[k] ~= nil then
                        settings[k] = parse_bool(v, DEFAULTS[k])
                    end
                end
            end
        end
        return settings
    end

    local function serialize_conf(settings)
        local lines = {}
        for _, k in ipairs(KEYS) do
            local val = settings[k]
            if val == nil then val = DEFAULTS[k] end
            lines[#lines + 1] = k .. '=' .. (val and 'true' or 'false')
        end
        return table.concat(lines, '\n') .. '\n'
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

    local function save_file(target_path, content)
        local temp_path = target_path .. '.' .. fs.random() .. '.tmp'
        fs.write_new(temp_path, content)
        local ok, err = pcall(fs.rename, temp_path, target_path)
        if not ok then
            fs.remove_if_exists(temp_path)
            error(err)
        end
    end

    local function write_settings(settings)
        save_file(conf_path, serialize_conf(settings))
        save_file(js_path, serialize_js(settings))
        fs.sync_directory(dir)
    end

    return {
        request = function(operation, args)
            if operation == 'get' then
                local settings = read_settings()
                if not fs.exists(js_path) then
                    pcall(function()
                        save_file(js_path, serialize_js(settings))
                        fs.sync_directory(dir)
                    end)
                end
                return { settings = settings }
            elseif operation == 'set' then
                assert(type(args) == 'table', 'Invalid arguments.')
                local current = read_settings()
                if args.key ~= nil and DEFAULTS[args.key] ~= nil then
                    assert(type(args.value) == 'boolean', 'Invalid setting value.')
                    current[args.key] = args.value
                    write_settings(current)
                end
                return { settings = current }
            else
                error('Unknown operation: ' .. tostring(operation))
            end
        end
    }
end
