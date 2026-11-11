"""Developer validation for the literal runtime settings schema (no execution)."""
import re

NAME = re.compile(r'[a-z][a-z0-9_]{0,31}')
TOKEN = re.compile(r'[a-z0-9][a-z0-9_-]{0,31}')
FIELDS = {'type', 'label', 'default', 'min', 'max', 'step', 'unit', 'help', 'options', 'asset', 'asset_source', 'asset_when'}


def integer(value):
    return bool(re.fullmatch(r'0|[1-9][0-9]*', value)) and len(value) <= 10 and int(value) <= 2147483647


def definitions(raw):
    names = raw.get('settings', '').split(' ') if raw.get('settings', '') else []
    if len(names) > 16 or len(set(names)) != len(names) or any(not NAME.fullmatch(n) for n in names):
        raise ValueError('Invalid settings list.')
    result = {n: {} for n in names}
    for key, value in raw.items():
        if not key.startswith('setting.'):
            continue
        parts = key.split('.')
        if len(parts) != 3 or parts[1] not in result or parts[2] not in FIELDS or len(value.encode('utf-8')) > (4096 if parts[2] == 'options' else 256):
            raise ValueError('Invalid setting field: ' + key)
        result[parts[1]][parts[2]] = value
    seen_assets = set()
    for name, d in result.items():
        kind = d.get('type')
        if kind not in ('number', 'boolean', 'choice') or not d.get('label') or 'default' not in d:
            raise ValueError('Setting needs a type, label and default: ' + name)
        if kind == 'number':
            if not all(integer(d.get(k, '')) for k in ('min', 'max', 'step')) or int(d['step']) == 0 or int(d['min']) > int(d['max']):
                raise ValueError('Invalid numeric bounds: ' + name)
        elif any(k in d for k in ('min', 'max', 'step', 'unit')):
            raise ValueError('Numeric fields on non-number setting: ' + name)
        if kind == 'choice':
            options = d.get('options', '').split(' ')
            if len(options) > 64 or len(set(options)) != len(options) or any(not TOKEN.fullmatch(o) for o in options):
                raise ValueError('Invalid choices: ' + name)
        elif 'options' in d:
            raise ValueError('Options on non-choice setting: ' + name)
        if any(k in d for k in ('asset', 'asset_source', 'asset_when')):
            if (kind != 'choice' or not all(k in d for k in ('asset', 'asset_source', 'asset_when'))
                or any(not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.-]*\.(conf|key)', d[k]) for k in ('asset', 'asset_source'))
                or not valid(d, d['asset_when']) or d['asset'] in seen_assets):
                raise ValueError('Invalid conditional asset: ' + name)
            seen_assets.add(d['asset'])
        if not valid(d, d['default']):
            raise ValueError('Invalid default: ' + name)
    return result


def valid(d, value):
    if d['type'] == 'number':
        return integer(value) and int(d['min']) <= int(value) <= int(d['max']) and (int(value) - int(d['min'])) % int(d['step']) == 0
    if d['type'] == 'boolean':
        return value in ('true', 'false')
    return value in d['options'].split(' ')
