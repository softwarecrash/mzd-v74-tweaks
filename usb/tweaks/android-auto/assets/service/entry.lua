-- Runtime settings manager for libpatch.conf and Resolution DPI
local lfs = require('lfs')

-- Saved package layout from lib/packages.sh (persistent package format 1).
local PACKAGE = '/tmp/mnt/data_persist/mzd-tweaks/installed/android-auto/package'
local DPI = 'resolution_dpi'

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

    -- Read-only: the saved settings.conf and the bounds from the saved manifest.
    local function package_dpi()
        local manifest = fs.read(PACKAGE .. '/tweaks/android-auto/manifest.conf', 65536)
        local limits = {}
        for line in manifest:gmatch('[^\r\n]+') do
            local field, val = line:match('^setting%.resolution_dpi%.([a-z]+)=(%d+)$')
            if field and (field == 'min' or field == 'max' or field == 'step') then
                limits[field] = tonumber(val)
                if limits.min and limits.max and limits.step then break end
            end
        end
        for _, field in ipairs({ 'min', 'max', 'step' }) do
            assert(limits[field], 'The saved manifest has no Resolution DPI ' .. field .. '.')
        end
        local saved = fs.read(PACKAGE .. '/settings.conf', 65536)
        local value = nil
        for line in saved:gmatch('[^\r\n]+') do
            local val = line:match('^resolution_dpi=(%d+)$')
            if val then value = tonumber(val); break end
        end
        assert(value, 'The saved settings have no Resolution DPI.')
        return value, limits
    end

    -- Last ERROR line of the apply script, or its last line, for the caller.
    local function failure_reason(output)
        local reason = ''
        for line in output:gmatch('[^\r\n]+') do
            local message = line:match('^ERROR: (.+)$')
            if message then reason = message elseif reason == '' then reason = line end
        end
        if reason == '' then reason = 'Resolution DPI could not be applied.' end
        return reason:sub(1, 400)
    end

    -- Runs the saved apply script; it owns locks, rollback and the saved inventory.
    -- Returns true when the value changed and a CMU restart is needed.
    local function apply_dpi(value)
        local current, limits = package_dpi()
        assert(type(value) == 'number' and value % 1 == 0 and value >= limits.min and value <= limits.max
            and (value - limits.min) % limits.step == 0, 'Invalid Resolution DPI value.')
        if value == current then return false end
        local log = '/tmp/mzd-aa-settings.' .. fs.random() .. '.log'
        -- Fixed script path and a validated integer: no caller text reaches the shell.
        local status = os.execute(string.format("/bin/sh '%s/tweaks/android-auto/apply-settings.sh' resolution_dpi=%d >'%s' 2>&1",
            PACKAGE, value, log))
        local output = ''
        local handle = io.open(log, 'rb')
        if handle then output = handle:read(8192) or ''; handle:close() end
        os.remove(log)
        -- Lua 5.1 returns the wait status; later versions return true on success.
        if status ~= 0 and status ~= true then error(failure_reason(output), 0) end
        return true
    end

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

    local function get_full_settings()
        local settings = read_settings()
        local limits = {}
        local unavailable = {}
        local ok, val, lim = pcall(package_dpi)
        if ok then
            settings[DPI] = val
            limits[DPI] = lim
        else
            unavailable[DPI] = tostring(val):sub(1, 400)
        end
        return settings, limits, unavailable
    end

    -- The Android Auto libraries read libpatch.conf only when MZD boots, so
    -- changes saved here need a reboot. The service reads nothing at startup
    -- and tracks only changes made through it: before a key is first written,
    -- its current value becomes that key's baseline. A reboot is required while
    -- any written key differs from its baseline. Whoever edits the file in
    -- another way (for example over SSH) is responsible for that reboot. A
    -- service restart forgets the baselines.
    local applied = {}
    local current_values = {}

    local function is_reboot_required()
        for k, v in pairs(applied) do
            if current_values[k] ~= v then return true end
        end
        return false
    end

    local function remember(updates)
        local current
        for k in pairs(updates) do
            if applied[k] == nil then
                if k == DPI then
                    local ok, val = pcall(package_dpi)
                    if ok then
                        applied[k] = val
                        if current_values[k] == nil then current_values[k] = val end
                    end
                else
                    current = current or read_settings()
                    applied[k] = current[k]
                    if current_values[k] == nil then current_values[k] = current[k] end
                end
            end
        end
    end

    local function result(settings, limits, unavailable)
        local reboot_required = is_reboot_required()
        return {
            success = true,
            settings = settings,
            limits = limits or {},
            unavailable = unavailable or {},
            restart_required = reboot_required,
            rebootRequired = reboot_required
        }
    end

    local function valid_update(k, v)
        if k == 'hud_transport' then return v == 'svcnavi' or v == 'vbs' end
        if k == 'hud_maneuver_max_distance_m' then return type(v) == 'number' and v >= 0 end
        return DEFAULTS[k] ~= nil and type(v) == 'boolean'
    end

    return {
        request = function(operation, args)
            args = args or {}
            if operation == 'get' then
                local settings, limits, unavailable = get_full_settings()
                for k, v in pairs(settings) do
                    current_values[k] = v
                end
                return result(settings, limits, unavailable)
            elseif operation == 'set' then
                local key = args.key
                local value = args.value
                assert(type(key) == 'string' and (key == DPI or DEFAULTS[key] ~= nil), 'Invalid setting key')
                if key == DPI then
                    remember({ [key] = value })
                    apply_dpi(value)
                    current_values[DPI] = value
                    local _, limits = package_dpi()
                    return result({ [DPI] = value }, limits, {})
                end
                assert(valid_update(key, value), 'Invalid value for ' .. key)
                remember({ [key] = value })
                write_settings({ [key] = value })
                local settings = read_settings()
                for k, v in pairs(settings) do
                    current_values[k] = v
                end
                return result(settings, {}, {})
            elseif operation == 'reboot' then
                -- Only the GUI asks for this, after the driver confirms it and
                -- every queued save has finished. On success MZD restarts, so
                -- usually no response arrives.
                assert(next(applied) ~= nil and is_reboot_required(), 'No saved changes to apply')
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
                if settings[DPI] ~= nil then
                    remember({ [DPI] = settings[DPI] })
                    apply_dpi(settings[DPI])
                    current_values[DPI] = settings[DPI]
                end
                local valid_updates = {}
                for k, v in pairs(settings) do
                    if k ~= DPI and valid_update(k, v) then
                        valid_updates[k] = v
                    end
                end
                if next(valid_updates) ~= nil then
                    remember(valid_updates)
                    write_settings(valid_updates)
                end
                local full_settings, limits, unavailable = get_full_settings()
                for k, v in pairs(full_settings) do
                    current_values[k] = v
                end
                return result(full_settings, limits, unavailable)
            else
                error('Unknown operation: ' .. tostring(operation))
            end
        end
    }
end
