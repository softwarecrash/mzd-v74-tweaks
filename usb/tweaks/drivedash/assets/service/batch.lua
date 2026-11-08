-- Bounded parallel read-only SMDB queries. Values never become shell code.
local M={}
function M.read(fields,run)
    local commands={"export LD_LIBRARY_PATH=/jci/lib:/usr/lib:/lib"}
    for i,field in ipairs(fields)do
        assert(field[2]:match('^[%w_-]+$') and field[3]:match('^[%w_-]+$'),'Invalid SMDB field')
        commands[#commands+1]="(v=$(/jci/smdb/smdb-read -n "..field[2].." -e "..field[3].."); r=$?; case \"$v\" in ''|*[!0-9+-]*) r=1; v=;; esac; printf '"..i.."\\t%s\\t%s\\n' \"$r\" \"$v\") &"
    end
    -- A newline, not a semicolon, must follow the shell's background operator.
    local code=table.concat(commands,'\n')..'\nwait'
    local ok,result=pcall(run,'/bin/sh',{'-c',code},1)
    local values={}
    if not ok or type(result)~='table' or not result.started or result.stdoutTruncated then return values end
    local seen={}
    for line in (result.stdout or ''):gmatch('[^\n]+')do
        local index,status,raw=line:match('^(%d+)\t(%d+)\t(.*)$')
        index=tonumber(index)
        if index and fields[index] then
            local key=fields[index][1]
            if seen[index]then values[key]=nil
            elseif status=='0' and raw:match('^[+-]?%d+$')then values[key]=raw end
            seen[index]=true
        end
    end
    return values
end
return M
