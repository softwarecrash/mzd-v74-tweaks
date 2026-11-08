/* Critically damped display-only needle; sensor samples remain unchanged. */
(function (global) {
    'use strict';
    global.DriveDashNeedle = function () {
        var from=null,target=null,velocity=0,began=0,frequency=18;
        function state(now) {
            if(target===null){return {value:null,velocity:0};}
            if(now<began || now-began>=1000){return {value:target,velocity:0};}
            var seconds=(now-began)/1000,a=from-target,b=velocity+frequency*a,decay=Math.exp(-frequency*seconds);
            var value=target+(a+b*seconds)*decay,speed=(b-frequency*(a+b*seconds))*decay;
            value=Math.max(Math.min(from,target),Math.min(Math.max(from,target),value));
            if(Math.abs(value-target)<0.5 && Math.abs(speed)<2){value=target;speed=0;}
            return {value:value,velocity:speed};
        }
        return {value:function(now){return state(now).value;},set:function(rpm,now){
            rpm=typeof rpm==='number' && isFinite(rpm)?Math.max(0,Math.min(8000,rpm)):null;
            if(rpm===target){return;}
            var current=state(now);from=current.value;velocity=current.velocity;target=rpm;began=now;
            if(from===null || target===null){from=target;velocity=0;}
        },moving:function(now){var current=state(now);return current.value!==null && (current.value!==target || current.velocity!==0);},
        reset:function(){from=null;target=null;velocity=0;began=0;}};
    };
}(window));
