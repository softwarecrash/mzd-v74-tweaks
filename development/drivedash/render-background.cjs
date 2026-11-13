/* Authoring tool only. Run in the renderer container; never on the CMU.
 * Font files are read from the private firmware/emulator tree, never published.
 * Prints the generated PNG as base64 for the container wrapper's read-only mount.
 */
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const {createCanvas, GlobalFonts} = require('@napi-rs/canvas');
const fontRoot = process.argv[2];
if (!fontRoot) throw new Error('Pass the private Mazda fonts directory.');
for (const [file,family] of [['Tipperary.ttf','DriveDashMazda'],['TipperarySemiboldItalic.ttf','DriveDashInstrument']]) {
    if (!GlobalFonts.registerFromPath(path.join(fontRoot,file),family)) throw new Error('Could not load '+file);
}
let skin;
vm.runInNewContext(fs.readFileSync('usb/tweaks/drivedash/assets/skins/oem-style.js','utf8'),
    {window:{DriveDashSkins:{register(value){skin=value;}}}});
const high = createCanvas(2400,1248), target = createCanvas(800,416);
high.getContext('2d').scale(3,3); skin.drawBackground(high.getContext('2d'));
const ctx = target.getContext('2d'); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
ctx.drawImage(high,0,0,800,416);
process.stdout.write(target.toBuffer('image/png').toString('base64'));
