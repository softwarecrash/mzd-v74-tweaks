# Tetris

A commander-controlled Tetris game for firmware 74.00.324, using automatically
managed [shared GUI support](../../../development/Gui-extensions.md).

Install through the USB launcher and restart. Open Applications > Traffic Jam >
Tetris. The game loads only on selection. Exit returns to Traffic Jam; Back from
the submenu returns to Applications. The menu path is declared in manifest.conf:

```ini
gui_menu_path=Traffic Jam
gui_label=Tetris
gui_entrypoint=assets/tetris.html
```

## Controls

| Input | Action |
| --- | --- |
| Tilt left/right | Move piece |
| Rotate commander | Rotate piece |
| Tilt down | Soft drop |
| Press | Hard drop / choose menu item |
| Back | Pause; Back in Pause resumes |

Pause offers Continue, Restart and Exit. Restart asks for confirmation. The game
includes a next-piece preview, landing-position guide, scoring and levels. The
220x440 playfield renders directly without scaling inside the 800x480 screen.

## Installation and removal

The worker owns only its module. The shared helper creates the optional data
hook, common runtime and path-derived Mazda menus. Removing Tetris keeps support
while another GUI extension remains; removing the last consumer collects the
owned support. Stock GUI JavaScript is not modified. Saved-package Uninstall
uses the installed snapshot even if the USB files have changed. Reports are
stored under reports/tetris on the originating USB.

If migrating from the older standalone files-type test package, first remove it
using its saved uninstaller. A type-changing replacement is refused. Do not
manually overwrite a developer hook or installed files.

## Credits and verification

Adapted from [Jake Gordon's javascript-tetris](https://github.com/jakesgordon/javascript-tetris),
revision e5c0c42f7dac0f3514a55eff656c6e22e95d68ed. Piece definitions/iteration are
retained; rules, input, rendering and lifecycle were adapted for the CMU.
See assets/LICENSE.upstream for the MIT license. CMU integration: SoftWareCrash.
OEM fonts/images are referenced on the CMU, not distributed with this package.

Run node tests/tweaks/tetris/shared-sdk.cjs and
python tests/contract/test_gui_extensions.py --tetris-only from the repository
root. Isolated tests cover rules, input, view lifecycle and shared ownership;
DOM mocks do not prove native rendering. Bench testing established basic menus,
controller input and return paths; long-term stability and power-loss recovery
are not established. The iframe shares the Opera process.

### Language

The installed game follows the Mazda GUI language through the optional shared
translation helper. `assets/i18n.js` contains all 41 distinct locale codes in
the 74.00.324 framework, including Mazda's regional identifiers (`fr_CN`,
`cs_CS`, `cn_HK`, `mn_TW`). The firmware maps its Korean enum to `en_US`.
English variants share English; Spanish/French regional variants and Taiwanese
Mandarin share their corresponding dictionary. Tetris and Traffic Jam remain
proper names. Missing translations silently use English/existing text.
The game chooses its language when opened. There is no background polling;
reopen it after changing the Mazda language.
Translations are initial drafts; native typography, font coverage, long labels
and RTL scripts still need visual checks on the CMU.

## High score

The Lua service stores `highscore.conf` in the manifest-declared mutable state
folder. An empty template is included in assets/config. Empty/missing files mean
a score of zero; the service creates a missing file on the first saved record.
Scores are saved at game over, restart or Exit, without writing every frame.
Values are validated and published by atomic rename. Update preserves the score;
Uninstall asks whether to keep it. The installed assets and package are immutable.

The playfield uses 800x416 below the original Mazda status bar. A phone call
suspends the view, clears held input and stops its game timer. Returning to the
same Applications context restores the current board/menu; a running game
returns paused and requires Continue. Home, music, navigation or a new
Applications visit closes the view normally.
