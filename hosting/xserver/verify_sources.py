"""Stop if either repository's public content changed after the paired release was built."""
import argparse
import json
from pathlib import Path
import subprocess

from build_packages import PLAN


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--packages', required=True, type=Path)
    parser.add_argument('--administrative-source', required=True, type=Path)
    parser.add_argument('--judicial-source', required=True, type=Path)
    args = parser.parse_args()
    release = json.loads((args.packages / 'release.json').read_text())
    roots = [args.administrative_source, args.judicial_source]
    for site, details, root in zip(PLAN['sites'], release['sites'], roots):
        subprocess.run(['git', 'fetch', '--quiet', 'origin', 'main'], cwd=root, check=True)
        changed = subprocess.run(['git', 'diff', '--quiet', site['source_commit'], 'FETCH_HEAD', '--', *details['files']], cwd=root)
        if changed.returncode:
            raise RuntimeError('PUBLIC_SOURCE_CHANGED: ' + site['name'])
        print('PUBLIC_SOURCE_UNCHANGED', site['name'])


if __name__ == '__main__':
    main()
