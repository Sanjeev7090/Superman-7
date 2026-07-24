"""
FII/DII Feature Tests — Iteration 37
Tests for IST-aware date logic, availability status, source field,
data_for_date field, nse_url, and MongoDB cache behavior.
"""
import pytest
import requests
import os
from datetime import datetime
from zoneinfo import ZoneInfo

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

# ── IST helper ────────────────────────────────────────────────────────────────
IST = ZoneInfo("Asia/Kolkata")


def _ist_now():
    return datetime.now(IST)


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def fii_response():
    """Fetch FII response once for the module."""
    r = requests.get(f"{BASE_URL}/api/market-intel/fii", timeout=30)
    assert r.status_code == 200, f"FII endpoint returned {r.status_code}"
    return r.json()


# ── HTTP + Top-level structure tests ─────────────────────────────────────────

class TestFiiEndpointStatus:
    """Basic endpoint health checks."""

    def test_fii_endpoint_returns_200(self):
        """Endpoint must return HTTP 200."""
        r = requests.get(f"{BASE_URL}/api/market-intel/fii", timeout=30)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}"
        print(f"PASS: /api/market-intel/fii → {r.status_code}")

    def test_fii_response_is_json(self):
        """Response must be valid JSON."""
        r = requests.get(f"{BASE_URL}/api/market-intel/fii", timeout=30)
        data = r.json()
        assert isinstance(data, dict), "Response must be a dict"
        print("PASS: Response is valid JSON dict")


# ── data_for_date field ───────────────────────────────────────────────────────

class TestFiiDataForDate:
    """data_for_date must be present and correctly formatted."""

    def test_data_for_date_key_exists(self, fii_response):
        """data_for_date must exist in response."""
        assert "data_for_date" in fii_response, "Missing 'data_for_date' key"
        print(f"PASS: data_for_date = {fii_response['data_for_date']}")

    def test_data_for_date_is_string(self, fii_response):
        """data_for_date must be a non-empty string."""
        val = fii_response.get("data_for_date")
        assert isinstance(val, str) and len(val) > 0, f"data_for_date invalid: {val!r}"
        print(f"PASS: data_for_date is string: '{val}'")

    def test_data_for_date_format(self, fii_response):
        """data_for_date should match DD-Mon-YYYY format (e.g. '24-Jul-2026')."""
        import re
        val = fii_response.get("data_for_date", "")
        # Pattern: 1-2 digit day, 3-letter month, 4-digit year
        pattern = r"^\d{1,2}-[A-Za-z]{3}-\d{4}$"
        assert re.match(pattern, val), f"data_for_date format wrong: '{val}'"
        print(f"PASS: data_for_date format correct: '{val}'")

    def test_data_for_date_ist_logic(self, fii_response):
        """
        Before 6 PM IST → previous trading day; After 6 PM IST → today's weekday date.
        We check the date is either today or a recent weekday.
        """
        from datetime import timedelta
        ist = _ist_now()
        val = fii_response.get("data_for_date", "")

        # Parse the returned date
        try:
            parsed = datetime.strptime(val, "%d-%b-%Y").date()
        except ValueError:
            pytest.fail(f"Cannot parse data_for_date '{val}'")

        today = ist.date()
        # The date must not be in the future
        assert parsed <= today, f"data_for_date {parsed} is in the future"
        # The date should be within last 5 days (allow for weekends/holidays)
        max_days_back = 5
        assert (today - parsed).days <= max_days_back, (
            f"data_for_date {parsed} is more than {max_days_back} days old"
        )
        # The date should not be a Saturday or Sunday
        # (FII data always refers to a trading weekday)
        assert parsed.weekday() < 5, f"data_for_date {parsed} is a weekend!"
        print(f"PASS: data_for_date IST logic correct: '{val}' (weekday={parsed.weekday()})")


# ── availability object ───────────────────────────────────────────────────────

