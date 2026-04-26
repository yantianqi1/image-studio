from __future__ import annotations

import hashlib
import hmac
import secrets

PASSWORD_ITERATIONS = 120_000
PASSWORD_ALGORITHM = "pbkdf2_sha256"
PASSWORD_SALT_BYTES = 16
SESSION_TOKEN_BYTES = 32


def issue_session_token() -> str:
    return secrets.token_urlsafe(SESSION_TOKEN_BYTES)


def sha256_hex(value: str) -> str:
    return hashlib.sha256(str(value).encode("utf-8")).hexdigest()


def hash_password(password: str) -> str:
    normalized = str(password).encode("utf-8")
    salt = secrets.token_bytes(PASSWORD_SALT_BYTES)
    digest = hashlib.pbkdf2_hmac("sha256", normalized, salt, PASSWORD_ITERATIONS)
    return "$".join(
        [
            PASSWORD_ALGORITHM,
            str(PASSWORD_ITERATIONS),
            salt.hex(),
            digest.hex(),
        ]
    )


def verify_password(password: str, stored_hash: str) -> bool:
    algorithm, iterations, salt_hex, digest_hex = str(stored_hash).split("$", maxsplit=3)
    if algorithm != PASSWORD_ALGORITHM:
        return False
    derived = hashlib.pbkdf2_hmac(
        "sha256",
        str(password).encode("utf-8"),
        bytes.fromhex(salt_hex),
        int(iterations),
    )
    return hmac.compare_digest(derived.hex(), digest_hex)

