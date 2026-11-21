"""Ensure the prepared files' source paths did not change on either main branch."""
import json
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parent
release = json.loads((root / 'release.json').read_text())
for site in release['sites']:
    with tempfile.TemporaryDirectory() as directory:
        def git(*args):
            return subprocess.run(['git', '-C', directory, *args], check=True, capture_output=True)
        git('init', '-q')
        git('remote', 'add', 'origin', 'https://github.com/lifes20220721/' + site['name'] + '.git')
        git('fetch', '--quiet', 'origin', site['source_commit'], 'main')
        main = git('rev-parse', 'refs/remotes/origin/main').stdout.decode().strip()
        git('diff', '--exit-code', site['source_commit'], main, '--', *site['files'])
        print('PREPARED_SOURCE_UNCHANGED', site['domain'], main, flush=True)
