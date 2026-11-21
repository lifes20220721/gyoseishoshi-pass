"""Explicit FTPS, two-site preflight, private backups, staging, and rollback. No DNS API."""
import argparse
import ftplib
import hashlib
import io
import json
import os
from pathlib import Path, PurePosixPath
import secrets
import socket
import ssl
import sys

from build_packages import PLAN, inspect_archive


def mkdirs(ftp, path):
    current = PurePosixPath('.')
    for part in PurePosixPath(path).parts:
        current /= part
        try:
            ftp.mkd(str(current))
        except ftplib.error_perm as error:
            # A 550 alone does not establish that the directory exists.
            previous = ftp.pwd()
            try:
                ftp.cwd(str(current))
            except ftplib.error_perm:
                raise error
            finally:
                ftp.cwd(previous)


def read(ftp, path):
    body = io.BytesIO()
    def append(chunk):
        if body.tell() + len(chunk) > 100 * 1024 * 1024:
            raise ValueError('REMOTE_FILE_TOO_LARGE')
        body.write(chunk)
    ftp.retrbinary('RETR ' + str(path), append)
    return body.getvalue()


def store_verified(ftp, path, body):
    mkdirs(ftp, PurePosixPath(path).parent)
    ftp.storbinary('STOR ' + str(path), io.BytesIO(body))
    if hashlib.sha256(read(ftp, path)).digest() != hashlib.sha256(body).digest():
        raise ValueError('REMOTE_HASH_MISMATCH')


def existing_file(ftp, path, cache):
    path = PurePosixPath(path)
    parent = path.parent
    if str(parent) not in cache:
        if str(parent) != '.' and not existing_directory(ftp, parent, cache):
            return False
        cache[str(parent)] = dict(ftp.mlsd(str(parent)))
    entry = cache[str(parent)].get(path.name)
    if entry and entry.get('type') != 'file':
        raise ValueError('UNEXPECTED_REMOTE_FILE_TYPE')
    return bool(entry)


def existing_directory(ftp, path, cache):
    path = PurePosixPath(path)
    if str(path) == '.':
        return True
    if str(path.parent) not in cache:
        if not existing_directory(ftp, path.parent, cache):
            return False
        cache[str(path.parent)] = dict(ftp.mlsd(str(path.parent)))
    entry = cache[str(path.parent)].get(path.name)
    if entry and entry.get('type') != 'dir':
        raise ValueError('UNEXPECTED_REMOTE_DIRECTORY_TYPE')
    return bool(entry)


def inspect_targets(ftp, sites):
    cache, results = {}, []
    allowed = {site['domain'] for site in PLAN['sites']}
    for domain, files in sites.items():
        if domain not in allowed:
            raise ValueError('UNEXPECTED_DOMAIN')
        root = PurePosixPath(domain) / 'public_html'
        if not existing_directory(ftp, root, cache):
            results.append({'domain': domain, 'status': 'DOMAIN_NOT_CONFIGURED', 'public_html_exists': False})
            continue
        entries = dict(ftp.mlsd(str(root)))
        if any(name in entries for name in ('index.php', 'wp-config.php')):
            results.append({'domain': domain, 'status': 'EXISTING_DYNAMIC_SITE', 'public_html_exists': True})
            continue
        existing = 0
        for name in files:
            path = root / name
            if existing_file(ftp, path, cache):
                read(ftp, path)
                existing += 1
        results.append({'domain': domain, 'status': 'READY', 'public_html_exists': True, 'existing_managed_files': existing})
    return {'ftp_authenticated': True, 'server_id': PLAN['server_id'], 'targets': results,
            'all_targets_ready': all(item['status'] == 'READY' for item in results),
            'uploaded': False, 'dns_changed': False}


