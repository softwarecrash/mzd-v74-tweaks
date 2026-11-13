-- Runtime ownership and bounded shutdown. No OEM service is stopped.
local M={}
local function normalize(path)return(path:gsub('^/data_persist/', '/tmp/mnt/data_persist/'))end
function M.owns(argv,payload)
    if type(argv)~='table' or not argv[1]then return false end
    payload=normalize(payload)
    local first=normalize(argv[1]);local leaf=first:match('([^/]+)$')
    if first==payload..'/aaw_listend' then return 'listener' end
    if first==payload..'/aaw_handler' then return 'handler' end
    if leaf=='sh' or (leaf=='busybox' and argv[2]=='sh') then
        local script=normalize(argv[leaf=='busybox' and 3 or 2] or '')
        if script==payload..'/start-aa-ap.sh' or script==payload..'/reset-aa-dongle.sh' then return 'script' end
    end
    local expected=leaf=='hostapd' and '/tmp/aa-hostapd-wlan1.conf' or leaf=='udhcpd' and '/tmp/aa-udhcpd.conf'
    if expected then
        local found=false
        for i=2,#argv do
            if argv[i]==expected then found=true
            elseif argv[i]:match('%.conf$')then return false end
        end
        if found then return 'network' end
    end
    return false
end
function M.stop(deps,payload)
    local sent={}
    local function signal_all(signal)
        local records=deps.processes()
        -- Give the listener its disconnect/child-cleanup path before the rest.
        table.sort(records,function(a,b)return M.owns(a.argv,payload)=='listener' and M.owns(b.argv,payload)~='listener'end)
        for _,record in ipairs(records)do
            if M.owns(record.argv,payload)then
                local key=record.pid..':'..record.start..':'..signal
                if not sent[key]then
                    assert(deps.signal(record,signal),'Cannot stop owned wireless process.')
                    sent[key]=true
                end
            end
        end
    end
    local function pending()
        for _,record in ipairs(deps.processes())do if M.owns(record.argv,payload)then return true end end
        return false
    end
    for i=1,30 do
        signal_all('TERM')
        if not pending()then deps.sleep(0.1);if not pending()then return end end
        deps.sleep(0.1)
    end
    for i=1,10 do
        signal_all('KILL')
        if not pending()then deps.sleep(0.1);if not pending()then return end end
        deps.sleep(0.1)
    end
    error('Owned wireless process did not stop; package files retained.')
end
return M
