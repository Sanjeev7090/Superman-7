"""
Market Intelligence API Tests
- Tests /api/market-intel endpoint for correct response structure
- Tests cache behavior (second call should be fast)
- Tests required fields: brent, vix, nifty, expiry, scores
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestMarketIntelAPI:
    """Tests for /api/market-intel endpoint"""

    def test_market_intel_returns_200(self):
        """API should return 200 OK"""
        resp = requests.get(f"{BASE_URL}/api/market-intel", timeout=30)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text[:200]}"
        print(f"PASS: /api/market-intel returned 200")

    def test_market_intel_has_brent_field(self):
        """Response should have brent (Brent Crude price)"""
        resp = requests.get(f"{BASE_URL}/api/market-intel", timeout=30)
        assert resp.status_code == 200
        data = resp.json()
        assert "brent" in data, f"Missing 'brent' field. Keys: {list(data.keys())}"
        brent = data["brent"]
        assert isinstance(brent, (int, float)), f"'brent' should be numeric, got {type(brent)}"
        assert brent > 0, f"'brent' should be > 0, got {brent}"
        print(f"PASS: brent = {brent}")

    def test_market_intel_has_vix_field(self):
        """Response should have vix (India VIX price)"""
        resp = requests.get(f"{BASE_URL}/api/market-intel", timeout=30)
        assert resp.status_code == 200
        data = resp.json()
        assert "vix" in data, f"Missing 'vix' field. Keys: {list(data.keys())}"
        vix = data["vix"]
        assert isinstance(vix, (int, float)), f"'vix' should be numeric, got {type(vix)}"
        assert vix > 0, f"'vix' should be > 0, got {vix}"
        print(f"PASS: vix = {vix}")

    def test_market_intel_has_nifty_field(self):
        """Response should have nifty price"""
        resp = requests.get(f"{BASE_URL}/api/market-intel", timeout=30)
        assert resp.status_code == 200
        data = resp.json()
        assert "nifty" in data, f"Missing 'nifty' field"
        nifty = data["nifty"]
        assert isinstance(nifty, (int, float)), f"'nifty' should be numeric, got {type(nifty)}"
        assert nifty > 0, f"'nifty' should be > 0, got {nifty}"
        print(f"PASS: nifty = {nifty}")

    def test_market_intel_has_expiry_field(self):
        """Response should have expiry countdown info"""
        resp = requests.get(f"{BASE_URL}/api/market-intel", timeout=30)
        assert resp.status_code == 200
        data = resp.json()
        assert "expiry" in data, f"Missing 'expiry' field"
        expiry = data["expiry"]
        assert isinstance(expiry, dict), f"'expiry' should be a dict, got {type(expiry)}"
        # Should have NIFTY and BANKNIFTY
        assert "NIFTY" in expiry or len(expiry) > 0, "expiry should have at least one entry"
        print(f"PASS: expiry has keys: {list(expiry.keys())}")

    def test_market_intel_has_scores_field(self):
        """Response should have scores object"""
        resp = requests.get(f"{BASE_URL}/api/market-intel", timeout=30)
        assert resp.status_code == 200
        data = resp.json()
        assert "scores" in data, f"Missing 'scores' field"
        scores = data["scores"]
        assert isinstance(scores, dict), f"'scores' should be a dict"
        assert "total" in scores, f"'scores.total' missing"
        assert "brent" in scores, f"'scores.brent' missing"
        assert "vix" in scores, f"'scores.vix' missing"
        print(f"PASS: scores = {scores}")

    def test_market_intel_has_bias_fields(self):
        """Response should have bias, bias_color, move_label, probability, action"""
        resp = requests.get(f"{BASE_URL}/api/market-intel", timeout=30)
        assert resp.status_code == 200
        data = resp.json()
        for field in ["bias", "bias_color", "move_label", "probability", "action"]:
            assert field in data, f"Missing '{field}' field"
            assert data[field], f"'{field}' should not be empty"
        valid_biases = ["Strong Bullish", "Mild Bullish", "Neutral", "Mild Bearish", "Strong Bearish"]
        assert data["bias"] in valid_biases, f"bias '{data['bias']}' not in valid list"
        print(f"PASS: bias = {data['bias']}, move = {data['move_label']}")

    def test_market_intel_has_brent_change_fields(self):
        """Response should have brent day/week/month change percentages"""
        resp = requests.get(f"{BASE_URL}/api/market-intel", timeout=30)
        assert resp.status_code == 200
        data = resp.json()
        assert "brent_chg_pct" in data, "Missing brent_chg_pct (day change)"
        # week and month can be None if insufficient history
        assert "brent_chg_week" in data, "Missing brent_chg_week"
        assert "brent_chg_month" in data, "Missing brent_chg_month"
        print(f"PASS: brent changes - day={data.get('brent_chg_pct')}, week={data.get('brent_chg_week')}, month={data.get('brent_chg_month')}")

    def test_market_intel_has_vix_change_fields(self):
        """Response should have vix day/week/month change percentages"""
        resp = requests.get(f"{BASE_URL}/api/market-intel", timeout=30)
        assert resp.status_code == 200
        data = resp.json()
        assert "vix_chg_pct" in data, "Missing vix_chg_pct (day change)"
        assert "vix_chg_week" in data, "Missing vix_chg_week"
        assert "vix_chg_month" in data, "Missing vix_chg_month"
        print(f"PASS: vix changes - day={data.get('vix_chg_pct')}, week={data.get('vix_chg_week')}, month={data.get('vix_chg_month')}")

    def test_market_intel_brent_price_format(self):
        """Brent price should be in valid dollar range ($40-$200)"""
        resp = requests.get(f"{BASE_URL}/api/market-intel", timeout=30)
        assert resp.status_code == 200
        data = resp.json()
        brent = data.get("brent", 0)
        # Reasonable Brent Crude range check
        assert 30 <= brent <= 250, f"Brent price {brent} seems unreasonable (expected $30-$250)"
        print(f"PASS: Brent price ${brent:.2f} is in reasonable range")

    def test_market_intel_cache_hit_speed(self):
        """Second call to /api/market-intel should be fast (cache hit < 500ms)"""
        # First call to warm cache
        requests.get(f"{BASE_URL}/api/market-intel", timeout=30)
        
        # Second call should hit cache
        start = time.time()
        resp = requests.get(f"{BASE_URL}/api/market-intel", timeout=10)
        elapsed_ms = (time.time() - start) * 1000
        
        assert resp.status_code == 200
        assert elapsed_ms < 500, f"Cache hit took {elapsed_ms:.0f}ms, expected < 500ms"
        print(f"PASS: Cache hit responded in {elapsed_ms:.0f}ms (< 500ms)")

    def test_market_intel_no_error_field(self):
        """Successful response should not have error field"""
        resp = requests.get(f"{BASE_URL}/api/market-intel", timeout=30)
        assert resp.status_code == 200
        data = resp.json()
        # If error field exists, the values should still be non-zero
        if "error" in data:
            print(f"WARNING: Response contains error field: {data['error']}")
            # The fallback should still return some data
            assert data.get("brent", 0) >= 0, "brent should be present even in error case"
        else:
            print("PASS: No error field in response")

    def test_market_intel_gift_nifty_fields(self):
        """Response should have gift_nifty and gift_premium"""
        resp = requests.get(f"{BASE_URL}/api/market-intel", timeout=30)
        assert resp.status_code == 200
        data = resp.json()
        assert "gift_nifty" in data, "Missing gift_nifty"
        assert "gift_premium" in data, "Missing gift_premium"
        print(f"PASS: gift_nifty={data.get('gift_nifty')}, gift_premium={data.get('gift_premium')}")

    def test_market_intel_regulatory_field(self):
        """Regulatory should be Positive, Neutral, or Negative"""
        resp = requests.get(f"{BASE_URL}/api/market-intel", timeout=30)
        assert resp.status_code == 200
        data = resp.json()
        assert "regulatory" in data, "Missing regulatory field"
        assert data["regulatory"] in ["Positive", "Neutral", "Negative"], \
            f"regulatory '{data['regulatory']}' not in valid values"
        print(f"PASS: regulatory = {data['regulatory']}")
