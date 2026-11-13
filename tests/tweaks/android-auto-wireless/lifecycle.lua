local lifecycle=assert(loadfile('development/candidates/android-auto-wireless/assets/service/lifecycle.lua'))()
local home='/tmp/mnt/data_persist/mzd-tweaks/shims/android-auto-wireless'
assert(lifecycle.owns({home..'/aaw_listend'},home)=='listener')
assert(lifecycle.owns({'/data_persist/mzd-tweaks/shims/android-auto-wireless/aaw_handler'},home)=='handler')
assert(lifecycle.owns({'/bin/sh',home..'/start-aa-ap.sh'},home)=='script')
assert(lifecycle.owns({'/bin/busybox','sh',home..'/reset-aa-dongle.sh'},home)=='script')
assert(lifecycle.owns({'/usr/sbin/hostapd','-B','/tmp/aa-hostapd-wlan1.conf'},home)=='network')
assert(lifecycle.owns({'udhcpd','/tmp/aa-udhcpd.conf'},home)=='network')
for _,argv in ipairs({{'sshd'},{'hostapd','/tmp/wlan0.conf'},{'hostapd','/tmp/aa-hostapd-wlan1.conf','/tmp/wlan0.conf'},{'/bin/sh','-c','echo '..home..'/start-aa-ap.sh'},{'/unrelated/aaw_listend'},{'/bin/busybox','echo',home..'/start-aa-ap.sh'}})do assert(not lifecycle.owns(argv,home))end
local processes={{pid=10,start='1',argv={home..'/aaw_listend'}},{pid=11,start='2',argv={home..'/aaw_handler'}},{pid=12,start='3',argv={'hostapd','/tmp/aa-hostapd-wlan1.conf'}},{pid=99,start='4',argv={'sshd'}}}
local signals={};local waits=0
local deps={processes=function()local copy={};for _,r in ipairs(processes)do copy[#copy+1]=r end;return copy end,
 sleep=function()waits=waits+1 end,
 signal=function(record,signal)
  assert(record.pid~=99);signals[#signals+1]={pid=record.pid,signal=signal}
  if record.pid~=12 or signal=='KILL' then for i,r in ipairs(processes)do if r.pid==record.pid then table.remove(processes,i);break end end end
  return true
 end}
lifecycle.stop(deps,home)
assert(signals[1].pid==10 and signals[1].signal=='TERM')
assert(#processes==1 and processes[1].pid==99 and waits>=30 and waits<=34)
local kill=0;for _,s in ipairs(signals)do if s.signal=='KILL'then kill=kill+1;assert(s.pid==12)end end;assert(kill==1)
local stubborn={processes=function()return {{pid=1,start='x',argv={home..'/aaw_handler'}}}end,sleep=function()end,signal=function()return true end}
assert(not pcall(lifecycle.stop,stubborn,home),'Unstoppable process must prevent payload removal')
print('WIRELESS_LIFECYCLE_PASSED: exact process ownership, listener-first TERM, bounded escalation, unrelated SSH/AP preservation and failure refusal.')
