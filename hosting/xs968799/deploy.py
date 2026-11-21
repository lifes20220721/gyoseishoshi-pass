"""Place the prepared static sites on xs968799 only. No DNS or deletion commands."""
import argparse
from contextlib import closing
import ftplib
import hashlib
import http.client
import io
import json
import os
from pathlib import Path, PurePosixPath
import secrets
import socket
import ssl
import zipfile

ROOT = Path(__file__).resolve().parent
HOST, ACCOUNT, IP = 'sv17319.xserver.jp', 'xs968799', '85.131.200.80'
DOMAINS = ('gyoseishoshipass.com', 'shihoshoshipass.com')


def digest(body):
    return hashlib.sha256(body).hexdigest()


def load_release():
    release = json.loads((ROOT / 'release.json').read_text())
    if (release['server_id'], release['ftp_host'], release['ipv4']) != (ACCOUNT, HOST, IP):
        raise ValueError('WRONG_SERVER_PROFILE')
    if tuple(s['domain'] for s in release['sites']) != DOMAINS:
        raise ValueError('WRONG_DOMAIN_PROFILE')
    sites = {}
    for site in release['sites']:
        archive_path = ROOT / 'packages' / site['archive']
        if digest(archive_path.read_bytes()) != site['archive_sha256']:
            raise ValueError('ARCHIVE_HASH_MISMATCH')
        with zipfile.ZipFile(archive_path) as archive:
            names = archive.namelist()
            if archive.testzip() or len(names) != len(set(names)):
                raise ValueError('INVALID_ARCHIVE')
            files = {}
            for name in names:
                path = PurePosixPath(name)
                if (not name or name.startswith('/') or '\\' in name or
                        any(c in name for c in '\r\n\x00') or
                        any(p in ('..', '.git', '.env', 'private', 'node_modules') for p in path.parts) or
                        str(path) != name):
                    raise ValueError('UNSAFE_ARCHIVE_PATH')
                if name in ('.htaccess', '.user.ini') or name.endswith(('.php', '.pem', '.key')):
                    raise ValueError('NON_STATIC_PAYLOAD')
                files[name] = archive.read(name)
        if {n: digest(b) for n, b in files.items()} != site['files']:
            raise ValueError('FILE_MANIFEST_MISMATCH')
        if not {'index.html', 'manifest.webmanifest', 'service-worker.js'} <= files.keys():
            raise ValueError('INCOMPLETE_SITE')
        sites[site['domain']] = files
    return sites


class SessionFTP(ftplib.FTP_TLS):
    """Verify both control/data TLS, reusing the authenticated TLS session."""
    def ntransfercmd(self, cmd, rest=None):
        conn, size = ftplib.FTP.ntransfercmd(self, cmd, rest)
        if self._prot_p:
            try:
                conn = self.context.wrap_socket(conn, server_hostname=self.host,
                                                session=self.sock.session)
            except Exception:
                conn.close()
                raise
        return conn, size


class Remote:
    def __init__(self, ftp):
        self.ftp = ftp
        self.listings = {}
        self.dirs = {'.'}

    def listing(self, path):
        key = str(path)
        if key not in self.listings:
            entries = {}
            for name, facts in self.ftp.mlsd(key):
                if facts.get('type') in ('cdir', 'pdir'):
                    continue
                name = PurePosixPath(name).name
                if name in entries:
                    raise ValueError('DUPLICATE_REMOTE_NAME')
                entries[name] = facts
            self.listings[key] = entries
        return self.listings[key]

    def exists(self, path, kind):
        path = PurePosixPath(path)
        if str(path) == '.':
            return True
        if not self.exists(path.parent, 'dir'):
            return False
        entry = self.listing(path.parent).get(path.name)
        if entry and entry.get('type') != kind:
            raise ValueError('UNEXPECTED_REMOTE_TYPE: ' + str(path))
        if entry and kind == 'dir':
            self.dirs.add(str(path))
        return bool(entry)

    def mkdirs(self, path):
        path = PurePosixPath(path)
        if str(path) in self.dirs:
            return
        self.mkdirs(path.parent)
        if not self.exists(path, 'dir'):
            self.ftp.mkd(str(path))
            self.listings.pop(str(path.parent), None)
        self.dirs.add(str(path))

    def read(self, path):
        body = io.BytesIO()
        def append(chunk):
            if body.tell() + len(chunk) > 100 * 1024 * 1024:
                raise ValueError('REMOTE_FILE_TOO_LARGE')
            body.write(chunk)
        self.ftp.retrbinary('RETR ' + str(path), append, blocksize=65536)
        return body.getvalue()

    def store(self, path, body):
        self.mkdirs(PurePosixPath(path).parent)
        self.ftp.storbinary('STOR ' + str(path), io.BytesIO(body), blocksize=65536)
        self.listings.pop(str(PurePosixPath(path).parent), None)
        if digest(self.read(path)) != digest(body):
            raise ValueError('STAGED_HASH_MISMATCH')

    def move(self, source, target):
        self.mkdirs(PurePosixPath(target).parent)
        self.ftp.rename(str(source), str(target))
        for path in (source, target):
            self.listings.pop(str(PurePosixPath(path).parent), None)


