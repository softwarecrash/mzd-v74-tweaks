# Stock sm.conf service blocks only. Manage custom environment variables.
function fail(text) { print "LoaderEnv: " text; bad=1; exit 1 }
function attr(line,name,   tail,q,pattern) {
    pattern="(^|[[:space:]])" name "=\""
    if(!match(line,pattern))return ""
    tail=substr(line,RSTART+RLENGTH); q=index(tail,"\"")
    if(!q)fail("Unterminated attribute.")
    if(match(substr(tail,q+1),pattern))fail("Duplicate attribute.")
    return substr(tail,1,q-1)
}
function xmlVisible(s,   out,at) {
    out=""
    while(length(s)) {
        if(comment) {
            at=index(s,"-->"); if(!at)return out
            s=substr(s,at+3);comment=0
        } else {
            at=index(s,"<!--")
            if(!at)return out s
            out=out substr(s,1,at-1);s=substr(s,at+4);comment=1
        }
    }
    return out
}

{
    lines[NR]=$0
    visible=xmlVisible($0)
    if(index(visible,"<service ")) {
        if(inService)fail("Nested or ambiguous service block.")
        inService=1; ours=(attr(visible,"name")==service)
        if(ours){blocks++; start=NR}
        if(visible ~ /\/>[ \t]*$/) {
            if(ours)fail("Selected service has no editable body.")
            inService=0;ours=0
        }
    }
    if(ours && index(visible,"<environ_var ") && index(visible,env_name)) {
        if(attr(visible,"env_name")==env_name) {
            entry=NR; old=attr(visible,"env_value"); present++
            if(!index(lines[entry],"env_value=\""))fail("Unsupported environment variable layout.")
            if(old ~ /["\r\n\\<>&]/)fail("Unsupported environment variable value.")
        }
    }
    if(index(visible,"</service>")){if(ours)end=NR;inService=0;ours=0}
}
END {
    if(bad)exit 1
    if(mode=="extract") {
        if(entry) print old
        exit 0
    }
    if(blocks!=1 || !end || end<=start || inService || comment || present>1)fail("Service or environment variable block is ambiguous.")
    if(mode!="status" && mode!="install" && mode!="uninstall")fail("Invalid loader environment variable action.")

    n_want = split(env_value, tokens_want, ":")
    n_old = entry ? split(old, tokens_old, ":") : 0
    n_keep = (keep!="") ? split(keep, tokens_keep, ":") : 0

    split("", map_old)
    split("", map_want)
    split("", map_keep)

    for(i=1; i<=n_old; i++) if(tokens_old[i]!="") map_old[tokens_old[i]]=1
    for(i=1; i<=n_want; i++) if(tokens_want[i]!="") map_want[tokens_want[i]]=1
    for(i=1; i<=n_keep; i++) if(tokens_keep[i]!="") map_keep[tokens_keep[i]]=1

    if(mode=="status") {
        all_present = 1
        for(i=1; i<=n_want; i++) {
            if(tokens_want[i]!="" && !map_old[tokens_want[i]]) {
                all_present = 0
                break
            }
        }
        print (entry && all_present) ? "installed" : "uninstalled"
        exit 0
    }

    if(mode=="install") {
        replacement = (!entry) ? "" : old
        for(i=1; i<=n_want; i++) {
            tok = tokens_want[i]
            if(tok!="" && !map_old[tok]) {
                replacement = (replacement=="" ? tok : replacement ":" tok)
                map_old[tok] = 1
            }
        }
    }

    if(mode=="uninstall") {
        if(!entry) {
            replacement = ""
        } else {
            replacement = ""
            for(i=1; i<=n_old; i++) {
                tok = tokens_old[i]
                if(tok=="") continue
                if(!map_want[tok] || map_keep[tok]) {
                    replacement = (replacement=="" ? tok : replacement ":" tok)
                }
            }
        }
    }

    for(i=1; i<=NR; i++) {
        if(!entry && i==start+1 && mode=="install") {
            print "            <environ_var env_name=\"" env_name "\" env_value=\"" replacement "\"/> <!-- mzd-v74-shims -->"
        }
        if(i==entry) {
            if(mode=="install") {
                line=lines[i]; at=index(line,"env_value=\"")+11; tail=substr(line,at); q=index(tail,"\"")
                print substr(line,1,at-1) replacement substr(tail,q)
            } else if(mode=="uninstall") {
                if(replacement!="") {
                    line=lines[i]; at=index(line,"env_value=\"")+11; tail=substr(line,at); q=index(tail,"\"")
                    print substr(line,1,at-1) replacement substr(tail,q)
                } else if(index(lines[i],"<!-- mzd-v74-shims -->")==0) {
                    line=lines[i]; at=index(line,"env_value=\"")+11; tail=substr(line,at); q=index(tail,"\"")
                    print substr(line,1,at-1) "" substr(tail,q)
                }
            } else {
                print lines[i]
            }
        } else {
            print lines[i]
        }
    }
}
