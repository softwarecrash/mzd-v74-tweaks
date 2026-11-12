"""Developer-side reader for the same data-only manifest.conf grammar as sh/JS."""
import re
from settings_schema import definitions

FIELDS = ('contract_version id name description version type group firmware '
          'entrypoint actions target oem_backup_md5 lock_group status_scope '
          'reboot_required requires conflicts progress confirmation refresh_all reset_entrypoint settings shim_service shim_asset shim_path shim_extra_targets shim_checks components contributors payload_dir gui_api gui_menu_path gui_label gui_entrypoint gui_resident gui_service gui_translations preflight').split()
REQUIRED = set(FIELDS) - {'target', 'oem_backup_md5', 'lock_group', 'progress', 'confirmation', 'refresh_all', 'reset_entrypoint', 'settings', 'shim_service', 'shim_asset', 'shim_path', 'shim_extra_targets', 'shim_checks', 'components', 'contributors', 'payload_dir', 'gui_api', 'gui_menu_path', 'gui_label', 'gui_entrypoint', 'gui_resident', 'gui_service', 'gui_translations', 'preflight'}
ID = re.compile(r'^[a-z0-9]+(?:-[a-z0-9]+)*$')
VERSION = re.compile(r'^[0-9]+\.[0-9]+\.[0-9]+$')

