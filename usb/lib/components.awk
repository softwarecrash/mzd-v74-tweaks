# Data-only component table. All five columns are mandatory, '-' means unused.
function fail(s) { print "Components: " s; bad=1; exit 1 }
function path(s) { return s ~ /^\/[A-Za-z0-9_.\/-]+$/ && s !~ /\/\.\.?($|\/)/ && s !~ /\/\// }
function asset(s) { return s ~ /^assets\/[A-Za-z0-9_.\/-]+$/ && s !~ /\/\.\.?($|\/)/ && s !~ /\/\// }
function hash(s) { return s ~ /^[0-9a-f]+$/ && length(s)==32 }
BEGIN {
    FS="\t"
    if(payload_dir!="") {
        if(substr(payload_dir,1,length(storage)+1)!=storage "/" || payload_dir ~ /\/\.\.?($|\/)/ || payload_dir ~ /\/\//)fail("Invalid payload directory.")
        prefix=payload_dir "/"
    } else {
        prefix=storage "/mzd-tweaks/shims/" id "/"
    }
}
{ sub(/\r$/, "") }
/^#/ || /^$/ {next}
{
    if(NF!=5 || ++count>64 || $0 ~ /\r/)fail("Expected at most 64 five-column records.")
    kind=$1; dest=$2; source=$3; service=$4; md5=$5
    gsub(/^[ \t]+|[ \t]+$/, "", kind)
    gsub(/^[ \t]+|[ \t]+$/, "", dest)
    gsub(/^[ \t]+|[ \t]+$/, "", source)
    gsub(/^[ \t]+|[ \t]+$/, "", service)
    gsub(/^[ \t]+|[ \t]+$/, "", md5)
    if(kind=="loader_env") {
        eq=index(dest,"=")
        env_name=substr(dest,1,eq-1)
        env_val=substr(dest,eq+1)
        if(!eq || env_name!~/^[A-Za-z_][A-Za-z0-9_]*$/ || env_val=="" || env_val ~ /["\r\n\\<>&]/ || source!="-" || service=="-" || service!~/^[A-Za-z0-9_.-]+$/ || md5!="-" || ++loader_envs>16)fail("Invalid loader environment variable.")
        key=service ":" env_name
        if(seen_env[key]++)fail("Duplicate service environment variable.")
        if(mode=="records")print kind "\t" dest "\t" source "\t" service "\t" md5
        next
    }
    if(!path(dest))fail("Invalid target path.")
    if(kind=="check") {
        if(source!="-" || service!="-" || !hash(md5) || checks[dest]++)fail("Invalid module check.")
        if(mode=="records")print kind "\t" dest "\t" source "\t" service "\t" md5
        next
    }
    if(seen[dest]++)fail("Duplicate component target.")
    if(kind=="loader" || kind=="patch") {
        if(!hash(md5) || service!="-")fail("Expected OEM fingerprint.")
        if(dest==primary && md5==original)main++
        if(kind=="loader") {if(source!="-" || ++loaders>8)fail("Invalid loader record.")}
        else if(!asset(source))fail("Invalid patch asset.")
        if(mode=="paths")print "patch\t" dest
        if(mode=="catalog")print dest "\t" md5 "\t" lock
    } else if(kind=="shim" || kind=="file" || kind=="config" || kind=="executable") {
        leaf=substr(dest,length(prefix)+1)
        if(index(dest,prefix)!=1 || leaf=="" || leaf ~ /\// || leaf ~ /^\./ || !asset(source))fail("Payload must be a direct file in this tweak's persistent folder.")
        if(kind=="shim") {
            if(md5!="-" && md5!="no_reset")fail("Invalid shim options.")
            if(service=="-" || service!~/^[A-Za-z0-9_.-]+$/ || dest!~/\.so$/ || source!~/\.so$/ || ++shims>16)fail("Invalid shim service or asset.")
        } else {
            if(md5!="-")fail("Unexpected options field.")
            if(service!="-")fail("Unexpected service field.")
        }
        if(mode=="paths")print "shim\t" dest
        payload++
    } else fail("Unknown component kind.")
    if(mode=="records")print kind "\t" dest "\t" source "\t" service "\t" md5
}
END {
    if(bad)exit 1
    if(main!=1 || count==0 || ((shims || loader_envs) && !loaders))fail("Primary target or loader declaration is missing.")
    if(mode=="paths" && payload)print "create\t" substr(prefix,1,length(prefix)-1)
}