def preflight(remote, sites):
    if tuple(sites) != DOMAINS:
        raise ValueError('BOTH_ALLOWED_SITES_REQUIRED')
    originals, report = {}, []
    for domain, files in sites.items():
        root = PurePosixPath(domain) / 'public_html'
        if not remote.exists(root, 'dir'):
            raise ValueError('DOMAIN_NOT_CONFIGURED: ' + domain)
        entries = remote.listing(root)
        if {'index.php', 'wp-config.php'} & entries.keys():
            raise ValueError('EXISTING_DYNAMIC_SITE: ' + domain)
        existing = 0
        for name in files:
            path = str(root / name)
            originals[path] = remote.read(path) if remote.exists(path, 'file') else None
            existing += originals[path] is not None
        report.append({'domain': domain, 'path': str(root), 'files': len(files),
                       'existing_managed_files': existing, 'status': 'READY'})
    return originals, report


def verify(remote, sites):
    result = []
    for domain, files in sites.items():
        for name, body in files.items():
            if digest(remote.read(PurePosixPath(domain) / 'public_html' / name)) != digest(body):
                raise ValueError('PLACED_HASH_MISMATCH: ' + domain + '/' + name)
        result.append({'domain': domain, 'verified_files': len(files), 'all_sha256_match': True})
    return result


def backup_inventory(remote, sites):
    inventory = []
    base = PurePosixPath('.pass-placement')
    for batch, facts in remote.listing(base).items():
        if len(batch) != 20 or any(c not in '0123456789abcdef' for c in batch) or facts.get('type') != 'dir':
            continue
        backups = []
        for domain, files in sites.items():
            for name in files:
                path = base / batch / 'backup' / domain / name
                if remote.exists(path, 'file'):
                    data = remote.read(path)
                    backups.append({'domain': domain, 'file': name, 'sha256': digest(data), 'bytes': len(data)})
        inventory.append({'backup_directory': str(base / batch / 'backup'), 'files': backups})
    return inventory


