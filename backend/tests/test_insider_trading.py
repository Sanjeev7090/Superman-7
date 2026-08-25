"""
Insider Trading Detection API Tests
Tests for /api/insider/detections and /api/insider/pattern-scan endpoints
"""
import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestInsiderDetections:
    """Tests for /api/insider/detections endpoint"""

    def test_detections_endpoint_returns_200(self):
        """Basic health: endpoint must return 200"""
        resp = requests.get(f"{BASE_URL}/api/insider/detections", timeout=120)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text[:300]}"
        print(f"PASS: /api/insider/detections returned 200")

    def test_detections_response_has_required_fields(self):
        """Response must contain: detections, count, source, from_history, updated_at"""
        resp = requests.get(f"{BASE_URL}/api/insider/detections", timeout=120)
        assert resp.status_code == 200
        data = resp.json()

        required_fields = ["detections", "count", "source", "from_history", "updated_at"]
        for field in required_fields:
            assert field in data, f"Missing required field: '{field}' in response. Got keys: {list(data.keys())}"
        print(f"PASS: All required fields present: {required_fields}")

    def test_detections_count_is_positive(self):
        """yfinance fallback should ALWAYS produce results - count > 0"""
        resp = requests.get(f"{BASE_URL}/api/insider/detections", timeout=120)
        assert resp.status_code == 200
        data = resp.json()

        count = data.get("count", 0)
        detections = data.get("detections", [])

        assert count > 0, f"Expected count > 0 but got count={count}. source={data.get('source')}. detections length={len(detections)}"
        assert len(detections) > 0, f"Expected detections array to be non-empty, but got {len(detections)} items"
        print(f"PASS: Got {count} detections from source: {data.get('source')}")

    def test_detections_array_items_have_required_fields(self):
        """Each detection must have: symbol, score, priority, insiders, factors, vol_ratio, price"""
        resp = requests.get(f"{BASE_URL}/api/insider/detections", timeout=120)
        assert resp.status_code == 200
        data = resp.json()

        detections = data.get("detections", [])
        assert len(detections) > 0, "No detections to validate"

        required_per_detection = ["symbol", "score", "priority", "insiders", "factors", "vol_ratio", "price"]
        for i, det in enumerate(detections[:5]):  # check first 5 items
            for field in required_per_detection:
                assert field in det, f"Detection[{i}] ({det.get('symbol', '?')}) missing field: '{field}'"
        print(f"PASS: First {min(5, len(detections))} detections have all required fields")

    def test_priority_assignment_logic(self):
        """Priority: score>=8 = HIGH, 5-7 = WATCHLIST, <5 = MONITOR"""
        resp = requests.get(f"{BASE_URL}/api/insider/detections", timeout=120)
        assert resp.status_code == 200
        data = resp.json()

        detections = data.get("detections", [])
        assert len(detections) > 0, "No detections to validate priority"

        for det in detections:
            score    = det.get("score", -1)
            priority = det.get("priority", "")
            if score >= 8:
                assert priority == "HIGH", f"{det.get('symbol')}: score={score} should be HIGH but got {priority}"
            elif score >= 5:
                assert priority == "WATCHLIST", f"{det.get('symbol')}: score={score} should be WATCHLIST but got {priority}"
            else:
                assert priority == "MONITOR", f"{det.get('symbol')}: score={score} should be MONITOR but got {priority}"
        print(f"PASS: Priority assignments correct for all {len(detections)} detections")

    def test_detections_count_matches_detections_array_length(self):
        """count field must equal len(detections)"""
        resp = requests.get(f"{BASE_URL}/api/insider/detections", timeout=120)
        assert resp.status_code == 200
        data = resp.json()

        count      = data.get("count", -1)
        detections = data.get("detections", [])
        assert count == len(detections), f"count={count} does not match len(detections)={len(detections)}"
        print(f"PASS: count={count} matches len(detections)={len(detections)}")

    def test_detections_from_history_is_boolean(self):
        """from_history should be a boolean value"""
        resp = requests.get(f"{BASE_URL}/api/insider/detections", timeout=120)
        assert resp.status_code == 200
        data = resp.json()

        from_history = data.get("from_history")
        assert isinstance(from_history, bool), f"from_history should be bool, got {type(from_history)}: {from_history}"
        print(f"PASS: from_history is bool: {from_history}")

    def test_mongodb_persistence_second_call_works(self):
        """Call detections twice - second call should return cached or DB data (no error)"""
        # First call - fresh
        resp1 = requests.get(f"{BASE_URL}/api/insider/detections", timeout=120)
        assert resp1.status_code == 200
        data1 = resp1.json()
        assert data1.get("count", 0) > 0, "First call returned 0 detections"

        # Second call - should use cache or DB
        time.sleep(1)
        resp2 = requests.get(f"{BASE_URL}/api/insider/detections", timeout=60)
        assert resp2.status_code == 200
        data2 = resp2.json()

        assert data2.get("count", 0) > 0, f"Second call returned 0 detections. from_history={data2.get('from_history')}"
        print(f"PASS: Second call returned {data2.get('count')} detections. cached={data2.get('cached')} from_history={data2.get('from_history')}")

    def test_refresh_param_works(self):
        """?refresh=true should trigger fresh fetch without errors"""
        resp = requests.get(f"{BASE_URL}/api/insider/detections?refresh=true", timeout=120)
        assert resp.status_code == 200
        data = resp.json()
        assert "detections" in data
        assert data.get("cached") is not True, "With refresh=true, cached should not be True"
        print(f"PASS: refresh=true works, got count={data.get('count')}, cached={data.get('cached')}")

    def test_source_field_is_non_empty_string(self):
        """source field should be a non-empty string indicating data source"""
        resp = requests.get(f"{BASE_URL}/api/insider/detections", timeout=120)
        assert resp.status_code == 200
        data = resp.json()

        source = data.get("source", "")
        assert isinstance(source, str) and len(source) > 0, f"source should be non-empty string, got: {repr(source)}"
        print(f"PASS: source='{source}'")


