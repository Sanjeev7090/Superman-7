"""
Tests for Brent Crude live update fix in Market Intelligence panel.
Verifies: history-based brent price, day/week/month changes, and other market data.
"""

import pytest
import requests
import os
import math

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")


@pytest.fixture(scope="module")
def market_intel_data():
    """Fetch /api/market-intel once for all tests in this module."""
    r = requests.get(f"{BASE_URL}/api/market-intel", timeout=30)
    assert r.status_code == 200, f"API returned {r.status_code}"
    return r.json()


class TestBrentFields:
    """Brent Crude price & change fields returned by /api/market-intel."""

    def test_brent_price_non_zero(self, market_intel_data):
        """Brent price must be a valid non-zero float (not 0, not null)."""
        brent = market_intel_data.get("brent")
        assert brent is not None, "brent field missing from response"
        assert isinstance(brent, (int, float)), f"brent not numeric: {brent}"
        assert brent > 0, f"brent is 0 or negative: {brent}"

    def test_brent_price_reasonable_range(self, market_intel_data):
        """Brent price should be in a realistic crude oil price range (>40, <200)."""
        brent = market_intel_data["brent"]
        assert 40 < brent < 200, f"brent={brent} outside realistic range (40–200)"

    def test_brent_chg_pct_present_and_not_nan(self, market_intel_data):
        """brent_chg_pct must be present and not NaN/None."""
        chg = market_intel_data.get("brent_chg_pct")
        assert chg is not None, "brent_chg_pct field missing"
        assert isinstance(chg, (int, float)), f"brent_chg_pct not numeric: {chg}"
        assert not math.isnan(chg), "brent_chg_pct is NaN"

    def test_brent_chg_pct_reasonable_range(self, market_intel_data):
        """Day change should be within ±30% (extreme but catches rollover artifacts)."""
        chg = market_intel_data["brent_chg_pct"]
        assert -30 <= chg <= 30, f"brent_chg_pct={chg} looks like a rollover artifact (>±30%)"

    def test_brent_chg_week_present(self, market_intel_data):
        """brent_chg_week field must be present."""
        assert "brent_chg_week" in market_intel_data, "brent_chg_week field missing"

    def test_brent_chg_week_not_nan(self, market_intel_data):
        """brent_chg_week must not be NaN if present."""
        chg = market_intel_data.get("brent_chg_week")
        if chg is not None:
            assert not (isinstance(chg, float) and math.isnan(chg)), "brent_chg_week is NaN"

    def test_brent_chg_month_present(self, market_intel_data):
        """brent_chg_month field must be present."""
        assert "brent_chg_month" in market_intel_data, "brent_chg_month field missing"

    def test_brent_chg_month_not_nan(self, market_intel_data):
        """brent_chg_month must not be NaN if present."""
        chg = market_intel_data.get("brent_chg_month")
        if chg is not None:
            assert not (isinstance(chg, float) and math.isnan(chg)), "brent_chg_month is NaN"


class TestOtherMarketData:
    """VIX, Nifty, GIFT Nifty, PCR still load correctly after Brent fix."""

    def test_vix_present_and_positive(self, market_intel_data):
        vix = market_intel_data.get("vix")
        assert vix is not None, "vix field missing"
        assert vix > 0, f"vix is 0 or negative: {vix}"

    def test_vix_chg_pct_present(self, market_intel_data):
        assert "vix_chg_pct" in market_intel_data, "vix_chg_pct field missing"

    def test_nifty_present_and_realistic(self, market_intel_data):
        nifty = market_intel_data.get("nifty")
        assert nifty is not None, "nifty field missing"
        assert 10000 < nifty < 100000, f"nifty={nifty} unrealistic"

    def test_nifty_chg_pct_present(self, market_intel_data):
        assert "nifty_chg_pct" in market_intel_data, "nifty_chg_pct field missing"

    def test_gift_nifty_present_and_realistic(self, market_intel_data):
        gift = market_intel_data.get("gift_nifty")
        assert gift is not None, "gift_nifty field missing"
        assert 10000 < gift < 100000, f"gift_nifty={gift} unrealistic"

    def test_gift_premium_present(self, market_intel_data):
        assert "gift_premium" in market_intel_data, "gift_premium field missing"

    def test_pcr_field_present(self, market_intel_data):
        """PCR object must be present (may be UNAVAILABLE in cloud env)."""
        assert "pcr" in market_intel_data, "pcr field missing"
        assert isinstance(market_intel_data["pcr"], dict), "pcr not a dict"

    def test_pcr_has_signal(self, market_intel_data):
        pcr = market_intel_data["pcr"]
        assert "signal" in pcr, "pcr.signal missing"

    def test_vix_chg_week_present(self, market_intel_data):
        assert "vix_chg_week" in market_intel_data, "vix_chg_week missing"

    def test_vix_chg_month_present(self, market_intel_data):
        assert "vix_chg_month" in market_intel_data, "vix_chg_month missing"


class TestResponseStructure:
    """Overall response structure validation."""

    def test_api_status_200(self):
        r = requests.get(f"{BASE_URL}/api/market-intel", timeout=30)
        assert r.status_code == 200

    def test_bias_field_present(self, market_intel_data):
        assert "bias" in market_intel_data, "bias field missing"

    def test_bias_valid_value(self, market_intel_data):
        valid_biases = {"Strong Bullish", "Mild Bullish", "Neutral", "Mild Bearish", "Strong Bearish"}
        assert market_intel_data["bias"] in valid_biases, f"Unknown bias: {market_intel_data['bias']}"

    def test_updated_at_present(self, market_intel_data):
        assert "updated_at" in market_intel_data, "updated_at field missing"