def place(remote, sites, batch):
    if not batch.isalnum():
        raise ValueError('INVALID_BATCH')
    originals, targets = preflight(remote, sites)
    private = PurePosixPath('.pass-placement') / batch
    if remote.exists(private, 'dir'):
        raise ValueError('BATCH_ALREADY_EXISTS')
    print('PREFLIGHT', json.dumps(targets), flush=True)
    for domain, files in sites.items():
        for name, body in files.items():
            old = originals[str(PurePosixPath(domain) / 'public_html' / name)]
            if old is not None:
                remote.store(private / 'backup' / domain / name, old)
            remote.store(private / 'stage' / domain / name, body)
        print('STAGED_AND_VERIFIED', domain, len(files), flush=True)
    journal = []
    try:
        tasks = [(d, n) for d, files in sites.items() for n in files]
        tasks.sort(key=lambda t: (t[1] == 'service-worker.js', t[1] == 'index.html', t))
        for domain, name in tasks:
            target = str(PurePosixPath(domain) / 'public_html' / name)
            parked = str(private / 'original' / domain / name)
            old = originals[target]
            # Detect another writer before replacing any existing file.
            remote.listings.pop(str(PurePosixPath(target).parent), None)
            if remote.exists(target, 'file') != (old is not None):
                raise ValueError('TARGET_CHANGED_DURING_STAGING')
            if old is not None and remote.read(target) != old:
                raise ValueError('TARGET_CHANGED_DURING_STAGING')
            entry = {'target': target, 'parked': parked, 'old_moved': False, 'new_moved': False}
            journal.append(entry)
            if old is not None:
                remote.move(target, parked)
                entry['old_moved'] = True
            remote.move(private / 'stage' / domain / name, target)
            entry['new_moved'] = True
        verified = verify(remote, sites)
    except Exception:
        failures = []
        for i, entry in reversed(list(enumerate(journal))):
            try:
                if entry['new_moved']:
                    remote.move(entry['target'], private / 'failed' / str(i))
                if entry['old_moved']:
                    remote.move(entry['parked'], entry['target'])
                old = originals[entry['target']]
                if old is not None and remote.read(entry['target']) != old:
                    raise ValueError('RESTORE_HASH_MISMATCH')
            except Exception:
                failures.append(entry['target'])
        raise RuntimeError(('ROLLBACK_INCOMPLETE' if failures else 'PLACEMENT_FAILED_ROLLED_BACK') +
                           ': ' + str(private)) from None
    return {'server_id': ACCOUNT, 'targets': targets, 'verification': verified,
            'backup_directory': str(private / 'backup'), 'batch_directory': str(private),
            'dns_changed': False, 'settings_deleted': False, 'contracts_cancelled': False}


class OldServerHTTP(http.client.HTTPConnection):
    def connect(self):
        self.sock = socket.create_connection((IP, 80), self.timeout)


def http_verify(sites):
    """Bypass public DNS; do not follow redirects to a different server."""
    results = []
    for domain, files in sites.items():
        checked, errors = 0, []
        for name, body in files.items():
            try:
                with closing(OldServerHTTP(domain, timeout=30)) as connection:
                    connection.request('GET', '/' + name, headers={'Cache-Control': 'no-cache'})
                    response = connection.getresponse()
                    data = response.read(100 * 1024 * 1024 + 1)
                    if response.status != 200 or digest(data) != digest(body):
                        errors.append({'file': name, 'http_status': response.status, 'sha256_match': False})
                    else:
                        checked += 1
            except (OSError, http.client.HTTPException) as error:
                errors.append({'file': name, 'error_type': type(error).__name__})
        results.append({'domain': domain, 'direct_ipv4': IP, 'verified_files': checked,
                        'total_files': len(files), 'errors': errors,
                        'public_dns_used': False, 'https_pending': True})
    return results


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--action', choices=('inspect', 'place-both', 'verify'), default='inspect')
    parser.add_argument('--report', type=Path, default=Path('placement-report.json'))
    args = parser.parse_args()
    sites = load_release()
    password = os.environ.get('XSERVER_XS968799_FTP_PASSWORD')
    if not password:
        raise ValueError('OLD_SERVER_SECRET_MISSING')
    if set(socket.gethostbyname_ex(HOST)[2]) != {IP}:
        raise ValueError('OLD_SERVER_IP_CHANGED')
    report = {'server_id': ACCOUNT, 'action': args.action, 'dns_changed': False}
    with SessionFTP(context=ssl.create_default_context(), timeout=60) as ftp:
        ftp.connect(HOST, 21)
        ftp.login(ACCOUNT, password)
        ftp.prot_p()
        if ftp.pwd() not in ('/', '/home/xs968799', '/home/xs968799/'):
            raise ValueError('UNEXPECTED_OLD_FTP_HOME')
        remote = Remote(ftp)
        if args.action == 'inspect':
            _, report['targets'] = preflight(remote, sites)
            report['server_files_written'] = False
        elif args.action == 'place-both':
            report.update(place(remote, sites, secrets.token_hex(10)))
        else:
            report['verification'] = verify(remote, sites)
            report['private_backups'] = backup_inventory(remote, sites)
    if args.action != 'inspect':
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        print('FTP_VERIFICATION_RESULT', json.dumps(report), flush=True)
        report['http_verification'] = http_verify(sites)
    args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print('OLD_SERVER_RESULT', json.dumps(report), flush=True)
    if any(item['errors'] for item in report.get('http_verification', [])):
        raise SystemExit('HTTP_VERIFICATION_INCOMPLETE: see saved report')


if __name__ == '__main__':
    main()
