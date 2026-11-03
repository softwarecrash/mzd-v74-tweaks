/* Translate shared semantic inputs to the unchanged Tetris controller API. */
(function () {
    'use strict';
    var game = window.MzdTetris, sdk = window.MzdGuiModule;
    if (!game || !sdk) { throw new Error('Tetris GUI integration is incomplete'); }
    sdk.onInput(function (action, phase) {
        if (action === 'back') {
            if (phase !== 'press') { game.release('back'); game.input('back'); }
        } else if (phase === 'press') { game.press(action); }
        else if (phase === 'release') { game.release(action); }
        else { game.input(action); }
        return true; // Tetris owns Back (pause/resume), and Exit closes via the SDK.
    });
    game.setExitHandler(function () { sdk.close(); });
    sdk.onDispose(function () { game.destroy(); });
    if (sdk.loadLanguage) { sdk.loadLanguage(function (language, direction) {
        document.documentElement.lang = language.replace('_','-');
        // Keep the spatial playfield/controller layout; mirror translated prose only.
        document.getElementById('dialog-text').dir = direction;
        game.translate();
    }); }
    var requestId=0;
    function score(value){sdk.send('tetris-score',{id:++requestId,score:value});}
    sdk.onMessage(function(data){
        if(data.type!=='mzd-module-tetris-score-result')return;
        game.setHighscore(data.result && data.result.highscore,data.error||'');
    });
    game.setScoreHandler(function(value){score(value);});
    score(null);
    sdk.ready();
}());
