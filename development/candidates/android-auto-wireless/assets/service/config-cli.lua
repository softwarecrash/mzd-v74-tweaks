-- Validate the effective config without printing passwords or SSIDs.
local here=assert(arg[0]:match('^(.*)/'))
assert(#arg==1,'Expected config path.')
local config=assert(loadfile(here..'/config.lua'))()
local file=assert(io.open(arg[1],'r'),'Cannot read wireless config.')
local text=file:read(65537);file:close()
local values=config.read(text)
print('wireless\t'..tostring(values.wireless))
print('channel\t'..tostring(values.aa_channel))
