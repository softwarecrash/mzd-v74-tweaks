/* Original ES5 rules; independent of rendering and the CMU framework. */
(function (root) {
    'use strict';
    var vectors = {left:[-1,0],right:[1,0],up:[0,-1],down:[0,1]};
    function Game(random) { this.random = random || Math.random; this.width = 24; this.height = 18; this.start(); }
    Game.prototype.food = function () {
        var empty = [], x, y, n, occupied;
        for (y = 0; y < this.height; y += 1) { for (x = 0; x < this.width; x += 1) {
            occupied = false;
            for (n = 0; n < this.body.length; n += 1) { if (this.body[n].x === x && this.body[n].y === y) { occupied = true; break; } }
            if (!occupied) { empty.push({x:x,y:y}); }
        } }
        if (!empty.length) { this.state = 'won'; this.apple = null; }
        else { this.apple = empty[Math.min(empty.length - 1, Math.floor(this.random() * empty.length))]; }
    };
    Game.prototype.start = function () {
        this.body = [{x:7,y:9},{x:6,y:9},{x:5,y:9}]; this.direction = 'right'; this.queue = [];
        this.score = 0; this.elapsed = 0; this.crash = null; this.state = 'playing'; this.food();
    };
    Game.prototype.interval = function () { return Math.max(90, 260 - this.score * 8); };
    Game.prototype.turn = function (direction) {
        var last = this.queue.length ? this.queue[this.queue.length - 1] : this.direction, a = vectors[last], b = vectors[direction];
        if (this.state !== 'playing' || !b || this.queue.length >= 2 || last === direction || (a[0] + b[0] === 0 && a[1] + b[1] === 0)) { return false; }
        this.queue.push(direction); return true;
    };
    Game.prototype.step = function () {
        if (this.state !== 'playing') { return; }
        if (this.queue.length) { this.direction = this.queue.shift(); }
        var v = vectors[this.direction], head = {x:this.body[0].x + v[0],y:this.body[0].y + v[1]}, n;
        head.x = (head.x + this.width) % this.width;
        head.y = (head.y + this.height) % this.height;
        var eat = this.apple && head.x === this.apple.x && head.y === this.apple.y;
        // Moving into the departing tail is legal when no food is eaten.
        for (n = 0; n < this.body.length - (eat ? 0 : 1); n += 1) {
            if (head.x === this.body[n].x && head.y === this.body[n].y) { this.crash = head; this.state = 'lost'; return; }
        }
        this.body.unshift(head);
        if (eat) { this.score += 1; this.food(); } else { this.body.pop(); }
    };
    Game.prototype.tick = function (milliseconds) {
        if (this.state !== 'playing') { return; }
        // Do not catch up after suspension: one late frame cannot kill the player.
        this.elapsed += Math.max(0, Math.min(milliseconds, this.interval()));
        if (this.elapsed >= this.interval()) { this.elapsed = 0; this.step(); }
    };
    root.SnakeEngine = {Game:Game};
}(typeof window !== 'undefined' ? window : this));
