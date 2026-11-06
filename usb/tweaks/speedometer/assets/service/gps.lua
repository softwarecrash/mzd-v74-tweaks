-- One bounded, read-only Mazda LDS query. No socket or background polling loop.
local M={}
function M.parse(text)
    local values,inside={},false
    for line in (text..'\n'):gmatch('([^\n]*)\n')do
        if line:match('^%s*struct%s*{%s*$')then
            if inside then return nil end
            inside=true
        elseif inside then
            if line:match('^%s*}%s*$')then break end
            local token=line:match('^%s*double%s+([^%s]+)%s*$')
            if not token then return nil end
            local number=tonumber(token)
            if not number or number~=number or number==math.huge or number==-math.huge then return nil end
            values[#values+1]=number
            if #values==5 then break end
        end
    end
    if #values~=5 then return nil end
    local lat,lon,alt,heading,speed=unpack(values)
    if lat < -90 or lat > 90 or lon < -180 or lon > 180 or alt < -1000 or alt > 20000 or heading < 0 or heading > 360 or speed < 0 or speed > 500 then return nil end
    -- OEM heading is exposed unchanged; reference direction is not yet verified.
    return {gpsLatitudeDeg=lat,gpsLongitudeDeg=lon,gpsAltitudeM=alt,gpsHeadingDeg=heading,gpsSpeedKph=speed}
end
function M.read(run)
    local result=run('/usr/bin/env',{'LD_LIBRARY_PATH=/jci/lib:/usr/lib:/lib','/usr/bin/dbus-send',
        '--print-reply','--reply-timeout=1000','--address=unix:path=/tmp/dbus_service_socket',
        '--type=method_call','--dest=com.jci.lds.data','/com/jci/lds/data','com.jci.lds.data.GetPosition'},1)
    if not result or not result.started or result.exitCode~=0 or result.signal or result.stdoutTruncated or result.stderrTruncated then return nil end
    return M.parse(result.stdout or '')
end
return M
