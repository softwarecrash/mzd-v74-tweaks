"""Developer-side validation of the literal component table and config maps."""
import re


def read(manifest, values):
    folder = manifest.parent
    table = folder / values['components']
    if not table.is_file() or table.is_symlink():
        raise ValueError('Missing or linked component table.')
    rows = []
    seen, checks = set(), set()
    primary = loaders = shims = 0
    if values.get('payload_dir'):
        prefix = values['payload_dir'] + '/'
    else:
        prefix = '/tmp/mnt/data_persist/mzd-tweaks/shims/' + values['id'] + '/'

    def safe(path, absolute=True):
        return bool(re.fullmatch(r'/[A-Za-z0-9_./-]+' if absolute else r'assets/[A-Za-z0-9_./-]+', path)) and not any(p in ('.', '..') for p in path.split('/')) and '//' not in path

    for line in table.read_bytes().decode('utf-8').split('\n'):
        line = line.removesuffix('\r')
        if not line or line.startswith('#'):
            continue
        fields = line.split('\t')
        if len(fields) != 5 or '\r' in line or len(rows) >= 64:
            raise ValueError('Expected at most 64 five-column component records.')
        kind, target, source, service, md5 = (f.strip() for f in fields)
        if not safe(target):
            raise ValueError('Invalid component target.')
        if kind == 'check':
            if source != '-' or service != '-' or not re.fullmatch('[0-9a-f]{32}', md5) or target in checks:
                raise ValueError('Invalid native module check.')
            checks.add(target)
        else:
            if target in seen:
                raise ValueError('Duplicate component target.')
            seen.add(target)
            if kind in ('loader', 'patch'):
                if not re.fullmatch('[0-9a-f]{32}', md5) or service != '-':
                    raise ValueError('Missing OEM fingerprint.')
                if target == values['target'] and md5 == values['oem_backup_md5']:
                    primary += 1
                if kind == 'loader':
                    loaders += 1
                    if source != '-' or loaders > 8:
                        raise ValueError('Invalid loader record.')
                elif not safe(source, False):
                    raise ValueError('Invalid patch source.')
            elif kind in ('shim', 'file', 'config', 'executable'):
                leaf = target[len(prefix):]
                if not target.startswith(prefix) or not leaf or '/' in leaf or leaf.startswith('.') or md5 != '-' or not safe(source, False):
                    raise ValueError('Payload must be a direct file in its private persistent folder.')
                if kind == 'shim':
                    shims += 1
                    if not re.fullmatch('[A-Za-z0-9_.-]+', service) or not target.endswith('.so') or not source.endswith('.so') or shims > 16:
                        raise ValueError('Invalid shim record.')
                elif service != '-':
                    raise ValueError('Unexpected component service.')
                if kind == 'config':
                    mapping = folder / source
                    if not mapping.is_file() or mapping.is_symlink():
                        raise ValueError('Missing configuration map.')
                    keys = set()
                    for record in mapping.read_bytes().decode('utf-8').split('\n'):
                        record = record.removesuffix('\r')
                        if not record or record.startswith('#'):
                            continue
                        pair = record.split('\t')
                        if len(pair) != 2 or not re.fullmatch('[A-Za-z][A-Za-z0-9_.-]*', pair[0]) or pair[0] in keys or pair[1] not in values['setting_definitions']:
                            raise ValueError('Invalid configuration mapping or unknown setting.')
                        keys.add(pair[0])
                    if not keys:
                        raise ValueError('Empty configuration map.')
            else:
                raise ValueError('Unknown component kind.')
        rows.append(fields)
    if primary != 1 or not rows or (shims and not loaders):
        raise ValueError('Missing primary target or shim loader.')
    return rows
