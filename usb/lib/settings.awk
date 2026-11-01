# Shared literal schema/value validator for the factory BusyBox awk.
function fail(message) { print "Settings: " message; bad=1; exit 1 }
function integer(v) { return v ~ /^(0|[1-9][0-9]*)$/ && length(v)<=10 && v+0<=2147483647 }
function valid(key,v,   t) {
    t=field[key,"type"]
    if(t=="number") return integer(v) && v+0>=field[key,"min"]+0 && v+0<=field[key,"max"]+0 && ((v-field[key,"min"]) % field[key,"step"]==0)
    if(t=="boolean") return v=="true" || v=="false"
    return index(" " field[key,"options"] " "," " v " ") && v ~ /^[a-z0-9][a-z0-9_-]*$/
}
function schema(   i,j,k,p,n,a,o,seenOptions) {
    n=split(list,keys," "); if(n>16)fail("At most 16 settings are supported.")
    for(i=1;i<=n;i++) {
        k=keys[i]
        if(k !~ /^[a-z][a-z0-9_]*$/ || length(k)>32 || declared[k]++)fail("Invalid or duplicate setting name: " k)
    }
    for(p in field) { split(p,a,SUBSEP); if(!declared[a[1]])fail("Undeclared setting: " a[1]) }
    for(i=1;i<=n;i++) {
        k=keys[i]; p=field[k,"type"]
        if(p!="number" && p!="boolean" && p!="choice")fail("Invalid type: " k)
        if(field[k,"label"]=="" || !present[k,"default"])fail("Label and default are required: " k)
        if(p=="number") {
            if(!integer(field[k,"min"]) || !integer(field[k,"max"]) || !integer(field[k,"step"]) || field[k,"step"]+0==0 || field[k,"min"]+0>field[k,"max"]+0)fail("Invalid numeric bounds: " k)
        } else if(present[k,"min"] || present[k,"max"] || present[k,"step"] || present[k,"unit"])fail("Numeric fields on non-number setting: " k)
        if(p=="choice") {
            o=field[k,"options"]; if(o=="" || o !~ /^[a-z0-9_-]+( [a-z0-9_-]+)*$/)fail("Invalid choices: " k)
            j=split(o,a," "); if(j>64)fail("Too many choices: " k)
            for(j in a)if(a[j] !~ /^[a-z0-9][a-z0-9_-]*$/ || length(a[j])>32 || seenOptions[k,a[j]]++)fail("Invalid or duplicate choice: " k)
        } else if(present[k,"options"])fail("Options on non-choice setting: " k)
        if(!valid(k,field[k,"default"]))fail("Invalid default: " k)
    }
    return n
}
NR==FNR {
    sub(/\r$/, "")
    if($0 ~ /[[:cntrl:]]/)fail("Control characters are not allowed.")
    if($0 ~ /^[[:space:]]*$/ || substr($0,1,1)=="#")next
    at=index($0,"="); key=substr($0,1,at-1); value=substr($0,at+1)
    if(key=="settings") {
        if(listSeen++)fail("Duplicate settings list.")
        list=value
        if(list!="" && list !~ /^[a-z][a-z0-9_]*( [a-z][a-z0-9_]*)*$/)fail("Invalid settings list.")
    } else if(key ~ /^setting\./) {
        if(split(key,parts,"[.]")!=3 || parts[3] !~ /^(type|label|default|min|max|step|unit|help|options)$/)fail("Unknown setting field: " key)
        if(length(value)>(parts[3]=="options"?4096:256) || present[parts[2],parts[3]]++)fail("Duplicate or oversized setting field: " key)
        field[parts[2],parts[3]]=value
    }
    next
}
defaults != "" && FILENAME == defaults {
    sub(/\r$/, "")
    if($0 ~ /[[:cntrl:]]/)fail("Control characters in defaults value.")
    if($0 ~ /^[[:space:]]*$/ || substr($0,1,1)=="#")next
    at=index($0,"="); key=substr($0,1,at-1); value=substr($0,at+1)
    if(!at || length($0)>128 || user_def_seen[key]++)fail("Invalid or duplicate default: " key)
    user_def[key]=value
    next
}
{
    sub(/\r$/, "")
    if($0 ~ /[[:cntrl:]]/)fail("Control characters in supplied value.")
    if($0 ~ /^[[:space:]]*$/ || substr($0,1,1)=="#")next
    at=index($0,"="); key=substr($0,1,at-1); value=substr($0,at+1)
    if(!at || length($0)>128 || supplied[key]++)fail("Invalid or duplicate value: " key)
    input[key]=value
}
END {
    if(bad)exit 1
    count=schema()
    for(key in user_def) {
        if(!declared[key])fail("Unknown default: " key)
        if(!valid(key,user_def[key]))fail("Invalid default for " key ": " user_def[key])
        field[key,"default"]=user_def[key]
    }
    for(key in input)if(!declared[key])fail("Unknown value: " key)
    if(mode=="validate")exit 0
    if(mode=="info") {
        print "settings=" list
        for(i=1;i<=count;i++)for(p in field) { split(p,a,SUBSEP); if(a[1]==keys[i])print "setting." a[1] "." a[2] "=" field[p] }
    }
    for(i=1;i<=count;i++) {
        key=keys[i]
        if(strict && !supplied[key])fail("Saved value missing: " key)
        value=supplied[key] ? input[key] : field[key,"default"]
        if(!valid(key,value))fail("Invalid value for " key ": " value)
        if(mode!="check")print (mode=="info" ? "value." : "") key "=" value
    }
}
