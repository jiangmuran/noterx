"""
Security fix verification tests.
Tests for admin auth, rate limiting, input validation, and DoS protections.
"""
import hashlib
import hmac
import os
import sys
import tempfile
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

os.environ["ADMIN_PASSWORD"] = "test-secure-password-2024"


def test_admin_password_from_env():
    """Admin password should be read from env var, not hardcoded."""
    from app.api.admin_api import _get_password_hash, _verify_password

    pw_hash = _get_password_hash()
    assert pw_hash, "Password hash should not be empty when ADMIN_PASSWORD is set"
    expected = hashlib.sha512(b"test-secure-password-2024").hexdigest()
    assert pw_hash == expected, "Password hash should match ADMIN_PASSWORD env var"

    assert _verify_password("test-secure-password-2024"), "Correct password should verify"
    assert not _verify_password("wrong-password"), "Wrong password should not verify"
    assert not _verify_password(""), "Empty password should not verify"


def test_admin_password_from_sha512_env():
    """ADMIN_PASSWORD_SHA512 should take priority over ADMIN_PASSWORD."""
    from app.api.admin_api import _get_password_hash, _verify_password

    saved = os.environ.pop("ADMIN_PASSWORD", None)
    os.environ["ADMIN_PASSWORD_SHA512"] = (
        "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
        "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef"
    )
    try:
        pw_hash = _get_password_hash()
        assert pw_hash == os.environ["ADMIN_PASSWORD_SHA512"], "Should use ADMIN_PASSWORD_SHA512 directly"
    finally:
        if saved:
            os.environ["ADMIN_PASSWORD"] = saved
        del os.environ["ADMIN_PASSWORD_SHA512"]


def test_admin_no_password_set():
    """When neither ADMIN_PASSWORD nor ADMIN_PASSWORD_SHA512 is set, hash should be empty."""
    from app.api.admin_api import _get_password_hash

    saved_pw = os.environ.pop("ADMIN_PASSWORD", None)
    saved_hash = os.environ.pop("ADMIN_PASSWORD_SHA512", None)
    try:
        pw_hash = _get_password_hash()
        assert pw_hash == "", "Password hash should be empty when no env var is set"
    finally:
        if saved_pw:
            os.environ["ADMIN_PASSWORD"] = saved_pw
        elif "ADMIN_PASSWORD" not in os.environ:
            os.environ["ADMIN_PASSWORD"] = "test-secure-password-2024"
        if saved_hash:
            os.environ["ADMIN_PASSWORD_SHA512"] = saved_hash


def test_admin_rate_limit():
    """Admin rate limiter should reject after MAX_ATTEMPTS in window."""
    os.environ["ADMIN_MAX_ATTEMPTS_PER_WINDOW"] = "3"
    os.environ["ADMIN_RATE_LIMIT_WINDOW_SEC"] = "10"

    from app.api.admin_api import _check_admin_rate_limit, _ADMIN_RATE_LIMIT
    _ADMIN_RATE_LIMIT.clear()

    identifier = "192.168.1.100"
    assert _check_admin_rate_limit(identifier), "First attempt should pass"
    assert _check_admin_rate_limit(identifier), "Second attempt should pass"
    assert _check_admin_rate_limit(identifier), "Third attempt should pass"
    assert not _check_admin_rate_limit(identifier), "Fourth attempt should be blocked"

    other_id = "10.0.0.1"
    assert _check_admin_rate_limit(other_id), "Different IP should not be blocked"

    _ADMIN_RATE_LIMIT.clear()
    del os.environ["ADMIN_MAX_ATTEMPTS_PER_WINDOW"]
    del os.environ["ADMIN_RATE_LIMIT_WINDOW_SEC"]


def test_global_rate_limit():
    """Global rate limiter should reject after max requests in window."""
    os.environ["API_RATE_LIMIT_WINDOW_SEC"] = "10"
    os.environ["API_RATE_LIMIT_PER_WINDOW"] = "3"

    from app.main import _check_rate_limit, _rate_limit_store
    _rate_limit_store.clear()

    ip = "192.168.1.200"
    assert _check_rate_limit(ip, 10, 3), "First request should pass"
    assert _check_rate_limit(ip, 10, 3), "Second request should pass"
    assert _check_rate_limit(ip, 10, 3), "Third request should pass"
    assert not _check_rate_limit(ip, 10, 3), "Fourth request should be blocked"

    _rate_limit_store.clear()
    del os.environ["API_RATE_LIMIT_WINDOW_SEC"]
    del os.environ["API_RATE_LIMIT_PER_WINDOW"]