def migrate(ftp, sites, batch, inspect_only=False):
    if not batch.isalnum():
        raise ValueError('INVALID_BATCH')
    if inspect_only:
        return inspect_targets(ftp, sites)
    cache, originals, changes = {}, {}, []
    private = PurePosixPath('.pass-migration') / batch
    # Inspect both domain folders before writing anything, including staging files.
    for domain, files in sites.items():
        if domain not in {site['domain'] for site in PLAN['sites']}:
            raise ValueError('UNEXPECTED_DOMAIN')
        root = PurePosixPath(domain) / 'public_html'
        if not existing_directory(ftp, root, cache):
            raise ValueError('DOMAIN_NOT_CONFIGURED: ' + domain)
        entries = dict(ftp.mlsd(str(root)))
        if any(name in entries for name in ('index.php', 'wp-config.php')):
            raise ValueError('EXISTING_DYNAMIC_SITE: ' + domain)
        for name in files:
            path = root / name
            originals[str(path)] = read(ftp, path) if existing_file(ftp, path, cache) else None
    existing_directory(ftp, PurePosixPath('.pass-migration'), cache)
    for domain, files in sites.items():
        for name, body in files.items():
            old = originals[str(PurePosixPath(domain) / 'public_html' / name)]
            if old is not None:
                store_verified(ftp, private / 'backup' / domain / name, old)
            store_verified(ftp, private / 'stage' / domain / name, body)
    try:
        # Offline assets first, then each entry point, then each service worker.
        tasks = [(domain, name) for domain, files in sites.items() for name in files]
        tasks.sort(key=lambda item: (item[1] == 'service-worker.js', item[1] == 'index.html', item))
        for domain, name in tasks:
            target = PurePosixPath(domain) / 'public_html' / name
            mkdirs(ftp, target.parent)
            ftp.rename(str(private / 'stage' / domain / name), str(target))
            changes.append(str(target))
        for domain, files in sites.items():
            for name, body in files.items():
                if read(ftp, PurePosixPath(domain) / 'public_html' / name) != body:
                    raise ValueError('PUBLISHED_HASH_MISMATCH')
    except Exception:
        failed = False
        for target in reversed(changes):
            try:
                if originals[target] is None:
                    ftp.delete(target)
                else:
                    store_verified(ftp, target, originals[target])
            except Exception:
                failed = True
        if failed:
            raise RuntimeError('ROLLBACK_INCOMPLETE: private backups in ' + str(private)) from None
        raise RuntimeError('PUBLICATION_FAILED_ROLLED_BACK') from None
    return {'uploaded_domains': list(sites), 'backup_directory': str(private / 'backup'), 'dns_changed': False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--packages', required=True, type=Path)
    parser.add_argument('--inspect-only', action='store_true')
    args = parser.parse_args()
    password = os.environ.get('XSERVER_FTP_PASSWORD', '')
    if not password:
        raise ValueError('MISSING_SECRET: XSERVER_FTP_PASSWORD')
    if PLAN['server_id'] != 'xs366651' or PLAN['ftp_host'] != 'sv17351.xserver.jp':
        raise ValueError('UNEXPECTED_SERVER')
    if PLAN['expected_ipv4'] not in socket.gethostbyname_ex(PLAN['ftp_host'])[2]:
        raise ValueError('SERVER_IP_CHANGED')
    sites = {site['domain']: inspect_archive(args.packages / site['archive']) for site in PLAN['sites']}
    with ftplib.FTP_TLS(context=ssl.create_default_context(), timeout=45) as ftp:
        ftp.connect(PLAN['ftp_host'], PLAN['ftp_port'])
        ftp.login(PLAN['server_id'], password)
        ftp.prot_p()
        if ftp.pwd() not in ('/', '/home/xs366651', '/home/xs366651/'):
            raise ValueError('UNEXPECTED_FTP_HOME')
        result = migrate(ftp, sites, secrets.token_hex(8), inspect_only=args.inspect_only)
        print(json.dumps(result))
        if args.inspect_only and not result['all_targets_ready']:
            raise ValueError('TARGET_DOMAINS_NOT_READY')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # FTP/server errors can contain paths or other remote text; never dump credentials or a traceback.
        known = ('MISSING_SECRET:', 'UNEXPECTED_', 'SERVER_IP_CHANGED', 'DOMAIN_NOT_CONFIGURED:',
                 'EXISTING_DYNAMIC_SITE:', 'REMOTE_', 'PUBLICATION_FAILED_', 'ROLLBACK_INCOMPLETE:',
                 'TARGET_DOMAINS_NOT_READY')
        message = str(error) if str(error).startswith(known) else type(error).__name__
        print('MIGRATION_STOPPED', message, file=sys.stderr)
        sys.exit(1)
