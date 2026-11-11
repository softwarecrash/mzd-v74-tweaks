/* Motorsport draft: segmented RPM bar and a large, legible digital speed. */
(function (global) {
    'use strict';
    var ink='#ece9dd',muted='#9c9f9d';
    function text(ctx,value,x,y,size,align,color){ctx.font='italic '+size+'px DriveDashMotorsport, Arial, sans-serif';ctx.textAlign=align||'left';ctx.fillStyle=color||ink;ctx.fillText(value,x,y);}
    function polygon(ctx,points,fill,stroke){var i;ctx.beginPath();for(i=0;i<points.length;i+=1){if(i){ctx.lineTo(points[i][0],points[i][1]);}else{ctx.moveTo(points[i][0],points[i][1]);}}ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1;ctx.stroke();}}
    function panel(ctx,x,y,w,h){polygon(ctx,[[x+8,y],[x+w,y],[x+w,y+h-8],[x+w-8,y+h],[x,y+h],[x,y+8]],'#0a0c0d','#777c7d');}
    function draw(ctx,m,t){
        var i,x,on,color,rpm=m.rpm===null?null:Math.min(8000,Math.max(0,m.rpm)),gradient;
        ctx.clearRect(0,0,800,416);ctx.fillStyle='#050607';ctx.fillRect(0,0,800,416);
        gradient=ctx.createLinearGradient(0,0,0,416);gradient.addColorStop(0,'#131619');gradient.addColorStop(1,'#030405');ctx.fillStyle=gradient;ctx.fillRect(0,0,800,416);
        for(i=0;i<=8;i+=1){text(ctx,String(i),34+i*82,25,22,'center');}
        for(i=0;i<32;i+=1){x=24+i*20.5;on=rpm!==null&&rpm>i*250;color=on?(i>=26?'#f02b21':i>=22?'#f67612':'#f6bf17'):(i>=26?'#3e1516':'#24292b');polygon(ctx,[[x+8,40],[x+26,40],[x+18,66],[x,66]],color,null);}
        polygon(ctx,[[31,36],[691,36],[680,71],[20,71]],null,'#b9bdba');text(ctx,'x1000 '+t('rpm'),784,65,15,'right',muted);
        panel(ctx,12,91,509,249);
        polygon(ctx,[[12,92],[21,92],[12,130],[12,108]],'#bc241c',null);
        text(ctx,m.speed,201,285,220,'center');text(ctx,m.speedUnit,340,316,25,'right',muted);
        if(m.gear&&m.gear!=='--'){
            polygon(ctx,[[421,147],[499,147],[508,156],[491,277],[417,277],[409,269]],'#090b0c','#a7adac');
            text(ctx,m.gear,458,249,86,'center');
        }
        panel(ctx,535,91,251,75);text(ctx,t('coolant').toUpperCase(),550,121,15,'left',muted);text(ctx,m.coolant+m.tempUnit,773,150,37,'right');
        panel(ctx,535,178,251,75);text(ctx,t('outside').toUpperCase(),550,208,15,'left',muted);text(ctx,m.outside+m.tempUnit,773,237,37,'right');
        panel(ctx,535,265,251,75);text(ctx,t('average').toUpperCase(),550,296,15,'left',muted);text(ctx,m.average,688,323,37,'right');text(ctx,m.averageUnit,774,320,13,'right',muted);
        polygon(ctx,[[21,356],[786,356],[786,401],[10,401]],'#0a0c0d','#737a7b');
        text(ctx,t('trip').toUpperCase(),29,384,17,'left',muted);text(ctx,m.trip+' '+m.tripUnit,373,389,30,'right');
        polygon(ctx,[[405,356],[416,356],[401,401],[390,401]],'#555d60',null);
        text(ctx,t('rpm'),430,384,17,'left',muted);text(ctx,rpm===null?'--':String(Math.round(rpm)),762,389,32,'right');
        polygon(ctx,[[12,412],[625,412],[634,405],[786,405],[786,408],[636,408],[628,415],[12,415]],'#bd251e',null);
    }
    global.DriveDashSkins.register({id:'motorsport',labelKey:'design.motorsport',draw:draw});
}(window));
