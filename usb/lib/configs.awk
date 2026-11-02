# Literal config.<name> metadata; output is internal tab-separated data.
function fail(message) {print "Config: " message;bad=1;exit 1}
function pathok(p) {return p ~ /^\/[A-Za-z0-9_.\/-]+$/ && p !~ /\/\.\.?($|\/)/ && p !~ /\/\// && p !~ /\/$/}
{
 sub(/\r$/,"")
 at=index($0,"=");key=substr($0,1,at-1);value=substr($0,at+1)
 if(key=="id")owner=value
 if(key~/^config\./) {
  if(split(key,parts,"[.]")!=3 || parts[3]!~/^(path|source)$/)fail("Unknown config field.")
  if(seen[parts[2],parts[3]]++)fail("Duplicate config field.")
  if(parts[2]!~/^[a-z][a-z0-9_]*$/ || length(parts[2])>32 || length(value)>512)fail("Invalid config name/value.")
  field[parts[2],parts[3]]=value
  if(!names[parts[2]]++){keys[++n]=parts[2]}
 }
}
END {
 if(bad)exit 1
 if(n>32)fail("Too many config entries.")
 for(i=1;i<=n;i++) {
  k=keys[i]
  p=field[k,"path"];t=p~/\/$/?"dir":"file";s=seen[k,"source"]?field[k,"source"]:"-"
  if(p~/\/\//)fail("Noncanonical config path.")
  if(t=="dir") {sub(/\/$/,"",p);if(s!="-")sub(/\/$/,"",s)}
  field[k,"type"]=t;field[k,"path"]=p;field[k,"source"]=s
  if(t!~/^(file|dir)$/ || !pathok(p))fail("Invalid config type/path: " k)
  at=index(p,"/mzd-tweaks/")
  if(at) {
   rest=substr(p,at+length("/mzd-tweaks/"));split(rest,scope,"/")
   if(scope[1]~/^(data|gui-data|shims)$/ && scope[2]!=owner)fail("Config overlaps another app namespace.")
  }
  if(base!="" && index(p,base "/")!=1)fail("Config must be inside persistent storage.")
  if(p~/\/mzd-tweaks\/(installed|gui-provider|config-owners)($|\/)/ || p~/\/mzd-tweaks$/)fail("Config overlaps installer metadata.")
  if(s!="-" && (s!~/^assets\/[A-Za-z0-9_.\/-]+$/ || s~/\/\.\.?($|\/)/ || s~/\/\// || s~/\/$/))fail("Invalid config source.")
  for(q in paths)if(q==p || index(p,q "/")==1 || index(q,p "/")==1)fail("Overlapping config paths.")
  paths[p]=1
 }
 if(mode!="validate")for(i=1;i<=n;i++){k=keys[i];print k "\t" field[k,"type"] "\t" field[k,"path"] "\t" field[k,"source"]}
}
