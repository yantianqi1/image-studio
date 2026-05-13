from __future__ import annotations

from io import BytesIO
from pathlib import Path

from PIL import Image

from apps.api.app.domains.image.assets import (
    detect_image_mime_type,
    normalize_upload_image,
)


def make_png_bytes() -> bytes:
    output = BytesIO()
    Image.new("RGB", (2, 2), (255, 0, 0)).save(output, format="PNG")
    return output.getvalue()


def make_jpeg_bytes() -> bytes:
    output = BytesIO()
    Image.new("RGB", (2, 2), (0, 255, 0)).save(output, format="JPEG")
    return output.getvalue()


def make_webp_bytes() -> bytes:
    output = BytesIO()
    Image.new("RGB", (2, 2), (0, 0, 255)).save(output, format="WEBP")
    return output.getvalue()


def make_avif_header() -> bytes:
    return b"\x00\x00\x00\x20ftypavif\x00\x00\x00\x00avifmif1" + b"\x00" * 100


def make_heic_header() -> bytes:
    return b"\x00\x00\x00\x20ftypheic\x00\x00\x00\x00heicmif1" + b"\x00" * 100


def make_tiff_bytes() -> bytes:
    output = BytesIO()
    Image.new("RGB", (2, 2), (128, 128, 128)).save(output, format="TIFF")
    return output.getvalue()


def test_detect_png():
    assert detect_image_mime_type(make_png_bytes()) == "image/png"


def test_detect_jpeg():
    assert detect_image_mime_type(make_jpeg_bytes()) == "image/jpeg"


def test_detect_webp():
    assert detect_image_mime_type(make_webp_bytes()) == "image/webp"


def test_detect_avif():
    assert detect_image_mime_type(make_avif_header()) == "image/avif"


def test_detect_heic():
    assert detect_image_mime_type(make_heic_header()) == "image/heic"


def test_detect_tiff():
    assert detect_image_mime_type(make_tiff_bytes()) == "image/tiff"


def test_detect_unknown_returns_none():
    assert detect_image_mime_type(b"not an image at all") is None


def test_normalize_keeps_compatible_format_unchanged():
    png_bytes = make_png_bytes()
    content, mime = normalize_upload_image(png_bytes, "image/jpeg")
    assert mime == "image/png"
    assert content == png_bytes


def test_normalize_corrects_mime_for_jpeg_labeled_as_png():
    jpeg_bytes = make_jpeg_bytes()
    content, mime = normalize_upload_image(jpeg_bytes, "image/png")
    assert mime == "image/jpeg"
    assert content == jpeg_bytes


def test_normalize_converts_tiff_to_png():
    tiff_bytes = make_tiff_bytes()
    content, mime = normalize_upload_image(tiff_bytes, "image/tiff")
    assert mime == "image/png"
    assert content != tiff_bytes
    assert content[:8] == b"\x89PNG\r\n\x1a\n"


def test_normalize_passes_through_unknown_format():
    data = b"not an image"
    content, mime = normalize_upload_image(data, "application/octet-stream")
    assert content == data
    assert mime == "application/octet-stream"


def test_upload_endpoint_corrects_mime_for_mismatched_file():
    from fastapi.testclient import TestClient

    from apps.api.app.core.config import get_settings
    from apps.api.app.domains.auth.service import create_admin_account
    from apps.api.app.infra.db.session import initialize_database, session_scope
    from apps.api.app.main import create_app

    initialize_database()
    client = TestClient(create_app())
    client.post("/api/public/auth/register", json={"email": "fmt@example.com", "password": "secret"})
    with session_scope() as session:
        create_admin_account(session=session, username="root", password="admin-pass")
    client.post("/api/admin/auth/login", json={"username": "root", "password": "admin-pass"})
    client.patch("/api/admin/settings", json={
        "site_title": "test",
        "allow_public_signup": True,
        "allow_anonymous_image": True,
        "uploads_enabled": True,
    })

    png_bytes = make_png_bytes()
    response = client.post(
        "/api/public/image/uploads",
        files={"file": ("photo.jpg", png_bytes, "image/jpeg")},
    )

    assert response.status_code == 201
    asset = response.json()["data"]
    assert asset["mime_type"] == "image/png"
    assert asset["storage_path"].endswith(".png")
