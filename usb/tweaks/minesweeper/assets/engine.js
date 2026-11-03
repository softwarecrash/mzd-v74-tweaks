/* Original ES5 rules: safe first opening, flood fill and explicit flag actions. */
(function (root) {
    'use strict';
    function Game(random) { this.random = random || Math.random; this.width = 16; this.height = 12; this.mineCount = 30; this.start(); }
    Game.prototype.start = function () {
        var n; this.cells = []; this.cursor = 0; this.flags = 0; this.opened = 0; this.elapsed = 0;
        this.planted = false; this.state = 'playing';
        for (n = 0; n < this.width * this.height; n += 1) { this.cells.push({mine:false,open:false,flag:false,count:0}); }
    };
    Game.prototype.neighbors = function (index) {
        var x = index % this.width, y = Math.floor(index / this.width), dx, dy, out = [];
        for (dy = -1; dy <= 1; dy += 1) { for (dx = -1; dx <= 1; dx += 1) {
            if ((dx || dy) && x + dx >= 0 && x + dx < this.width && y + dy >= 0 && y + dy < this.height) { out.push((y + dy) * this.width + x + dx); }
        } } return out;
    };
    Game.prototype.plant = function (first) {
        var safe = this.neighbors(first), candidates = [], n, j, temporary, adjacent, k;
        safe.push(first);
        for (n = 0; n < this.cells.length; n += 1) { if (safe.indexOf(n) < 0) { candidates.push(n); } }
        for (n = candidates.length - 1; n > 0; n -= 1) {
            j = Math.min(n, Math.floor(this.random() * (n + 1))); temporary = candidates[n]; candidates[n] = candidates[j]; candidates[j] = temporary;
        }
        for (n = 0; n < this.mineCount; n += 1) { this.cells[candidates[n]].mine = true; }
        for (n = 0; n < this.cells.length; n += 1) {
            adjacent = this.neighbors(n);
            for (k = 0; k < adjacent.length; k += 1) { if (this.cells[adjacent[k]].mine) { this.cells[n].count += 1; } }
        }
        this.planted = true;
    };
    Game.prototype.move = function (direction) {
        if (this.state !== 'playing') { return; }
        var x = this.cursor % this.width, y = Math.floor(this.cursor / this.width);
        if (direction === 'left') { x = Math.max(0,x - 1); } if (direction === 'right') { x = Math.min(this.width - 1,x + 1); }
        if (direction === 'up') { y = Math.max(0,y - 1); } if (direction === 'down') { y = Math.min(this.height - 1,y + 1); }
        this.cursor = y * this.width + x;
    };
    Game.prototype.flag = function (enabled) {
        var cell = this.cells[this.cursor];
        if (this.state !== 'playing' || cell.open || cell.flag === enabled || (enabled && this.flags >= this.mineCount)) { return false; }
        cell.flag = enabled; this.flags += enabled ? 1 : -1; return true;
    };
    Game.prototype.reveal = function () {
        var first = this.cells[this.cursor], queue = [this.cursor], index, cell, adjacent, n;
        if (this.state !== 'playing' || first.flag || first.open) { return false; }
        if (!this.planted) { this.plant(this.cursor); }
        if (first.mine) { first.open = true; this.state = 'lost'; return true; }
        // Mark on insertion so each cell enters the queue at most once.
        first.open = true;
        while (queue.length) {
            index = queue.pop(); cell = this.cells[index]; this.opened += 1;
            if (!cell.count) {
                adjacent = this.neighbors(index);
                for (n = 0; n < adjacent.length; n += 1) {
                    cell = this.cells[adjacent[n]];
                    if (!cell.open && !cell.flag && !cell.mine) { cell.open = true; queue.push(adjacent[n]); }
                }
            }
        }
        if (this.opened === this.cells.length - this.mineCount) { this.state = 'won'; }
        return true;
    };
    Game.prototype.tick = function (milliseconds) {
        if (this.state === 'playing' && this.planted) { this.elapsed += Math.max(0,Math.min(milliseconds,1000)); }
    };
    root.MinesweeperEngine = {Game:Game};
}(typeof window !== 'undefined' ? window : this));
