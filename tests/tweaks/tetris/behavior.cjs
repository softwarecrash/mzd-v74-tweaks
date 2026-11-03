/* Tetris engine/controller checks using a synthetic DOM; no vehicle writes. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const GAME=path.join(__dirname,'../../../usb/tweaks/tetris/assets');
const E = require(path.join(GAME,'engine.js'));
let checks = 0;
function check(name, fn) { fn(); checks++; console.log('PASS', name); }
function rng(seed) { return function () { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }; }
function count(game) { return game.board.reduce((n, row) => n + row.filter(x => x !== null).length, 0); }
check('all piece rotations contain four cells', () => {
    for (let t = 0; t < 7; t++) for (let r = 0; r < 4; r++) {
        let n = 0; E.each(t, 0, 0, r, () => n++); assert.equal(n, 4);
    }
});
check('seven-bag includes every type, including the last index', () => {
    const g = new E.Game(rng(123)); g.bag = [];
    for (let i = 0; i < 50; i++) assert.equal(new Set(Array.from({length: 7}, () => g.take())).size, 7);
});
check('walls, floor, ghost and hard drop', () => {
    const g = new E.Game(rng(4)); g.start();
    while (g.move(-1)) {} assert(!g.move(-1));
    while (g.move(1)) {} assert(!g.move(1));
    assert(g.fits(g.current.x, g.ghostY(), g.current.rotation));
    assert(!g.fits(g.current.x, g.ghostY() + 1, g.current.rotation));
    g.hardDrop(); assert.equal(count(g), 4); assert(g.score > 0);
});
check('row zero is cleared and remaining rows stay intact', () => {
    const g = new E.Game(rng(1)); g.start();
    g.current = {type: 0, rotation: 0, x: 3, y: -1};
    for (let x = 0; x < 10; x++) g.board[0][x] = x >= 3 && x <= 6 ? null : 2;
    g.board[10][2] = 4;
    assert.equal(g.lock(), 1); assert.equal(g.lines, 1); assert.equal(g.board[10][2], 4);
    assert(g.board[0].every(x => x === null));
});
check('four simultaneous lines score and collapse correctly', () => {
    const g = new E.Game(rng(2)); g.start();
    for (let y = 16; y < 20; y++) for (let x = 0; x < 10; x++) g.board[y][x] = x === 4 ? null : 1;
    g.current = {type: 0, rotation: 1, x: 2, y: 16};
    assert.equal(g.lock(), 4); assert.equal(g.lines, 4); assert.equal(g.score, 800); assert.equal(count(g), 0);
});
check('pause freezes movement, drops and gravity', () => {
    const g = new E.Game(rng(8)); g.start(); g.pause();
    const before = JSON.stringify(g); g.move(1); g.rotate(1); g.softDrop(); g.hardDrop(); g.tick(0.1);
    assert.equal(JSON.stringify(g), before); g.pause(); assert.equal(g.state, 'playing');
});
check('lock delay allows a late horizontal correction', () => {
    const g = new E.Game(rng(9)); g.start(); g.current.y = g.ghostY();
    g.tick(0.1); g.tick(0.1); assert.equal(count(g), 0);
    assert(g.move(1)); g.tick(0.1); g.tick(0.1); assert.equal(count(g), 0);
    for (let n = 0; n < 5; n++) g.tick(0.1); assert.equal(count(g), 4);
});
check('spawn collision ends the game', () => {
    const g = new E.Game(rng(2)); g.start();
    for (let y = 0; y < 4; y++) for (let x = 0; x < 10; x++) g.board[y][x] = 0;
    g.spawn(); assert.equal(g.state, 'over');
});
check('deterministic input stress preserves board and collision invariants', () => {
    const random = rng(812), g = new E.Game(random); g.start();
    for (let n = 0; n < 12000; n++) {
        if (g.state === 'over') g.start();
        const action = Math.floor(random() * 6);
        if (action === 0) g.move(-1); else if (action === 1) g.move(1);
        else if (action === 2) g.rotate(1); else if (action === 3) g.rotate(-1);
        else if (action === 4) g.softDrop(); else g.hardDrop();
        g.tick(0.1); assert.equal(g.board.length, 20);
        for (const row of g.board) assert.equal(row.length, 10);
        if (g.state === 'playing') assert(g.fits(g.current.x, g.current.y, g.current.rotation));
        assert(Number.isFinite(g.score));
    }
});
function fixture(options = {}) {
    const html=fs.readFileSync(path.join(GAME,'tetris.html'),'utf8'),ids=new Set([...html.matchAll(/id="([^"]+)"/g)].map(m=>m[1])),boardSize=/id="board" width="(\d+)" height="(\d+)"/.exec(html);
    const draws=[],elements = {}, listeners = {}, windowListeners = {}; let now = 0, frame, cancelled = false;
    const canvas = {fillRect(){draws.push(Array.from(arguments));}, strokeRect(){}, clearRect(){}, save(){}, restore(){}, translate(){}};
    function element() {
        return {style: {}, children: [], textContent: '', setAttribute(){}, appendChild(x){this.children.push(x);},
            getElementsByTagName(){return this.children;}, getContext(){return canvas;},
            set innerHTML(value){this.children=[];}, get innerHTML(){return '';}};
    }
    const document = {querySelectorAll(){return [];},onwheel: null, hidden: false, documentElement:{clientWidth:800,clientHeight:480},
        getElementById(id){if(!ids.has(id))return null;const node=elements[id]||(elements[id]=element());if(id==='board'){node.width=Number(boardSize[1]);node.height=Number(boardSize[2]);}return node;}, createElement(tag){const e=element();e.tagName=tag.toUpperCase();return e;},
        addEventListener(name, fn){listeners[name] = fn;}, removeEventListener(name){delete listeners[name];}};
    const window = {innerWidth:800,innerHeight:480, setInterval(fn){frame=fn;return 1;}, clearInterval(){cancelled=true;},
        addEventListener(name,fn){windowListeners[name]=fn;},removeEventListener(name){delete windowListeners[name];}};
    if (options.sharedGui) window.MzdGuiModule = {};
    function Clock(){this.getTime=()=>now;}
    vm.runInNewContext(fs.readFileSync(path.join(GAME,'app.js'),'utf8'),{TetrisEngine:E,document,window,Date:Clock});
    return {api:window.MzdTetris,draws,elements,listeners,windowListeners,window,document,
        step(ms){now+=ms;frame();}, cancelled(){return cancelled;},
        key(name,keyCode){listeners[name]({keyCode,preventDefault(){}});}};
}
check('start press does not drop a piece through key auto-repeat', () => {
    const f=fixture(); f.key('keydown',13); assert.equal(f.api.getState().state,'playing');
    f.key('keydown',13); f.key('keydown',13); assert.equal(f.api.getState().score,0);
    f.key('keyup',13); f.key('keydown',13); assert(f.api.getState().score>0);
});
check('semantic press/release latches select until release', () => {
    const f=fixture(); f.api.press('select'); f.api.press('select'); assert.equal(f.api.getState().score,0);
    f.api.release('select'); f.api.press('select'); assert(f.api.getState().score>0);
});
check('Back pauses/resumes, blur pauses and timers do not catch up', () => {
    const f=fixture(); f.api.input('select'); f.api.input('back'); assert.equal(f.api.getState().state,'paused');
    const before=f.api.getState(); f.step(9000); assert.deepEqual(f.api.getState(),before);
    f.api.input('back'); assert.equal(f.api.getState().state,'playing');
    f.windowListeners.blur(); assert.equal(f.api.getState().screen,'pause');
});
check('local Traffic Jam menu contains only the available Tetris game', () => {
    const f=fixture();
    f.api.input('back');assert.equal(f.api.getState().screen,'lobby');
    f.api.input('down');f.api.input('select');assert.equal(f.api.getState().screen,'ready');
});
check('pause labels, restart confirmation, and host exit have explicit destinations', () => {
    const f=fixture();let exits=0;f.api.setExitHandler(()=>exits++);f.api.input('select');f.api.input('select');
    const score=f.api.getState().score;assert(score>0);f.api.input('back');
    assert.deepEqual(f.elements.menu.children.map(x=>x.textContent),['Continue','Restart','Exit']);
    f.api.input('rotateRight');f.api.input('select');assert.equal(f.api.getState().screen,'restart');assert.equal(f.api.getState().score,score);
    assert.equal(f.elements.menu.children[0].textContent,'Cancel');f.api.input('back');assert.equal(f.api.getState().screen,'pause');
    f.api.input('rotateRight');f.api.input('select');f.api.input('rotateRight');f.api.input('select');
    assert.equal(f.api.getState().state,'playing');assert.equal(f.api.getState().score,0);
    f.api.input('back');f.api.input('rotateLeft');f.api.input('select');assert.equal(exits,1);assert.notEqual(f.api.getState().screen,'lobby');
});
check('OEM Back release and M/N keep all pause buttons visible', () => {
    const f=fixture();f.api.input('select');
    f.key('keydown',8);assert.equal(f.api.getState().screen,'play');
    f.key('keyup',8);assert.equal(f.api.getState().screen,'pause');
    for(const code of [77,77,78,77]){
        f.key('keydown',code);f.key('keyup',code);
        assert.equal(f.api.getState().screen,'pause');assert.equal(f.api.getState().menuItems,3);
        assert.equal(f.elements.menu.children.length,3);assert(f.api.getState().menuVisible);
        assert(f.elements.menu.children.every(e=>e.tagName==='DIV' && e.className.includes('menu-entry')));
    }
});
check('scales 800x480 and cleans up all input handlers/timer', () => {
    const f=fixture(); f.window.innerWidth=1600;f.window.innerHeight=960;f.windowListeners.resize();
    assert.equal(f.elements.stage.style.transform,'none');
    f.window.innerWidth=400;f.window.innerHeight=240;f.windowListeners.resize();
    assert.equal(f.elements.stage.style.transform,'scale(0.5)');f.api.destroy();
    assert(f.cancelled());assert.equal(Object.keys(f.listeners).length,0);assert.equal(Object.keys(f.windowListeners).length,0);
    const before=f.api.getState();f.api.input('select');assert.deepEqual(f.api.getState(),before);
});
check('DOM preview stays present; pause removes canvas from compositing', () => {
    const f=fixture();assert.equal(f.elements.next.children.length,4);
    assert.equal(f.elements.court.style.display,'none');
    f.api.input('select');assert.equal(f.elements.court.style.display,'block');
    for(let n=0;n<3;n++){
        f.api.input('select');assert.equal(f.elements.next.children.length,4);
        f.api.input('back');assert.equal(f.elements.court.style.display,'none');
        f.api.input('rotateRight');assert.equal(f.elements.menu.children.length,3);
        assert(f.elements.menu.children.every(e=>e.className.includes('menu-entry')));
        f.api.input('back');assert.equal(f.elements.court.style.display,'block');
    }
});
check('runtime files parse as ES5 without block function declarations', () => {
    const Module=require('node:module'); const natives=process.binding('natives');
    const key=Object.keys(natives).find(k=>k.endsWith('acorn/dist/acorn'));assert(key);
    const parser=new Module('tetris-es5');parser._compile(natives[key],'tetris-es5.js');
    function walk(node,parent,grandparent){
        if(node.type==='FunctionDeclaration')assert(parent.type==='Program' ||
            (parent.type==='BlockStatement' && grandparent && /^(FunctionDeclaration|FunctionExpression)$/.test(grandparent.type)), 'Block function');
        for(const value of Object.values(node)){
            if(Array.isArray(value)){for(const child of value)if(child && child.type)walk(child,node,parent);}
            else if(value && value.type)walk(value,node,parent);
        }
    }
    for(const name of ['engine.js','app.js'])walk(parser.exports.parse(fs.readFileSync(path.join(GAME,name),'utf8'),{ecmaVersion:5}),null,null);
});
check('game over renders readable score and cleared-line text',()=>{const f=fixture();f.api.input('select');for(let n=0;n<100&&f.api.getState().screen!=='over';n++)f.api.input('select');const state=f.api.getState();assert.equal(state.screen,'over');assert.equal(f.elements['dialog-text'].textContent,'Score '+state.score+' - '+state.lines+' lines cleared.');assert(fs.readFileSync(path.join(GAME,'tetris.html'),'utf8').includes('<title>Tetris - Traffic Jam</title>'));});
check('header removed and larger canvas renders at native pixel size',()=>{const f=fixture();assert(!fs.readFileSync(path.join(GAME,'tetris.html'),'utf8').includes('<header>'));assert.equal(f.elements.board.width,220);assert.equal(f.elements.board.height,440);assert.deepEqual(f.draws[0],[0,0,220,440]);assert.equal(f.elements.stage.style.transform,'none');});
check('highscore loads, displays and saves once at game over',()=>{
 const f=fixture(),saved=[];f.api.setHighscore(3,'');assert.equal(f.elements.highscore.textContent,'000003');
 f.api.setScoreHandler(score=>saved.push(score));f.api.input('select');
 for(let n=0;n<100&&f.api.getState().screen!=='over';n++)f.api.input('select');
 const score=f.api.getState().score;assert(score>3);assert.deepEqual(saved,[score]);assert.equal(Number(f.elements.highscore.textContent),score);
 f.api.setHighscore(undefined,'IO failed');assert.match(f.elements.highscore.textContent,/not saved/);f.api.destroy();
});
console.log('TETRIS_DRAFT_PASSED:',checks,'checks.');
module.exports = {checks,fixture};
