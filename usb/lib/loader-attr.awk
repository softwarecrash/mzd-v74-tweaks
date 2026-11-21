# Stock sm.conf / sm_WCP.conf service blocks only. Manage service attributes safely.
function fail(text) { print "LoaderAttr: " text; bad=1; exit 1 }
function set_attr(line,name,new_val,   pattern,tail,q,before,after) {
    pattern="(^|[[:space:]])" name "=\""
    if(!match(line,pattern))return line
    before=substr(line,1,RSTART+RLENGTH-1)
    tail=substr(line,RSTART+RLENGTH); q=index(tail,"\"")
    if(!q)fail("Unterminated attribute.")
    after=substr(tail,q)
    return before new_val after
}
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
        if(ours) {
            blocks++; start=NR
            has_attr = match(visible, "(^|[[:space:]])" attr_name "=\"")
            cur_val=attr(visible,attr_name)
        }
        if(visible ~ /\/>[ \t]*$/) { inService=0; ours=0 }
    }
    if(index(visible,"</service>")) {
        if(ours) end=NR
        inService=0; ours=0
    }
}

END {
    if(bad)exit 1
    if(blocks!=1 || inService || comment)fail("Service ownership is ambiguous.")

    line = lines[start]
    tag_comment = "<!-- mzd-attr-" attr_name ":"
    has_comment = (index(line, tag_comment) > 0)

    cur_args = attr(line, "args")
    args_token = attr_name "=" token
    args_pattern = "(^|[[:space:]])" args_token "([[:space:]]|$)"
    has_in_args = match(cur_args, args_pattern)
    has_args_comment = (index(line, tag_comment "removed_args=") > 0)
    has_attr_comment = (index(line, tag_comment "removed_attr=") > 0)

    is_installed=0
    if(op_mode=="remove_val") {
        has_token = match(cur_val, "(^|[[:space:]])" token "([[:space:]]|$)")
        is_installed = (!has_token)
    } else if(op_mode=="remove_attr") {
        if(has_attr || has_attr_comment) {
            is_installed = (!has_attr)
        } else if(has_in_args || has_args_comment) {
            is_installed = (!has_in_args)
        } else {
            is_installed = 1
        }
    } else if(op_mode=="set") {
        is_installed = has_attr && (cur_val==want_val)
    } else {
        fail("Invalid loader attribute operation.")
    }

    if(mode=="status") {
        if(is_installed && has_comment) {
            print "installed"
        } else {
            print "uninstalled"
        }
        exit 0
    }

    if(mode!="install" && mode!="uninstall")fail("Invalid loader attribute action.")

    if(mode=="install") {
        if(!has_comment) {
            if(op_mode=="remove_attr") {
                if(has_attr) {
                    if(want_val != "" && cur_val != want_val) fail("Attribute value mismatch.")
                    pattern = "(^|[[:space:]])" attr_name "=\""
                    if(!match(line, pattern)) fail("Cannot locate attribute in service line.")
                    tail = substr(line, RSTART + RLENGTH)
                    q = index(tail, "\"")
                    if(!q) fail("Unterminated attribute in service line.")
                    offset = RSTART - 1
                    match_len = RLENGTH + q
                    line = substr(line, 1, offset) substr(line, RSTART + match_len)
                    line = line " " tag_comment "removed_attr=" cur_val ":" offset " -->"
                } else if(has_in_args) {
                    new_args = cur_args
                    sub("(^|[[:space:]]+)" args_token "([[:space:]]+|$)", " ", new_args)
                    gsub(/^[[:space:]]+|[[:space:]]+$/, "", new_args)
                    line = set_attr(line, "args", new_args)
                    line = line " " tag_comment "removed_args=" token " -->"
                } else if(match(line, "(^|[[:space:]])args=\"")) {
                    line = line " " tag_comment "removed_args=absent -->"
                } else {
                    line = line " " tag_comment "removed_attr=absent -->"
                }
            } else if(op_mode=="remove_val") {
                has_token = match(cur_val, "(^|[[:space:]])" token "([[:space:]]|$)")
                if(!has_token) {
                    line = line " " tag_comment "removed=" cur_val " -->"
                } else {
                    new_val = cur_val
                    sub("(^|[[:space:]]+)" token "([[:space:]]+|$)", " ", new_val)
                    gsub(/^[[:space:]]+|[[:space:]]+$/, "", new_val)
                    line = set_attr(line, attr_name, new_val)
                    line = line " " tag_comment "removed=" token " -->"
                }
            } else if(op_mode=="set") {
                if(!has_attr) {
                    sub(/<service[[:space:]]+/, "<service " attr_name "=\"" want_val "\" ", line)
                    line = line " " tag_comment "absent -->"
                } else if(cur_val == want_val) {
                    line = line " " tag_comment cur_val " -->"
                } else {
                    line = set_attr(line, attr_name, want_val)
                    line = line " " tag_comment cur_val " -->"
                }
            } else {
                fail("Invalid loader attribute operation.")
            }
            lines[start] = line
        }
    } else if(mode=="uninstall") {
        if(keep_val!=1) {
            prefix = " " tag_comment
            idx = index(line, prefix)
            if(idx > 0) {
                tail = substr(line, idx + length(prefix))
                end_idx = index(tail, " -->")
                if(end_idx > 0) {
                    saved_orig = substr(tail, 1, end_idx - 1)
                    comment_len = length(prefix) + end_idx - 1 + length(" -->")
                    line = substr(line, 1, idx - 1) substr(line, idx + comment_len)
                    cur_clean_val = attr(line, attr_name)
                    if(saved_orig == "absent") {
                        if(!sub(attr_name "=\"" cur_clean_val "\"[[:space:]]+", "", line)) {
                            sub("[[:space:]]+" attr_name "=\"" cur_clean_val "\"", "", line)
                        }
                    } else if(index(saved_orig, "removed_attr=")==1) {
                        orig_part = substr(saved_orig, 14)
                        if(orig_part == "absent") {
                            if(cur_clean_val != "") {
                                if(!sub(attr_name "=\"" cur_clean_val "\"[[:space:]]+", "", line)) {
                                    sub("[[:space:]]+" attr_name "=\"" cur_clean_val "\"", "", line)
                                }
                            }
                        } else if(match(orig_part, /:[0-9]+$/)) {
                            orig_attr_val = substr(orig_part, 1, RSTART - 1)
                            offset = substr(orig_part, RSTART + 1) + 0
                            ins = (offset > 0 ? " " : "") attr_name "=\"" orig_attr_val "\""
                            line = substr(line, 1, offset) ins substr(line, offset + 1)
                        } else {
                            orig_attr_val = orig_part
                            sub(/<service[[:space:]]+/, "<service " attr_name "=\"" orig_attr_val "\" ", line)
                        }
                    } else if(index(saved_orig, "removed_args=")==1) {
                        orig_args = substr(saved_orig, 14)
                        cur_args = attr(line, "args")
                        if(orig_args == "absent") {
                            if(match(cur_args, args_pattern)) {
                                new_args = cur_args
                                sub("(^|[[:space:]]+)" args_token "([[:space:]]+|$)", " ", new_args)
                                gsub(/^[[:space:]]+|[[:space:]]+$/, "", new_args)
                                line = set_attr(line, "args", new_args)
                            }
                        } else {
                            restored_args = (cur_args=="" ? (attr_name "=" orig_args) : cur_args " " (attr_name "=" orig_args))
                            line = set_attr(line, "args", restored_args)
                        }
                    } else if(index(saved_orig, "removed=")==1) {
                        orig_val = substr(saved_orig, 9)
                        if(orig_val != cur_clean_val) {
                            new_val = (cur_clean_val=="" ? orig_val : cur_clean_val " " orig_val)
                            line = set_attr(line, attr_name, new_val)
                        }
                    } else {
                        if(saved_orig != cur_clean_val) {
                            line = set_attr(line, attr_name, saved_orig)
                        }
                    }
                    lines[start] = line
                }
            }
        }
    }

    for(i=1;i<=NR;i++) print lines[i]
}
