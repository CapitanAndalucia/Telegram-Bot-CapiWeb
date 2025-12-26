import json
from urllib.parse import urlencode
from urllib.request import urlopen, Request
from django.conf import settings

RECAPTCHA_VERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify'


def verify_recaptcha(response_token, remote_ip=None):
    """Verifica el token de reCAPTCHA con Google.

    Devuelve (ok: bool, error_message: str|null)
    """
    if not response_token:
        return False, 'Missing captcha token'

    secret = getattr(settings, 'RECAPTCHA_SECRET', None)
    if not secret:
        return False, 'Captcha not configured on server'

    data = {
        'secret': secret,
        'response': response_token,
    }
    if remote_ip:
        data['remoteip'] = remote_ip

    encoded = urlencode(data).encode()
    req = Request(RECAPTCHA_VERIFY_URL, data=encoded)
    try:
        with urlopen(req, timeout=5) as f:
            resp = f.read().decode()
            parsed = json.loads(resp)
    except Exception as e:
        return False, f'Error verifying captcha: {e}'

    if parsed.get('success'):
        return True, None

    # determine a sensible message
    err_codes = parsed.get('error-codes')
    return False, f'Invalid captcha: {err_codes}'
