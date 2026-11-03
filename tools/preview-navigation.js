/* Desktop preview shortcuts only. Controls are rendered by the real app.js. */
(function () {
    "use strict";
    var opened=false;
    function el(id){return document.getElementById(id);}
    function navigate(){
        if(opened || !(window.previewSettingsDemo || window.previewRecoveryDemo || window.previewBrokenUninstallDemo))return;
        var visible=el("overlay").className.indexOf("hidden")===-1;
        if(visible && el("dialog-title").textContent==="Before you begin" && el("action").textContent==="OK") {el("action").click();return;}
        if(!visible && !el("refresh").disabled && el("cards").children.length) {
            var group=window.previewRecoveryDemo?"Interface":"System",tabs=el("tabs").getElementsByTagName("button");
            for(var i=0;i<tabs.length;i++)if(tabs[i].textContent.indexOf(group)===0)tabs[i].click();
            var id=window.previewRecoveryDemo?(window.previewRecoveryDeniedDemo?"list-beep":"main-menu-loop"):(window.previewBrokenUninstallDemo?"ssh":"settings-example");
            var card=el("tweak-"+id);if(card){opened=true;card.click();}
        }
    }
    new MutationObserver(navigate).observe(document.body,{subtree:true,childList:true,characterData:true});
    navigate();
}());
