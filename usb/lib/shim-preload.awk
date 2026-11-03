# Stock sm.conf service blocks only. Preserve unrelated bytes and preload order.
function fail(text) { print "Shim: " text; bad=1; exit 1 }
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
        if(ours){blocks++; start=NR; reset_val=attr(visible,"reset_board")}
        if(visible ~ /\/>[ \t]*$/) {
            if(ours)fail("Selected service has no editable body.")
            inService=0;ours=0
        }
    }
    if(ours && index(visible,"LD_PRELOAD")) {
        if($0 !~ /^[ \t]*<environ_var env_name="LD_PRELOAD" env_value="[^"]*"\/>( <!-- mzd-v74-shims -->)?[ \t]*$/)fail("Unsupported LD_PRELOAD layout.")
        preload++; entry=NR; old=attr($0,"env_value")
        if(old ~ /[^A-Za-z0-9_.\/: -]/)fail("Unsupported preload value.")
        n=split(old,tokens,/[ :]+/)
        for(i=1;i<=n;i++)if(tokens[i]==library)present++
    }
    if(index(visible,"</service>")){if(ours)end=NR;inService=0;ours=0}
    # Another service must not acquire an unnoticed reference to this library.
    if(!ours && index(visible,library))foreign=1
}
END {
    if(bad)exit 1
    if(blocks!=1 || !end || end<=start || inService || comment || preload>1 || present>1 || foreign)fail("Service/preload ownership is ambiguous.")
    if(mode=="status"){
        installed = present && (no_reset ? (reset_val=="no") : 1)
        print installed ? "installed" : "uninstalled"; exit 0
    }
    if(mode!="install" && mode!="uninstall")fail("Invalid preload action.")
    replacement=old
    if(mode=="install" && !present)replacement=(old=="" ? library : old " " library)
    if(mode=="uninstall" && present) {
        # Delete only our token and one adjacent separator. Preserve other bytes.
        pos=1
        while(match(substr(old,pos),/[^ :]+/)) {
            first=pos+RSTART-1; last=first+RLENGTH
            if(substr(old,first,RLENGTH)==library) {
                if(first>1)replacement=substr(old,1,first-2) substr(old,last)
                else replacement=substr(old,last+(substr(old,last,1) ~ /[ :]/ ? 1 : 0))
                break
            }
            pos=last
        }
    }
    if(no_reset==1) {
        if(mode=="install" && !present && reset_val!="" && reset_val!="no") {
            sub("reset_board=\"" reset_val "\"", "reset_board=\"no\"", lines[start])
            lines[start] = lines[start] " <!-- mzd-reset-board:" reset_val " -->"
        } else if(mode=="uninstall" && present) {
            if(match(lines[start], / <!-- mzd-reset-board:([A-Za-z0-9_-]+) -->/)) {
                orig_reset = substr(lines[start], RSTART+22, RLENGTH-26)
                sub("reset_board=\"no\"", "reset_board=\"" orig_reset "\"", lines[start])
                sub(/ <!-- mzd-reset-board:[A-Za-z0-9_-]+ -->/, "", lines[start])
            }
        }
    }
    for(i=1;i<=NR;i++) {
        if(!entry && i==start+1 && mode=="install")print "            <environ_var env_name=\"LD_PRELOAD\" env_value=\"" library "\"/> <!-- mzd-v74-shims -->"
        if(i==entry && ((mode=="install" && !present) || (mode=="uninstall" && present))) {
            if(replacement!="" || index(lines[i],"<!-- mzd-v74-shims -->")==0) {
                line=lines[i]; at=index(line,"env_value=\"")+11; tail=substr(line,at); q=index(tail,"\"")
                print substr(line,1,at-1) replacement substr(tail,q)
            }
        } else print lines[i]
    }
}