def parse(text):
    values = {}
    for line in text.split('\n'):
        line = line.removesuffix('\r')
        if any(ord(c) < 32 or ord(c) == 127 for c in line):
            raise ValueError('Control characters are not allowed.')
        if not line.strip() or line.startswith('#'):
            continue
        if '=' not in line:
            raise ValueError('Expected KEY=VALUE.')
        key, value = line.split('=', 1)
        if key not in FIELDS and not key.startswith('setting.') and not key.startswith('config.'):
            raise ValueError('Unknown manifest field: ' + key)
        if key in values:
            raise ValueError('Duplicate manifest field: ' + key)
        values[key] = value
    if REQUIRED - values.keys():
        raise ValueError('Missing fields: ' + ', '.join(sorted(REQUIRED - values.keys())))
    if values['contract_version'] != '1' or values['entrypoint'] != 'run.sh':
        raise ValueError('Unsupported contract or entrypoint.')
    if not ID.fullmatch(values['id']) or not ID.fullmatch(values['group']):
        raise ValueError('Invalid ID/group.')
    if not values['name'] or not values['description']:
        raise ValueError('Name and description are required.')
    if not VERSION.fullmatch(values['version']) or not VERSION.fullmatch(values['firmware']):
        raise ValueError('Expected one numeric version/firmware with three components.')
    configs=sorted({key.split('.')[1] for key in values if key.startswith('config.') and len(key.split('.'))==3})
    if len(configs)>32 or any(not re.fullmatch(r'[a-z][a-z0-9_]{0,31}', k) for k in configs):
        raise ValueError('Invalid config names.')
    targets=[]
    for key in values:
        if key.startswith('config.'):
            parts=key.split('.')
            if len(values[key])>512 or len(parts)!=3 or parts[1] not in configs or parts[2] not in ['path','source']:
                raise ValueError('Unknown config field.')
    for name in configs:
        target=values.get('config.'+name+'.path','');kind='dir' if target.endswith('/') else 'file';source=values.get('config.'+name+'.source','-')
        if '//' in target:raise ValueError('Invalid config path.')
        if kind=='dir':target=target[:-1];source=source.removesuffix('/')
        scope=re.search(r'/mzd-tweaks/(data|gui-data|shims)(?:/([^/]+))?',target)
        if kind=='dir' and not any(target==p or target.startswith(p+'/') for p in ['/tmp/mnt/data_persist/mzd-tweaks/'+area+'/'+values['id'] for area in ['data','gui-data']]):
            raise ValueError('Config directory must be inside its own app data namespace.')
        if scope and scope.group(2)!=values['id']:raise ValueError('Config overlaps another app namespace.')
        if re.search(r'/mzd-tweaks/(installed|gui-provider|config-owners)($|/)|/mzd-tweaks$',target):raise ValueError('Config overlaps installer metadata.')
        if values['type']=='command' or kind not in ['file','dir'] or not re.fullmatch(r'/[A-Za-z0-9_./-]+',target) or re.search(r'/\.\.?($|/)|//|/$',target):
            raise ValueError('Invalid config type/path.')
        if source!='-' and (not re.fullmatch(r'assets/[A-Za-z0-9_./-]+',source) or re.search(r'/\.\.?($|/)|//|/$',source)):
            raise ValueError('Invalid config source.')
        if any(target==p or target.startswith(p+'/') or p.startswith(target+'/') for p in targets):
            raise ValueError('Overlapping config paths.')
        targets.append(target)
    expected = 'run status' if values['type'] == 'command' else 'install uninstall status'
    if values['type'] not in ['command', 'patch', 'service', 'files', 'gui-extension'] or values['actions'] != expected:
        raise ValueError('Invalid type/actions.')
    if values['status_scope'] not in ['target-patch', 'configuration', 'payload', 'service-health']:
        raise ValueError('Invalid status scope.')
    if values['reboot_required'] not in ['true', 'false']:
        raise ValueError('Expected true/false.')
    for key in ['requires', 'conflicts']:
        if not re.fullmatch('[a-z0-9 -]*', values[key]) or any(not ID.fullmatch(x) for x in values[key].split()):
            raise ValueError('Invalid dependency list.')
        if len(values[key].split()) != len(set(values[key].split())):
            raise ValueError('Duplicate dependency ID.')
    if values['type'] == 'gui-extension' or values.get('gui_api'):
        for key, suffix in [('gui_resident', 'js'), ('gui_service', 'lua'), ('gui_translations', 'js')]:
            path = values.get(key, '')
            if key in values and not path:
                raise ValueError('GUI capability paths cannot be empty.')
            if path and (not re.fullmatch(r'assets/[A-Za-z0-9_./-]+[.]'+suffix, path) or re.search(r'(^|/)\.\.?($|/)', path)):
                raise ValueError('Invalid GUI capability path.')
        if values.get('gui_service') and not values.get('gui_resident'):
            raise ValueError('A GUI service requires a resident controller.')
        menu_path = values.get('gui_menu_path', '')
        segments = menu_path.split('/') if menu_path else []
        if len(menu_path)>240 or len(segments)>8 or any(not x or x in ['.','..'] or len(x)>80 or x.strip()!=x for x in segments):
            raise ValueError('Invalid GUI menu path.')
        if values['id'] in ['games', 'exit']:
            raise ValueError('Reserved GUI extension ID.')
        if (values.get('gui_api') != '1'
                or not 1 <= len(values.get('gui_label', '')) <= 80 or values.get('reset_entrypoint') != 'reset.sh'
                or values['reboot_required'] != 'true' or values['status_scope'] != 'payload'
                or not re.fullmatch(r'assets/[A-Za-z0-9_./-]+[.]html', values.get('gui_entrypoint', ''))
                or any(x in ['.', '..'] for x in values['gui_entrypoint'].split('/'))):
            raise ValueError('Invalid GUI extension metadata.')
        if values['type'] == 'gui-extension' and any(values.get(k) for k in ['target','oem_backup_md5','lock_group','components','shim_asset']):
            raise ValueError('Invalid GUI extension metadata.')
    elif any(k in values for k in ['gui_resident','gui_service','gui_translations']) or any(values.get(k) for k in ['gui_api','gui_menu_path','gui_label','gui_entrypoint','gui_resident','gui_service','gui_translations']):
        raise ValueError('GUI metadata requires gui-extension type or gui_api=1.')
    if values['type'] not in ['command', 'gui-extension']:
        if not values.get('target', '').startswith('/'):
            raise ValueError('An absolute target is required.')
        if not re.fullmatch('[0-9a-f]{32}', values.get('oem_backup_md5', '')):
            raise ValueError('Invalid OEM backup checksum.')
        if not re.fullmatch('[A-Za-z0-9_-]+', values.get('lock_group', '')):
            raise ValueError('Invalid lock group.')
    if values.get('progress', 'false') not in ['true', 'false']:
        raise ValueError('Expected true/false for progress.')
    if values.get('refresh_all', 'false') not in ['true', 'false']:
        raise ValueError('Expected true/false for refresh_all.')
    if values.get('preflight', 'false') not in ['true', 'false']:
        raise ValueError('Expected true/false for preflight.')
    if values.get('reset_entrypoint', '') not in ['', 'reset.sh']:
        raise ValueError('Reset entrypoint must be reset.sh.')
    if any(values.get(k) for k in ('shim_service', 'shim_asset', 'shim_path', 'shim_extra_targets', 'shim_checks')):
        if values['type'] != 'files' or values.get('reset_entrypoint') != 'reset.sh' or values['reboot_required'] != 'true':
            raise ValueError('Shims require files, reset.sh and reboot_required=true.')
        if not re.fullmatch('[A-Za-z0-9_.-]+', values.get('shim_service', '')):
            raise ValueError('Invalid shim service.')
        asset = values.get('shim_asset', '')
        dest = values.get('shim_path', '')
        for path in [asset, dest, values.get('target', '')]:
            if not re.fullmatch('[A-Za-z0-9_./-]+', path) or any(x in ('.', '..') for x in path.split('/')):
                raise ValueError('Unsupported shim path.')
        if not asset.startswith('assets/') or not asset.endswith('.so'):
            raise ValueError('Shim asset must be an assets/*.so file.')
        prefix = '/tmp/mnt/data_persist/mzd-tweaks/shims/'+values['id']+'/'
        if not dest.startswith(prefix) or '/' in dest[len(prefix):] or not dest.endswith('.so') or dest[len(prefix):].startswith('.'):
            raise ValueError('Invalid persistent shim destination.')
        for field in ('shim_extra_targets', 'shim_checks'):
            records = values.get(field, '').split()
            paths = [pair.split(':')[0] for pair in records]
            if len(records) > (7 if field == 'shim_extra_targets' else 16) or len(set(paths)) != len(paths) or (field == 'shim_extra_targets' and values['target'] in paths):
                raise ValueError('Duplicate or excessive shim records.')
            for pair in records:
                if not re.fullmatch(r'/[A-Za-z0-9_./-]+:[0-9a-f]{32}', pair) or any(x in ('.', '..') for x in pair.split(':')[0].split('/')):
                    raise ValueError('Invalid shim path:OEM-MD5 record.')
    if values.get('components'):
        if (values['components'] != 'components.tsv' or values['type'] != 'files'
                or values.get('reset_entrypoint') != 'reset.sh' or values['reboot_required'] != 'true'
                or values.get('lock_group') not in ('sm-config', 'jci-gui')):
            raise ValueError('Invalid component bundle metadata.')
        if any(values.get(k) for k in ('shim_service', 'shim_asset', 'shim_path', 'shim_extra_targets', 'shim_checks')):
            raise ValueError('Use either components or single-shim metadata.')
        if values.get('payload_dir'):
            pdir = values['payload_dir']
            if not pdir.startswith('/tmp/mnt/data_persist/') or any(x in ('.', '..') for x in pdir.split('/')) or not re.fullmatch(r'/[A-Za-z0-9_./-]+', pdir):
                raise ValueError('Invalid persistent payload directory.')
    schema = definitions(values)
    result = dict(values)
    result['setting_definitions'] = schema
    result['refresh_all'] = values.get('refresh_all', 'false') == 'true'
    result['progress'] = values.get('progress', 'false') == 'true'
    result['contract_version'] = 1
    for key in ['firmware', 'actions', 'requires', 'conflicts']:
        result[key] = values[key].split()
    result['reboot_required'] = values['reboot_required'] == 'true'
    return result

def read(path):
    result = parse(path.read_text(encoding='utf-8'))
    if result.get('components'):
        from component_schema import read as read_components
        read_components(path, result)
    return result
