(function () {
    'use strict';
    var game = new TetrisEngine.Game(), cell = 22, highscore=0, scoreHandler=null;
    var board = document.getElementById('board'), ctx = board.getContext('2d');
    var preview = document.getElementById('next'), previewType = -1;
    var menu = [], choice = 0, screen = 'ready', keys = {}, held = {}, pressed = {}, lastStamp = '';
    var last = new Date().getTime(), exitHandler = null, timer, destroyed = false;
    function tr(key, fallback, values) { var sdk = window.MzdGuiModule; return sdk && sdk.t ? sdk.t(key,fallback,values) : fallback.replace(/\{([a-zA-Z0-9_]+)\}/g,function (match,name) { return values && Object.prototype.hasOwnProperty.call(values,name) ? String(values[name]) : match; }); }
    function el(id) { return document.getElementById(id); }
    function text(id, value) { el(id).textContent = value; }
    function pad(n, width) { var s = String(n); while (s.length < width) { s = '0' + s; } return s; }
    function clearHeld() { held = {}; }
    function fit() {
        var w = window.innerWidth || document.documentElement.clientWidth;
        var h = window.innerHeight || document.documentElement.clientHeight;
        var scale = Math.min(1, w / 800, h / 480), stage = el('stage');
        // An identity transform still creates problematic layers on CMU Presto.
        stage.style.transform = scale < 1 ? 'scale(' + scale + ')' : 'none';
        stage.style.OTransform = scale < 1 ? 'scale(' + scale + ')' : 'none';
        stage.style.left = Math.max(0, (w - 800 * scale) / 2) + 'px';
        stage.style.top = Math.max(0, (h - 480 * scale) / 2) + 'px';
    }
    function tile(context, x, y, color, size, ghost) {
        var px = x * size, py = y * size;
        if (ghost) {
            context.strokeStyle = '#797b81'; context.lineWidth = 1;
            context.strokeRect(px + 3, py + 3, size - 6, size - 6);
        } else {
            context.fillStyle = color; context.fillRect(px + 1, py + 1, size - 2, size - 2);
            context.fillStyle = 'rgba(255,255,255,0.22)'; context.fillRect(px + 2, py + 2, size - 4, 2);
        }
    }
    function render(force) {
        var c = game.current, x, y, stamp = [game.score, game.lines, game.level, game.state, c.type, c.x, c.y, c.rotation, game.next].join(':');
        if (!force && stamp === lastStamp) { return; }
        lastStamp = stamp;
        ctx.fillStyle = '#08090b'; ctx.fillRect(0, 0, board.width, board.height);
        for (y = 0; y < 20; y += 1) {
            for (x = 0; x < 10; x += 1) {
                ctx.fillStyle = '#25262a'; ctx.fillRect(x * cell + Math.floor(cell / 2) - 1, y * cell + Math.floor(cell / 2) - 1, 2, 2);
                if (game.board[y][x] !== null) { tile(ctx, x, y, TetrisEngine.types[game.board[y][x]].color, cell, false); }
            }
        }
        if (game.state === 'playing' || game.state === 'paused' || game.state === 'ready') {
            TetrisEngine.each(c.type, c.x, game.ghostY(), c.rotation, function (bx, by) { tile(ctx, bx, by, '', cell, true); });
            TetrisEngine.each(c.type, c.x, c.y, c.rotation, function (bx, by) { tile(ctx, bx, by, TetrisEngine.types[c.type].color, cell, false); });
        }
        renderNext();
        text('score', pad(game.score, 6)); text('lines', pad(game.lines, 2)); text('level', pad(game.level, 2));
        text('remaining', 10 - game.lines % 10); el('progress-fill').style.width = (game.lines % 10 * 10) + '%';
    }
    function renderNext() {
        var points = [], minX = 4, maxX = 0, minY = 4, maxY = 0, n, block, x, y;
        if (previewType === game.next) { return; }
        previewType = game.next; preview.innerHTML = '';
        TetrisEngine.each(game.next, 0, 0, 0, function (bx, by) {
            points.push([bx, by]); minX = Math.min(minX, bx); maxX = Math.max(maxX, bx);
            minY = Math.min(minY, by); maxY = Math.max(maxY, by);
        });
        x = Math.floor((144 - (maxX - minX + 1) * 24) / 2);
        y = Math.floor((96 - (maxY - minY + 1) * 24) / 2);
        for (n = 0; n < points.length; n += 1) {
            block = document.createElement('div'); block.className = 'preview-block';
            block.style.left = (x + (points[n][0] - minX) * 24) + 'px';
            block.style.top = (y + (points[n][1] - minY) * 24) + 'px';
            block.style.backgroundColor = TetrisEngine.types[game.next].color;
            preview.appendChild(block);
        }
    }
    function focusMenu() {
        var buttons = el('menu').children, n;
        for (n = 0; n < buttons.length; n += 1) {
            buttons[n].className = 'menu-entry' + (menu[n].disabled ? ' disabled' : '') + (n === choice ? ' selected' : '');
        }
    }
    function dialog(mode, title, subtitle, items) {
        var n, button;
        clearHeld(); screen = mode; menu = items; choice = 0;
        // Never composite a DOM pause menu over the accelerated playfield.
        el('court').style.display = 'none';
        el('shade').style.display = 'block'; el('dialog').style.display = 'block';
        text('dialog-kicker', mode === 'lobby' ? tr('trafficJam','TRAFFIC JAM') : 'TETRIS');
        text('dialog-title', title); text('dialog-text', subtitle); el('menu').innerHTML = '';
        for (n = 0; n < items.length; n += 1) {
            // OEM-style ordinary elements avoid native button repainting in Presto.
            button = document.createElement('div'); button.setAttribute('role', 'button');
            button.tabIndex = items[n].disabled ? -1 : 0;
            button.setAttribute('aria-disabled', items[n].disabled ? 'true' : 'false');
            button.textContent = items[n].label;
            button.onclick = (function (index) { return function () { choice = index; select(); }; }(n));
            el('menu').appendChild(button);
        }
        focusMenu(); render(true);
    }
    function hideDialog() { screen = 'play'; el('shade').style.display = 'none'; el('dialog').style.display = 'none'; el('court').style.display = 'block'; clearHeld(); }
    function start() { recordScore(); game.start(); hideDialog(); last = new Date().getTime(); render(true); }
    function resume() { if (game.state === 'paused') { game.pause(); } hideDialog(); last = new Date().getTime(); render(true); }
    function lobby() {
        if (game.state === 'playing') { game.pause(); }
        dialog('lobby', tr('trafficJam','Traffic Jam'), tr('selectGame','Select a game.'), [
            { label: 'Tetris', action: ready }
        ]);
    }
    function exitGame() {
        recordScore();clearHeld();
        if (exitHandler) { exitHandler(); } else { lobby(); }
    }
    function ready() { dialog('ready', 'Tetris', tr('startHint','Select Start to begin.'), [{ label: tr('start','Start'), action: start }, { label: tr('exit','Exit'), action: exitGame }]); }
    function pauseMenu() {
        dialog('pause', tr('paused','Paused'), tr('pauseHint','Continue, restart or exit this game.'), [
            { label: tr('continue','Continue'), action: resume }, { label: tr('restart','Restart'), action: confirmRestart }, { label: tr('exit','Exit'), action: exitGame }
        ]);
    }
    function confirmRestart() {
        dialog('restart', tr('restartTitle','Restart game?'), tr('restartHint','Your current game will be lost.'), [
            { label: tr('cancel','Cancel'), action: pauseMenu }, { label: tr('restart','Restart'), action: start }
        ]);
    }
    function pause() {
        if (game.state !== 'playing') { return; }
        game.pause();
        pauseMenu();
    }
    function moveMenu(delta) {
        var count = 0;
        do { choice = (choice + delta + menu.length) % menu.length; count += 1; }
        while (menu[choice].disabled && count < menu.length);
        focusMenu();
    }
    function select() { if (menu[choice] && !menu[choice].disabled) { menu[choice].action(); } }
    function input(action) {
        if (destroyed) { return; }
        if (screen !== 'play') {
            if (action === 'up' || action === 'left' || action === 'rotateLeft') { moveMenu(-1); }
            else if (action === 'down' || action === 'right' || action === 'rotateRight') { moveMenu(1); }
            else if (action === 'select') { select(); }
            else if (action === 'back') {
                if (screen === 'pause') { resume(); }
                else if (screen === 'restart') { pauseMenu(); }
                else if (screen !== 'lobby') { exitGame(); }
            }
            return;
        }
        if (action === 'left') { game.move(-1); }
        else if (action === 'right') { game.move(1); }
        else if (action === 'up' || action === 'rotateRight') { game.rotate(1); }
        else if (action === 'rotateLeft') { game.rotate(-1); }
        else if (action === 'down') { game.softDrop(); }
        else if (action === 'select') { game.hardDrop(); }
        else if (action === 'back') { pause(); }
        checkOver(); render(false);
    }
    function press(action) {
        if (pressed[action]) { return; }
        pressed[action] = true;
        input(action);
        if (screen === 'play' && (action === 'left' || action === 'right' || action === 'down')) {
            if (action === 'left') { delete held.right; } else if (action === 'right') { delete held.left; }
            held[action] = { delay: 0.18, elapsed: 0 };
        }
    }
    function release(action) { delete held[action]; delete pressed[action]; }
    function keyAction(code) {
        return { 37: 'left', 39: 'right', 38: 'up', 40: 'down', 13: 'select', 32: 'back', 27: 'back', 8: 'back', 77: 'rotateRight', 78: 'rotateLeft', 90: 'rotateLeft', 88: 'rotateRight', 81: 'rotateLeft', 69: 'rotateRight' }[code];
    }
    function keydown(event) {
        var action = keyAction(event.keyCode);
        if (!action) { return; }
        event.preventDefault();
        // Match OEM Back semantics: act on release, never on both phases.
        if (event.keyCode === 8) { keys[8] = 'back'; return; }
        if (!keys[event.keyCode]) { keys[event.keyCode] = action; press(action); }
    }
    function keyup(event) {
        var action = keys[event.keyCode];
        if (event.keyCode === 8) {
            delete keys[8]; release('back'); event.preventDefault(); input('back'); return;
        }
        if (action) { release(action); delete keys[event.keyCode]; event.preventDefault(); }
    }
    function blur() { keys = {}; pressed = {}; clearHeld(); pause(); }
    function visibility() { if (document.hidden || document.webkitHidden) { blur(); } }
    function wheel(event) {
        var delta = typeof event.deltaY === 'number' ? event.deltaY : -(event.wheelDelta || 0);
        if (delta) { event.preventDefault(); input(delta > 0 ? 'rotateRight' : 'rotateLeft'); }
    }
    function setHighscore(value,error) {
        if(typeof value==='number' && isFinite(value) && value>=0)highscore=Math.max(highscore,Math.floor(value));
        var node=el('highscore');if(node)node.textContent=pad(highscore,6)+(error?' ('+tr('notSaved','not saved')+')':'');
    }
    function recordScore() {
        if(game.score>highscore){setHighscore(game.score,'');if(scoreHandler)scoreHandler(game.score);}
    }
    function overMenu() {
        recordScore();
        dialog('over', tr('gameOver','Game over'), tr('result','Score {score} - {lines} lines cleared.',{score:game.score,lines:game.lines}), [
            {label:tr('again','Play again'),action:start},{label:tr('exit','Exit'),action:exitGame}
        ]);
    }
    function translate() {
        var nodes = document.querySelectorAll('[data-i18n]'), i, key, previous = choice;
        for (i = 0; i < nodes.length; i += 1) {
            key = nodes[i].getAttribute('data-i18n');
            if (typeof nodes[i]._english !== 'string') { nodes[i]._english = nodes[i].textContent; }
            nodes[i].textContent = tr(key,nodes[i]._english);
        }
        nodes = document.querySelectorAll('[data-i18n-label]');
        for (i = 0; i < nodes.length; i += 1) {
            if (typeof nodes[i]._englishLabel !== 'string') { nodes[i]._englishLabel = nodes[i].getAttribute('aria-label'); }
            nodes[i].setAttribute('aria-label',tr(nodes[i].getAttribute('data-i18n-label'),nodes[i]._englishLabel));
        }
        if (screen === 'ready') { ready(); } else if (screen === 'pause') { pauseMenu(); }
        else if (screen === 'restart') { confirmRestart(); } else if (screen === 'over') { overMenu(); } else if (screen === 'lobby') { lobby(); }
        if (menu.length) { choice = Math.min(previous,menu.length - 1); focusMenu(); }
    }
    function checkOver() {
        if (game.state === 'over' && screen === 'play') {
            overMenu();
        }
    }
    function frame() {
        var now = new Date().getTime(), dt = Math.max(0, Math.min(0.1, (now - last) / 1000)), action, item;
        last = now;
        if (screen === 'play') {
            for (action in held) {
                if (Object.prototype.hasOwnProperty.call(held, action)) {
                    item = held[action]; item.elapsed += dt;
                    if (item.elapsed >= item.delay) { item.elapsed = 0; item.delay = action === 'down' ? 0.045 : 0.075; input(action); }
                }
            }
            game.tick(dt); checkOver(); render(false);
        }
    }
    function destroy() {
        if (destroyed) { return; }
        destroyed = true; pressed = {}; keys = {}; clearHeld(); window.clearInterval(timer);
        document.removeEventListener('keydown', keydown, false); document.removeEventListener('keyup', keyup, false);
        document.removeEventListener('visibilitychange', visibility, false); document.removeEventListener('webkitvisibilitychange', visibility, false);
        window.removeEventListener('blur', blur, false); window.removeEventListener('resize', fit, false);
        document.removeEventListener('wheel', wheel, false); document.removeEventListener('mousewheel', wheel, false);
    }
    if (!window.MzdGuiModule) {
        document.addEventListener('keydown', keydown, false); document.addEventListener('keyup', keyup, false);
    }
    document.addEventListener('visibilitychange', visibility, false); document.addEventListener('webkitvisibilitychange', visibility, false);
    window.addEventListener('blur', blur, false); window.addEventListener('resize', fit, false);
    // Pick one wheel event family to avoid duplicate rotations.
    document.addEventListener('onwheel' in document ? 'wheel' : 'mousewheel', wheel, false);
    window.MzdTetris = { setHighscore:setHighscore,setScoreHandler:function(fn){scoreHandler=fn;}, translate:translate, input: input, press: press, release: release, pause: pause, destroy: destroy,
        setExitHandler: function (fn) { exitHandler = typeof fn === 'function' ? fn : null; },
        getState: function () { return { state: game.state, screen: screen, score: game.score, lines: game.lines,
            menuChoice: choice, menuItems: menu.length, menuVisible: screen !== 'play',
            previewBlocks: preview.children.length, courtVisible: el('court').style.display !== 'none' }; }
    };
    fit(); ready(); timer = window.setInterval(frame, 33);
}());
