"""
Nifty 50 Breadth Feature Tests
- Tests /api/market-intel for breadth object presence and structure
- Tests breadth signal validity
- Tests matrix rows for breadth_ref field
- Brent regression check (non-zero)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

VALID_SIGNALS = {"STRONG_BULL", "BULL", "MILD_BULL", "NEUTRAL", "MILD_BEAR", "STRONG_BEAR", "UNKNOWN"}
EXPECTED_BREADTH_REFS = {"28+", "22-27", "18-22", "12-17", "<12"}

@pytest.fixture(scope="module")
def market_intel_data():
    """Fetch /api/market-intel once and reuse across tests."""
    resp = requests.get(f"{BASE_URL}/api/market-intel", timeout=35)
    assert resp.status_code == 200, f"API returned {resp.status_code}: {resp.text[:300]}"
    return resp.json()


class TestBreadthObject:
    """Tests for breadth object in /api/market-intel response"""

    def test_breadth_key_present(self, market_intel_data):
        """breadth key must be present in response"""
        assert "breadth" in market_intel_data, \
            f"Missing 'breadth' key. Top-level keys: {list(market_intel_data.keys())}"
        print(f"PASS: breadth key present")

    def test_breadth_is_dict(self, market_intel_data):
        """breadth should be a dict (not empty list / None)"""
        breadth = market_intel_data["breadth"]
        assert isinstance(breadth, dict), f"breadth should be dict, got {type(breadth)}"
        print(f"PASS: breadth is dict with keys: {list(breadth.keys())}")

    def test_breadth_has_advances(self, market_intel_data):
        """breadth.advances must be present"""
        breadth = market_intel_data["breadth"]
        assert "advances" in breadth, f"Missing 'advances' in breadth: {breadth}"
        assert isinstance(breadth["advances"], int), \
            f"advances should be int, got {type(breadth['advances'])}"
        print(f"PASS: breadth.advances = {breadth['advances']}")

    def test_breadth_has_declines(self, market_intel_data):
        """breadth.declines must be present"""
        breadth = market_intel_data["breadth"]
        assert "declines" in breadth, f"Missing 'declines' in breadth: {breadth}"
        assert isinstance(breadth["declines"], int), \
            f"declines should be int, got {type(breadth['declines'])}"
        print(f"PASS: breadth.declines = {breadth['declines']}")

    def test_breadth_has_total(self, market_intel_data):
        """breadth.total must be present and >= 1"""
        breadth = market_intel_data["breadth"]
        assert "total" in breadth, f"Missing 'total' in breadth"
        assert isinstance(breadth["total"], int), f"total should be int, got {type(breadth['total'])}"
        assert breadth["total"] >= 1, f"total should be >= 1, got {breadth['total']}"
        print(f"PASS: breadth.total = {breadth['total']}")

    def test_breadth_has_signal(self, market_intel_data):
        """breadth.signal must be present"""
        breadth = market_intel_data["breadth"]
        assert "signal" in breadth, f"Missing 'signal' in breadth: {breadth}"
        print(f"PASS: breadth.signal = {breadth['signal']}")

    def test_breadth_has_signal_label(self, market_intel_data):
        """breadth.signal_label must be present and non-empty"""
        breadth = market_intel_data["breadth"]
        assert "signal_label" in breadth, f"Missing 'signal_label' in breadth"
        assert breadth["signal_label"], f"signal_label should not be empty"
        print(f"PASS: breadth.signal_label = '{breadth['signal_label']}'")

    def test_breadth_has_impact_label(self, market_intel_data):
        """breadth.impact_label must be present"""
        breadth = market_intel_data["breadth"]
        assert "impact_label" in breadth, f"Missing 'impact_label' in breadth: {breadth}"
        print(f"PASS: breadth.impact_label = '{breadth['impact_label']}'")

    def test_breadth_signal_is_valid_value(self, market_intel_data):
        """breadth.signal must be one of the valid enum values"""
        breadth = market_intel_data["breadth"]
        signal = breadth.get("signal", "")
        assert signal in VALID_SIGNALS, \
            f"signal '{signal}' not in valid set {VALID_SIGNALS}"
        print(f"PASS: breadth.signal '{signal}' is valid")

    def test_breadth_data_consistency(self, market_intel_data):
        """advances + declines <= total (data consistency)"""
        breadth = market_intel_data["breadth"]
        advances = breadth.get("advances", 0)
        declines = breadth.get("declines", 0)
        total    = breadth.get("total", 50)
        assert advances + declines <= total, \
            f"advances({advances}) + declines({declines}) = {advances+declines} > total({total})"
        print(f"PASS: {advances}A + {declines}D = {advances+declines} <= {total} total")

    def test_breadth_advances_in_valid_range(self, market_intel_data):
        """advances should be 0-50 (Nifty 50 stocks)"""
        breadth = market_intel_data["breadth"]
        adv = breadth.get("advances", 0)
        total = breadth.get("total", 50)
        assert 0 <= adv <= total, f"advances {adv} not in range 0-{total}"
        print(f"PASS: advances {adv} in valid range 0-{total}")

    def test_breadth_declines_in_valid_range(self, market_intel_data):
        """declines should be 0-50"""
        breadth = market_intel_data["breadth"]
        dec = breadth.get("declines", 0)
        total = breadth.get("total", 50)
        assert 0 <= dec <= total, f"declines {dec} not in range 0-{total}"
        print(f"PASS: declines {dec} in valid range 0-{total}")

    def test_breadth_signal_matches_advances(self, market_intel_data):
        """Signal value should match advances count per decision matrix rules"""
        breadth = market_intel_data["breadth"]
        advances = breadth.get("advances", 0)
        signal   = breadth.get("signal", "")
        # Only validate if we have real data (advances > 0)
        if advances == 0:
            pytest.skip("advances=0, likely no data — skipping signal match check")
        expected = None
        if advances >= 35:  expected = "STRONG_BULL"
        elif advances >= 28: expected = "BULL"
        elif advances >= 22: expected = "MILD_BULL"
        elif advances >= 18: expected = "NEUTRAL"
        elif advances >= 12: expected = "MILD_BEAR"
        else:               expected = "STRONG_BEAR"
        assert signal == expected, \
            f"For advances={advances}, expected signal={expected}, got signal={signal}"
        print(f"PASS: advances={advances} → signal={signal} (correct)")


class TestMatrixBreadthRef:
    """Tests that matrix rows in /api/market-intel contain breadth_ref field"""

    def test_matrix_key_present(self, market_intel_data):
        """matrix key should be present in response"""
        assert "matrix" in market_intel_data, \
            f"Missing 'matrix' key. Keys: {list(market_intel_data.keys())}"
        print(f"PASS: matrix key present")

    def test_matrix_is_list_of_5(self, market_intel_data):
        """matrix should be a list with 5 bias levels"""
        matrix = market_intel_data["matrix"]
        assert isinstance(matrix, list), f"matrix should be list, got {type(matrix)}"
        assert len(matrix) == 5, f"matrix should have 5 rows, got {len(matrix)}"
        print(f"PASS: matrix has {len(matrix)} rows")

    def test_matrix_rows_have_breadth_ref(self, market_intel_data):
        """Every matrix row must have a breadth_ref field"""
        matrix = market_intel_data["matrix"]
        for i, row in enumerate(matrix):
            assert "breadth_ref" in row, \
                f"Row {i} (label={row.get('label')}) missing 'breadth_ref'. Keys: {list(row.keys())}"
        print(f"PASS: all {len(matrix)} matrix rows have breadth_ref")

    def test_matrix_breadth_ref_values(self, market_intel_data):
        """breadth_ref values should be one of the expected ranges"""
        matrix = market_intel_data["matrix"]
        found_refs = {row.get("breadth_ref") for row in matrix}
        assert found_refs == EXPECTED_BREADTH_REFS, \
            f"breadth_ref values mismatch. Expected {EXPECTED_BREADTH_REFS}, got {found_refs}"
        print(f"PASS: matrix breadth_ref values = {found_refs}")

    def test_matrix_strong_bull_has_28plus(self, market_intel_data):
        """Strong Bullish row should have breadth_ref='28+'"""
        matrix = market_intel_data["matrix"]
        bull_row = next((r for r in matrix if r.get("label") == "Strong Bullish"), None)
        assert bull_row is not None, "No 'Strong Bullish' row in matrix"
        assert bull_row.get("breadth_ref") == "28+", \
            f"Strong Bullish breadth_ref should be '28+', got '{bull_row.get('breadth_ref')}'"
        print(f"PASS: Strong Bullish breadth_ref = '28+'")

    def test_matrix_strong_bear_has_lt12(self, market_intel_data):
        """Strong Bearish row should have breadth_ref='<12'"""
        matrix = market_intel_data["matrix"]
        bear_row = next((r for r in matrix if r.get("label") == "Strong Bearish"), None)
        assert bear_row is not None, "No 'Strong Bearish' row in matrix"
        assert bear_row.get("breadth_ref") == "<12", \
            f"Strong Bearish breadth_ref should be '<12', got '{bear_row.get('breadth_ref')}'"
        print(f"PASS: Strong Bearish breadth_ref = '<12'")


class TestBrentRegression:
    """Regression test: Brent Crude price must be non-zero (previous bug fix)"""

    def test_brent_non_zero(self, market_intel_data):
        """Brent price should not be 0 (regression check for previous $0 bug)"""
        brent = market_intel_data.get("brent", 0)
        assert brent > 0, f"Brent price is 0 — regression! The $0 bug may have returned."
        print(f"PASS: brent = ${brent:.2f} (non-zero)")

    def test_brent_reasonable_range(self, market_intel_data):
        """Brent price should be in $30-$250 range"""
        brent = market_intel_data.get("brent", 0)
        assert 30 <= brent <= 250, \
            f"Brent ${brent:.2f} outside reasonable range $30-$250"
        print(f"PASS: brent = ${brent:.2f} in reasonable range")
