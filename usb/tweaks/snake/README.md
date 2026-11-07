# Snake

Tilt steers. Press or Back opens Pause. The snake grows and accelerates after each apple. Crossing any edge wraps to the opposite edge; self-collisions end the game.

After game over the final board stays visible, with the collision marked in red.
Press or Back opens the result menu; Back from that menu shows the board again.

Own entry under Applications > Traffic Jam. The game loads only on selection.
English/German initially; other languages fall back to English.

Records live in `/tmp/mnt/data_persist/mzd-tweaks/gui-data/snake/record.conf`.
Created on the first record. No browser localStorage or USB is required.
Normal uninstall removes the complete declared data directory; Keep and Update
preserve it. Original GUI files are not patched. Shared support remains while
other consumers need it. Restart after installation/removal.

[Development and test instructions](../../../development/traffic-jam/README.md).

First-party implementation, project CC BY-NC-SA 4.0 license. CMU playtesting pending.

The playfield uses 800x416 below the original Mazda status bar. A phone call
suspends the view, clears held input and stops its game timer. Returning to the
same Applications context restores the current board/menu; a running game
returns paused and requires Continue. Home, music, navigation or a new
Applications visit closes the view normally.
