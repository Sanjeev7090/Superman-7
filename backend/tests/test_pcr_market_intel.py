"""
PCR Market Intel API Tests
==========================
Tests specifically for the Nifty PCR feature added to /api/market-intel
- pcr field structure and required keys
- pcr_history field presence
- pcr_price_action field presence
- API response time (must be < 25s even when NSE unreachable)
- signal_label and signal_color present for unavailable state
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

PCR_REQUIRED_KEYS = [
    "pcr", "total_call_oi", "total_put_oi",
    "signal", "signal_label", "signal_color",
    "signal_bg", "description", "caution", "source",
]
VALID_SIGNALS = [
    "UNAVAILABLE", "OVER_BEARISH", "BEARISH",
    "NEUTRAL_BEARISH", "BULLISH", "STRONG_BULLISH", "OVER_BULLISH",
]


class TestPCRInMarketIntel:
    """PCR field tests within /api/market-intel"""

    def test_market_intel_responds_within_25s(self):
        """API must respond within 25 seconds — even if NSE is unreachable"""
        start = time.time()
        resp = requests.get(f"{BASE_URL}/api/market-intel", timeout=30)
        elapsed = time.time() - start
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        assert elapsed < 25, f"API took {elapsed:.1f}s — exceeded 25s limit (PCR timeout not working)"
        print(f"PASS: /api/market-intel responded in {elapsed:.2f}s (< 25s)")

    def test_pcr_field_present_in_response(self):
        """Response must include 'pcr' field (object, not null)"""
        resp = requests.get(f"{BASE_URL}/api/market-intel", timeout=30)
        assert resp.status_code == 200
        data = resp.json()
        assert "pcr" in data, f"'pcr' key missing from response. Keys: {list(data.keys())}"
        assert data["pcr"] is not None, "'pcr' field should not be null"
        assert isinstance(data["pcr"], dict), f"'pcr' should be a dict, got {type(data['pcr'])}"
        print(f"PASS: pcr field present — signal={data['pcr'].get('signal')}")

    def test_pcr_field_has_all_required_keys(self):
        """PCR object must have all required keys"""
        resp = requests.get(f"{BASE_URL}/api/market-intel", timeout=30)
        assert resp.status_code == 200
        data = resp.json()
        pcr = data.get("pcr", {})
        missing = [k for k in PCR_REQUIRED_KEYS if k not in pcr]
        assert not missing, f"PCR missing required keys: {missing}. Got keys: {list(pcr.keys())}"
        print(f"PASS: PCR has all required keys: {PCR_REQUIRED_KEYS}")

    def test_pcr_signal_is_valid(self):
        """PCR signal value must be one of the valid signal strings"""
        resp = requests.get(f"{BASE_URL}/api/market-intel", timeout=30)
        assert resp.status_code == 200
        data = resp.json()
        pcr = data.get("pcr", {})
        signal = pcr.get("signal")
        assert signal in VALID_SIGNALS, \
            f"pcr.signal='{signal}' not in valid signals: {VALID_SIGNALS}"
        print(f"PASS: pcr.signal='{signal}' is valid")

    def test_pcr_signal_label_present_and_non_empty(self):
        """pcr.signal_label must be a non-empty string"""
        resp = requests.get(f"{BASE_URL}/api/market-intel", timeout=30)
        assert resp.status_code == 200
        data = resp.json()
        pcr = data.get("pcr", {})
        label = pcr.get("signal_label")
        assert label is not None, "pcr.signal_label should not be None"
        assert isinstance(label, str), f"pcr.signal_label should be str, got {type(label)}"
        assert len(label) > 0, "pcr.signal_label should not be empty"
        print(f"PASS: pcr.signal_label='{label}'")

    def test_pcr_signal_color_is_hex(self):
        """pcr.signal_color must be a hex color string"""
        resp = requests.get(f"{BASE_URL}/api/market-intel", timeout=30)
        assert resp.status_code == 200
        data = resp.json()
        pcr = data.get("pcr", {})
        color = pcr.get("signal_color")
        assert color is not None, "pcr.signal_color should not be None"
        assert isinstance(color, str), f"pcr.signal_color should be str, got {type(color)}"
        assert color.startswith("#"), f"pcr.signal_color should start with '#', got '{color}'"
        print(f"PASS: pcr.signal_color='{color}'")

    def test_pcr_unavailable_state_when_nse_blocked(self):
        """When NSE unreachable (cloud env), pcr.signal must be UNAVAILABLE with proper fields"""
        resp = requests.get(f"{BASE_URL}/api/market-intel", timeout=30)
        assert resp.status_code == 200
        data = resp.json()
        pcr = data.get("pcr", {})
        signal = pcr.get("signal")

        if signal == "UNAVAILABLE":
            # Verify the UNAVAILABLE state has proper fallback values
            assert pcr.get("signal_label") == "PCR Unavailable", \
                f"Expected 'PCR Unavailable', got '{pcr.get('signal_label')}'"
            assert pcr.get("signal_color") == "#64748b", \
                f"Expected '#64748b', got '{pcr.get('signal_color')}'"
            assert pcr.get("pcr") == 0.0, f"Expected pcr=0.0 when unavailable, got {pcr.get('pcr')}"
            assert pcr.get("source") in ("unavailable", "timeout"), \
                f"Expected source='unavailable' or 'timeout', got '{pcr.get('source')}'"
            print(f"PASS: PCR UNAVAILABLE state is correctly formed (NSE blocked in cloud — expected)")
        else:
            # NSE was reachable — verify live data
            assert pcr.get("pcr", 0) > 0, f"Live PCR value should be > 0, got {pcr.get('pcr')}"
            assert pcr.get("source") == "nse_live", f"Expected source='nse_live', got {pcr.get('source')}"
            print(f"PASS: PCR live data — pcr={pcr.get('pcr')}, signal={signal}")

    def test_pcr_history_field_present(self):
        """pcr_history field must be present in response (may be empty list)"""
        resp = requests.get(f"{BASE_URL}/api/market-intel", timeout=30)
        assert resp.status_code == 200
        data = resp.json()
        assert "pcr_history" in data, \
            f"'pcr_history' key missing from response. Keys: {list(data.keys())}"
        history = data["pcr_history"]
        assert isinstance(history, list), f"'pcr_history' should be a list, got {type(history)}"
        print(f"PASS: pcr_history present — {len(history)} entries")

    def test_pcr_price_action_field_present(self):
        """pcr_price_action field must be present in response"""
        resp = requests.get(f"{BASE_URL}/api/market-intel", timeout=30)
        assert resp.status_code == 200
        data = resp.json()
        assert "pcr_price_action" in data, \
            f"'pcr_price_action' key missing. Keys: {list(data.keys())}"
        pa = data["pcr_price_action"]
        assert isinstance(pa, dict), f"'pcr_price_action' should be a dict, got {type(pa)}"
        assert "signal" in pa, f"pcr_price_action.signal missing. Got: {pa}"
        assert "label" in pa, f"pcr_price_action.label missing"
        assert "color" in pa, f"pcr_price_action.color missing"
        print(f"PASS: pcr_price_action present — signal={pa.get('signal')}")

    def test_pcr_caution_field_is_bool(self):
        """pcr.caution must be a boolean"""
        resp = requests.get(f"{BASE_URL}/api/market-intel", timeout=30)
        assert resp.status_code == 200
        data = resp.json()
        pcr = data.get("pcr", {})
        caution = pcr.get("caution")
        assert isinstance(caution, bool), \
            f"pcr.caution should be bool, got {type(caution).__name__}: {caution}"
        print(f"PASS: pcr.caution={caution} (bool)")

    def test_pcr_source_field_is_string(self):
        """pcr.source must be a non-empty string"""
        resp = requests.get(f"{BASE_URL}/api/market-intel", timeout=30)
        assert resp.status_code == 200
        data = resp.json()
        pcr = data.get("pcr", {})
        source = pcr.get("source")
        assert source is not None, "pcr.source should not be None"
        assert isinstance(source, str), f"pcr.source should be str, got {type(source)}"
        assert len(source) > 0, "pcr.source should not be empty"
        print(f"PASS: pcr.source='{source}'")

    def test_api_second_call_uses_cache(self):
        """Second consecutive call should be fast (cache hit < 1000ms)"""
        # Warm the cache
        requests.get(f"{BASE_URL}/api/market-intel", timeout=30)
        # Second call
        start = time.time()
        resp = requests.get(f"{BASE_URL}/api/market-intel", timeout=10)
        elapsed_ms = (time.time() - start) * 1000
        assert resp.status_code == 200
        assert elapsed_ms < 1000, f"Cache hit took {elapsed_ms:.0f}ms, expected < 1000ms"
        data = resp.json()
        # PCR should still be present in cached response
        assert "pcr" in data, "pcr missing from cached response"
        print(f"PASS: Cache hit in {elapsed_ms:.0f}ms, pcr present")
