"""Copy first-party view sources into two independent, ready-to-run packages."""
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(__file__).resolve().parent

EN = {
    'gui.menu.0':'Traffic Jam', 'gui.back':'Back', 'gui.backToApplications':'Back to Applications',
    'score':'Score', 'time':'Time', 'highscore':'High score', 'bestTime':'Best time', 'notSaved':'not saved',
    'flags':'Flags', 'continue':'Continue', 'newGame':'New game', 'exit':'Exit', 'paused':'Paused',
    'won':'You won!', 'gameOver':'Game over',
    'resultHint':'Press / Back: menu',
    'snakeControls':'Tilt: steer\nPress / Back: pause',
    'mineControls':'Tilt: move cursor\nPress: open\nTurn right: set flag\nTurn left: remove flag\nBack: pause',
    'snakeKeys':'Keyboard: arrows steer, Enter / Esc pause',
    'mineKeys':'Keyboard: arrows move, Enter opens, M sets flag, N removes flag, Esc pauses',
}
DE = {
    'gui.menu.0':'Traffic Jam', 'gui.back':'Zurück', 'gui.backToApplications':'Zurück zu Anwendungen',
    'score':'Punkte', 'time':'Zeit', 'highscore':'Rekord', 'bestTime':'Bestzeit', 'notSaved':'nicht gespeichert',
    'flags':'Flaggen', 'continue':'Fortsetzen', 'newGame':'Neues Spiel', 'exit':'Beenden', 'paused':'Pause',
    'won':'Gewonnen!', 'gameOver':'Spiel vorbei',
    'resultHint':'Drücken / Zurück: Menü',
    'snakeControls':'Kippen: Richtung\nDrücken / Zurück: Pause',
    'mineControls':'Kippen: Cursor bewegen\nDrücken: Aufdecken\nRechts drehen: Flagge setzen\nLinks drehen: Flagge entfernen\nZurück: Pause',
    'snakeKeys':'Tastatur: Pfeile steuern, Enter / Esc Pause',
    'mineKeys':'Tastatur: Pfeile bewegen, Enter öffnet, M setzt Flagge, N entfernt sie, Esc pausiert',
}

def write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(data, encoding='utf-8', newline='\n')

for id_, label in [('snake','Snake'), ('minesweeper','Minesweeper')]:
    assets = ROOT/'usb/tweaks'/id_/'assets'
    for name in ['app.js','style.css']:
        write(assets/name, (SOURCE/name).read_text(encoding='utf-8'))
    # Each package has its own dictionary and requires no other game to be installed.
    languages = {'en_US':dict(EN, **{'gui.label':label}), 'de_DE':dict(DE, **{'gui.label':label})}
    write(assets/'i18n.js', 'window.MzdGuiI18n.register('+json.dumps(id_)+','+
          json.dumps({'version':1,'languages':languages},ensure_ascii=False,indent=2)+');\n')
    write(assets/'index.html', '''<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>'''+label+''' - Traffic Jam</title><link rel="stylesheet" href="style.css"></head><body>
<main id="stage"><aside><h1 id="title">'''+label+'''</h1><div class="label" id="metric-label"></div><div class="metric" id="metric"></div>
<div class="label" id="best-label"></div><div id="best"></div><div id="extra"></div><div id="controls"></div></aside>
<div id="court"><canvas id="board" width="480" height="360" aria-label="'''+label+''' playfield"></canvas></div>
<div id="keyboard"></div><div id="shade"></div><section id="dialog" role="dialog" aria-modal="true" aria-labelledby="dialog-title">
<h2 id="dialog-title"></h2><p id="dialog-text"></p><div id="menu"></div></section></main>
<script src="/data/integration/mzd-gui-runtime/sdk.js"></script><script>window.TrafficJamGame="'''+id_+'''";</script>
<script src="engine.js"></script><script src="app.js"></script></body></html>
''')
