# Traffic Jam games

Snake and Minesweeper are independent GUI-extension packages. Each manifest
declares `gui_menu_path=Traffic Jam`; the shared helper merges that native Mazda
submenu with Tetris. Game views and engines load only when selected.

First-party ES5 rules live in each package's `assets/engine.js`. The common view
sources here are copied into each package by `python development/traffic-jam/build.py`.
No extra shared runtime or dependency on another game is installed.
English and German are included initially; other Mazda languages silently use
English. Language selection happens once when opening a view.

The small registered resident forwards authenticated record messages only for its
active view. Snake stores a maximum score; Minesweeper stores the shortest win
time in seconds for its fixed 16x12/30-mine board. Both use atomic writes in their
manifest-declared module data directories. Normal uninstall removes records and
ownership markers, Keep preserves them, and Update preserves them automatically.

Tests: `node tests/tweaks/traffic-jam/behavior.cjs` and
`python tests/contract/test_gui_extensions.py --traffic-jam-only`.
Browser keyboard controls are also usable by serving a package directory with
Python's HTTP server and opening `assets/index.html`; missing CMU fonts/background
fall back to local fonts/a dark background, without writing persistent records.
These isolated tests are not evidence of physical CMU rendering or input timing.