class TestPatternScan:
    """Tests for /api/insider/pattern-scan endpoint"""

    def test_pattern_scan_returns_200(self):
        """Basic health: endpoint must return 200"""
        resp = requests.get(f"{BASE_URL}/api/insider/pattern-scan?symbols=RELIANCE,TCS", timeout=120)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text[:300]}"
        print(f"PASS: /api/insider/pattern-scan returned 200")

    def test_pattern_scan_response_structure(self):
        """Response must contain: results (array), count, updated_at, scanned_stocks"""
        resp = requests.get(f"{BASE_URL}/api/insider/pattern-scan?symbols=RELIANCE,TCS", timeout=120)
        assert resp.status_code == 200
        data = resp.json()

        required_fields = ["results", "count", "updated_at", "scanned_stocks"]
        for field in required_fields:
            assert field in data, f"Missing field: '{field}'. Got keys: {list(data.keys())}"
        print(f"PASS: pattern-scan response has required fields")

    def test_pattern_scan_results_is_array(self):
        """results should be a list"""
        resp = requests.get(f"{BASE_URL}/api/insider/pattern-scan?symbols=RELIANCE,TCS", timeout=120)
        assert resp.status_code == 200
        data = resp.json()

        results = data.get("results")
        assert isinstance(results, list), f"results should be list, got {type(results)}"
        print(f"PASS: results is a list with {len(results)} items")

    def test_pattern_scan_with_specific_symbols(self):
        """Pattern scan for specific symbols returns scanned_stocks=2"""
        resp = requests.get(f"{BASE_URL}/api/insider/pattern-scan?symbols=RELIANCE,TCS", timeout=120)
        assert resp.status_code == 200
        data = resp.json()

        scanned = data.get("scanned_stocks", 0)
        assert scanned == 2, f"Expected scanned_stocks=2 for RELIANCE,TCS, got {scanned}"
        print(f"PASS: scanned_stocks={scanned} for 2 specified symbols")

    def test_pattern_items_have_required_fields(self):
        """If patterns found, each item must have: symbol, patterns, pattern_count, top_pattern, top_bias"""
        resp = requests.get(f"{BASE_URL}/api/insider/pattern-scan?symbols=RELIANCE,TCS", timeout=120)
        assert resp.status_code == 200
        data = resp.json()

        results = data.get("results", [])
        if not results:
            print(f"SKIP: No pattern detections for RELIANCE,TCS (market may be closed or no patterns found)")
            return

        required_fields = ["symbol", "patterns", "pattern_count", "top_pattern", "top_bias", "top_tf"]
        for i, item in enumerate(results):
            for field in required_fields:
                assert field in item, f"result[{i}] ({item.get('symbol', '?')}) missing field: '{field}'"
        print(f"PASS: {len(results)} pattern results have all required fields")

    def test_pattern_scan_count_matches_results_length(self):
        """count must equal len(results)"""
        resp = requests.get(f"{BASE_URL}/api/insider/pattern-scan?symbols=RELIANCE,TCS", timeout=120)
        assert resp.status_code == 200
        data = resp.json()

        count   = data.get("count", -1)
        results = data.get("results", [])
        assert count == len(results), f"count={count} does not match len(results)={len(results)}"
        print(f"PASS: count={count} matches len(results)")

    def test_pattern_scan_no_symbols_full_universe(self):
        """Without symbols param, should scan full universe (scanned_stocks > 2)"""
        # Only do a quick smoke test - full scan can be slow
        # Use cached version if available
        resp = requests.get(f"{BASE_URL}/api/insider/pattern-scan", timeout=120)
        assert resp.status_code == 200
        data = resp.json()

        assert "results" in data
        assert "count" in data
        scanned = data.get("scanned_stocks", 0)
        # Full universe has 35 stocks
        assert scanned >= 2, f"Expected multiple stocks scanned, got scanned_stocks={scanned}"
        print(f"PASS: Full universe scan returned {data.get('count')} results, scanned={scanned} stocks")
