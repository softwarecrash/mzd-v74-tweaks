"""Assemble the owned ES5 resident from public source; no device deployment."""
from pathlib import Path
ROOT=Path(__file__).resolve().parent
TARGET=ROOT.parents[1]/'usb/tweaks/wallpaper-manager'
parts=[ROOT/'preview/core.js',ROOT/'preview/native-menu.js',ROOT/'cmu/import-client.js']
bundle='\n'.join(p.read_text(encoding='utf-8') for p in parts)
bundle+='\nwindow.MzdGuiResidents.register("wallpaper-manager",function (context) {\n'
bundle+=(ROOT/'cmu/host.js').read_text(encoding='utf-8')+'\n});\n'
(TARGET/'assets/resident.js').write_bytes(bundle.encode('utf-8'))
assert not list((TARGET/'assets').rglob('*.png'))
print('Wallpaper Manager resident assembled; no images bundled or device changed.')
