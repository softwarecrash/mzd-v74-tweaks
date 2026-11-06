(function () {
    'use strict';
    var PI = Math.PI;
    function text(ctx, value, x, y, size, color, align) {
        ctx.font = size+'px SpeedoMazda, Arial, sans-serif'; ctx.fillStyle = color || '#efefeb'; ctx.textAlign = align || 'center'; ctx.fillText(value,x,y);
    }
    function line(ctx, x, y, x2, y2, color, width) {
        ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x2,y2); ctx.strokeStyle = color; ctx.lineWidth = width || 1; ctx.stroke();
    }
    function wing(ctx, left) {
        var g = ctx.createLinearGradient(0,130,0,390);
        g.addColorStop(0,'#c8cbd0'); g.addColorStop(0.15,'#484c53'); g.addColorStop(0.8,'#282a30'); g.addColorStop(1,'#afb3b8');
        ctx.save(); if (!left) { ctx.translate(800,0); ctx.scale(-1,1); }
        ctx.beginPath(); ctx.moveTo(226,143); ctx.lineTo(55,160); ctx.quadraticCurveTo(22,164,22,205); ctx.lineTo(22,354); ctx.quadraticCurveTo(22,376,48,376); ctx.lineTo(234,376); ctx.lineTo(234,365); ctx.lineTo(50,365); ctx.quadraticCurveTo(32,365,32,349); ctx.lineTo(32,206); ctx.quadraticCurveTo(32,174,59,172); ctx.lineTo(232,155); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
        ctx.restore();
    }
    window.SpeedometerSkins.register({id:'bm2014',labelKey:'design.bm2014',draw:function (ctx, m, t) {
        var cx = 400, cy = 252, i, angle, c, s, gradient, now = new Date(), time;
        ctx.clearRect(0,0,800,480);
        gradient = ctx.createRadialGradient(400,230,50,400,230,500); gradient.addColorStop(0,'#151619'); gradient.addColorStop(1,'#030405'); ctx.fillStyle = gradient; ctx.fillRect(0,0,800,480);
        line(ctx,210,32,333,32,'#64676b'); line(ctx,467,32,576,32,'#64676b');
        time = ('0'+now.getHours()).slice(-2)+':'+('0'+now.getMinutes()).slice(-2); text(ctx,time,400,42,24);
        wing(ctx,true); wing(ctx,false);
        line(ctx,45,230,230,230,'#383b40'); line(ctx,45,300,230,300,'#383b40'); line(ctx,569,230,755,230,'#383b40'); line(ctx,569,300,755,300,'#383b40');
        text(ctx,t('outside'),128,193,16,'#b7b8ba'); text(ctx,m.outside+m.tempUnit,128,220,25);
        text(ctx,m.gear,128,283,54); text(ctx,t('trip'),128,326,16,'#b7b8ba'); text(ctx,m.trip+' '+m.tripUnit,128,353,23);
        text(ctx,t('coolant'),674,193,16,'#b7b8ba'); text(ctx,m.coolant+m.tempUnit,674,220,25);
        text(ctx,t('average'),674,257,16,'#b7b8ba'); text(ctx,m.average+' '+m.averageUnit,674,285,21);
        text(ctx,t('fuel'),674,326,16,'#b7b8ba');
        for (i = 0; i < 8; i += 1) { ctx.fillStyle = m.fuel !== null && i < Math.round(m.fuel*8/100) ? '#e2e2de' : '#292c30'; ctx.fillRect(606+i*17,339,14,10); }
        gradient = ctx.createLinearGradient(225,80,575,420); gradient.addColorStop(0,'#d7dade'); gradient.addColorStop(0.22,'#4c5158'); gradient.addColorStop(0.5,'#b9bdc3'); gradient.addColorStop(0.8,'#383d45'); gradient.addColorStop(1,'#d6d9dc');
        ctx.beginPath(); ctx.arc(cx,cy,176,0,PI*2); ctx.fillStyle = gradient; ctx.fill();
        ctx.beginPath(); ctx.arc(cx,cy,169,0,PI*2); ctx.fillStyle = '#111317'; ctx.fill();
        ctx.beginPath(); ctx.arc(cx,cy,161,0,PI*2); ctx.strokeStyle = '#51545a'; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.arc(cx,cy,155,PI*0.75,PI*2.25); ctx.strokeStyle = '#bf2e20'; ctx.lineWidth = 3; ctx.stroke();
        ctx.beginPath(); ctx.arc(cx,cy,151,PI*0.75+PI*1.5*6.5/8,PI*2.25); ctx.strokeStyle = '#c32116'; ctx.lineWidth = 12; ctx.stroke();
        for (i = 0; i <= 40; i += 1) {
            angle = PI*0.75+PI*1.5*i/40; c = Math.cos(angle); s = Math.sin(angle);
            line(ctx,cx+c*(i%5 === 0 ? 136 : 146),cy+s*(i%5 === 0 ? 136 : 146),cx+c*155,cy+s*155,i > 32 ? '#ef3928' : '#e8e8e4',i%5 === 0 ? 3 : 1);
            if (i%5 === 0) { text(ctx,String(i/5),cx+c*119,cy+s*119+10,29); }
        }
        text(ctx,'x1000',467,257,13,'#babcc0'); text(ctx,t('rpm'),467,273,13,'#babcc0');
        if (m.rpm !== null) {
            angle = PI*0.75+PI*1.5*m.rpm/8000; ctx.save(); ctx.translate(cx,cy); ctx.rotate(angle);
            ctx.beginPath(); ctx.moveTo(-24,-3); ctx.lineTo(146,0); ctx.lineTo(-24,3); ctx.closePath(); ctx.fillStyle = '#fc3e28'; ctx.fill(); ctx.restore();
        }
        ctx.beginPath(); ctx.arc(cx,cy,16,0,PI*2); ctx.fillStyle = '#08090b'; ctx.fill(); ctx.strokeStyle = '#373b40'; ctx.lineWidth = 2; ctx.stroke();
        ctx.beginPath(); ctx.moveTo(422,303); ctx.lineTo(535,303); ctx.lineTo(516,372); ctx.lineTo(400,372); ctx.closePath(); ctx.fillStyle = '#090b0e'; ctx.fill(); ctx.strokeStyle = '#94999f'; ctx.lineWidth = 2; ctx.stroke();
        text(ctx,m.speed,467,348,57); text(ctx,m.speedUnit,463,369,16);
        text(ctx,t('simulated'),400,455,14,'#a7a8aa');
    }});
}());
