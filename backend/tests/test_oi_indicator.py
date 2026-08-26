"""
OI Indicator endpoint tests — /api/oi-indicator/nifty
Tests: response structure, data validity, performance (no hang), toggle-safe response
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestOIIndicator:
    """Tests for OI Indicator API endpoint"""

    def test_oi_endpoint_returns_200(self):
        """OI endpoint should return 200 OK"""
        r = requests.get(f"{BASE_URL}/api/oi-indicator/nifty", timeout=15)
        assert r.status_code == 200, f"Expected 200, got {r.status_code}: {r.text[:200]}"
        print("PASS: OI endpoint returns 200")

    def test_oi_endpoint_response_structure(self):
        """OI endpoint should return all required keys"""
        r = requests.get(f"{BASE_URL}/api/oi-indicator/nifty", timeout=15)
        assert r.status_code == 200
        data = r.json()

        required_keys = ['symbol', 'spot_price', 'pcr', 'pcr_zone', 'max_pain',
                         'call_wall', 'put_wall', 'signal', 'signal_desc',
                         'signal_color', 'top_strikes', 'updated_at']
        for key in required_keys:
            assert key in data, f"Missing key: {key}"
        print(f"PASS: All required keys present: {list(data.keys())}")

    def test_oi_endpoint_data_types(self):
        """Validate data types of OI response"""
        r = requests.get(f"{BASE_URL}/api/oi-indicator/nifty", timeout=15)
        assert r.status_code == 200
        data = r.json()

        assert isinstance(data['symbol'], str), "symbol must be string"
        assert isinstance(data['pcr'], (int, float)), "pcr must be numeric"
        assert isinstance(data['max_pain'], (int, float)), "max_pain must be numeric"
        assert isinstance(data['call_wall'], (int, float)), "call_wall must be numeric"
        assert isinstance(data['put_wall'], (int, float)), "put_wall must be numeric"
        assert isinstance(data['signal'], str), "signal must be string"
        assert isinstance(data['top_strikes'], list), "top_strikes must be list"
        print(f"PASS: Data types correct — PCR={data['pcr']}, Signal={data['signal']}")

    def test_oi_endpoint_response_time(self):
        """OI endpoint should respond within 15 seconds (no hang/freeze)"""
        start = time.time()
        r = requests.get(f"{BASE_URL}/api/oi-indicator/nifty", timeout=15)
        elapsed = time.time() - start
        assert r.status_code == 200
        assert elapsed < 15.0, f"Response took {elapsed:.1f}s — too slow (hang risk)"
        print(f"PASS: Response time = {elapsed:.2f}s (< 15s limit)")

    def test_oi_endpoint_pcr_valid_range(self):
        """PCR should be a positive number (0 might mean no data but not negative)"""
        r = requests.get(f"{BASE_URL}/api/oi-indicator/nifty", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert data['pcr'] >= 0, f"PCR should be >= 0, got {data['pcr']}"
        print(f"PASS: PCR = {data['pcr']} (valid)")

    def test_oi_endpoint_signal_valid_value(self):
        """Signal should be one of the expected 4 values"""
        r = requests.get(f"{BASE_URL}/api/oi-indicator/nifty", timeout=15)
        assert r.status_code == 200
        data = r.json()
        valid_signals = ["STRONG BULLISH", "SHORT COVERING", "LONG UNWINDING", "STRONG BEARISH"]
        assert data['signal'] in valid_signals, f"Unexpected signal: {data['signal']}"
        print(f"PASS: Signal = '{data['signal']}' (valid)")

    def test_oi_endpoint_top_strikes_structure(self):
        """top_strikes list items should have required keys"""
        r = requests.get(f"{BASE_URL}/api/oi-indicator/nifty", timeout=15)
        assert r.status_code == 200
        data = r.json()
        if data['top_strikes']:
            row = data['top_strikes'][0]
            assert 'strike' in row, "top_strikes row missing 'strike'"
            assert 'call_oi' in row, "top_strikes row missing 'call_oi'"
            assert 'put_oi' in row, "top_strikes row missing 'put_oi'"
            print(f"PASS: top_strikes[0] = {row}")
        else:
            print("INFO: top_strikes is empty (NSE may be closed)")

    def test_oi_endpoint_no_mongo_id_leak(self):
        """Response should not contain MongoDB _id field"""
        r = requests.get(f"{BASE_URL}/api/oi-indicator/nifty", timeout=15)
        assert r.status_code == 200
        data = r.json()
        assert '_id' not in data, "MongoDB _id leaked in response"
        print("PASS: No MongoDB _id in response")

    def test_oi_endpoint_caching_second_call_faster(self):
        """Second call should use cache and be very fast"""
        # First call (may hit cache already)
        requests.get(f"{BASE_URL}/api/oi-indicator/nifty", timeout=15)

        # Second call — should be cached
        start = time.time()
        r = requests.get(f"{BASE_URL}/api/oi-indicator/nifty", timeout=15)
        elapsed = time.time() - start
        assert r.status_code == 200
        assert elapsed < 2.0, f"Cached response took {elapsed:.2f}s (should be < 2s)"
        print(f"PASS: Cached response time = {elapsed:.3f}s")