def test_input_field_validation():
    """Input fields should be validated for max length."""
    from fastapi import HTTPException
    from app.api.diagnose import _validate_input_fields

    _validate_input_fields("short title", "short content", "food", "")
    _validate_input_fields("a" * 200, "b" * 10000, "tech", "#tag1,#tag2")

    try:
        _validate_input_fields("a" * 250, "content", "food", "")
        assert False, "Should have raised HTTPException for long title"
    except HTTPException as e:
        assert e.status_code == 400, f"Expected 400, got {e.status_code}"

    try:
        _validate_input_fields("title", "a" * 12000, "food", "")
        assert False, "Should have raised HTTPException for long content"
    except HTTPException as e:
        assert e.status_code == 400, f"Expected 400, got {e.status_code}"

    try:
        _validate_input_fields("title", "content", "a" * 100, "")
        assert False, "Should have raised HTTPException for long category"
    except HTTPException as e:
        assert e.status_code == 400, f"Expected 400, got {e.status_code}"

    try:
        _validate_input_fields("title", "content", "food", "a" * 1000)
        assert False, "Should have raised HTTPException for long tags"
    except HTTPException as e:
        assert e.status_code == 400, f"Expected 400, got {e.status_code}"


def test_record_id_validation():
    """Record IDs should be validated as 32-char hex strings."""
    from fastapi import HTTPException
    from app.api.history_api import _vali_date_record_id, _RECORD_ID_RE

    valid = "a" * 32
    _vali_date_record_id(valid)

    assert _RECORD_ID_RE.fullmatch(valid), "Valid hex should match"
    assert _RECORD_ID_RE.fullmatch("0123456789abcdef0123456789abcdef"), "Valid hex should match"
    assert not _RECORD_ID_RE.fullmatch(""), "Empty should not match"
    assert not _RECORD_ID_RE.fullmatch("g" * 32), "Non-hex should not match"
    assert not _RECORD_ID_RE.fullmatch("a" * 31), "Wrong length should not match"
    assert not _RECORD_ID_RE.fullmatch("a" * 33), "Wrong length should not match"
    assert not _RECORD_ID_RE.fullmatch("../../../etc/passwd"), "Path traversal should not match"
    assert not _RECORD_ID_RE.fullmatch("a' OR 1=1 --"), "SQL injection attempt should not match"

    try:
        _vali_date_record_id("../../../etc/passwd")
        assert False, "Should have raised for path traversal"
    except HTTPException as e:
        assert e.status_code == 400

    try:
        _vali_date_record_id("")
        assert False, "Should have raised for empty ID"
    except HTTPException as e:
        assert e.status_code == 400


def test_hardcoded_secret_removed():
    """The old hardcoded ADMIN_PASSWORD_SHA512 must not exist in admin_api.py any more."""
    admin_api_path = os.path.join(
        os.path.dirname(__file__), "..", "app", "api", "admin_api.py"
    )
    with open(admin_api_path, "r", encoding="utf-8") as f:
        content = f.read()
    old_hash = "a776a66c6d2846ba069697bb56f68fedfe301a453126cf4af1d566296cd8ae903b591520c4fbb51592f1fa206b7a4c3baeb79a3dde67167a108b885835813cba"
    assert old_hash not in content, (
        "CRITICAL: Old hardcoded password hash still present in admin_api.py! "
        "Remove it and use ADMIN_PASSWORD / ADMIN_PASSWORD_SHA512 env vars instead."
    )


def test_temp_video_total_size_limit():
    """Temp video cleanup should enforce total directory size limit."""
    from app.api.diagnose import _cleanup_expired_temp_videos, TEMP_VIDEO_DIR

    os.environ["TEMP_VIDEO_DIR_MAX_TOTAL_MB"] = "12"
    import uuid

    def _make_dummy_video(name: str, size_mb: int):
        path = TEMP_VIDEO_DIR / name
        path.write_bytes(b"\x00" * (size_mb * 1024 * 1024))
        return path

    created = []
    try:
        TEMP_VIDEO_DIR.mkdir(parents=True, exist_ok=True)

        now = int(time.time())
        exp = now + 3600
        for i in range(8):
            uid = uuid.uuid4().hex
            name = f"{uid}_{exp}.mp4"
            p = _make_dummy_video(name, 2)
            created.append(p)

        assert len(created) == 8, "Should have 8 files created (16MB total)"
        existing_before = sum(1 for f in TEMP_VIDEO_DIR.iterdir()
                              if f.is_file() and f.name.endswith('.mp4'))
        assert existing_before >= 8

        _cleanup_expired_temp_videos(now)

        remaining = [p for p in created if p.exists()]
        assert len(remaining) < 8, (
            f"Some files should be deleted when total > 12MB, "
            f"but all {len(remaining)} files still exist"
        )

    finally:
        del os.environ["TEMP_VIDEO_DIR_MAX_TOTAL_MB"]
        for p in created:
            try:
                p.unlink(missing_ok=True)
            except Exception:
                pass


def test_cors_allow_methods_restricted():
    """CORS should only allow GET, POST, DELETE (not *)."""
    main_path = os.path.join(
        os.path.dirname(__file__), "..", "app", "main.py"
    )
    with open(main_path, "r", encoding="utf-8") as f:
        content = f.read()
    assert 'allow_methods=["*"]' not in content, (
        "CORS allow_methods should not be wildcard '*' after security fix"
    )
    assert 'allow_headers=["*"]' not in content, (
        "CORS allow_headers should not be wildcard '*' after security fix"
    )
