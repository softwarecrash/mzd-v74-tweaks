/* OEM-style instrument skin. LCD segments use local vector geometry. */
(function () {
    'use strict';
    var PI = Math.PI;
    function text(ctx, value, x, y, size, color) {
        ctx.font = size+'px DriveDashMazda, Arial, sans-serif'; ctx.fillStyle = color || '#e8eae5'; ctx.textAlign = 'center'; ctx.fillText(value,x,y);
    }
    /* Bevelled, right-leaning LCD segments based on the BM instrument photos. */
    function numerals(ctx, value, x, y, height) {
        var glyphs = {'0':'abcdef','1':'bc','2':'abdeg','3':'abcdg','4':'bcfg','5':'acdfg','6':'acdefg','7':'abc','8':'abcdefg','9':'abcdfg','-':'g'};
        var segments = {
            a:[[4,0],[18,0],[21,2.5],[18,5],[4,5],[1,2.5]],
            g:[[4,17.5],[18,17.5],[21,20],[18,22.5],[4,22.5],[1,20]],
            d:[[4,35],[18,35],[21,37.5],[18,40],[4,40],[1,37.5]],
            f:[[0,4],[2.5,6.5],[2.5,15],[0,18],[-2.5,15],[-2.5,6.5]],
            b:[[22,4],[24.5,6.5],[24.5,15],[22,18],[19.5,15],[19.5,6.5]],
            e:[[0,22],[2.5,25],[2.5,33.5],[0,36],[-2.5,33.5],[-2.5,25]],
            c:[[22,22],[24.5,25],[24.5,33.5],[22,36],[19.5,33.5],[19.5,25]]
        };
        var scale = height/40, advance = 32, i, j, k, chars, polygon, px, py;
        value = String(value);
        ctx.save(); ctx.translate(x-(value.length*advance-5)*scale/2,y-height); ctx.scale(scale,scale);
        ctx.fillStyle = '#f3f6ed';
        for (i = 0; i < value.length; i += 1) {
            chars = glyphs[value.charAt(i)] || '';
            for (j = 0; j < chars.length; j += 1) {
                polygon = segments[chars.charAt(j)]; ctx.beginPath();
                for (k = 0; k < polygon.length; k += 1) {
                    py = polygon[k][1]; px = polygon[k][0]+i*advance+(40-py)*0.14;
                    if (k === 0) { ctx.moveTo(px,py); } else { ctx.lineTo(px,py); }
                }
                ctx.closePath(); ctx.fill();
            }
        }
        ctx.restore();
    }
    function scaleNumber(ctx,value,x,y) {
        ctx.save(); ctx.translate(x,y); ctx.scale(0.92,1);
        ctx.font = 'italic 26px DriveDashInstrument, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#f0f2ed';
        ctx.fillText(value,0,0); ctx.restore();
    }
    function line(ctx,x,y,x2,y2,color,width) {
        ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x2,y2); ctx.strokeStyle = color; ctx.lineWidth = width || 1; ctx.stroke();
    }
    function circle(ctx,x,y,r,fill) { ctx.beginPath(); ctx.arc(x,y,r,0,PI*2); ctx.fillStyle = fill; ctx.fill(); }
    function arc(ctx,x,y,r,start,end,color,width) { ctx.beginPath(); ctx.arc(x,y,r,start,end); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke(); }
    function pod(ctx, left) {
        var g;
        ctx.save(); if (!left) { ctx.translate(800,0); ctx.scale(-1,1); } ctx.translate(18,0);
        /* Thin folded lip, tucked behind the central instrument housing. */
        ctx.beginPath(); ctx.moveTo(251,153); ctx.lineTo(81,174); ctx.quadraticCurveTo(48,180,44,214); ctx.lineTo(53,329); ctx.quadraticCurveTo(56,350,81,354); ctx.lineTo(247,363); ctx.lineTo(247,358); ctx.lineTo(82,348); ctx.quadraticCurveTo(61,345,60,327); ctx.lineTo(51,216); ctx.quadraticCurveTo(55,188,83,182); ctx.lineTo(253,161); ctx.closePath();
        g = ctx.createLinearGradient(40,167,80,363); g.addColorStop(0,'#b6bac0'); g.addColorStop(0.18,'#464b52'); g.addColorStop(0.58,'#0d1015'); g.addColorStop(1,'#555d64'); ctx.fillStyle = g; ctx.fill();
        ctx.beginPath(); ctx.moveTo(249,165); ctx.lineTo(86,187); ctx.quadraticCurveTo(60,191,58,218); ctx.lineTo(67,325); ctx.quadraticCurveTo(69,337,88,340); ctx.lineTo(246,351); ctx.closePath();
        g = ctx.createLinearGradient(80,180,210,345); g.addColorStop(0,'#171b21'); g.addColorStop(0.45,'#070a0e'); g.addColorStop(1,'#0d1115'); ctx.fillStyle = g; ctx.fill();
        line(ctx,83,180,236,160,'#8b9096',0.6); line(ctx,85,346,236,356,'#70777d',0.6);
        ctx.restore();
    }
    function drawBackground(ctx) {
        var cx = 400, cy = 249, i, a, c, s, g;
        ctx.clearRect(0,0,800,416);
        g = ctx.createRadialGradient(400,230,50,400,230,470); g.addColorStop(0,'#171b21'); g.addColorStop(0.55,'#06090d'); g.addColorStop(1,'#010203'); ctx.fillStyle = g; ctx.fillRect(0,0,800,416);
        ctx.save(); ctx.translate(400,208); ctx.scale(1.02,1.02); ctx.translate(-400,-249);
        pod(ctx,true); pod(ctx,false);
        line(ctx,105,248,211,248,'#252c32',0.7);
        line(ctx,589,248,695,248,'#252c32',0.7);
        /* Outer rolled rim and a wide, recessed black instrument tube. */
        ctx.save(); ctx.shadowColor = '#000'; ctx.shadowBlur = 20; ctx.shadowOffsetY = 10; circle(ctx,cx,cy,184,'#080b0f'); ctx.restore();
        g = ctx.createLinearGradient(270,65,535,431); g.addColorStop(0,'#5c636b'); g.addColorStop(0.12,'#d1d5d8'); g.addColorStop(0.23,'#32383e'); g.addColorStop(0.6,'#090c10'); g.addColorStop(0.88,'#50575f'); g.addColorStop(1,'#20262c'); circle(ctx,cx,cy,182,g);
        circle(ctx,cx,cy,178,'#090c10'); arc(ctx,cx,cy,180,PI*1.04,PI*1.91,'#e1e3e4',0.8);
        g = ctx.createLinearGradient(cx,cy-176,cx,cy+176); g.addColorStop(0,'#030507'); g.addColorStop(0.44,'#090d12'); g.addColorStop(1,'#232a32'); circle(ctx,cx,cy,175,g);
        g = ctx.createLinearGradient(cx,cy-157,cx,cy+157); g.addColorStop(0,'#818a92'); g.addColorStop(0.2,'#353c43'); g.addColorStop(0.65,'#10151b'); g.addColorStop(1,'#56616a'); circle(ctx,cx,cy,159,g);
        g = ctx.createRadialGradient(cx-18,cy-50,0,cx,cy,155); g.addColorStop(0,'#171c23'); g.addColorStop(0.7,'#0b1016'); g.addColorStop(1,'#020507'); circle(ctx,cx,cy,155,g);
        arc(ctx,cx,cy,158,PI*1.1,PI*1.9,'#adb5b9',0.7); arc(ctx,cx,cy,153,PI*0.05,PI*0.95,'#020304',3);
        /* Recessed load track follows the instrument's subdued metallic trim. */
        arc(ctx,cx,cy,166,PI*2/3,PI*2,'#080c10',9);
        arc(ctx,cx,cy,169.2,PI*2/3,PI*2,'#374149',0.7);
        arc(ctx,cx,cy,162.8,PI*2/3,PI*2,'#020406',0.8);
        /* BM sweep: zero lower-left, five at twelve o'clock, eight at the right. */
        arc(ctx,cx,cy,135,PI*2/3,PI*2,'#424a50',20);
        arc(ctx,cx,cy,147,PI*2/3,PI*2,'#d94728',2);
        circle(ctx,cx,cy,91,'#1b2329'); circle(ctx,cx,cy,89,'#0b1016');
        /* Subtle perforated centre, rendered in deterministic instrument coordinates. */
        for (i = -80; i <= 80; i += 5) {
            for (c = -80; c <= 80; c += 5) {
                if (i*i+c*c < 85*85) { circle(ctx,cx+i,cy+c,0.65,'#263039'); }
            }
        }
        arc(ctx,cx,cy,143,PI*2/3+PI*4/3*6.5/8,PI*2,'#a61c13',7);
        for (i = 0; i <= 40; i += 1) {
            a = PI*2/3+PI*4/3*i/40; c = Math.cos(a); s = Math.sin(a);
            line(ctx,cx+c*(i%5 === 0 ? 124 : 136),cy+s*(i%5 === 0 ? 124 : 136),cx+c*145,cy+s*145,i >= 33 ? '#f0432b' : '#e1e6e4',i%5 === 0 ? 2.5 : 0.8);
            if (i%5 === 0) { scaleNumber(ctx,String(i/5),cx+c*108,cy+s*108+9); }
        }
        text(ctx,'x1000',454,245,11,'#98a1a6');
        /* Compact automotive battery centred below speed, inside the dial rings. */
        ctx.save(); ctx.translate(cx,cy+132); ctx.scale(0.66,0.66);
        ctx.strokeStyle = '#879397'; ctx.lineWidth = 1.2;
        ctx.strokeRect(-28,-16,56,32);
        ctx.fillStyle = '#879397';
        ctx.fillRect(-20,-20,10,4); ctx.fillRect(10,-20,10,4);
        line(ctx,-21,-10,-15,-10,'#879397',1);
        line(ctx,15,-10,21,-10,'#879397',1);
        line(ctx,18,-13,18,-7,'#879397',1);
        ctx.restore();
        /* Compact LCD inset: bevelled segment geometry, no font dependency. */
        ctx.beginPath(); ctx.moveTo(414,296); ctx.lineTo(520,296); ctx.lineTo(508,359); ctx.lineTo(402,359); ctx.closePath(); ctx.fillStyle = '#020507'; ctx.fill(); ctx.strokeStyle = '#5b6468'; ctx.lineWidth = 0.8; ctx.stroke();
        line(ctx,416,298,518,298,'#171f25',2);
        ctx.restore();
    }
    var background = null;
    function loadBackground(){if(!background && typeof window.Image==='function'){background=new window.Image();background.src='skins/oem-style-background.png';}}
    function drawInstrument(ctx,m,t) {
        var cx = 400, cy = 249, i, a, g;
        ctx.clearRect(0,0,800,416);
        if (background && background.complete && background.width === 800 && background.height === 416) {
            ctx.drawImage(background,0,0);
        } else { drawBackground(ctx); }
        ctx.save(); ctx.translate(400,208); ctx.scale(1.02,1.02); ctx.translate(-400,-249);
        text(ctx,t('outside'),160,207,14,'#90999f'); text(ctx,m.outside+m.tempUnit,160,234,23);
        if (m.gear && m.gear !== '--') { text(ctx,m.gear,161,290,40); }
        text(ctx,t('trip'),160,316,13,'#90999f'); text(ctx,m.trip+' '+m.tripUnit,160,339,20);
        text(ctx,t('coolant'),640,207,14,'#90999f'); text(ctx,m.coolant+m.tempUnit,640,234,23);
        text(ctx,t('average'),640,263,13,'#90999f'); text(ctx,m.average+' '+m.averageUnit,640,284,19);
        text(ctx,t('fuel'),640,321,12,'#90999f');
        for (i = 0; i < 8; i += 1) { ctx.fillStyle = m.fuel !== null && i < Math.round(m.fuel*8/100) ? '#cbd4cf' : '#20272b'; ctx.fillRect(592+i*12,332,9,5); }
        if (m.engineLoad !== null && m.engineLoad > 0) {
            a = PI*2/3+PI*4/3*m.engineLoad/100;
            arc(ctx,cx,cy,166,PI*2/3,a,'#3c4950',7);
            arc(ctx,cx,cy,168.4,PI*2/3,a,'#718087',1.2);
            arc(ctx,cx,cy,163.6,PI*2/3,a,'#1a252c',1);
            if (m.engineLoad > 80) {
                arc(ctx,cx,cy,166,PI*2/3+PI*4/3*0.8,a,'#8e352c',5);
            }
        }
        text(ctx,t('rpm'),454,260,11,'#98a1a6');
        ctx.save(); ctx.translate(cx,cy+132); ctx.scale(0.66,0.66);
        text(ctx,m.battery === null ? '--' : Math.round(m.battery)+'%',0,8,15,'#c0cacb');
        ctx.restore();
        numerals(ctx,m.speed,462,340,35); text(ctx,m.speedUnit,460,353,11,'#a1aba8');
        ctx.restore();
    }
    function drawNeedle(ctx,rpm) {
        var cx=400,cy=249,a,g,m={rpm:rpm};
        ctx.save();ctx.translate(400,208);ctx.scale(1.02,1.02);ctx.translate(-400,-249);
        if (m.rpm !== null) {
            a = PI*2/3+PI*4/3*m.rpm/8000; ctx.save(); ctx.translate(cx,cy); ctx.rotate(a);
            ctx.shadowColor = '#ef2b10'; ctx.shadowBlur = 5; ctx.beginPath(); ctx.moveTo(-20,-2.5); ctx.lineTo(137,-0.8); ctx.lineTo(137,0.8); ctx.lineTo(-20,2.5); ctx.closePath(); ctx.fillStyle = '#f73c21'; ctx.fill();
            ctx.shadowBlur = 0; line(ctx,17,-0.7,133,-0.7,'#ffb08a',0.8); ctx.restore();
        }
        g = ctx.createLinearGradient(cx,cy-16,cx,cy+16); g.addColorStop(0,'#414a52'); g.addColorStop(0.2,'#171d24'); g.addColorStop(1,'#020406');
        ctx.save(); ctx.shadowColor = '#000'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 3; circle(ctx,cx,cy,16,g); ctx.restore(); circle(ctx,cx,cy,12,'#0b1117');
        ctx.restore();
    }
    var cached=null,cachedContext=null,cachedKey=null;
    function draw(ctx,m,t) {
        var key;
        loadBackground();
        key=[m.speed,m.speedUnit,m.outside,m.coolant,m.tempUnit,m.gear,m.trip,m.tripUnit,m.average,m.averageUnit,m.engineLoad,m.battery,m.fuel,t('outside'),t('trip'),t('coolant'),t('average'),t('fuel'),t('rpm'),background && background.complete ? 'ready':'loading'].join('|');
        if(!cached && typeof document!=='undefined' && document.createElement){
            cached=document.createElement('canvas');cached.width=800;cached.height=416;cachedContext=cached.getContext('2d');
        }
        if(cachedContext){
            if(key!==cachedKey){drawInstrument(cachedContext,m,t);cachedKey=key;}
            ctx.clearRect(0,0,800,416);ctx.drawImage(cached,0,0);
        }else{drawInstrument(ctx,m,t);}
        drawNeedle(ctx,m.rpm);
    }
    window.DriveDashSkins.register({id:'oem-style',labelKey:'design.oem-style',drawBackground:drawBackground,draw:draw});
}());
