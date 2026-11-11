-- Runtime settings manager for libpatch.conf
local lfs = require('lfs')

local DEFAULTS = {
    touch = true,
    hud = true,
    hud_transport = 'svcnavi',
    force_street_name = false,
    hud_fold_latin = true,
    use_protocol_v1_6 = false,
    roundabout_prepend_exit_number = false,
    compass_always_on = false,
    bt_pairing_bypass_all_devices = false,
    bt_pairing_show_device_notification = false,
    mute_pauses_phone = true,
    unmute_starts_playback = false,
    block_headunit_media_play = false,
    aa_audio_low_latency = false,
    hud_maneuver_max_distance_m = 0
}

local function parse_bool(str, default)
    if not str then return default end
    local s = str:lower():match('^%s*(.-)%s*$')
    if s == 'true' or s == '1' or s == 'yes' or s == 'on' then return true end
    if s == 'false' or s == '0' or s == 'no' or s == 'off' then return false end
    return default
end

local function parse_number(str, default)
    if not str then return default end
    local digits = str:match('(%d+)')
    if digits then
        return tonumber(digits) or default
    end
    return default
end

local function parse_choice(str, default, allowed)
    if not str then return default end
    local s = str:lower():match('^%s*(.-)%s*$')
    if allowed[s] then return s end
    return default
end

return function(context)
    local fs = context.files
    local path = assert(context.config and context.config.libpatch, 'libpatch config path is not configured')

    local function read_settings()
        local settings = {}
        for k, v in pairs(DEFAULTS) do
            settings[k] = v
        end
        if not fs.exists(path) then
            return settings
        end
        local content = fs.read(path, 65536)
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
                    if k == 'hud_transport' then
                        settings.hud_transport = parse_choice(v, DEFAULTS.hud_transport, { svcnavi = true, vbs = true })
                    elseif k == 'hud_maneuver_max_distance_m' then
                        settings.hud_maneuver_max_distance_m = parse_number(v, DEFAULTS.hud_maneuver_max_distance_m)
                    elseif DEFAULTS[k] ~= nil then
                        settings[k] = parse_bool(v, DEFAULTS[k])
                    end
                end
            end
        end
        return settings
    end

    local function write_settings(updates)
        local content = ''
        if fs.exists(path) then
            content = fs.read(path, 65536) or ''
        end

        local updated_keys = {}
        local lines = {}
        if #content > 0 and content:sub(-1) ~= '\n' then
            content = content .. '\n'
        end
        for line in content:gmatch('([^\r\n]*)\r?\n') do
            local clean = line:match('^%s*([^#]+)')
            local matched_key = nil
            if clean then
                local k = clean:match('^([A-Za-z0-9_]+)%s*=')
                if k then
                    k = k:lower():match('^%s*(.-)%s*$')
                    if updates[k] ~= nil then
                        matched_key = k
                        updated_keys[k] = true
                        local val = updates[k]
                        if type(val) == 'boolean' then
                            val = val and 'true' or 'false'
                        else
                            val = tostring(val)
                        end
                        table.insert(lines, k .. ' = ' .. val)
                    end
                end
            end
            if not matched_key then
                table.insert(lines, line)
            end
        end

        while #lines > 0 and lines[#lines] == '' do
            table.remove(lines)
        end

        -- Append any keys that weren't already present in the file
        for k, val in pairs(updates) do
            if not updated_keys[k] then
                if type(val) == 'boolean' then
                    val = val and 'true' or 'false'
                else
                    val = tostring(val)
                end
                table.insert(lines, k .. ' = ' .. val)
            end
        end

        local new_content = #lines > 0 and (table.concat(lines, '\n') .. '\n') or ''
        local dir = path:match('^(.*)/')
        if dir and not fs.exists(dir) then
            lfs.mkdir(dir)
        end

        local staging_dir = (context.data and fs.exists(context.data) and context.data)
            or (fs.exists('/tmp/mnt/data_persist/mzd-tweaks/gui-data/android-auto') and '/tmp/mnt/data_persist/mzd-tweaks/gui-data/android-auto')
        local tmp = (staging_dir and (staging_dir .. '/libpatch.conf.' .. fs.random() .. '.tmp'))
            or (path .. '.' .. fs.random() .. '.tmp')
        local ok, err = pcall(function()
            fs.write_new(tmp, new_content)
            fs.rename(tmp, path)
        end)
        if not ok then
            fs.remove_if_exists(tmp)
            error(err)
        end
        if dir then
            fs.sync_directory(dir)
        end
    end

    -- The Android Auto libraries read libpatch.conf only when MZD boots, so
    -- changes saved here need a reboot. The service reads nothing at startup
    -- and tracks only changes made through it: before a key is first written,
    -- its current value becomes that key's baseline. A reboot is required while
    -- any written key differs from its baseline. Whoever edits the file in
    -- another way (for example over SSH) is responsible for that reboot. A
    -- service restart forgets the baselines.
    local applied = {}

    local function remember(updates)
        local current
        for k in pairs(updates) do
            if applied[k] == nil then
                current = current or read_settings()
                applied[k] = current[k]
            end
        end
    end

    local function result(settings)
        local reboot_required = false
        for k, v in pairs(applied) do
            if settings[k] ~= v then reboot_required = true end
        end
        return { success = true, settings = settings, rebootRequired = reboot_required }
    end

    return {
        request = function(operation, args)
            args = args or {}
            if operation == 'get' then
                return result(read_settings())
            elseif operation == 'set' then
                local key = args.key
                local value = args.value
                assert(type(key) == 'string' and DEFAULTS[key] ~= nil, 'Invalid setting key')
                if key == 'hud_transport' then
                    assert(value == 'svcnavi' or value == 'vbs', 'Invalid value for hud_transport')
                elseif key == 'hud_maneuver_max_distance_m' then
                    assert(type(value) == 'number' and value >= 0, 'Invalid distance value')
                else
                    assert(type(value) == 'boolean', 'Boolean value expected')
                end
                remember({ [key] = value })
                write_settings({ [key] = value })
                return result(read_settings())
            elseif operation == 'reboot' then
                -- Only the GUI asks for this, after the driver confirms it and
                -- every queued save has finished. On success MZD restarts, so
                -- usually no response arrives.
                assert(next(applied) ~= nil and result(read_settings()).rebootRequired, 'No saved changes to apply')
                local dir = path:match('^(.*)/')
                if dir and fs.exists(dir) then
                    fs.sync_directory(dir)
                end
                local status = os.execute('reboot')
                assert(status == 0 or status == true, 'Failed to reboot MZD (status ' .. tostring(status) .. ')')
                return { success = true }
            elseif operation == 'save' then
                local settings = args.settings
                assert(type(settings) == 'table', 'Settings table expected')
                local valid_updates = {}
                for k, v in pairs(settings) do
                    if DEFAULTS[k] ~= nil then
                        if k == 'hud_transport' then
                            if v == 'svcnavi' or v == 'vbs' then valid_updates[k] = v end
                        elseif k == 'hud_maneuver_max_distance_m' then
                            if type(v) == 'number' and v >= 0 then valid_updates[k] = v end
                        elseif type(v) == 'boolean' then
                            valid_updates[k] = v
                        end
                    end
                end
                remember(valid_updates)
                write_settings(valid_updates)
                return result(read_settings())
            else
                error('Unknown operation: ' .. tostring(operation))
            end
        end
    }
end
