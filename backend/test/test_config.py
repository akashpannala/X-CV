import os

from backend.config import Settings


class TestSettingsDefaults:
    def test_default_jwt_algorithm(self):
        s = Settings(
            supabase_url="http://test",
            supabase_anon_key="k1",
            supabase_service_key="k2",
            jwt_secret="secret",
        )
        assert s.jwt_algorithm == "HS256"

    def test_default_jwt_expire_minutes(self):
        s = Settings(
            supabase_url="http://test",
            supabase_anon_key="k1",
            supabase_service_key="k2",
            jwt_secret="secret",
        )
        assert s.jwt_expire_minutes == 480

    def test_default_api_host(self):
        s = Settings(
            supabase_url="http://test",
            supabase_anon_key="k1",
            supabase_service_key="k2",
            jwt_secret="secret",
        )
        assert s.api_host == "127.0.0.1"

    def test_default_api_port(self):
        s = Settings(
            supabase_url="http://test",
            supabase_anon_key="k1",
            supabase_service_key="k2",
            jwt_secret="secret",
        )
        assert s.api_port == 8000

    def test_debug_defaults_to_true(self):
        s = Settings(
            supabase_url="http://test",
            supabase_anon_key="k1",
            supabase_service_key="k2",
            jwt_secret="secret",
        )
        assert s.debug is True


class TestSettingsOverride:
    def test_accepts_override_values(self):
        s = Settings(
            supabase_url="http://custom",
            supabase_anon_key="ak",
            supabase_service_key="sk",
            jwt_secret="mysecret",
            jwt_algorithm="RS256",
            jwt_expire_minutes=60,
            api_host="0.0.0.0",
            api_port=9000,
            debug=False,
        )
        assert s.supabase_url == "http://custom"
        assert s.supabase_anon_key == "ak"
        assert s.supabase_service_key == "sk"
        assert s.jwt_secret == "mysecret"
        assert s.jwt_algorithm == "RS256"
        assert s.jwt_expire_minutes == 60
        assert s.api_host == "0.0.0.0"
        assert s.api_port == 9000
        assert s.debug is False

    def test_required_fields_raise_without(self):
        try:
            Settings()
            assert False, "Should have raised"
        except Exception:
            pass

    def test_env_vars_override_defaults(self, monkeypatch):
        monkeypatch.setenv("SUPABASE_URL", "http://env-url")
        monkeypatch.setenv("SUPABASE_ANON_KEY", "env-anon")
        monkeypatch.setenv("SUPABASE_SERVICE_KEY", "env-svc")
        monkeypatch.setenv("JWT_SECRET", "env-jwt")
        monkeypatch.setenv("JWT_EXPIRE_MINUTES", "30")
        s = Settings()
        assert s.supabase_url == "http://env-url"
        assert s.supabase_anon_key == "env-anon"
        assert s.supabase_service_key == "env-svc"
        assert s.jwt_secret == "env-jwt"
        assert s.jwt_expire_minutes == 30


class TestSettingsModuleSingleton:
    def test_settings_instance_is_available(self):
        from backend.config import settings

        assert settings.supabase_url is not None
        assert settings.jwt_secret is not None
        assert settings.jwt_algorithm == "HS256"
