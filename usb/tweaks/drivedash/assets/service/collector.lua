-- Demand-driven SMDB reader. No background loop or persistent writes.
local M={}
local current='vdm_vdt_current_data'
local slow={
    {'outsideC',current,'Out-CarTemperature',1,254,function(n)return n-40 end},
    {'coolantC',current,'EngClnt_Te_Actl',1,254,function(n)return n-40 end},
    {'leverPosition',current,'TransmChangeLeverPosition',1,4},
    {'gearNumber',current,'TransmissionGearPosition',1,6},
    {'tripKm','vdm','PID_Drv1Dstnc_curr',0,2147483646,function(n)return n*0.02 end},
    {'avgL100','vdm_vdt_history_data','TotAvlFuelE',1,65534,function(n)return 1000/n end},
    {'fuelRaw',current,'FuelGaugePosition',0,254},
    {'engineLoadPercent',current,'EngineLoad',0,100},
    -- Factory battery SOC uses half-percent steps; 254/255 are not readings.
    {'batteryPercent',current,'Battery_StateOfCharge',0,200,function(n)return n/2 end},
    {'intakeC',current,'DR_IntakeAirTemp',1,254,function(n)return n-40 end},
    {'driveAvgL100','vdm','Drv1AvlFuelE',1,65534,function(n)return 1000/n end},
    {'cumulativeAvgL100','vdm_history_data','HVD_CumAvgFuelEff_curr',1,65534,function(n)return 10000/n end}
}
function M.create(deps)
    local values,misses={},{}
    local nextSlow,lastSample,sequence=1,nil,0
    local fresh={}
    local count=#slow+(deps.gps and 1 or 0)
    local gpsValues,gpsMisses={},0
    local function read(field)
        -- SSH and boot launches can have different inherited library paths.
        local ok,result=pcall(deps.run,'/usr/bin/env',{'LD_LIBRARY_PATH=/jci/lib:/usr/lib:/lib','/jci/smdb/smdb-read','-n',field[2],'-e',field[3]},1)
        local value
        if ok and result.started and result.exitCode==0 and not result.signal and not result.stdoutTruncated and not result.stderrTruncated then
            local raw=result.stdout:match('^%s*([+-]?%d+)%s*$')
            value=raw and tonumber(raw)
            if value and (value<field[4] or value>field[5])then value=nil end
        end
        local key=field[1]
        if value~=nil then
            values[key]=field[6] and field[6](value) or value
            misses[key]=0
            return true
        end
        misses[key]=(misses[key] or 0)+1
        if misses[key]>=3 then values[key]=nil end
        return false
    end
    return {sample=function()
        local now=deps.now()
        -- No view requests for ten seconds means a new session, not fresh data.
        if lastSample and (now-lastSample>=10 or now<lastSample)then
            values,misses={},{};gpsValues={};gpsMisses=0;nextSlow=1;lastSample=nil
        end
        if not lastSample or now-lastSample>=0.5 then
            fresh={}
            fresh.speedKph=read({'speedKph',current,'VehicleSpeed',0,40000,function(n)return n/100 end})
            fresh.rpm=read({'rpm',current,'EngineSpeed',0,8000,function(n)return n*2 end})
            if nextSlow>#slow then
                local ok,result=pcall(deps.gps)
                if ok and type(result)=='table' then
                    gpsValues=result;gpsMisses=0;fresh.gps=true
                else
                    gpsMisses=gpsMisses+1
                    if gpsMisses>=3 then gpsValues={}end
                end
                if fresh.gps or next(gpsValues)==nil then nextSlow=1 end
            else
                local field=slow[nextSlow]
                local ok=read(field)
                fresh[field[1]]=ok
                -- Retry a known field promptly; unsupported fields cannot stall discovery.
                if ok or values[field[1]]==nil then nextSlow=nextSlow%count+1 end
            end
            sequence=sequence+1
            lastSample=deps.now()
        end
        local out={source='cmu',available=false,schemaVersion=1,sequence=sequence,sampleSeconds=lastSample,fresh=fresh}
        for key,value in pairs(values)do out[key]=value end
        for key,value in pairs(gpsValues)do out[key]=value end
        out.gear=({[1]='P',[2]='R',[3]='N',[4]='D'})[out.leverPosition]
        if not out.gear and out.gearNumber then out.gear=tostring(out.gearNumber)end
        out.available=out.speedKph~=nil or out.rpm~=nil
        -- Initial AIO reference range: approximate bars, not calibrated litres.
        if out.fuelRaw~=nil then out.fuelPercent=math.min(100,out.fuelRaw*100/184)end
        return out
    end}
end
return M
