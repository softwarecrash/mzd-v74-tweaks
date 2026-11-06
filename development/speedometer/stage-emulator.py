"""Stage the speedometer design draft in our private browser emulator only."""
from pathlib import Path
import json
import shutil
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
SOURCE = Path(__file__).resolve().parent
EMU = ROOT / 'private/emulator/mzd-emu'
base = EMU / 'data/integration'
assert (EMU / 'jci/gui/index.html').is_file(), 'Prepare the private MZD emulator first.'
assert base.resolve().is_relative_to((ROOT / 'private/emulator').resolve())
hook = base / 'developer_mode_GuiConfig.js'
assert not hook.exists() or (base / '.gui-helper-test-owner').exists(), 'Refusing a foreign emulator hook.'
registry = base / 'mzd-gui-registry.js'
modules = []
if registry.exists():
    text = registry.read_text(encoding='utf-8').strip()
    prefix = 'window.mzdGuiRegistry='
    assert text.startswith(prefix) and text.endswith(';'), 'Unexpected emulator registry.'
    value = json.loads(text[len(prefix):-1])
    assert value.get('api') == 1 and isinstance(value.get('modules'), list)
    modules = [m for m in value['modules'] if m.get('id') != 'speedometer']
    backups = ROOT / 'private/designs/speedometer/emulator-backups'
    backups.mkdir(parents=True, exist_ok=True)
    shutil.copy2(registry, backups / ('registry-' + datetime.now(timezone.utc).strftime('%Y%m%d-%H%M%S-%f') + '.js'))
destination = base / 'mzd-gui-modules/speedometer/assets'
assert destination.resolve().is_relative_to(base.resolve())
shutil.copytree(SOURCE / 'assets', destination, dirs_exist_ok=True)
shutil.copytree(ROOT / 'usb/lib/gui-runtime', base / 'mzd-gui-runtime', dirs_exist_ok=True)
shutil.copy2(ROOT / 'usb/lib/gui-runtime/boot.js', hook)
url = '/data/integration/mzd-gui-modules/speedometer/assets/'
modules.append({'id': 'speedometer', 'menuPath': '', 'label': 'Speedometer',
                'entrypoint': url + 'view.html', 'resident': url + 'resident.js',
                'translations': url + 'i18n.js'})
registry.write_text('window.mzdGuiRegistry=' + json.dumps({'api': 1, 'modules': modules}) + ';\n', encoding='utf-8', newline='\n')
(base / '.gui-helper-test-owner').write_text('Private browser emulator fixture only.\n', encoding='utf-8')
print('STAGED: Applications > Speedometer (simulated data only).')
print('http://localhost:8080/jci/gui/index.html?test=speedometer-bm2014')