class TestFiiAvailability:
    """availability object structure and IST-aware status."""

    def test_availability_key_exists(self, fii_response):
        """availability must be present."""
        assert "availability" in fii_response, "Missing 'availability' key"
        print(f"PASS: 'availability' key present")

    def test_availability_is_dict(self, fii_response):
        """availability must be a dict."""
        av = fii_response.get("availability")
        assert isinstance(av, dict), f"availability must be dict, got {type(av)}"
        print("PASS: availability is dict")

    def test_availability_has_status(self, fii_response):
        """availability must have 'status' field."""
        av = fii_response.get("availability", {})
        assert "status" in av, "availability missing 'status' field"
        print(f"PASS: availability.status = '{av['status']}'")

    def test_availability_has_message(self, fii_response):
        """availability must have 'message' field."""
        av = fii_response.get("availability", {})
        assert "message" in av, "availability missing 'message' field"
        assert isinstance(av["message"], str) and av["message"], "message must be non-empty string"
        print(f"PASS: availability.message = '{av['message'][:60]}...'")

    def test_availability_has_show_timer(self, fii_response):
        """availability must have 'show_timer' field."""
        av = fii_response.get("availability", {})
        assert "show_timer" in av, "availability missing 'show_timer' field"
        assert isinstance(av["show_timer"], bool), "show_timer must be boolean"
        print(f"PASS: availability.show_timer = {av['show_timer']}")

    def test_availability_status_valid_values(self, fii_response):
        """availability.status must be one of: released, pre_release, weekend."""
        av = fii_response.get("availability", {})
        status = av.get("status")
        valid = {"released", "pre_release", "weekend"}
        assert status in valid, f"availability.status '{status}' not in {valid}"
        print(f"PASS: availability.status '{status}' is valid")

    def test_availability_status_matches_ist_time(self, fii_response):
        """
        IST time >= 18:00 weekday → status must be 'released'
        IST time < 18:00 weekday  → status must be 'pre_release'
        Weekend                   → status must be 'weekend'
        """
        ist = _ist_now()
        av = fii_response.get("availability", {})
        status = av.get("status")
        is_weekday = ist.weekday() < 5

        if not is_weekday:
            assert status == "weekend", f"Expected 'weekend', got '{status}'"
            print("PASS: Weekend → status='weekend'")
        elif ist.hour >= 18:
            assert status == "released", (
                f"IST {ist.hour}:{ist.minute:02d} >= 18:00, expected 'released', got '{status}'"
            )
            print(f"PASS: IST {ist.hour}:{ist.minute:02d} → status='released'")
        else:
            assert status == "pre_release", (
                f"IST {ist.hour}:{ist.minute:02d} < 18:00, expected 'pre_release', got '{status}'"
            )
            print(f"PASS: IST {ist.hour}:{ist.minute:02d} → status='pre_release'")

    def test_pre_release_has_mins_to_release(self, fii_response):
        """If status is pre_release, mins_to_release must be > 0."""
        av = fii_response.get("availability", {})
        if av.get("status") == "pre_release":
            assert "mins_to_release" in av, "pre_release must have mins_to_release"
            assert av["mins_to_release"] > 0, "mins_to_release must be > 0"
            print(f"PASS: mins_to_release = {av['mins_to_release']}")
        else:
            print(f"SKIP: status is '{av.get('status')}', not pre_release — mins_to_release not required")

    def test_released_show_timer_false(self, fii_response):
        """When status is 'released', show_timer must be False."""
        av = fii_response.get("availability", {})
        if av.get("status") == "released":
            assert av.get("show_timer") == False, (
                f"When released, show_timer must be False, got {av.get('show_timer')}"
            )
            print("PASS: released → show_timer=False")
        else:
            print(f"SKIP: status is '{av.get('status')}', not released")

    def test_pre_release_show_timer_true(self, fii_response):
        """When status is 'pre_release', show_timer must be True."""
        av = fii_response.get("availability", {})
        if av.get("status") == "pre_release":
            assert av.get("show_timer") == True, (
                f"When pre_release, show_timer must be True, got {av.get('show_timer')}"
            )
            print("PASS: pre_release → show_timer=True")
        else:
            print(f"SKIP: status is '{av.get('status')}', not pre_release")


# ── source field ──────────────────────────────────────────────────────────────

