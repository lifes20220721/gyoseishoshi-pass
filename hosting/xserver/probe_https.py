"""Read-only HTTPS readiness of both fixed new origins; public DNS is untouched."""
from contextlib import closing
import json
import ssl
import sys

from verify_origin import OriginConnection, PLAN


ready = True
for site in PLAN['sites']:
    result = {'domain': site['domain']}
    try:
        with closing(OriginConnection(site['domain'], timeout=20, context=ssl.create_default_context())) as connection:
            connection.request('GET', '/', headers={'Host': site['domain'], 'Cache-Control': 'no-cache'})
            response = connection.getresponse()
            response.read(65536)
            result.update(https_verified=True, http_status=response.status)
            if response.status != 200:
                ready = False
    except ssl.SSLCertVerificationError as error:
        result.update(https_verified=False, reason='certificate_verification_failed', detail=error.verify_message)
        ready = False
    except OSError as error:
        result.update(https_verified=False, reason='connection_unavailable', error_type=type(error).__name__)
        ready = False
    print('HTTPS_PROBE', json.dumps(result))
sys.exit(0 if ready else 1)
