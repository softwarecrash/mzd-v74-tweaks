-- Runtime settings manager for MZD Tweaks.
-- settings.conf is the saved source of truth. settings.js holds the same values
-- as window.mzdTweaks; resident.js loads it at boot so the patched OEM controls
-- have the saved values before this service is running.
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
        for line in content:gmatch('[^\r\n]+') do
            local clean = line:match('^%s*([^#]+)')
            if clean then
                local k, v = clean:match('^([A-Za-z0-9_]+)%s*=%s*(.*)$')
                if k and v then
                    k = k:lower()
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

    local function temp_for(target_path)
        return target_path .. '.' .. fs.random() .. '.tmp'
    end

    local function remove_temps(temps)
        for _, path in ipairs(temps) do
            pcall(fs.remove_if_exists, path)
        end
    end

    -- Publishes files only after every temp file has been written completely.
    -- files is a list of { path = ..., content = ..., previous = ... }. When a
    -- later rename fails, the files already published get their previous content back.
    local function publish(files)
        local temps = {}
        for i, item in ipairs(files) do
            temps[i] = temp_for(item.path)
            local ok, err = pcall(fs.write_new, temps[i], item.content)
            if not ok then
                remove_temps(temps)
                error(err, 0)
            end
        end
        for i, item in ipairs(files) do
            local ok, err = pcall(fs.rename, temps[i], item.path)
            if not ok then
                remove_temps(temps)
                for j = i - 1, 1, -1 do
                    local restore = files[j].previous
                    if restore then
                        local tmp = temp_for(files[j].path)
                        if not (pcall(fs.write_new, tmp, restore) and pcall(fs.rename, tmp, files[j].path)) then
                            pcall(fs.remove_if_exists, tmp)
                        end
                    end
                end
                pcall(fs.sync_directory, dir)
                error(err, 0)
            end
        end
        fs.sync_directory(dir)
    end

    local function current_file(path)
        if fs.exists(path) then
            return fs.read(path, 65536)
        end
        return nil
    end

    local function write_settings(settings)
        publish({
            { path = conf_path, content = serialize_conf(settings), previous = current_file(conf_path) },
            { path = js_path, content = serialize_js(settings), previous = current_file(js_path) }
        })
    end

    return {
        request = function(operation, args)
            if operation == 'get' then
                local settings = read_settings()
                -- A read may repair settings.js so the next boot uses the saved values.
                local expected = serialize_js(settings)
                if current_file(js_path) ~= expected then
                    publish({ { path = js_path, content = expected } })
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
