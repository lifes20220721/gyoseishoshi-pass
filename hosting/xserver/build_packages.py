"""Build a paired static release; reuse the already prepared administrative ZIP."""
import argparse
import ast
import hashlib
import json
import posixpath
from pathlib import Path, PurePosixPath
import re
import shutil
import zipfile

ROOT = Path(__file__).resolve().parent
PLAN = json.loads((ROOT / 'plan.json').read_text())


def digest(data):
    return hashlib.sha256(data).hexdigest()


def inspect_archive(path):
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)) or archive.testzip():
            raise ValueError('INVALID_ARCHIVE')
        for name in names:
            parts = PurePosixPath(name).parts
            if not parts or name.startswith('/') or '..' in parts or '\\' in name:
                raise ValueError('UNSAFE_ARCHIVE_PATH')
            if any(part in ('.git', '.env', 'private', 'node_modules') for part in parts):
                raise ValueError('NON_PUBLIC_FILE')
        blobs = {name: archive.read(name) for name in names if not name.endswith('/')}
    for required in ('index.html', 'service-worker.js', 'manifest.webmanifest'):
        if required not in blobs:
            raise ValueError('MISSING_REQUIRED_ASSET: ' + required)
    for name, body in blobs.items():
        if name.endswith(('.html', '.css')):
            for reference in re.findall(r'(?:src|href)=["\']([^"\']+)["\']', body.decode()):
                if reference.startswith(('https:', 'http:', '//', '#', 'mailto:', 'data:')):
                    continue
                reference = reference.split('?', 1)[0].split('#', 1)[0]
                if reference in ('', './'):
                    continue
                reference = posixpath.normpath(str(PurePosixPath(name).parent / reference.removeprefix('./')))
                if reference not in blobs:
                    raise ValueError('MISSING_LINKED_ASSET: ' + reference)
    worker = blobs['service-worker.js'].decode()
    for key in ('ASSETS', 'CORE_FILES'):
        match = re.search(r'const ' + key + r'\s*=\s*(\[.*?\]);', worker, re.S)
        if match:
            for asset in ast.literal_eval(match.group(1)):
                asset = asset.removeprefix('./').split('?', 1)[0]
                if asset and asset not in blobs:
                    raise ValueError('MISSING_OFFLINE_ASSET: ' + asset)
    return blobs


def build(judicial_source, output):
    output.mkdir(parents=True, exist_ok=True)
    prepared = ROOT / 'packages' / 'gyoseishoshi-pass.zip'
    if digest(prepared.read_bytes()) != PLAN['sites'][0]['prepared_archive_sha256']:
        raise ValueError('PREPARED_ARCHIVE_CHANGED')
    shutil.copyfile(prepared, output / 'gyoseishoshi-pass.zip')
    assets = json.loads((judicial_source / 'scripts/assets.json').read_text())
    names = set(assets['scripts'] + assets['styles'])
    names.update(['index.html', 'service-worker.js', 'manifest.webmanifest', 'privacy.html', 'contact.html', 'sources.html'])
    names.update(p.name for p in judicial_source.glob('*.json') if p.name != 'package.json')
    for directory in ('icons', 'past-exams', 'app-privacy', '.well-known'):
        names.update(str(p.relative_to(judicial_source)) for p in (judicial_source / directory).rglob('*') if p.is_file())
    for optional in ('robots.txt', 'sitemap.xml', 'ads.txt'):
        if (judicial_source / optional).is_file():
            names.add(optional)
    # Policy pages may still refer to a legacy shared stylesheet.
    checked = set()
    while names - checked:
        name = (names - checked).pop()
        checked.add(name)
        if not name.endswith(('.html', '.css')):
            continue
        body = (judicial_source / name).read_text()
        for reference in re.findall(r'(?:src|href)=["\']([^"\']+)["\']', body):
            if reference.startswith(('https:', 'http:', '//', '#', 'mailto:', 'data:')):
                continue
            reference = reference.split('?', 1)[0].split('#', 1)[0]
            if reference in ('', './'):
                continue
            reference = posixpath.normpath(str(PurePosixPath(name).parent / reference.removeprefix('./')))
            if reference.startswith(('/', '../')) or not (judicial_source / reference).is_file():
                raise ValueError('MISSING_SOURCE_ASSET: ' + reference)
            names.add(reference)
    with zipfile.ZipFile(output / 'shihoshoshi-pass.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
        for name in sorted(names):
            archive.write(judicial_source / name, name)
    report = {'server_id': PLAN['server_id'], 'dns_changed': False, 'sites': []}
    for site in PLAN['sites']:
        archive = output / site['archive']
        blobs = inspect_archive(archive)
        report['sites'].append({**site, 'archive_sha256': digest(archive.read_bytes()),
                                'files': {name: digest(body) for name, body in blobs.items()}})
    (output / 'release.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'packages_verified': True, 'server_id': PLAN['server_id'],
                      'files': {site['name']: len(site['files']) for site in report['sites']}}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--judicial-source', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    build(args.judicial_source, args.output)
