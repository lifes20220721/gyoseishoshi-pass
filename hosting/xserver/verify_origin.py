"""Verify both XServer HTTPS origins before changing public DNS."""
import argparse
from contextlib import closing
import hashlib
import http.client
import json
from pathlib import Path
import socket
import ssl
import sys
from urllib.parse import quote

from build_packages import PLAN, inspect_archive


class OriginConnection(http.client.HTTPSConnection):
    def connect(self):
        connection = socket.create_connection((PLAN['expected_ipv4'], 443), timeout=self.timeout)
        self.sock = self._context.wrap_socket(connection, server_hostname=self.host)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--packages', required=True, type=Path)
    args = parser.parse_args()
    for site in PLAN['sites']:
        files = inspect_archive(args.packages / site['archive'])
        for name, expected in files.items():
            with closing(OriginConnection(site['domain'], timeout=30, context=ssl.create_default_context())) as connection:
                connection.request('GET', '/' + quote(name), headers={'Host': site['domain'], 'Cache-Control': 'no-cache'})
                response = connection.getresponse()
                body = response.read()
                if response.status != 200:
                    raise ValueError('ORIGIN_HTTP_STATUS: ' + site['domain'] + '/' + name + ' ' + str(response.status))
                if name == '.well-known/assetlinks.json' and 'application/json' not in response.getheader('Content-Type', ''):
                    raise ValueError('ASSETLINKS_CONTENT_TYPE')
                if hashlib.sha256(body).digest() != hashlib.sha256(expected).digest():
                    raise ValueError('ORIGIN_CONTENT_MISMATCH: ' + site['domain'] + '/' + name)
        print('HTTPS_ORIGIN_VERIFIED', site['domain'], len(files))
    print('BOTH_ORIGINS_READY_FOR_DNS_CHANGE; DNS has not been changed by this script')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        print('HTTPS_ORIGIN_NOT_READY', type(error).__name__, str(error)[:300], file=sys.stderr)
        sys.exit(1)
