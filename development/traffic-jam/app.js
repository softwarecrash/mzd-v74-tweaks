/* Build source for the independently packaged Snake and Minesweeper views. */
(function () {
    'use strict';
    var id = window.TrafficJamGame, snake = id === 'snake', sdk = window.MzdGuiModule;
    var game = new (snake ? window.SnakeEngine : window.MinesweeperEngine).Game();
    var board = document.getElementById('board'), ctx = board.getContext('2d');
    var mode = 'ready', menu = [], choice = 0, best = 0, unsaved = false, ended = false, held = {}, keys = {}, requestId = 0;
    var last = new Date().getTime(), timer;
    function el(name) { return document.getElementById(name); }
    function text(name,value) { el(name).textContent = value; }
    function tr(key,fallback) { return sdk && sdk.t ? sdk.t(key,fallback) : fallback; }
    function seconds(value) { value = Math.floor(value); return Math.floor(value / 60) + ':' + ('0' + value % 60).slice(-2); }
    function metric() { return snake ? String(game.score) : seconds(game.elapsed / 1000); }
    function record() {
        var value = snake ? game.score : game.state === 'won' ? Math.max(1,Math.ceil(game.elapsed / 1000)) : 0;
        if (value && sdk && sdk.send) { sdk.send(id + '-record',{id:++requestId,value:value}); }
    }
    function labels() {
        text('title',snake ? 'Snake' : 'Minesweeper');
        text('metric-label',snake ? tr('score','Score') : tr('time','Time'));
        text('best-label',snake ? tr('highscore','High score') : tr('bestTime','Best time'));
        text('best',(!best ? '-' : snake ? String(best) : seconds(best)) + (unsaved ? ' (' + tr('notSaved','not saved') + ')' : ''));
        text('controls',snake ? tr('snakeControls','Tilt: steer\nPress / Back: pause') : tr('mineControls','Tilt: move cursor\nPress: open\nTurn right: set flag\nTurn left: remove flag\nBack: pause'));
        text('keyboard',snake ? tr('snakeKeys','Keyboard: arrows steer, Enter / Esc pause') : tr('mineKeys','Keyboard: arrows move, Enter opens, M sets flag, N removes flag, Esc pauses'));
    }
    function fit() {
        var w = window.innerWidth || 800, h = window.innerHeight || 480, scale = Math.min(1,w / 800,h / 480), stage = el('stage');
        stage.style.transform = scale < 1 ? 'scale(' + scale + ')' : 'none'; stage.style.OTransform = stage.style.transform;
        stage.style.left = Math.max(0,(w - scale * 800) / 2) + 'px'; stage.style.top = Math.max(0,(h - scale * 480) / 2) + 'px';
    }
    function draw() {
        var n, p, x, y, c, size = snake ? 22 : 33, colors = ['','#c4d8ff','#9ed9aa','#ff7770','#d5b6ff','#e5bb7a','#84d5d4','#ddd','#aaa'];
        ctx.fillStyle = '#08090b'; ctx.fillRect(0,0,528,396);
        if (snake) {
            for (n = 0; n < game.body.length; n += 1) { p = game.body[n]; ctx.fillStyle = n ? '#c5c6c8' : '#fff'; ctx.fillRect(p.x * size + 1,p.y * size + 1,size - 2,size - 2); }
            if (game.apple) { ctx.fillStyle = '#ff2801'; ctx.fillRect(game.apple.x * size + 3,game.apple.y * size + 3,size - 6,size - 6); }
            if (game.crash) { ctx.strokeStyle = '#ff2801'; ctx.lineWidth = 3; ctx.strokeRect(game.crash.x * size + 1,game.crash.y * size + 1,size - 2,size - 2); }
        } else {
            ctx.font = 'bold 20px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            for (n = 0; n < game.cells.length; n += 1) {
                c = game.cells[n]; x = n % game.width * size; y = Math.floor(n / game.width) * size;
                ctx.fillStyle = c.open && c.mine ? '#a51900' : c.open ? '#17181a' : '#45464a'; ctx.fillRect(x + 1,y + 1,size - 2,size - 2);
                if (c.flag && !c.open) {
                    ctx.fillStyle = '#ff2801'; ctx.fillRect(x + 11,y + 7,3,19); ctx.fillRect(x + 14,y + 7,10,8);
                } else if (c.mine && (c.open || game.state === 'lost')) {
                    ctx.fillStyle = '#ff2801'; ctx.beginPath(); ctx.arc(x + 16,y + 16,7,0,Math.PI * 2,false); ctx.fill();
                } else if (c.open && c.count) { ctx.fillStyle = colors[c.count]; ctx.fillText(String(c.count),x + 16,y + 17); }
            }
            x = game.cursor % game.width * size; y = Math.floor(game.cursor / game.width) * size;
            ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.strokeRect(x + 2,y + 2,size - 4,size - 4);
        }
        text('metric',metric()); text('extra',snake ? '' : tr('flags','Flags') + ': ' + game.flags + ' / ' + game.mineCount);
    }
    function focusMenu() {
        var n, nodes = el('menu').children;
        for (n = 0; n < nodes.length; n += 1) { nodes[n].className = 'menu-entry' + (n === choice ? ' selected' : ''); }
    }
    function dialog(next) {
        var n, node, title;
        held = {}; mode = next; choice = 0;
        menu = next === 'paused' ? [{key:'continue',label:'Continue',run:resume},{key:'newGame',label:'New game',run:start},{key:'exit',label:'Exit',run:exit}] :
            [{key:'newGame',label:'New game',run:start},{key:'exit',label:'Exit',run:exit}];
        title = next === 'ready' ? (snake ? 'Snake' : 'Minesweeper') : next === 'paused' ? tr('paused','Paused') : game.state === 'won' ? tr('won','You won!') : tr('gameOver','Game over');
        // Hide the accelerated canvas before showing DOM controls (CMU Presto).
        el('court').style.display = 'none'; el('shade').style.display = 'block'; el('dialog').style.display = 'block';
        text('dialog-title',title); text('dialog-text',next === 'finished' ? tr(snake ? 'score' : 'time',snake ? 'Score' : 'Time') + ': ' + metric() : '');
        el('menu').innerHTML = '';
        for (n = 0; n < menu.length; n += 1) {
            node = document.createElement('div'); node.setAttribute('role','button'); node.tabIndex = 0; node.textContent = tr(menu[n].key,menu[n].label);
            node.onclick = (function (index) { return function () { choice = index; activate(); }; }(n)); el('menu').appendChild(node);
        }
        focusMenu();
    }
    function resume() { held = {}; mode = 'play'; last = new Date().getTime(); el('shade').style.display = 'none'; el('dialog').style.display = 'none'; el('court').style.display = 'block'; draw(); }
    function start() { record(); game.start(); resume(); }
    function exit() { record(); if (sdk) { sdk.close(); } else { dialog('ready'); } }
    function activate() { if (menu[choice]) { menu[choice].run(); } }
    function result() {
        mode = 'result'; held = {}; draw();
        el('court').style.display = 'block'; el('shade').style.display = 'none'; el('dialog').style.display = 'none';
        text('controls',(game.state === 'won' ? tr('won','You won!') : tr('gameOver','Game over')) + '\n\n' + tr('resultHint','Press / Back: menu'));
    }
    function completed() { if (mode === 'play' && game.state !== 'playing') { record(); result(); } }
    function input(action,phase) {
        if (ended) { return true; }
        if (phase === 'release') { delete held[action]; }
        if (action === 'back') {
            if (phase !== 'press') { if (mode === 'play') { dialog('paused'); } else if (mode === 'paused') { resume(); } else if (mode === 'result') { dialog('finished'); } else if (mode === 'finished') { result(); } else { exit(); } }
            return true;
        }
        if (phase !== 'press' && phase !== 'step') { return true; }
        if (mode === 'result') { if (action === 'select') { dialog('finished'); } return true; }
        if (mode !== 'play') {
            if (action === 'down' || action === 'rotateRight') { choice = (choice + 1) % menu.length; }
            else if (action === 'up' || action === 'rotateLeft') { choice = (choice + menu.length - 1) % menu.length; }
            else if (action === 'select') { activate(); return true; }
            focusMenu(); return true;
        }
        if (snake) {
            if (action === 'select') { dialog('paused'); } else { game.turn(action); }
        } else {
            if (action === 'rotateRight') { game.flag(true); } else if (action === 'rotateLeft') { game.flag(false); }
            else if (action === 'select') { game.reveal(); }
            else if (['left','right','up','down'].indexOf(action) >= 0) {
                game.move(action); if (phase === 'press') { held[action] = new Date().getTime() + 350; }
            }
        }
        draw(); completed(); return true;
    }
    function pause() { if (mode === 'play') { dialog('paused'); } }
    function visibility() { if (document.hidden || document.webkitHidden) { pause(); } }
    function down(event) {
        var action = {37:'left',39:'right',38:'up',40:'down',13:'select',77:'rotateRight',78:'rotateLeft',27:'back',8:'back'}[event.keyCode];
        if (!action) { return; } event.preventDefault(); if (!keys[event.keyCode]) { keys[event.keyCode] = action; input(action,'press'); }
    }
    function up(event) { var action = keys[event.keyCode]; if (action) { event.preventDefault(); delete keys[event.keyCode]; input(action,'release'); } }
    function dispose() {
        ended = true; held = {}; window.clearInterval(timer); window.removeEventListener('resize',fit,false); window.removeEventListener('blur',pause,false);
        document.removeEventListener('visibilitychange',visibility,false); window.removeEventListener('keydown',down,true); window.removeEventListener('keyup',up,true);
    }
    if (sdk) {
        sdk.onInput(input); sdk.onDispose(dispose);
        sdk.onMessage(function (data) {
            if (data.type !== 'mzd-module-' + id + '-record-result') { return; }
            if (data.result && typeof data.result.best === 'number') { best = data.result.best; }
            unsaved = !!data.error; labels();
        });
        sdk.loadLanguage(function (language,direction) {
            document.documentElement.lang = language.replace('_','-'); el('controls').dir = direction;
            labels(); if (mode === 'result') { result(); } else if (mode !== 'play') { dialog(mode); }
        });
        sdk.send(id + '-record',{id:++requestId}); sdk.ready();
    } else { window.addEventListener('keydown',down,true); window.addEventListener('keyup',up,true); }
    window.addEventListener('resize',fit,false); window.addEventListener('blur',pause,false); document.addEventListener('visibilitychange',visibility,false);
    timer = window.setInterval(function () {
        var now = new Date().getTime(), elapsed = Math.max(0,now - last), action, position, displayed; last = now;
        if (mode !== 'play' || ended) { return; }
        if (elapsed > 1500) { pause(); return; }
        position = snake ? game.body[0].x + ':' + game.body[0].y : game.cursor;
        if (!snake) { for (action in held) { if (Object.prototype.hasOwnProperty.call(held,action) && now >= held[action]) { game.move(action); held[action] = now + 120; } } }
        game.tick(elapsed);
        if (position !== (snake ? game.body[0].x + ':' + game.body[0].y : game.cursor) || game.state !== 'playing') { draw(); }
        else { displayed = metric(); if (el('metric').textContent !== displayed) { text('metric',displayed); } }
        completed();
    },50);
    labels(); fit(); dialog('ready'); draw();
    // A small inspection surface for isolated controller tests; no framework globals.
    window.TrafficJamView = {input:input,destroy:dispose,game:game,mode:function () { return mode; }};
}());
