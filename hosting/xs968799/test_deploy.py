import ftplib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import PurePosixPath
import socket
import threading
import unittest
from unittest.mock import patch

from deploy import Remote, place, preflight, http_verify


class MemoryFTP:
    def __init__(self, fail_target=None):
        self.files = {
            'gyoseishoshipass.com/public_html/index.html': b'old administrative',
            'shihoshoshipass.com/public_html/index.html': b'old judicial',
            'gyoseishoshipass.com/public_html/.htaccess': b'server config',
            'xs968799.xsrv.jp/public_html/pass-review/index.php': b'keep API',
            'xs968799.xsrv.jp/pass-review-private/database.sqlite': b'keep state',
        }
        self.dirs = {'.'}
        for file in self.files:
            self.dirs.update(str(p) for p in PurePosixPath(file).parents)
        self.fail_target = fail_target
        self.operations = []

    def mlsd(self, path):
        if path not in self.dirs:
            raise ftplib.error_perm('550 missing directory')
        entries = {}
        for directory in self.dirs - {'.'}:
            if str(PurePosixPath(directory).parent) == path:
                entries[PurePosixPath(directory).name] = {'type': 'dir'}
        for file in self.files:
            if str(PurePosixPath(file).parent) == path:
                entries[PurePosixPath(file).name] = {'type': 'file'}
        return list(entries.items())

    def mkd(self, path):
        if str(PurePosixPath(path).parent) not in self.dirs or path in self.dirs:
            raise ftplib.error_perm('550 invalid mkdir')
        self.operations.append(('mkdir', path))
        self.dirs.add(path)

    def retrbinary(self, command, callback, blocksize=65536):
        callback(self.files[command[5:]])

    def storbinary(self, command, body, blocksize=65536):
        target = command[5:]
        self.operations.append(('store', target))
        self.files[target] = body.read()

    def rename(self, source, target):
        if target == self.fail_target:
            self.fail_target = None
            raise ftplib.error_temp('450 simulated failure after first site changed')
        if target in self.files:
            raise ftplib.error_perm('550 refuse overwrite')
        self.operations.append(('rename', source, target))
        self.files[target] = self.files.pop(source)


class PlacementTests(unittest.TestCase):
    sites = {
        'gyoseishoshipass.com': {'index.html': b'new admin', '.well-known/assetlinks.json': b'certs'},
        'shihoshoshipass.com': {'index.html': b'new judicial', 'service-worker.js': b'new worker'},
    }

    def test_success_preserves_server_settings_api_state_and_backups(self):
        ftp = MemoryFTP()
        before = ftp.files.copy()
        report = place(Remote(ftp), self.sites, 'testbatch')
        self.assertFalse(report['dns_changed'])
        for domain, files in self.sites.items():
            for name, body in files.items():
                self.assertEqual(ftp.files[domain + '/public_html/' + name], body)
            self.assertEqual(ftp.files['.pass-placement/testbatch/backup/' + domain + '/index.html'],
                             before[domain + '/public_html/index.html'])
        for name, body in before.items():
            if not name.endswith('/index.html'):
                self.assertEqual(ftp.files[name], body)

    def test_second_site_failure_restores_both_sites_without_delete(self):
        ftp = MemoryFTP('shihoshoshipass.com/public_html/index.html')
        before = ftp.files.copy()
        with self.assertRaisesRegex(RuntimeError, 'PLACEMENT_FAILED_ROLLED_BACK'):
            place(Remote(ftp), self.sites, 'testbatch')
        self.assertEqual({n: b for n, b in ftp.files.items() if not n.startswith('.pass-placement/')}, before)

    def test_missing_second_domain_prevents_any_write(self):
        ftp = MemoryFTP()
        ftp.dirs.remove('shihoshoshipass.com/public_html')
        with self.assertRaisesRegex(ValueError, 'DOMAIN_NOT_CONFIGURED'):
            place(Remote(ftp), self.sites, 'testbatch')
        self.assertEqual(ftp.operations, [])

    def test_inspection_has_no_mutations(self):
        ftp = MemoryFTP()
        _, report = preflight(Remote(ftp), self.sites)
        self.assertEqual(len(report), 2)
        self.assertEqual(ftp.operations, [])

    def test_dynamic_site_prevents_any_write(self):
        ftp = MemoryFTP()
        ftp.files['shihoshoshipass.com/public_html/index.php'] = b'existing site'
        with self.assertRaisesRegex(ValueError, 'EXISTING_DYNAMIC_SITE'):
            place(Remote(ftp), self.sites, 'testbatch')
        self.assertEqual(ftp.operations, [])

    def test_symlinked_parent_prevents_any_write(self):
        ftp = MemoryFTP()
        original_mlsd = ftp.mlsd
        def mlsd(path):
            rows = original_mlsd(path)
            if path == 'gyoseishoshipass.com/public_html':
                rows.append(('.well-known', {'type': 'OS.unix=slink'}))
            return rows
        ftp.mlsd = mlsd
        with self.assertRaisesRegex(ValueError, 'UNEXPECTED_REMOTE_TYPE'):
            place(Remote(ftp), self.sites, 'testbatch')
        self.assertEqual(ftp.operations, [])

    def test_http_uses_old_ip_and_domain_host_and_checks_every_file(self):
        requests = []
        class Handler(BaseHTTPRequestHandler):
            def do_GET(self):
                requests.append((self.headers['Host'], self.path))
                body = b'placed content'
                self.send_response(200)
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            def log_message(self, *args):
                pass
        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        original_connect = socket.create_connection
        destinations = []
        def connect(address, timeout):
            destinations.append(address)
            return original_connect(server.server_address, timeout)
        try:
            with patch('deploy.socket.create_connection', side_effect=connect):
                results = http_verify({'gyoseishoshipass.com': {
                    'index.html': b'placed content', 'app.js': b'placed content',
                    'mismatch.js': b'expected different content'}})
            self.assertEqual(destinations, [('85.131.200.80', 80)] * 3)
            self.assertEqual(requests, [('gyoseishoshipass.com', '/' + n)
                                        for n in ('index.html', 'app.js', 'mismatch.js')])
            self.assertEqual(results[0]['verified_files'], 2)
            self.assertEqual(results[0]['errors'], [{'file': 'mismatch.js', 'http_status': 200,
                                                   'sha256_match': False}])
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == '__main__':
    unittest.main()