class TestFiiSource:
    """source field must be one of the valid values."""

    def test_source_key_exists(self, fii_response):
        """source must be present in response."""
        assert "source" in fii_response, "Missing 'source' key"
        print(f"PASS: source = '{fii_response['source']}'")

    def test_source_is_valid_value(self, fii_response):
        """source must be one of: 'unavailable', 'NSE F&O Archive', 'mongodb_cache'."""
        source = fii_response.get("source")
        valid = {"unavailable", "NSE F&O Archive", "mongodb_cache"}
        assert source in valid, f"source '{source}' not in {valid}"
        print(f"PASS: source '{source}' is valid")

    def test_unavailable_source_has_nse_url(self, fii_response):
        """When source is 'unavailable', nse_url must be present."""
        if fii_response.get("source") == "unavailable":
            assert "nse_url" in fii_response, "unavailable source must have nse_url"
            nse_url = fii_response["nse_url"]
            assert isinstance(nse_url, str) and nse_url.startswith("https://"), (
                f"nse_url must be an https URL, got '{nse_url}'"
            )
            assert "nseindia.com" in nse_url, f"nse_url must be NSE domain, got '{nse_url}'"
            print(f"PASS: nse_url = '{nse_url}'")
        else:
            print(f"SKIP: source is '{fii_response.get('source')}', not unavailable")

    def test_nse_archive_source_has_fii_data(self, fii_response):
        """When source is 'NSE F&O Archive', fii data must be present."""
        if fii_response.get("source") == "NSE F&O Archive":
            assert "fii" in fii_response, "NSE source must have fii data"
            fii = fii_response["fii"]
            assert isinstance(fii, dict), "fii must be a dict"
            assert "buy" in fii and "sell" in fii and "net" in fii, (
                "fii must have buy, sell, net fields"
            )
            print(f"PASS: NSE source has fii data: {fii}")
        else:
            print(f"SKIP: source is '{fii_response.get('source')}', not NSE F&O Archive")

    def test_mongodb_cache_source_has_fii_data(self, fii_response):
        """When source is 'mongodb_cache', fii data must be present."""
        if fii_response.get("source") == "mongodb_cache":
            assert "fii" in fii_response, "mongodb_cache source must have fii data"
            print(f"PASS: mongodb_cache source has fii data")
        else:
            print(f"SKIP: source is '{fii_response.get('source')}', not mongodb_cache")


# ── NSE URL structure ─────────────────────────────────────────────────────────

class TestFiiNseUrl:
    """NSE URL should point to correct NSE participant vol report page."""

    def test_nse_url_is_correct_if_present(self, fii_response):
        """nse_url, if present, must point to NSE F&O participant vol."""
        nse_url = fii_response.get("nse_url")
        if nse_url:
            assert "nseindia.com" in nse_url, f"nse_url must be nseindia.com: {nse_url}"
            assert "fo_participant_vol" in nse_url or "fo_participant" in nse_url or "nsccl" in nse_url, (
                f"nse_url should reference F&O participant page: {nse_url}"
            )
            print(f"PASS: nse_url points to correct NSE page: '{nse_url}'")
        else:
            print("SKIP: nse_url not present (source is not 'unavailable')")


# ── Full response completeness ────────────────────────────────────────────────

class TestFiiResponseCompleteness:
    """Completeness checks — both availability and data_for_date in ALL responses."""

    def test_both_availability_and_data_for_date_always_present(self, fii_response):
        """Regardless of source, availability and data_for_date must always be returned."""
        assert "availability" in fii_response, "availability always required"
        assert "data_for_date" in fii_response, "data_for_date always required"
        print("PASS: Both availability and data_for_date present regardless of source")

    def test_no_generic_old_message(self, fii_response):
        """
        Old behavior: generic 'NSE FII data available after 6 PM IST' message.
        New behavior: dynamic availability object is returned.
        The response MUST NOT be the old-style message-only response.
        """
        # Check that the new structure (availability object) overrides old style
        av = fii_response.get("availability")
        assert av is not None, "Old-style message-only response detected. Need availability object."
        assert "status" in av, "availability.status required (new behavior)"
        print("PASS: New IST-aware availability object present (old-style message-only not returned)")

    def test_refresh_returns_same_structure(self):
        """Calling the endpoint twice should return consistent structure."""
        r1 = requests.get(f"{BASE_URL}/api/market-intel/fii", timeout=30)
        r2 = requests.get(f"{BASE_URL}/api/market-intel/fii", timeout=30)
        d1 = r1.json()
        d2 = r2.json()
        assert "availability" in d1 and "availability" in d2
        assert "data_for_date" in d1 and "data_for_date" in d2
        assert "source" in d1 and "source" in d2
        print("PASS: Consistent structure across multiple calls")
