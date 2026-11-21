import ftplib
from pathlib import PurePosixPath
import unittest

from deploy import migrate


class MemoryFTP:
    def __init__(self, fail_target=None):
        self.files = {
            'gyoseishoshipass.com/public_html/index.html': b'old administrative',
            'shihoshoshipass.com/public_html/index.html': b'old judicial',
            'gyoseishoshipass.com/public_html/unrelated.txt': b'keep this'
        }
        self.dirs = {'.', 'gyoseishoshipass.com', 'shihoshoshipass.com',
                     'gyoseishoshipass.com/public_html', 'shihoshoshipass.com/public_html'}
        self.fail_target = fail_target
        self.current = '.'

    def mlsd(self, path):
        path = str(PurePosixPath(path))
        if path not in self.dirs:
            raise ftplib.error_perm('550 missing directory')
        entries = {}
        for directory in self.dirs - {'.'}:
            if str(PurePosixPath(directory).parent) == path:
                entries[PurePosixPath(directory).name] = {'type':'dir'}
        for file in self.files:
            if str(PurePosixPath(file).parent) == path:
                entries[PurePosixPath(file).name] = {'type':'file'}
        return list(entries.items())

    def mkd(self, path):
        path = str(PurePosixPath(path))
        if path in self.dirs:
            raise ftplib.error_perm('550 exists')
        self.dirs.add(path)

    def pwd(self): return self.current

    def cwd(self, path):
        if path not in self.dirs:
            raise ftplib.error_perm('550 missing directory')
        self.current = path

    def retrbinary(self, command, callback): callback(self.files[command[5:]])

    def storbinary(self, command, body): self.files[command[5:]] = body.read()

    def rename(self, source, target):
        if target == self.fail_target:
            raise ftplib.error_temp('450 simulated second-site failure')
        self.files[target] = self.files.pop(source)

    def delete(self, path): del self.files[path]


class MigrationTests(unittest.TestCase):
    sites = {
        'gyoseishoshipass.com': {'index.html': b'new administrative', '.well-known/assetlinks.json': b'certificates'},
        'shihoshoshipass.com': {'index.html': b'new judicial'}
    }

    def test_second_site_failure_restores_both_sites_and_removes_new_files(self):
        ftp = MemoryFTP('shihoshoshipass.com/public_html/index.html')
        before = ftp.files.copy()
        with self.assertRaisesRegex(RuntimeError, 'ROLLED_BACK'):
            migrate(ftp, self.sites, 'testbatch')
        self.assertEqual({p:b for p,b in ftp.files.items() if '/public_html/' in p}, before)

    def test_missing_second_domain_prevents_all_writes(self):
        ftp = MemoryFTP()
        ftp.dirs.remove('shihoshoshipass.com/public_html')
        before = ftp.files.copy()
        with self.assertRaisesRegex(ValueError, 'DOMAIN_NOT_CONFIGURED'):
            migrate(ftp, self.sites, 'testbatch')
        self.assertEqual(ftp.files, before)
        self.assertNotIn('.pass-migration', ftp.dirs)

    def test_success_preserves_unrelated_files_and_original_backups(self):
        ftp = MemoryFTP()
        report = migrate(ftp, self.sites, 'testbatch')
        self.assertFalse(report['dns_changed'])
        self.assertEqual(ftp.files['gyoseishoshipass.com/public_html/unrelated.txt'], b'keep this')
        self.assertEqual(ftp.files['.pass-migration/testbatch/backup/gyoseishoshipass.com/index.html'], b'old administrative')
        self.assertEqual(ftp.files['shihoshoshipass.com/public_html/index.html'], b'new judicial')

    def test_inspection_is_read_only(self):
        ftp = MemoryFTP()
        before = ftp.files.copy()
        report = migrate(ftp, self.sites, 'testbatch', inspect_only=True)
        self.assertFalse(report['uploaded'])
        self.assertTrue(report['all_targets_ready'])
        self.assertEqual(ftp.files, before)

    def test_inspection_reports_both_domains_when_first_domain_is_missing(self):
        ftp = MemoryFTP()
        ftp.dirs.remove('gyoseishoshipass.com/public_html')
        before = ftp.files.copy()
        report = migrate(ftp, self.sites, 'testbatch', inspect_only=True)
        self.assertEqual([item['status'] for item in report['targets']], ['DOMAIN_NOT_CONFIGURED', 'READY'])
        self.assertFalse(report['all_targets_ready'])
        self.assertEqual(ftp.files, before)


if __name__ == '__main__':
    unittest.main()
