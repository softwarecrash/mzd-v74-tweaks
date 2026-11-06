/* CMU Opera 12-compatible UI. Manifests are data; only run.sh owns state. */
(function () {
    "use strict";
    var config = window.installerConfig, frame = document.getElementById("transport");
    var pending = {}, requestId = 0, connected = false, manager = null;
    var tweaks = [], selectedGroup = "", selected = null, scanning = false;
    var restartRequired = false, failedStatusName = "";
    var operating = false, closing = false, locked = false, dialogMode = "", returnFocusId = "", accepted = false;
    var detailView = 0, choicePicker = null, detailLoad = null;
    function detailBusy() { return !!detailLoad && dialogMode==="details"; }
    function clearDetailLoad() {
        if(detailLoad)window.clearInterval(detailLoad.timer);
        detailLoad=null;show("detail-loading",false);el("dialog").setAttribute("aria-busy","false");
    }
    function finishDetailLoad(state) {
        if(detailLoad!==state || state.building || state.pending)return;
        clearDetailLoad();
        if(dialogMode==="details" && state.view===detailView)el("back").focus();
    }
    function beginDetailLoad(view) {
        clearDetailLoad();
        var state={view:view,pending:0,building:true,timer:null,dots:1};detailLoad=state;
        text("detail-loading-text","Reading tweak information.");show("detail-loading",true);el("dialog").setAttribute("aria-busy","true");
        el("detail-loading").focus();
        state.timer=window.setInterval(function(){
            if(detailLoad!==state)return;
            state.dots=state.dots%3+1;text("detail-loading-text","Reading tweak information"+new Array(state.dots+1).join("."));
        },350);
        return state;
    }
    function el(id) { return document.getElementById(id); }
    function revealSection(node) {
        var area=el("dialog-body"), top=0, current=node;
        while(current && current!==area){top+=current.offsetTop||0;current=current.offsetParent;}
        if(current!==area)return;
        if(top<area.scrollTop)area.scrollTop=top;
        else if(top+node.offsetHeight>area.scrollTop+area.clientHeight)area.scrollTop=top+node.offsetHeight-area.clientHeight;
    }
    function section(node, heading) {
        node.className+=" dialog-section";
        node.setAttribute("data-heading",heading);
        node.onfocus=function(){revealSection(node);};
    }
    function text(id, value) {
        var headings={"dialog-state":"DETAILS","dialog-description":"DESCRIPTION","dialog-output":"DETAILS","dialog-contributors":"CONTRIBUTORS"};
        if(dialogMode!=="details" || !headings[id]){el(id).textContent=value;return;}
        if(id==="dialog-description") {
            clear(el(id));
            if(trim(value)) {
                var description=document.createElement("div");description.tabIndex=0;description.textContent=String(value);
                section(description,"DESCRIPTION");el(id).appendChild(description);
            }
            return;
        }
        var area=el(id),remaining=String(value||""),part,cut,line,button,balance,first=true;
        clear(area);
        // Small focusable sections keep every line reachable without touch scrolling.
        while(remaining){
            cut=remaining.length>360?remaining.lastIndexOf(" ",360):remaining.length;
            if(cut<40)cut=Math.min(360,remaining.length);
            else if(cut<remaining.length)cut++;
            // Limit explicit line breaks without turning blank paragraphs into sections.
            line=0;
            for(var breaks=0;breaks<6;breaks++){
                line=remaining.indexOf("\n",line);
                if(line<0 || line>=cut)break;
                if(breaks===5)cut=line+1;
                line++;
            }
            // Avoid a final section containing only a leftover word or short fragment.
            if(cut<remaining.length && remaining.length-cut<80){
                balance=remaining.lastIndexOf(" ",Math.floor(remaining.length/2));
                if(balance>=40 && balance<cut)cut=balance+1;
            }
            part=remaining.substring(0,cut);remaining=remaining.substring(cut);
            if(!trim(part))continue;
            button=document.createElement("button");button.textContent=part;
            section(button,first?headings[id]:"CONTINUED");first=false;area.appendChild(button);
        }
    }
    function show(id, visible) { el(id).className = visible ? el(id).className.replace(/\bhidden\b/g, "") : el(id).className.replace(/\bhidden\b/g, "") + " hidden"; }
    function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
    function setDialogMode(mode) {
        clearDetailLoad();
        closeChoice(false);
        var actions=el("dialog-actions"), previousDisplay=actions.style.display;
        // Presto can retain a native focus outline when its button is hidden.
        // Transfer focus while the middle action is still painted.
        if(mode!=="details" && [el("update-action"),el("uninstall-action"),el("restore-action")].indexOf(document.activeElement)>=0)el("back").focus();
        // Invalidate the whole native button row, including the former button's
        // background. Hiding just that control can leave its red border behind.
        actions.style.display="none";
        actions.offsetHeight;
        dialogMode=mode;
        el("dialog-heading").className=mode==="details"?"detail-heading":"";
        if (mode!=="details") {el("dialog-meta").tabIndex=-1;show("restore-action",false);show("uninstall-action",false);show("update-action",false);clear(el("dialog-settings"));clear(el("dialog-contributors"));}
        actions.style.display=previousDisplay||"";
    }
    function trim(value) { return String(value || "").replace(/^\s+|\s+$/g, ""); }
    function supported(item, action) { return item.manifest.actions.indexOf(action) !== -1; }
    function resultError(result) {
        if (!result || !result.started) return result && result.startError ? result.startError : "Process did not start.";
        if (result.signal) return "Process stopped by signal " + result.signal + ". Outcome may be unknown.";
        if (result.exitCode !== 0) return trim(result.stderr) || trim(result.stdout) || "Worker failed (exit " + result.exitCode + ").";
        return "";
    }
    // The existing native adapter represents output bytes as JSON \u00xx.
    // Decode UTF-8 here so non-ASCII manifest text remains readable as well.
    function outputText(value) { try { return decodeURIComponent(escape(value)); } catch (ignore) { return value; } }
    var shell = {
        exec: function (program, args, callback) {
            var id = ++requestId;
            pending[id] = callback;
            frame.contentWindow.postMessage({type:"shell-exec",token:config.token,id:id,program:program,args:args}, config.origin);
        }
    };
    var detailRequests=null,detailReplies=null;
    function infoRows(result) {
        var problem=resultError(result),rows={},lines,i,row;
        if(problem || result.stdoutTruncated || result.stderrTruncated)throw new Error(problem || "Information response was truncated.");
        if(result.stdout && result.stdout.charAt(result.stdout.length-1)!=="\n")throw new Error("Incomplete information response.");
        lines=result.stdout?result.stdout.slice(0,-1).split("\n"):[];
        for(i=0;i<lines.length;i++) {
            row=JSON.parse(lines[i]);
            if(!row || !/^[a-zA-Z0-9_-]+$/.test(row.key) || Object.prototype.hasOwnProperty.call(rows,row.key) ||
               typeof row.exitCode!=="number" || row.exitCode<0 || row.exitCode>255 || row.exitCode%1 ||
               typeof row.stdout!=="string" || typeof row.stderr!=="string")throw new Error("Invalid information response.");
            rows[row.key]={started:true,startError:"",exitCode:row.exitCode,signal:null,stdout:row.stdout,stderr:row.stderr,stdoutTruncated:false,stderrTruncated:false};
        }
        return rows;
    }
    function call(args, callback) {
        var isDetail=["package-info","update-info","settings-info","preflight-info","uninstall-check","restore-check"].indexOf(args[0])>=0;
        var state=detailBusy() && isDetail ? detailLoad : null;
        if(state)state.pending++;
        function complete(error,result) {
            try { callback(error,result); }
            finally { if(state){state.pending--;finishDetailLoad(state);} }
        }
        if(detailRequests && isDetail){detailRequests.push({args:args,complete:complete});return;}
        if(detailReplies && isDetail){complete(null,detailReplies[args[0]] || {started:false,startError:"Missing detail response."});return;}
        shell.exec("/bin/sh", ["./installer.sh"].concat(args), complete);
    }
    function detailError(error) {
        text("dialog-description","Could not read tweak information: "+String(error));
        el("action").disabled=true;el("update-action").disabled=true;el("uninstall-action").disabled=true;el("restore-action").disabled=true;
    }
    function requestDetails(item,requests) {
        if(!requests.length)return;
        var sections=[],i,deliveryFailure=null;
        for(i=0;i<requests.length;i++)sections.push(requests[i].args[0]);
        if(sections.indexOf("package-info")>=0)sections.push("update-info");
        function deliver(request,error,result) {
            try {request.complete(error,result);}
            catch(e){deliveryFailure=e;detailError(e);}
        }
        function individual(index) {
            if(index===requests.length){if(deliveryFailure)detailError(deliveryFailure);return;}
            var request=requests[index];
            shell.exec("/bin/sh",["./installer.sh"].concat(request.args),function(error,result){
                deliver(request,error,result);individual(index+1);
            });
        }
        call(["details",item.id,sections.join(" ")],function(error,result) {
            var rows=null,problem=error,j;
            try {if(!problem)rows=infoRows(result);}catch(e){problem=String(e);}
            if(!problem)for(j=0;j<sections.length;j++)if(!Object.prototype.hasOwnProperty.call(rows,sections[j])){problem="Missing detail response.";break;}
            // A truncated, timed-out or invalid batch must not hide valid sections.
            if(problem){individual(0);return;}
            detailReplies=rows;
            try {for(j=0;j<requests.length;j++)deliver(requests[j],null,rows[requests[j].args[0]]);}
            finally {detailReplies=null;if(deliveryFailure)detailError(deliveryFailure);}
        });
    }
    var cpuTotal = "0", cpuIdle = "0", metricsPending = false;
    function updateMetrics() {
        // Never enqueue telemetry behind status scans or a modifying action.
        if (!connected || closing || scanning || operating || metricsPending) return;
        metricsPending = true;
        call(["metrics", cpuTotal, cpuIdle], function (error, result) {
            metricsPending = false;
            var node = el("system-info"); clear(node);
            if (error || resultError(result)) { node.textContent = "System information unavailable"; return; }
            var lines = trim(result.stdout).split("\n"), parts, value, i;
            for (i = 0; i < lines.length; i++) {
                parts = lines[i].split("\t"); value = "";
                if (parts[0] === "cpu" && /^\d+$/.test(parts[1]) && /^\d+$/.test(parts[2])) {
                    cpuTotal = parts[1]; cpuIdle = parts[2];
                    value = "CPU: " + (/^\d+$/.test(parts[3]) ? parts[3] + "%" : "--");
                } else if (parts[0] === "disk" && /^\d+$/.test(parts[2])) {
                    if (parts[1] === "/") value = "System: " + parts[2] + "% free";
                    else if (parts[1] === "/tmp/mnt/resources" || parts[1] === "/mnt/resources") value = "Resources: " + parts[2] + "% free";
                }
                if (value) { var span = document.createElement("span"); span.textContent = value; node.appendChild(span); }
            }
            if (!node.firstChild) node.textContent = "System information unavailable";
        });
    }
    function footer(message) { text("footer-status", message); }
    function label(state) {
        if (state === "installed") return "Installed";
        if (state === "uninstalled") return "Not installed";
        if (state === "unavailable") return "Unavailable";
        if (state === "broken") return "Broken installation";
        if (state === "error") return "Status error";
        if (state === "command") return "Command";
        return "Checking status...";
    }
    function itemLabel(item) {return item.manifest.type==="command" && item.state==="uninstalled" ? "Ready" : label(item.state);}
    function controls() {
        if(operating || closing)el("back").disabled=true;
        el("refresh").disabled = !accepted || scanning || operating || closing || locked;
        el("exit").disabled = operating || closing;
        el("restore-action").disabled = scanning || locked || operating || closing;
        el("uninstall-action").disabled = scanning || locked || operating || closing;
        el("update-action").disabled = scanning || locked || operating || closing || !selected || !selected.updateAvailable;
        if (dialogMode === "restart") el("action").disabled = scanning || locked || operating || closing;
        var nodes = el("tabs").getElementsByTagName("button"), i;
        for (i = 0; i < nodes.length; i++) nodes[i].disabled = scanning || operating || closing;
        nodes = el("cards").getElementsByTagName("button");
        for (i = 0; i < nodes.length; i++) nodes[i].disabled = scanning || operating || closing;
    }
    function updateCard(item) {
        if (!item.button) return;
        item.dot.className = "dot " + item.state;
        item.statusNode.textContent = itemLabel(item);
        item.button.setAttribute("aria-label", item.name + ": " + itemLabel(item));
    }
    function groups() {
        var found = [], i;
        for (i = 0; i < tweaks.length; i++) if (found.indexOf(tweaks[i].group) === -1) found.push(tweaks[i].group);
        return found.sort();
    }
    function groupName(group) { return group.replace(/(^|-)([a-z])/g,function(match,separator,letter){return (separator?" ":"")+letter.toUpperCase();}); }
    function renderTabs() {
        var node = el("tabs"), all = groups(); clear(node);
        if (all.indexOf(selectedGroup) === -1) selectedGroup = all[0] || "";
        for (var i = 0; i < all.length; i++) (function (group) {
            var count = 0;
            for (var j = 0; j < tweaks.length; j++) if (tweaks[j].group === group) count++;
            var button = document.createElement("button");
            button.className = "tab" + (group === selectedGroup ? " selected" : "");
            button.textContent = groupName(group) + " (" + count + ")";
            button.setAttribute("role", "tab"); button.setAttribute("aria-selected", group === selectedGroup ? "true" : "false");
            button.onclick = function () {
                selectedGroup = group;
                // Keep the category buttons in the DOM so controller focus survives.
                var tabs = el("tabs").getElementsByTagName("button");
                for (var k = 0; k < tabs.length; k++) {
                    tabs[k].className = tabs[k] === button ? "tab selected" : "tab";
                    tabs[k].setAttribute("aria-selected", tabs[k] === button ? "true" : "false");
                }
                renderCards(); button.focus();
            };
            node.appendChild(button);
        }(all[i]));
        controls();
    }
    function selectCard(button,index) {
        var markers=el("list-position").children,area=el("content"),i;
        var active=markers.length===1?100:Math.max(25,150/markers.length),grey=markers.length>1?(100-active)/(markers.length-1):0,gap=Math.min(1.2,20/Math.max(1,markers.length));
        for(i=0;i<markers.length;i++){
            markers[i].className="list-segment"+(i===index?" active":"");
            markers[i].style.top=(i<=index?i*grey:active+(i-1)*grey)+"%";
            markers[i].style.height=((i===index?active:grey)-gap)+"%";
        }
        if(button.offsetTop<area.scrollTop)area.scrollTop=button.offsetTop;
        else if(button.offsetTop+button.offsetHeight>area.scrollTop+area.clientHeight)area.scrollTop=button.offsetTop+button.offsetHeight-area.clientHeight;
    }
    function renderCards() {
        var node = el("cards"),indicator=el("list-position"),position=0; clear(node);clear(indicator);
        show("empty", !tweaks.length);
        text("empty", "No tweaks found in the tweaks folder.");
        for (var i = 0; i < tweaks.length; i++) {
            var item = tweaks[i]; item.button = null;
            if (item.group !== selectedGroup) continue;
            var button = document.createElement("button"), dot = document.createElement("i"), name = document.createElement("span"), state = document.createElement("span");
            button.className = "tweak"; button.id = "tweak-" + item.id;
            name.className = "tweak-name"; name.textContent = item.name;
            state.className = "tweak-status";
            button.appendChild(dot); button.appendChild(name); button.appendChild(state);
            (function (tweak,card,index) {
                card.onfocus=function(){selectCard(card,index);};
                card.onclick=function(){selectCard(card,index);openDetails(tweak);};
            }(item,button,position));
            var marker=document.createElement("span");marker.className="list-segment"+(position===0?" active":"");
            indicator.appendChild(marker);position++;
            item.button = button; item.dot = dot; item.statusNode = state;
            node.appendChild(button); updateCard(item);
        }
        if(node.firstChild)selectCard(node.firstChild,0);
        el("content").scrollTop = 0; controls();
    }
    function settingDefinitions(raw) {
        var names=raw.settings ? raw.settings.split(" ") : [], defs=[], known={}, key, parts, i, d, n;
        function integer(v) {return /^(0|[1-9][0-9]*)$/.test(v || "") && String(v).length<=10 && Number(v)<=2147483647;}
        if(names.length>16)throw new Error("Too many settings.");
        for(i=0;i<names.length;i++) {
            key=names[i]; if(!/^[a-z][a-z0-9_]{0,31}$/.test(key) || known["$"+key])throw new Error("Invalid settings list.");
            d={key:key};known["$"+key]=d;defs.push(d);
        }
        for(key in raw)if(Object.prototype.hasOwnProperty.call(raw,key) && key.indexOf("setting.")===0) {
            parts=key.split(".");d=known["$"+parts[1]];
            if(parts.length!==3 || !d || "type label default min max step unit help options".split(" ").indexOf(parts[2])===-1 || unescape(encodeURIComponent(raw[key])).length>(parts[2]==="options"?4096:256))throw new Error("Invalid setting field: "+key);
            d[parts[2]]=raw[key];
        }
        for(i=0;i<defs.length;i++) {
            d=defs[i]; if(["number","boolean","choice"].indexOf(d.type)===-1 || !d.label || d.default===undefined)throw new Error("Incomplete setting: "+d.key);
            if(d.type==="number") {
                if(!integer(d.min) || !integer(d.max) || !integer(d.step) || Number(d.step)===0 || Number(d.min)>Number(d.max))throw new Error("Invalid numeric bounds.");
            } else if(d.min!==undefined || d.max!==undefined || d.step!==undefined || d.unit!==undefined)throw new Error("Unexpected numeric fields.");
            if(d.type==="choice") {
                d.choices=(d.options || "").split(" ");known={};
                if(d.choices.length>64)throw new Error("Too many choices.");
                for(n=0;n<d.choices.length;n++) {
                    key=d.choices[n];if(!/^[a-z0-9][a-z0-9_-]{0,31}$/.test(key) || known["$"+key])throw new Error("Invalid choices.");known["$"+key]=true;
                }
            } else if(d.options!==undefined)throw new Error("Unexpected options.");
            if(!settingValid(d,d.default))throw new Error("Invalid default: "+d.key);
        }
        return defs;
    }
    function settingValid(d,value) {
        if(d.type==="boolean")return value==="true" || value==="false";
        if(d.type==="choice")return d.choices.indexOf(value)!==-1;
        var n=Number(value);
        return /^(0|[1-9][0-9]*)$/.test(value) && String(value).length<=10 && n<=2147483647 && n>=Number(d.min) && n<=Number(d.max) && (n-Number(d.min))%Number(d.step)===0;
    }
    function settingArguments(item) {
        var args=[],defs=item.settingDefs||[],values=item.settingValues||{},i;
        for(i=0;i<defs.length;i++) {
            if(!settingValid(defs[i],values[defs[i].key]))throw new Error("Invalid setting: "+defs[i].label);
            args.push(defs[i].key+"="+values[defs[i].key]);
        }
        return args;
    }
    var languageNames={
        "off":"Off", "auto":"Automatic", "english":"English", "en":"English",
        "en-uk":"English (UK)", "en-us":"English (US)", "en-au":"English (Australia)",
        "ar":"العربية", "cs":"Čeština", "da":"Dansk", "de":"Deutsch",
        "es":"Español", "es-mx":"Español (México)", "fi":"Suomi",
        "fr":"Français", "fr-ca":"Français (Canada)", "hu":"Magyar",
        "it":"Italiano", "ja":"日本語", "nl":"Nederlands", "no":"Norsk",
        "pl":"Polski", "pt":"Português", "ru":"Русский", "sk":"Slovenčina",
        "sv":"Svenska", "tr":"Türkçe", "uk":"Українська",
        "zh-cn":"简体中文", "zh-tw":"繁體中文"
    };
    function settingDisplay(d,value) {
        if(d.type==="boolean")return value==="true"?"On":"Off";
        if(d.type==="choice" && /(^|_)language$/.test(d.key))
            return Object.prototype.hasOwnProperty.call(languageNames,value)?languageNames[value]:value;
        if(d.type==="choice")return value.charAt(0).toUpperCase()+value.substring(1);
        return value;
    }
    function closeChoice(restore) {
        var old=choicePicker;
        if(!old)return;
        choicePicker=null;
        if(old.root.parentNode)old.root.parentNode.removeChild(old.root);
        if(restore && old.view===detailView && selected===old.item && dialogMode==="details")old.trigger.focus();
    }
    function openChoice(item,d,trigger,save) {
        if(operating || closing || dialogMode!=="details" || selected!==item || item.settingsSaved)return;
        closeChoice(false);
        var root=document.createElement("div"),title=document.createElement("h2"),list=document.createElement("div"),cancel=document.createElement("button"),n;
        var state={root:root,list:list,buttons:[],index:d.choices.indexOf(item.settingValues[d.key]),view:detailView,item:item,trigger:trigger};
        root.id="choice-picker";root.className="choice-picker";root.setAttribute("role","dialog");root.setAttribute("aria-modal","true");root.setAttribute("aria-label",d.label);
        title.textContent=d.label;root.appendChild(title);list.className="choice-list";list.setAttribute("role","listbox");root.appendChild(list);
        choicePicker=state;
        function focus(index) {
            state.index=index;
            if(index<d.choices.length)list.scrollTop=Math.max(0,(index-4)*52);
        }
        for(n=0;n<d.choices.length;n++)(function(index){
            var b=document.createElement("button"),current=d.choices[index]===item.settingValues[d.key];
            b.id="choice-option-"+index;b.className="choice-option"+(current?" selected":"");b.textContent=settingDisplay(d,d.choices[index])+(current?" (selected)":"");
            b.setAttribute("role","option");b.setAttribute("aria-selected",current?"true":"false");
            b.onfocus=function(){focus(index);};
            b.onclick=function(){
                if(choicePicker!==state || state.view!==detailView || selected!==item || dialogMode!=="details" || operating || closing || item.settingsSaved)return;
                save(d.choices[index]);trigger.textContent=settingDisplay(d,item.settingValues[d.key]);closeChoice(true);
            };
            state.buttons.push(b);list.appendChild(b);
        }(n));
        cancel.id="choice-cancel";cancel.textContent="Cancel";cancel.onfocus=function(){state.index=d.choices.length;};cancel.onclick=function(){if(choicePicker===state)closeChoice(true);};state.buttons.push(cancel);root.appendChild(cancel);
        el("dialog").appendChild(root);state.index=Math.max(0,state.index);focus(state.index);state.buttons[state.index].focus();
    }
    function choiceKey(event,key) {
        var state=choicePicker,delta;
        if(!state)return false;
        if(key===27){closeChoice(true);}
        else if(key===37 || key===38 || key===39 || key===40 || key===77 || key===78 || key===9){
            delta=(key===37 || key===38 || key===78 || (key===9 && event.shiftKey))?-1:1;
            state.index=(state.index+delta+state.buttons.length)%state.buttons.length;
            if(state.index<state.buttons.length-1)state.list.scrollTop=Math.max(0,(state.index-4)*52);
            state.buttons[state.index].focus();
        } else if(key===13 || key===32){state.buttons[state.index].onclick();}
        else return false;
        if(event.preventDefault)event.preventDefault();event.returnValue=false;return true;
    }
    function renderSettings(item) {
        closeChoice(false);
        var area=el("dialog-settings"),defs=item.settingDefs||[],readOnly=item.settingsSaved,i;
        clear(area);
        if(!defs.length)return;
        var heading=document.createElement("div");heading.className="settings-heading";heading.textContent=readOnly?"INSTALLED SETTINGS":"SETTINGS";area.appendChild(heading);
        for(i=0;i<defs.length;i++)(function(d) {
            var row=document.createElement("div"),label=document.createElement("div"),controls=document.createElement("div"),value=document.createElement("span");
            row.className="setting-row";label.className="setting-label";label.textContent=d.label;row.appendChild(label);
            if(d.help){var help=document.createElement("div");help.className="setting-help";help.textContent=d.help;row.appendChild(help);}
            controls.className="setting-controls";row.appendChild(controls);area.appendChild(row);
            function button(suffix,title,handler) {
                var b=document.createElement("button");b.id="setting-"+d.key+"-"+suffix;b.textContent=title;b.setAttribute("aria-label",d.label+": "+title);b.onclick=handler;controls.appendChild(b);return b;
            }
            function save(v) {item.settingValues[d.key]=v;item.settingDraft[d.key]=v;}
            if(readOnly){row.tabIndex=0;section(row,"INSTALLED SETTING");value.textContent=settingDisplay(d,item.settingValues[d.key])+(d.unit?" "+d.unit:"");controls.appendChild(value);return;}
            if(d.type==="number") {
                var minus=button("minus","-",function(){save(String(Number(item.settingValues[d.key])-Number(d.step)));update();});
                value.className="setting-value";controls.appendChild(value);
                var plus=button("plus","+",function(){save(String(Number(item.settingValues[d.key])+Number(d.step)));update();});
                var update=function(){value.textContent=item.settingValues[d.key]+(d.unit?" "+d.unit:"");minus.disabled=Number(item.settingValues[d.key])-Number(d.step)<Number(d.min);plus.disabled=Number(item.settingValues[d.key])+Number(d.step)>Number(d.max);};
                update();
            } else if(d.type==="boolean") {
                var toggle=button("toggle","",function(){save(item.settingValues[d.key]==="true"?"false":"true");updateToggle();});
                var updateToggle=function(){var on=item.settingValues[d.key]==="true";toggle.textContent=on?"On":"Off";toggle.className="setting-toggle"+(on?" on":"");toggle.setAttribute("aria-checked",on?"true":"false");};
                toggle.setAttribute("role","switch");updateToggle();
            } else {
                var choice=button("choice",settingDisplay(d,item.settingValues[d.key]),function(){if(d.choices.length>=3){openChoice(item,d,choice,save);return;}var at=d.choices.indexOf(item.settingValues[d.key]);save(d.choices[(at+1)%d.choices.length]);choice.textContent=settingDisplay(d,item.settingValues[d.key]);});
            }
        }(defs[i]));
        if(readOnly){var note=document.createElement("div");note.className="setting-help";note.textContent="To change settings, uninstall this version first, then install again.";area.appendChild(note);}
    }
    function loadSettings(item,view) {
        item.settingDefs=item.manifest.settingDefs||[];item.settingValues={};item.settingDraft=item.settingDraft||{};item.settingsSaved=false;
        if(!item.settingDefs.length && item.state!=="installed") {item.settingsReady=true;return;}
        item.settingsReady=!item.settingDefs.length;
        if(!item.settingsReady)el("action").disabled=true;
        call(["settings-info",item.id],function(error,result) {
            if(view!==detailView || dialogMode!=="details" || selected!==item || operating || closing)return;
            try {
                var problem=error||resultError(result);if(problem)throw new Error(String(problem));
                if(result.stdoutTruncated || result.stderrTruncated)throw new Error("Settings response was truncated.");
                var raw={},lines=result.stdout.split("\n"),i,at,k;
                for(i=0;i<lines.length;i++)if(lines[i]) {
                    at=lines[i].indexOf("=");k=lines[i].substring(0,at);
                    if(at<0 || /[\x00-\x1f\x7f]/.test(lines[i]) || Object.prototype.hasOwnProperty.call(raw,k))throw new Error("Invalid settings response.");
                    raw[k]=lines[i].substring(at+1);
                }
                if(raw.settings_saved!=="true" && raw.settings_saved!=="false")throw new Error("Missing settings origin.");
                item.settingsSaved=raw.settings_saved==="true";item.settingDefs=settingDefinitions(raw);
                for(i=0;i<item.settingDefs.length;i++) {
                    var d=item.settingDefs[i],v=raw["value."+d.key];
                    if(!settingValid(d,v))throw new Error("Invalid saved value: "+d.key);
                    item.settingValues[d.key]=!item.settingsSaved && settingValid(d,item.settingDraft[d.key])?item.settingDraft[d.key]:v;
                }
                item.settingsReady=true;renderSettings(item);
                el("action").disabled=scanning||locked||item.invalid||item.settingsSaved&&item.state!=="installed"||item.compatibilityPending||item.compatibilityBlocked||item.installNeedsRestore;
            } catch(e){item.settingsReady=false;el("action").disabled=true;text("dialog-description",item.manifest.description+"\n\nSettings unavailable: "+String(e));}
        });
    }
    function parseManifest(id, raw) {
        var m = {}, lines = raw.split("\n"), fields = "contract_version id name description version type group firmware entrypoint actions target oem_backup_md5 lock_group status_scope reboot_required requires conflicts progress confirmation refresh_all reset_entrypoint settings shim_service shim_asset shim_path shim_extra_targets shim_checks components contributors payload_dir gui_api gui_menu_path gui_label gui_entrypoint gui_resident gui_service gui_translations preflight".split(" ");
        for (var n = 0; n < lines.length; n++) {
            var line = lines[n].replace(/\r$/, "");
            if (/[\x00-\x1f\x7f]/.test(line)) throw new Error("Manifest contains control characters.");
            if (!trim(line) || line.charAt(0) === "#") continue;
            var at = line.indexOf("="), key = line.substring(0, at);
            if (at < 0 || (fields.indexOf(key) === -1 && key.indexOf("setting.")!==0 && key.indexOf("config.")!==0)) throw new Error("Invalid manifest field.");
            if (Object.prototype.hasOwnProperty.call(m,key)) throw new Error("Duplicate manifest field: " + key);
            m[key] = line.substring(at + 1);
        }
        var required = "contract_version id name description version type group firmware entrypoint actions status_scope reboot_required requires conflicts".split(" ");
        for (var r = 0; r < required.length; r++) if (!Object.prototype.hasOwnProperty.call(m,required[r])) throw new Error("Missing manifest field: " + required[r]);
        var configNames=[],configTargets=[],configKey,ci,cname,ctype,cpath,csource,cp;
        for(configKey in m)if(m.hasOwnProperty(configKey) && configKey.indexOf("config.")===0) {
            if(String(m[configKey]).length>512)throw new Error("Oversized config field.");
            cp=configKey.split(".");if(cp.length!==3 || ["path","source"].indexOf(cp[2])<0)throw new Error("Invalid config field.");
            if(configNames.indexOf(cp[1])<0)configNames.push(cp[1]);
        }
        if(configNames.length>32)throw new Error("Too many config entries.");
        for(ci=0;ci<configNames.length;ci++) {
            cname=configNames[ci];cpath=m["config."+cname+".path"]||"";csource=(m["config."+cname+".source"]===undefined?"-":m["config."+cname+".source"]);
            if(cpath.indexOf("//")>=0)throw new Error("Invalid config path.");
            ctype=cpath.charAt(cpath.length-1)==="/"?"dir":"file";
            if(ctype==="dir"){cpath=cpath.substring(0,cpath.length-1);if(csource.charAt(csource.length-1)==="/")csource=csource.substring(0,csource.length-1);}
            if(!/^[a-z][a-z0-9_]{0,31}$/.test(cname) || configNames.indexOf(cname)!==ci || ["file","dir"].indexOf(ctype)<0 || m.type==="command" || !/^\/[A-Za-z0-9_.\/-]+$/.test(cpath) || /\/\.\.?($|\/)|\/\/|\/$/.test(cpath))throw new Error("Invalid config declaration.");
            if(csource!=="-" && (!/^assets\/[A-Za-z0-9_.\/-]+$/.test(csource) || /\/\.\.?($|\/)|\/\/|\/$/.test(csource)))throw new Error("Invalid config source.");
            for(cp=0;cp<configTargets.length;cp++)if(cpath===configTargets[cp] || cpath.indexOf(configTargets[cp]+"/")===0 || configTargets[cp].indexOf(cpath+"/")===0)throw new Error("Overlapping config paths.");
            var scope=cpath.match(/\/mzd-tweaks\/(data|gui-data|shims)(?:\/([^/]+))?/);
            if(scope && scope[2]!==m.id)throw new Error("Config overlaps another app namespace.");
            if(/\/mzd-tweaks\/(installed|gui-provider|config-owners)($|\/)|\/mzd-tweaks$/.test(cpath))throw new Error("Config overlaps installer metadata.");
            configTargets.push(cpath);
        }
        if (m.contract_version !== "1") throw new Error("Unsupported manifest contract version.");
        m.contract_version = 1;
        if (m.type==="gui-extension") {
            var menuPath=m.gui_menu_path||"", menuSegments=menuPath?menuPath.split("/"):[];
            if (menuPath.length>240 || menuSegments.length>8) throw new Error("Invalid GUI menu path.");
            for(var mi=0;mi<menuSegments.length;mi++) if (!menuSegments[mi] || menuSegments[mi]==="." || menuSegments[mi]===".." || menuSegments[mi].length>80 || trim(menuSegments[mi])!==menuSegments[mi]) throw new Error("Invalid GUI menu path.");
            if (["games","exit"].indexOf(m.id)!==-1) throw new Error("Reserved GUI extension ID.");
            if (m.gui_api!=="1" || !m.gui_label || m.gui_label.length>80 ||
                !/^assets\/[A-Za-z0-9_./-]+[.]html$/.test(m.gui_entrypoint||"") || /(^|\/)\.\.?($|\/)/.test(m.gui_entrypoint) ||
                m.reset_entrypoint!=="reset.sh" || m.reboot_required!=="true" || m.status_scope!=="payload" ||
                m.target || m.oem_backup_md5 || m.lock_group || m.components || m.shim_asset || m.actions!=="install uninstall status") throw new Error("Invalid GUI extension metadata.");
            ["gui_resident","gui_service","gui_translations"].forEach(function (key) {
                var value = m[key], suffix = key === "gui_service" ? "lua" : "js";
                if (m.hasOwnProperty(key) && !value) throw new Error("GUI capability paths cannot be empty.");
                if (value && (!new RegExp("^assets/[A-Za-z0-9_./-]+[.]" + suffix + "$").test(value) || /(^|\/)\.\.?($|\/)/.test(value))) throw new Error("Invalid GUI capability path.");
            });
            if (m.gui_service && !m.gui_resident) throw new Error("A GUI service requires a resident controller.");
        } else if (Object.prototype.hasOwnProperty.call(m,"gui_translations") || Object.prototype.hasOwnProperty.call(m,"gui_resident") || Object.prototype.hasOwnProperty.call(m,"gui_service") || m.gui_resident || m.gui_service || m.gui_api || m.gui_menu_path || m.gui_label || m.gui_entrypoint) throw new Error("GUI metadata requires gui-extension type.");
        if (m.reboot_required !== "true" && m.reboot_required !== "false") throw new Error("Invalid reboot_required value.");
        m.reboot_required = m.reboot_required === "true";
        if (m.progress !== undefined && m.progress !== "true" && m.progress !== "false") throw new Error("Invalid progress value.");
        m.progress = m.progress === "true";
        if (m.refresh_all !== undefined && m.refresh_all !== "true" && m.refresh_all !== "false") throw new Error("Invalid refresh_all value.");
        m.refresh_all = m.refresh_all === "true";
        if (m.preflight !== undefined && m.preflight !== "true" && m.preflight !== "false") throw new Error("Invalid preflight value.");
        m.preflight = m.preflight === "true";
        if (m.reset_entrypoint !== undefined && m.reset_entrypoint !== "" && m.reset_entrypoint !== "reset.sh") throw new Error("Invalid reset entrypoint.");
        var lists = ["firmware","actions","requires","conflicts"];
        for (var l = 0; l < lists.length; l++) m[lists[l]] = trim(m[lists[l]]) ? trim(m[lists[l]]).split(/ +/) : [];
        if (!m || m.contract_version !== 1 || m.id !== id || typeof m.name !== "string" || !trim(m.name) || typeof m.description !== "string" || !Array.isArray(m.actions) || m.entrypoint !== "run.sh") throw new Error("Invalid manifest: expected contract version 1, matching id, name, description, actions and entrypoint run.sh.");
        if (m.group !== undefined && (typeof m.group !== "string" || !trim(m.group))) throw new Error("Invalid manifest group.");
        m.settingDefs=settingDefinitions(m);
        return m;
    }
    function discover() {
        scanning = true; controls(); footer("Finding tweaks on USB...");
        function individual() {
            call(["list"],function(error,result){
                var problem=error||resultError(result),ids,index=0,rows=[];
                if(problem || result.stdoutTruncated || result.stderrTruncated){received(problem||"USB list was truncated.",result,false);return;}
                ids=trim(result.stdout)?trim(result.stdout).split(/\r?\n/):[];
                function next() {
                    if(closing){scanning=false;return;}
                    if(index===ids.length){received(null,{started:true,exitCode:0,signal:null,stdout:rows.join("\n")+(rows.length?"\n":""),stderr:""},false);return;}
                    var id=ids[index++];
                    if(!/^[a-zA-Z0-9_-]+$/.test(id)){next();return;}
                    call(["manifest",id],function(error,reply){
                        rows.push(JSON.stringify({key:id,exitCode:reply && reply.exitCode===2?2:error||resultError(reply)||reply.stdoutTruncated||reply.stderrTruncated?1:0,
                            stdout:reply?reply.stdout:"",stderr:String(error||resultError(reply)||(reply.stdoutTruncated||reply.stderrTruncated?"Manifest was truncated.":""))}));
                        next();
                    });
                }
                next();
            });
        }
        function received(error,result,canRetry) {
            var problem=error,rows,ids=[],id,i;
            try {if(!problem)rows=infoRows(result);}catch(e){problem=String(e);}
            if(problem && canRetry){individual();return;}
            if(result && (result.exitCode===2 || result.signal)){locked=true;failedStatusName="USB scan";}
            if(problem){scanning=false;footer("Could not read tweaks");showResult("Cannot read tweaks",String(problem),locked,function(){});controls();return;}
            tweaks=[];
            for(id in rows)if(Object.prototype.hasOwnProperty.call(rows,id))ids.push(id);
            ids.sort();
            for(i=0;i<ids.length;i++) {
                id=ids[i];var reply=rows[id];
                if(reply.exitCode===2){locked=true;failedStatusName=id;scanning=false;showResult("Cannot read tweak",String(resultError(reply)),true,function(){});controls();return;}
                var item={id:id,name:id,group:"errors",manifest:{actions:[]},state:"error",error:"",invalid:false};
                try {
                    problem=resultError(reply);if(problem)throw new Error(String(problem));
                    item.manifest=parseManifest(id,reply.stdout);item.name=item.manifest.name;
                    item.group=item.manifest.group||"other";item.state="checking";
                }catch(e){item.error=String(e);item.invalid=true;}
                tweaks.push(item);
            }
            tweaks.sort(function(a,b){return a.name.toLowerCase()<b.name.toLowerCase()?-1:a.name.toLowerCase()>b.name.toLowerCase()?1:0;});
            if(closing)return;
            renderTabs();renderCards();refreshAll();
        }
        call(["manifests"],function(error,result){received(error,result,true);});
    }
    function checkStatus(item, callback) {
        if (item.invalid) { callback(); return; }
        if (!supported(item, "status")) {
            item.state = supported(item,"run") ? "command" : "error";
            item.error = item.state === "error" ? "Manifest has no status action." : "";
            updateCard(item); callback(); return;
        }
        item.state = "checking"; item.error = ""; updateCard(item);
        call(["action",item.id,"status"], function (error, result) {
            var problem = error || resultError(result), state = result ? trim(result.stdout) : "";
            if (!problem && !result.stdoutTruncated && !result.stderrTruncated && result.stdout === state + "\n" &&
                (state === "installed" || state === "uninstalled" || state === "unavailable" || state === "broken")) {
                if ((state === "unavailable" || state === "broken") && !trim(result.stderr)) {
                    item.state = "error"; item.error = "Worker returned " + state + " without a reason.";
                } else { item.state = state; item.error = trim(result.stderr); }
            }
            else { item.state = "error"; item.error = String(problem || "Unexpected status response: " + state); }
            if (result && (result.exitCode === 2 || result.signal)) {locked = true;failedStatusName = item.name;}
            updateCard(item); callback();
        });
    }
    function refreshAll() {
        scanning = true; controls();
        var ids = [], wanted = {}, items = [], i;
        for (i = 0; i < tweaks.length; i++) {
            var item = tweaks[i];
            if (item.invalid) continue;
            if (!supported(item,"status")) {
                item.state = supported(item,"run") ? "command" : "error";
                item.error = item.state === "error" ? "Manifest has no status action." : "";
                updateCard(item); continue;
            }
            ids.push(item.id); wanted["$" + item.id] = true; items.push(item);
            item.state = "checking"; item.error = ""; updateCard(item);
        }
        function finish(problem) {
            scanning = false; controls();
            footer(locked ? "Status failed: " + failedStatusName + ". Do NOT reboot." : problem ? "Could not read installation states" : "");
            if (closing) return;
            if (dialogMode === "details") openDetails(selected);
            else if (!dialogMode && el("cards").firstChild) el("cards").firstChild.focus();
        }
        if (!ids.length) { finish(null); return; }
        footer("Reading installed tweaks...");
        call(["statuses",ids.join(" ")],function (error,result) {
            if (closing) {scanning=false;return;}
            var problem = error || resultError(result), rows = {}, j;
            if (result && (result.exitCode === 2 || result.signal)) {locked=true;failedStatusName="status scan";}
            try {
                if (problem) throw new Error(String(problem));
                if (result.stdoutTruncated || result.stderrTruncated || result.stdout.charAt(result.stdout.length-1) !== "\n") throw new Error("Incomplete status response.");
                var lines = result.stdout.slice(0,-1).split("\n");
                if (lines.length !== ids.length) throw new Error("Missing status entries.");
                for (j = 0; j < lines.length; j++) {
                    var fields = lines[j].split("\t"), key = "$" + fields[0];
                    if (fields.length !== 3 || !wanted[key] || rows[key] || !/^(installed|uninstalled|unavailable|broken|error)$/.test(fields[1])) throw new Error("Invalid status entry.");
                    if (/^(unavailable|broken|error)$/.test(fields[1]) && !trim(fields[2])) throw new Error("Status entry without a reason.");
                    rows[key] = {state:fields[1],reason:fields[2]};
                }
            } catch (e) {problem=String(e);}
            for (j = 0; j < items.length; j++) {
                var row = rows["$" + items[j].id];
                items[j].state = problem ? "error" : row.state;
                items[j].error = problem ? String(problem) : trim(row.reason);
                updateCard(items[j]);
            }
            finish(problem);
        });
    }
    function addMeta(key, value) {
        var row = document.createElement("div"), title = document.createElement("span"), content = document.createElement("span");
        row.className = "meta-row"; title.className = "meta-key"; title.textContent = key + ":";
        content.textContent = typeof value === "object" ? JSON.stringify(value) : String(value);
        row.appendChild(title); row.appendChild(content); el("dialog-meta").appendChild(row);
        return content;
    }
    function versionNewer(newer, older) {
        if (!/^[0-9]+[.][0-9]+[.][0-9]+$/.test(newer) || !/^[0-9]+[.][0-9]+[.][0-9]+$/.test(older)) return false;
        var n=newer.split("."),o=older.split("."),i;
        for(i=0;i<3;i++) {
            n[i]=n[i].replace(/^0+/,"");o[i]=o[i].replace(/^0+/,"");
            if(n[i].length!==o[i].length)return n[i].length>o[i].length;
            if(n[i]!==o[i])return n[i]>o[i];
        }
        return false;
    }
    function requestUninstall(item) {
        if(detailBusy() || operating || closing || scanning || locked)return;
        operating=true;controls();setDialogMode("working");el("back").disabled=true;el("action").disabled=true;text("dialog-state","Checking configuration");
        call(["config-info",item.id],function(error,result){
            operating=false;
            var problem=error||resultError(result), answer=result?trim(result.stdout):"";
            if(problem || (answer!=="present" && answer!=="none")) {
                controls();showResult("Cannot uninstall",String(problem||"Invalid configuration response"),false,function(){openDetails(item);});return;
            }
            if(answer==="none"){item.preserveConfig=false;perform(item,"uninstall");return;}
            setDialogMode("confirm");text("dialog-title","Keep configuration?");text("dialog-state",item.name);
            text("dialog-description","Keep this tweak's configuration and user data for a later installation?");
            clear(el("dialog-meta"));text("dialog-output","");text("back","No, remove");text("action","Yes, keep");
            el("back").disabled=false;el("action").disabled=false;
            el("back").onclick=function(){item.preserveConfig=false;perform(item,"uninstall");};
            el("action").onclick=function(){item.preserveConfig=true;perform(item,"uninstall");};el("action").focus();
        });
    }
    function confirmUpdate(item) {
        if (detailBusy() || !item.updateAvailable || operating || scanning || closing || locked) return;
        setDialogMode("confirm");el("dialog-body").className="";
        text("dialog-title","Update: "+item.name);text("dialog-state",item.installedVersion+" to "+item.manifest.version);
        text("dialog-description","The saved version will be uninstalled, then the USB version installed.\nConfiguration files and app data are kept. Compatible manifest settings are retained; new or incompatible options use the new defaults.\n\nIf replacement fails, the previous package is retained for recovery. It is not automatically reinstalled.");
        clear(el("dialog-meta"));text("dialog-output","");text("back","Cancel");text("action","Update");
        el("back").disabled=false;el("action").disabled=false;el("back").onclick=function(){openDetails(item);};
        el("action").onclick=function(){perform(item,"update");};el("back").focus();
    }
    function openDetails(item) {
        if(operating || closing || !item)return;
        var requests=[],previous=detailRequests,built=false;
        detailRequests=requests;
        try {buildDetails(item);built=true;}
        catch(e){
            if(detailLoad){detailLoad.pending=0;detailLoad.building=false;}
            clearDetailLoad();show("overlay",true);show("back",true);el("back").disabled=false;el("back").onclick=closeDialog;
            detailError(e);el("back").focus();
        }
        finally {detailRequests=previous;}
        if(built){
            requestDetails(item,requests);
            if(detailLoad){detailLoad.building=false;finishDetailLoad(detailLoad);}
            if(detailBusy())el("detail-loading").focus();
        }
    }
    function buildDetails(item) {
        var view=++detailView;
        show("restore-action",false); show("uninstall-action",false); item.savedRemovable=false; item.installNeedsRestore=false; item.updateAvailable=false; show("update-action",false);
        text("back","Back"); el("back").onclick=closeDialog;
        el("dialog-body").className = "section-list";
        selected = item; returnFocusId = "tweak-" + item.id; setDialogMode("details");
        beginDetailLoad(view);
        text("dialog-title", item.name+" - "+itemLabel(item)); el("dialog-dot").className = "dot " + item.state;
        text("dialog-state",item.error || "");
        var description = item.manifest.description || "Manifest could not be loaded.";
        if (item.manifest.type === "patch" || item.manifest.type === "service" || item.manifest.type === "files" || item.manifest.type === "gui-extension") {
            if (item.state === "broken" || (item.state === "unavailable" && /target|patch|file|content|incompatible/i.test(item.error || ""))) description += "\n\nUse System > Restore originals, then retry.\nThis resets ALL patches on affected files.";
        }
        text("dialog-description", description);
        clear(el("dialog-settings")); clear(el("dialog-meta")); text("dialog-output", "");
        el("dialog-meta").className="";el("dialog-meta").tabIndex=0;section(el("dialog-meta"),"TWEAK INFORMATION");
        // Present the manifest information needed to choose an action. Patch
        // hashes, lock names and internal file paths remain worker concerns.
        var versionMeta = item.manifest.version !== undefined ? addMeta("Version",item.manifest.version) : null;
        if (versionMeta && item.state === "installed" && item.manifest.type !== "command") {
            call(["package-info",item.id],function (error,result) {
                if (error || resultError(result) || view!==detailView || dialogMode !== "details" || selected !== item) return;
                var info = trim(result.stdout).split("\t");
                if (info.length !== 2 || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(info[0])) return;
                if (info[0] !== item.manifest.version) versionMeta.textContent = info[0] + " installed / " + item.manifest.version + " on USB";
                if (info[1]!=="installed" || !versionNewer(item.manifest.version,info[0]) || !supported(item,"install")) return;
                item.installedVersion=info[0];show("update-action",true);el("update-action").disabled=true;
                call(["update-info",item.id],function(error,result){
                    if(view!==detailView || dialogMode!=="details" || selected!==item || operating || closing || scanning || locked)return;
                    var offer=result && !result.stdoutTruncated && !result.stderrTruncated && result.stdout.match(/^available\t([0-9]+\.[0-9]+\.[0-9]+)\t([0-9]+\.[0-9]+\.[0-9]+)\n$/);
                    if(error || resultError(result) || !offer || offer[1]!==item.installedVersion || offer[2]!==item.manifest.version) {
                        text("dialog-description",description+"\n\nUpdate unavailable: "+String(error||resultError(result)||"Package versions changed. Refresh and retry."));return;
                    }
                    item.updateAvailable=true;el("update-action").disabled=false;
                    el("update-action").onclick=function(){if(view===detailView && selected===item && dialogMode==="details")confirmUpdate(item);};
                });
            });
        }
        if (item.manifest.firmware !== undefined) addMeta("Firmware",Array.isArray(item.manifest.firmware) ? item.manifest.firmware.join(", ") : item.manifest.firmware);
        if (item.manifest.type !== undefined) addMeta("Type",item.manifest.type);
        if (!item.invalid) addMeta("Category",groupName(item.group));
        if(item.manifest.contributors)addMeta("Contributors",item.manifest.contributors);
        if (item.manifest.reboot_required !== undefined) addMeta("Restart required",item.manifest.reboot_required ? "Yes (after exit)" : "No");
        show("back",true); show("action",true); show("result-ok",false); show("overlay",true);
        el("dialog-body").scrollTop = 0;
        var action = item.state === "installed" ? "uninstall" : item.state === "uninstalled" ? (supported(item,"run") ? "run" : "install") : item.state === "command" ? "run" : "status";
        text("action", action === "status" ? "Retry status" : action.charAt(0).toUpperCase() + action.substring(1));
        el("action").disabled = scanning || locked || item.invalid || !supported(item,action);
        el("back").disabled = false; el("back").focus();
        el("action").onclick = function () {
            if (detailBusy() || el("action").disabled || !item.settingsReady || item.compatibilityPending || item.compatibilityBlocked || (action === "install" && item.installNeedsRestore)) return;
            if (action === "status") {
                scanning = true; controls(); el("action").disabled = true;
                checkStatus(item,function () {scanning=false;controls();openDetails(item);});
            } else if (action === "run" && item.manifest.confirmation) confirmRun(item);
            else if(action==="uninstall")requestUninstall(item);
            else perform(item,action);
        };
        item.compatibilityPending=false; item.compatibilityBlocked=false;
        loadSettings(item,view);
        if((item.manifest.components || item.manifest.preflight) && item.state!=="installed" && !item.invalid) {
            item.compatibilityPending=true;el("action").disabled=true;
            call(["preflight-info",item.id],function(error,result) {
                if(view!==detailView || dialogMode!=="details" || selected!==item || operating || closing)return;
                item.compatibilityPending=false;
                var lines=result && result.stdout?trim(result.stdout).split("\n"):[],messages=[],blocked=false;
                for(var i=0;i<lines.length;i++) {
                    if(!lines[i])continue;
                    var parts=lines[i].split("\t");
                    if(parts.length!==2 || (parts[0]!=="block" && parts[0]!=="warning" && parts[0]!=="info") || !parts[1] || /[\x00-\x1f\x7f]/.test(parts[1])) {blocked=true;messages.push("Invalid compatibility response.");break;}
                    if(parts[0]==="block")blocked=true;
                    messages.push((parts[0]==="block"?"Cannot install: ":parts[0]==="warning"?"Note: ":"Info: ")+parts[1]);
                }
                if(error || resultError(result)) {blocked=true;if(!messages.length)messages.push(String(error||resultError(result)));}
                item.compatibilityBlocked=blocked;
                text("dialog-description",description+(messages.length?"\n\n"+messages.join("\n"):""));
                el("action").disabled=scanning||locked||item.invalid||!item.settingsReady||blocked||item.installNeedsRestore||!supported(item,action);
            });
        }
        // Offer the recorded uninstaller for a broken package, never a new USB
        // worker or an inferred ownership claim. The action rechecks all guards.
        if (!scanning && !locked && !item.invalid && item.state==="broken" && item.manifest.type!=="command" && supported(item,"uninstall")) {
            call(["uninstall-check",item.id],function (error,result) {
                if (view!==detailView || dialogMode!=="details" || selected!==item || operating || closing || scanning || locked) return;
                var info=result && typeof result.stdout==="string" && !result.stdoutTruncated && !result.stderrTruncated && result.stdout.match(/^available\t([0-9]+\.[0-9]+\.[0-9]+)\t(installed|prepared|installing|uninstalling|restoring|failed)\n$/);
                if (error || resultError(result) || !info) {
                    text("dialog-description",description+"\n\nSaved uninstall unavailable:\n"+String(error || resultError(result) || "Invalid saved-uninstall response."));
                    return;
                }
                item.savedRemovable=true;
                if (versionMeta && info[1]!==item.manifest.version) versionMeta.textContent=info[1]+" saved / "+item.manifest.version+" on USB";
                show("restore-action",false);show("uninstall-action",true);el("uninstall-action").disabled=false;
                text("dialog-description",item.manifest.description+"\n\nRemove the saved installation (version "+info[1]+") before trying again. Its recorded uninstaller will be used. You can install the USB version after successful removal.");
                el("uninstall-action").onclick=function () {
                    if (el("uninstall-action").disabled || view!==detailView || dialogMode!=="details" || selected!==item || operating || closing || scanning || locked) return;
                    requestUninstall(item);
                };
            });
        }
        // Inspect only the opened detail view, never the whole menu. Leave it
        // visible and preserve focus; require offered recovery before Install.
        if (!scanning && !locked && !item.invalid && item.manifest.type==="patch" && item.state!=="installed" && supported(item,"install")) {
            call(["restore-check",item.id],function (error,result) {
                if (error || view!==detailView || dialogMode!=="details" || selected!==item || operating || closing || scanning || locked || item.savedRemovable) return;
                if (result && !resultError(result) && !result.stdoutTruncated && !result.stderrTruncated && result.stdout === "original\n") return;
                var offer=originalRestoreOffer(result);
                if (!offer) {
                    var reason=error || resultError(result) || "The restore check returned an invalid response.";
                    text("dialog-description",description+"\n\nRestore original unavailable:\n"+String(reason));
                    return;
                }
                show("restore-action",true); el("restore-action").disabled=false;
                if (action === "install") {item.installNeedsRestore=true;el("action").disabled=true;}
                text("dialog-description",item.manifest.description+"\n\nRestore original resets ALL changes to this file."+(action === "install" ? " Restore it before installing." : ""));
                el("restore-action").onclick=function () {
                    if (el("restore-action").disabled) return;
                    confirmOriginalRestore(item,offer.hash,offer.path,function () {openDetails(item);});
                };
            });
        }

    }
    function confirmRun(item) {
        setDialogMode("confirm");
        el("dialog-body").className = "";
        text("dialog-title", "Confirm: " + item.name);
        text("dialog-state", "This action changes the system.");
        text("dialog-description", item.manifest.confirmation); clear(el("dialog-meta"));
        text("action", "Continue"); text("back", "Cancel"); el("back").focus();
        el("back").onclick = function () {text("back","Back");openDetails(item);};
        el("action").onclick = function () {text("back","Back");el("back").onclick=closeDialog;perform(item,"run");};
    }
    function closeDialog() {
        if(detailBusy())return;
        if(selected)selected.settingDraft=null;
        show("overlay",false); setDialogMode(""); el("dialog-state").className=""; el("dialog-body").className="";
        var button = document.getElementById(returnFocusId); if (button) button.focus();
    }
    function showDisclaimer() {
        setDialogMode("disclaimer");
        el("dialog-body").className="";
        text("dialog-title","MZD Tweaks - Before you begin"); el("dialog-dot").className="dot";
        el("dialog-state").className="startup-warning";
        text("dialog-state","Use only while parked.");
        text("dialog-description","Choose how you want to customize your Mazda.\nRead each description before installing.\n\nKeep the system on and leave the USB stick plugged in until everything is finished.");
        clear(el("dialog-meta")); text("dialog-output","");
        text("back","Exit"); text("action","OK");
        show("back",true); show("action",true); show("result-ok",false); show("overlay",true);
        el("dialog-body").scrollTop=0;
        el("back").disabled=false; el("action").disabled=false;
        el("back").onclick=exit;
        el("action").onclick=function () {
            if(accepted || closing)return;
            accepted=true; text("back","Back"); el("back").onclick=closeDialog;
            closeDialog(); discover();
        };
        controls(); footer("Read the notice, then select OK or Exit."); el("action").focus();
    }
    function showResult(title, message, critical, callback, status) {
        el("dialog-body").className = status ? "bottom-info" : "";
        setDialogMode("result"); show("overlay",true); text("dialog-title",title);
        el("dialog-dot").className = "dot " + (critical ? "error" : "uninstalled");
        el("dialog-state").className = status ? "operation-status" : "";
        text("dialog-state",status || "");
        text("dialog-description", critical ? "Further actions are blocked. Do NOT reboot. Check the USB reports." : ""); clear(el("dialog-meta")); text("dialog-output",message);
        show("back",false); show("action",false); show("result-ok",true); el("result-ok").disabled=false;
        el("dialog-body").scrollTop = 0;
        el("result-ok").onclick = function () {closeDialog();callback();}; el("result-ok").focus();
    }
    function executeAction(item, action, callback, restoreHash) {
        if(action==="restore-original") {call(["restore-original",item.id,restoreHash],callback);return;}
        var options;
        if(action==="uninstall" && item.preserveConfig){call(["action",item.id,"uninstall","--preserve-config"],callback);return;}
        if(action==="update"){call(["action",item.id,"update",item.manifest.version],callback);return;}
        try {options=(action==="install" || action==="run")?settingArguments(item):[];}
        catch(e){callback(null,{started:false,startError:String(e),exitCode:null,signal:null,stdout:"",stderr:""});return;}
        if(action!=="run" || !item.manifest.progress) {call(["action",item.id,action].concat(options),callback);return;}
        call(["start-run",item.id].concat(options),function(error,result) {
            if(error || resultError(result)) {callback(error,result);return;}
            var job=trim(result.stdout), started=new Date().getTime();
            if(!/^job\.[A-Za-z0-9]+$/.test(job)) {callback("Invalid background job response.",result);return;}
            function poll() {
                call(["job-status",job],function(error,result) {
                    if(error || resultError(result)) {callback("Background job state is uncertain: "+(error||resultError(result)),result);return;}
                    var lines=result.stdout.split("\n");
                    if(lines[0]==="running") {
                        var done=Number(lines[1]),total=Number(lines[2]),message=lines[3]||"Working";
                        text("dialog-state",message+(total>0?" ("+done+"/"+total+")":"")+" - "+Math.floor((new Date().getTime()-started)/1000)+" s");
                        window.setTimeout(poll,1000);return;
                    }
                    if(lines[0]!=="done" || !/^[0-9]+$/.test(lines[1])) {callback("Invalid background job state.",result);return;}
                    var code=Number(lines[1]);
                    call(["job-output",job,"stdout"],function(error,out) {
                        if(error || resultError(out)) {callback("Could not read background result.",out);return;}
                        call(["job-output",job,"stderr"],function(error,err) {
                            if(error || resultError(err)) {callback("Could not read background error output.",err);return;}
                            callback(null,{started:true,startError:"",exitCode:code,signal:null,stdout:out.stdout,stderr:err.stdout,
                                stdoutTruncated:out.stdoutTruncated,stderrTruncated:err.stdoutTruncated});
                        });
                    });
                });
            }
            poll();
        });
    }
    function originalRestoreOffer(result) {
        if (!result || resultError(result) || result.stdoutTruncated || result.stderrTruncated) return null;
        var fields=result.stdout.split("\t");
        if (fields.length!==3 || fields[0]!=="available" || !/^[0-9a-f]{32}$/.test(fields[1]) || !/^\/[^\x00-\x1f\x7f]+\n$/.test(fields[2])) return null;
        return {hash:fields[1],path:fields[2].slice(0,-1)};
    }
    function confirmOriginalRestore(item, hash, path, cancel) {
        if(detailBusy())return;
        setDialogMode("restore-confirm"); el("dialog-body").className="";
        el("dialog-state").className="";
        text("dialog-title","Restore original file?"); el("dialog-dot").className="dot unavailable";
        text("dialog-state","A verified original backup is available");
        text("dialog-description","Restoring this file removes ALL tweaks affecting it.\nYour current file and original backup will be saved to USB first.\n\n"+path+"\n\nThis does not install the tweak. You can retry Install afterwards.");
        clear(el("dialog-meta")); text("dialog-output","");
        show("overlay",true); show("back",true); show("action",true); show("result-ok",false);
        text("back","Back"); text("action","Restore original");
        el("back").disabled=false; el("action").disabled=false;
        el("back").onclick=cancel;
        el("action").onclick=function () {perform(item,"restore-original",hash);};
        el("dialog-body").scrollTop=0; el("back").focus();
    }
    function perform(item, action, restoreHash) {
        if(detailBusy() || choicePicker)return;
        var actionName = action==="restore-original" ? "Restore" : action.charAt(0).toUpperCase() + action.slice(1);
        var workingTimer = null, workingDots = 0;
        var workingLabel = {install:"Installing",update:"Updating",uninstall:"Uninstalling","restore-original":"Restoring"}[action];
        operating = true; controls(); setDialogMode("working");
        el("dialog-body").className = "bottom-info";
        el("dialog-state").className = "operation-status";
        text("dialog-state",workingLabel ? workingLabel : actionName + " in progress...");
        if (workingLabel) {
            workingTimer = window.setInterval(function () {
                if (!operating || dialogMode!=="working") return;
                workingDots = (workingDots + 1) % 4;
                text("dialog-state",workingLabel + new Array(workingDots + 1).join("."));
            },500);
        }
        text("dialog-description","Keep the system on and do not remove the USB drive");
        clear(el("dialog-meta"));
        el("back").disabled = true; el("action").disabled = true;
        footer("Working: " + item.name);
        function complete(error,result) {
            operating=false;
            if (workingTimer!==null) {window.clearInterval(workingTimer);workingTimer=null;}
            var recoveryCandidate=result && /(^|\n)MZD_RECOVERY_CANDIDATE\n/.test(result.stdout);
            if (result && result.stdout) result.stdout=result.stdout.replace(/^MZD_RECOVERY_CANDIDATE\n/gm,"");
            var problem = error || resultError(result);
            var critical = !!error || !result || (result.started && (result.exitCode === 2 || !!result.signal || result.exitCode === null));
            if (critical) locked=true;
            if (!problem && (action==="restore-original" || (item.manifest.reboot_required && (action === "install" || action === "update" || action === "uninstall" || action === "run")))) restartRequired=true;
            var message = result ? trim(result.stdout + (result.stderr ? "\n" + result.stderr : "")) : "";
            // Old saved workers may still return their original progress preamble.
            // Keep the single live status row authoritative; retain useful details.
            message = trim(message.replace(/^(?:install|uninstall|run) in progress\. Do not remove the USB drive\.[ \t]*$/gim, "")
                .replace(/^(?:install|uninstall|run) completed\.[ \t]*(?:Other changes were preserved\.)?[ \t]*$/gim, "Other changes were preserved."));
            if (!message) message = problem ? String(problem) : "No additional details.";
            if (result && (result.stdoutTruncated || result.stderrTruncated)) message += "\n\nOutput was truncated. See the tweak reports on USB.";
            item.state = "error"; item.error = problem ? String(problem) : "Status will be checked after OK."; updateCard(item);
            var status = actionName + (problem ? " failed" : " completed");
            controls(); footer(locked ? "Critical worker failure. Do NOT reboot." : status);
            var title = critical ? "Manual check required" : problem ? "Operation failed" : "Operation completed";
            showResult(item.name+" - "+title,message,critical,function () {
                if (locked) return;
                if (item.manifest.refresh_all) {refreshAll();return;}
                scanning=true; controls(); footer("Checking " + item.name + "...");
                checkStatus(item,function () {
                    scanning=false;controls();footer(locked ? "Critical worker failure. Do NOT reboot." : "Status updated - " + item.name);
                    if (recoveryCandidate && action==="install" && !locked) openDetails(item);
                });
            },status);
        }
        executeAction(item,action,complete,restoreHash);
    }
    var focusPending=false;
    function checkFocusRequest() {
        if(focusPending || operating || closing || !connected)return;
        focusPending=true;
        call(["event","focus-poll"],function(error,result){
            if(error || resultError(result) || closing || !result || trim(result.stdout)!=="requested") {focusPending=false;return;}
            try {
                manager.SetRequiredSurfaces("JCI_OPERA_SECONDARY",0);
                manager.SetKeyboardFocus("JCI_OPERA_SECONDARY");
            } catch(e) {
                focusPending=false;call(["event","note","Replug focus failed: "+String(e)],function(){});return;
            }
            call(["event","refocus-ready","Replug: Secondary visibility and keyboard focus requested"],function(){focusPending=false;});
        });
    }
    function restorePrimary() {
        if (!manager) return "Native focus controller unavailable.";
        try {manager.SetRequiredSurfaces("JCI_OPERA_PRIMARY",0);manager.SetKeyboardFocus("JCI_OPERA_PRIMARY");return "";}
        catch (e) {return String(e);}
    }
    function leaveInstaller(restart) {
        if (operating || closing || (restart && (locked || scanning))) return;
        closing=true;controls();
        el("back").disabled=true;el("action").disabled=true;
        footer(restart ? "Preparing restart..." : "Returning to Mazda...");
        var problem = restart ? "User confirmed restart" : restorePrimary();
        call(["event",restart ? "restart" : "close",problem || "Primary visibility and focus requested"],function (error,result) {
            if(error || resultError(result)) {
                closing=false;controls();
                el("back").disabled=false;el("action").disabled=false;
                text("dialog-state","Could not close: "+(error || resultError(result)));
                footer("Exit failed; retry Exit.");
            }
        });
    }
    function exit() {
        if (operating || closing) return;
        if (!restartRequired || locked) {leaveInstaller(false);return;}
        setDialogMode("restart");returnFocusId="exit";
        el("dialog-body").className="";
        text("dialog-title","Restart recommended");el("dialog-dot").className="dot installed";
        text("dialog-state","Changes were made during this session.");
        text("dialog-description","Restart the CMU to activate all changes.\nSelect Restart now, or Exit to restart later.");
        clear(el("dialog-meta"));text("dialog-output","");
        text("back","Exit");text("action","Restart");
        show("back",true);show("action",true);show("result-ok",false);show("overlay",true);
        el("back").disabled=false;el("action").disabled=scanning || locked;el("dialog-body").scrollTop=0;
        el("back").onclick=function(){leaveInstaller(false);};
        el("action").onclick=function(){leaveInstaller(true);};
        (el("action").disabled ? el("back") : el("action")).focus();
    }
    el("back").onclick=closeDialog;
    el("refresh").onclick=function () {
        if (!accepted || scanning || operating || closing || locked) return;
        if (dialogMode) closeDialog();
        selected = null; detailView += 1;
        discover();
    };
    el("exit").onclick=exit;
    function controllerBack(event) {
        // Backspace is the CMU Back button. Always suppress browser history.
        if(event.preventDefault)event.preventDefault();event.returnValue=false;
        if(detailBusy() || operating || closing)return;
        if(choicePicker){closeChoice(true);return;}
        if(dialogMode==="restore-confirm")el("back").onclick();else if(dialogMode==="restart")leaveInstaller(false);else if(dialogMode==="confirm")openDetails(selected);else if(dialogMode==="details")closeDialog();else if(dialogMode==="disclaimer" || !dialogMode)exit();
    }
    document.onkeydown=function (event) {
        event=event||window.event; var key=event.keyCode||event.which, nodes, buttons=[],i,index=-1;
        if(detailBusy()){if(event.preventDefault)event.preventDefault();event.returnValue=false;return;}
        if(key===8) {
            // Mazda emits goBack on keyup, not keydown or auto-repeat.
            if(event.preventDefault)event.preventDefault();event.returnValue=false;return;
        }
        if(choiceKey(event,key))return;
        if(dialogMode==="details" && (key===38 || key===40)) {
            var field=document.activeElement,previous;
            if(field && field.parentNode===el("dialog-description") && field.scrollHeight>field.clientHeight) {
                previous=field.scrollTop;
                field.scrollTop=Math.max(0,Math.min(field.scrollHeight-field.clientHeight,previous+(key===38?-46:46)));
                if(field.scrollTop!==previous){if(event.preventDefault)event.preventDefault();event.returnValue=false;return;}
            }
        }
        // Original CMU Multicontroller.js: M = clockwise, N = counterclockwise.
        // Rotation and tilt navigate detail sections as well as action buttons.
        if(key===77)key=39;else if(key===78)key=37;
        if (key===27) {
            if (dialogMode==="restore-confirm") el("back").onclick(); else if (dialogMode==="restart") leaveInstaller(false); else if (dialogMode==="confirm") openDetails(selected); else if (dialogMode==="details") closeDialog(); else if (dialogMode==="disclaimer" || !dialogMode) exit(); else return;
        } else if (key===38 || key===40 || key===37 || key===39) {
            // Up/down scroll detail text; left/right selects its action buttons.
            if (dialogMode && dialogMode!=="details" && (key===38 || key===40)) el("dialog-body").scrollTop += key===38 ? -70 : 70;
            else {
                nodes=(dialogMode ? el("dialog") : el("app")).getElementsByTagName("button");
                if(dialogMode==="details") {
                    nodes=[];
                    (function collect(parent){
                        for(var n=0;n<parent.children.length;n++){
                            var child=parent.children[n];
                            if(child.tagName.toLowerCase()==="button" || child.tabIndex===0)nodes.push(child);
                            else collect(child);
                        }
                    }(el("dialog")));
                }
                for(i=0;i<nodes.length;i++) if(!nodes[i].disabled && nodes[i].className.indexOf("hidden")===-1) buttons.push(nodes[i]);
                for(i=0;i<buttons.length;i++) if(buttons[i]===document.activeElement) index=i;
                if(buttons.length) {
                    index=(index+(key===37||key===38?-1:1)+buttons.length)%buttons.length;
                    buttons[index].focus();
                    if(dialogMode==="details")revealSection(buttons[index]);
                    if (!dialogMode && buttons[index].className==="tweak") {
                        var card=buttons[index],area=el("content");
                        if(card.offsetTop<area.scrollTop)area.scrollTop=card.offsetTop;
                        else if(card.offsetTop+card.offsetHeight>area.scrollTop+area.clientHeight)area.scrollTop=card.offsetTop+card.offsetHeight-area.clientHeight;
                    }
                }
            }
        } else if (key===13 || key===32) {
            var current=document.activeElement;
            if(current && !current.disabled && typeof current.onclick==="function") current.onclick(); else return;
        } else return;
        if(event.preventDefault)event.preventDefault();event.returnValue=false;
    };
    document.onkeyup=function (event) {
        event=event||window.event;
        if((event.keyCode||event.which)===8)controllerBack(event);
    };
    window.addEventListener("message",function (event) {
        if(event.source!==frame.contentWindow || event.origin!==config.origin)return;
        var data=event.data;if(!data || data.token!==config.token)return;
        if(data.type==="shell-result") {
            var callback=pending[data.id];if(!callback)return;delete pending[data.id];
            if(data.result) {data.result.stdout=outputText(data.result.stdout||"");data.result.stderr=outputText(data.result.stderr||"");}
            callback(data.error,data.result);return;
        }
        if(data.type!=="shell-ready" || connected)return;
        connected=true;
        var nativeMessage="";
        try {
            manager=new WaylandManager();manager.SetRequiredSurfaces("JCI_OPERA_SECONDARY",0);manager.SetKeyboardFocus("JCI_OPERA_SECONDARY");
        } catch(e) {nativeMessage=String(e);}
        // The parent shell performs the vehicle-confirmed direct D-Bus switch
        // after this event; successful JS calls alone did not make it visible.
        call(["event","ready","viewport="+window.innerWidth+"x"+window.innerHeight+"; native="+(nativeMessage||"requested")],function(error,result) {
            if(error || resultError(result)) {footer("Cannot initialize USB session");return;}
            showDisclaimer();
            updateMetrics();
            window.setInterval(updateMetrics, 5000);
            window.setInterval(checkFocusRequest, 1000);
        });
    },false);
    controls(); frame.src=config.origin+"/#"+config.token;
}());
