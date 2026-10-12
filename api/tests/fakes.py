"""Fake OpenAI-compatible vision servers for tests (no network)."""

import json

import httpx

PLATE = {
    "dish": "Chicken rice bowl",
    "meal_type": "dinner",
    "servings": 1,
    "ingredients": [
        {"name": "grilled chicken breast", "grams": 150, "confidence": 0.9},
        {"name": "cooked rice", "grams": 200, "confidence": 0.8},
        {"name": "olive oil", "grams": 10, "confidence": 0.4},
        {"name": "mystery sauce", "grams": 30, "confidence": 0.2},
    ],
}


def chat_response(content: str) -> httpx.Response:
    return httpx.Response(200, json={"choices": [{"message": {"content": content}}]})


def vision_transport(content: str | dict = PLATE, status: int = 200, seen: list | None = None):
    def handler(request: httpx.Request) -> httpx.Response:
        if seen is not None:
            seen.append(request)
        if status != 200:
            return httpx.Response(status, text="boom")
        return chat_response(content if isinstance(content, str) else json.dumps(content))

    return httpx.MockTransport(handler)


# --- Web Push --------------------------------------------------------------------------


def b64url(data: bytes) -> str:
    import base64

    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


class FakePhone:
    """A browser push subscription: keys like a real one, so payloads can be decrypted."""

    def __init__(self, endpoint="https://web.push.apple.com/QGx-test-device"):
        import os

        from cryptography.hazmat.primitives import serialization
        from cryptography.hazmat.primitives.asymmetric import ec

        self.endpoint = endpoint
        self.key = ec.generate_private_key(ec.SECP256R1())
        self.auth = os.urandom(16)
        public = self.key.public_key().public_bytes(
            serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
        )
        self.subscription = {
            "endpoint": endpoint,
            "keys": {"p256dh": b64url(public), "auth": b64url(self.auth)},
        }

    def read(self, request: httpx.Request) -> dict:
        import http_ece

        plain = http_ece.decrypt(
            request.content, private_key=self.key, auth_secret=self.auth, version="aes128gcm"
        )
        return json.loads(plain)


def push_transport(seen: list, status: int = 201):
    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(status)

    return httpx.MockTransport(handler)


def vapid_private_key() -> str:
    from py_vapid import Vapid

    vapid = Vapid()
    vapid.generate_keys()
    return b64url(vapid.private_key.private_numbers().private_value.to_bytes(32, "big"))
