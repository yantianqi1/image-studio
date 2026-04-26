from apps.api.app.core.security import hash_password, issue_session_token, sha256_hex, verify_password


def test_password_hash_roundtrip():
    password_hash = hash_password("top-secret")

    assert verify_password("top-secret", password_hash) is True
    assert verify_password("wrong", password_hash) is False


def test_session_token_and_sha256_are_deterministic():
    token = issue_session_token()

    assert token
    assert sha256_hex("same-value") == sha256_hex("same-value")
    assert sha256_hex(token) != token
