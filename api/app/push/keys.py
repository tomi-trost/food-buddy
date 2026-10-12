"""Print a new VAPID key line for deploy/.env:  python -m app.push.keys >> .env"""

import base64

from py_vapid import Vapid

if __name__ == "__main__":
    key = Vapid()
    key.generate_keys()
    raw = key.private_key.private_numbers().private_value.to_bytes(32, "big")
    print("VAPID_PRIVATE_KEY=" + base64.urlsafe_b64encode(raw).rstrip(b"=").decode())
