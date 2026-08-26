"""
Tests for new features in iteration 43:
1. Sensex OI Integration: /api/rej/sensex-option-flow - is_real_oi, total_ce_oi, total_pe_oi, pcr_oi fields
2. NSE Bulk Deals market days (already tested implicitly via detections)
3. Pattern Alert Badge: /api/insider/pattern-scan?symbols=RELIANCE,HDFCBANK (5-stock sample)
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestSensexOptionFlowOI:
    """Tests for /api/rej/sensex-option-flow - new OI fields"""

    def test_sensex_option_flow_returns_200(self):
        """Endpoint must return 200"""
        resp = requests.get(f"{BASE_URL}/api/rej/sensex-option-flow", timeout=60)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text[:300]}"
        print(f"PASS: /api/rej/sensex-option-flow returned 200")

    def test_sensex_option_flow_has_oi_fields(self):
        """Response must have is_real_oi (bool), total_ce_oi (int), total_pe_oi (int), pcr_oi (float)"""
        resp = requests.get(f"{BASE_URL}/api/rej/sensex-option-flow", timeout=60)
        assert resp.status_code == 200
        data = resp.json()

        # Check is_real_oi field
        assert "is_real_oi" in data, f"Missing field 'is_real_oi'. Got keys: {list(data.keys())}"
        assert isinstance(data["is_real_oi"], bool), f"is_real_oi should be bool, got {type(data['is_real_oi'])}"

        # Check total_ce_oi field
        assert "total_ce_oi" in data, f"Missing field 'total_ce_oi'. Got keys: {list(data.keys())}"
        assert isinstance(data["total_ce_oi"], int), f"total_ce_oi should be int, got {type(data['total_ce_oi'])}"

        # Check total_pe_oi field
        assert "total_pe_oi" in data, f"Missing field 'total_pe_oi'. Got keys: {list(data.keys())}"
        assert isinstance(data["total_pe_oi"], int), f"total_pe_oi should be int, got {type(data['total_pe_oi'])}"

        # Check pcr_oi field
        assert "pcr_oi" in data, f"Missing field 'pcr_oi'. Got keys: {list(data.keys())}"
        assert isinstance(data["pcr_oi"], float), f"pcr_oi should be float, got {type(data['pcr_oi'])}"

        print(f"PASS: OI fields present - is_real_oi={data['is_real_oi']}, "
              f"total_ce_oi={data['total_ce_oi']}, total_pe_oi={data['total_pe_oi']}, "
              f"pcr_oi={data['pcr_oi']}")

    def test_sensex_option_flow_oi_values_non_negative(self):
        """OI values must be non-negative numbers"""
        resp = requests.get(f"{BASE_URL}/api/rej/sensex-option-flow", timeout=60)
        assert resp.status_code == 200
        data = resp.json()

        assert data.get("total_ce_oi", -1) >= 0, f"total_ce_oi must be >= 0, got {data.get('total_ce_oi')}"
        assert data.get("total_pe_oi", -1) >= 0, f"total_pe_oi must be >= 0, got {data.get('total_pe_oi')}"
        assert data.get("pcr_oi", -1) >= 0, f"pcr_oi must be >= 0, got {data.get('pcr_oi')}"
        print(f"PASS: OI values non-negative: CE={data['total_ce_oi']}, PE={data['total_pe_oi']}, PCR={data['pcr_oi']}")

    def test_sensex_option_flow_has_required_structure(self):
        """Response must have picks, criteria (call_buy/put_buy), spot data"""
        resp = requests.get(f"{BASE_URL}/api/rej/sensex-option-flow", timeout=60)
        assert resp.status_code == 200
        data = resp.json()

        # Core spot data fields
        assert "spot" in data, f"Missing 'spot' field. Keys: {list(data.keys())}"
        assert "expiry" in data, f"Missing 'expiry' field. Keys: {list(data.keys())}"
        assert "recommended" in data, f"Missing 'recommended' field. Keys: {list(data.keys())}"

        # Criteria structures
        assert "call_buy" in data, f"Missing 'call_buy' field. Keys: {list(data.keys())}"
        assert "put_buy" in data, f"Missing 'put_buy' field. Keys: {list(data.keys())}"

        # call_buy must have score and signal
        call_buy = data["call_buy"]
        assert "score" in call_buy, f"call_buy missing 'score'. Got: {list(call_buy.keys())}"
        assert "signal" in call_buy, f"call_buy missing 'signal'. Got: {list(call_buy.keys())}"
        assert "criteria" in call_buy, f"call_buy missing 'criteria'. Got: {list(call_buy.keys())}"

        print(f"PASS: Response structure valid - spot={data['spot']}, recommended={data['recommended']}, "
              f"call_score={call_buy['score']}, put_score={data['put_buy']['score']}")

    def test_sensex_option_flow_is_real_oi_false_fallback(self):
        """When BSE API is blocked (cloud env), is_real_oi=False and BS-derived OI used - OI should still be > 0"""
        resp = requests.get(f"{BASE_URL}/api/rej/sensex-option-flow", timeout=60)
        assert resp.status_code == 200
        data = resp.json()

        is_real_oi = data.get("is_real_oi", None)
        total_ce_oi = data.get("total_ce_oi", 0)
        total_pe_oi = data.get("total_pe_oi", 0)

        # Regardless of is_real_oi, OI values must be present (either real BSE or BS-derived)
        assert total_ce_oi > 0, f"total_ce_oi must be > 0 (BS-derived if BSE API blocked). Got {total_ce_oi}"
        assert total_pe_oi > 0, f"total_pe_oi must be > 0 (BS-derived if BSE API blocked). Got {total_pe_oi}"

        print(f"PASS: is_real_oi={is_real_oi} — total_ce_oi={total_ce_oi}, total_pe_oi={total_pe_oi} both > 0")

    def test_sensex_option_flow_pcr_oi_computation(self):
        """pcr_oi should = total_pe_oi / max(total_ce_oi, 1)"""
        resp = requests.get(f"{BASE_URL}/api/rej/sensex-option-flow", timeout=60)
        assert resp.status_code == 200
        data = resp.json()

        total_ce_oi = data.get("total_ce_oi", 0)
        total_pe_oi = data.get("total_pe_oi", 0)
        pcr_oi = data.get("pcr_oi", -1)

        expected_pcr = round(total_pe_oi / max(total_ce_oi, 1), 2)
        assert abs(pcr_oi - expected_pcr) < 0.01, (
            f"pcr_oi={pcr_oi} does not match expected {expected_pcr} "
            f"(pe={total_pe_oi}, ce={total_ce_oi})"
        )
        print(f"PASS: pcr_oi={pcr_oi} correctly computed from CE={total_ce_oi}, PE={total_pe_oi}")


class TestPatternScan5Stock:
    """Tests for /api/insider/pattern-scan with 5-stock sample (badge background fetch)"""

    def test_pattern_scan_5_stock_sample_returns_200(self):
        """5-stock sample used for badge background fetch must return 200"""
        resp = requests.get(
            f"{BASE_URL}/api/insider/pattern-scan?symbols=RELIANCE,HDFCBANK,INFY,TATAMOTORS,SBIN",
            timeout=120
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text[:300]}"
        print(f"PASS: 5-stock pattern scan returned 200")

    def test_pattern_scan_5_stock_count_positive(self):
        """5-stock sample should return count > 0 (badge requires detections)"""
        resp = requests.get(
            f"{BASE_URL}/api/insider/pattern-scan?symbols=RELIANCE,HDFCBANK,INFY,TATAMOTORS,SBIN",
            timeout=120
        )
        assert resp.status_code == 200
        data = resp.json()

        count = data.get("count", 0)
        assert count > 0, (
            f"Expected count > 0 for 5-stock pattern scan but got count={count}. "
            f"scanned_stocks={data.get('scanned_stocks')}. This would mean badge won't show."
        )
        print(f"PASS: 5-stock pattern scan returned count={count}")

    def test_pattern_scan_reliance_hdfcbank_returns_200(self):
        """Pattern scan for RELIANCE,HDFCBANK - basic 2 stock test"""
        resp = requests.get(
            f"{BASE_URL}/api/insider/pattern-scan?symbols=RELIANCE,HDFCBANK",
            timeout=120
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "results" in data
        assert "count" in data
        print(f"PASS: RELIANCE,HDFCBANK scan returned count={data['count']}, scanned={data.get('scanned_stocks')}")

    def test_pattern_scan_scanned_stocks_count_correct(self):
        """scanned_stocks should equal 5 for 5-symbol request"""
        resp = requests.get(
            f"{BASE_URL}/api/insider/pattern-scan?symbols=RELIANCE,HDFCBANK,INFY,TATAMOTORS,SBIN",
            timeout=120
        )
        assert resp.status_code == 200
        data = resp.json()

        scanned = data.get("scanned_stocks", 0)
        assert scanned == 5, f"Expected scanned_stocks=5, got {scanned}"
        print(f"PASS: scanned_stocks=5 correctly for 5-symbol request")

    def test_pattern_items_structure(self):
        """Each pattern item in results must have pattern-level fields"""
        resp = requests.get(
            f"{BASE_URL}/api/insider/pattern-scan?symbols=RELIANCE,HDFCBANK,INFY,TATAMOTORS,SBIN",
            timeout=120
        )
        assert resp.status_code == 200
        data = resp.json()

        results = data.get("results", [])
        if not results:
            print(f"SKIP: No pattern results for 5-stock scan (may be weekend/holiday)")
            return

        for item in results:
            patterns = item.get("patterns", [])
            assert len(patterns) > 0, f"Stock {item.get('symbol')} has empty patterns array"
            for p in patterns:
                assert "pattern" in p, f"Pattern missing 'pattern' key: {p}"
                assert "bias" in p, f"Pattern missing 'bias' key: {p}"
                assert "timeframe" in p, f"Pattern missing 'timeframe' key: {p}"
                assert "timeframe_display" in p, f"Pattern missing 'timeframe_display' key: {p}"
        print(f"PASS: Pattern items structure correct for {len(results)} stocks")


class TestInsiderDetectionsWithBulkDeals:
    """Test the NSE Bulk Deals market days feature - detections endpoint behavior"""

    def test_detections_returns_count_positive(self):
        """yfinance fallback ensures count > 0 always"""
        resp = requests.get(f"{BASE_URL}/api/insider/detections", timeout=120)
        assert resp.status_code == 200
        data = resp.json()
        count = data.get("count", 0)
        assert count > 0, (
            f"Expected count > 0. "
            f"source={data.get('source')}, from_history={data.get('from_history')}"
        )
        print(f"PASS: detections count={count} > 0, source={data.get('source')}")

    def test_detections_source_field_indicates_origin(self):
        """source field should indicate which data source was used"""
        resp = requests.get(f"{BASE_URL}/api/insider/detections", timeout=120)
        assert resp.status_code == 200
        data = resp.json()
        source = data.get("source", "")
        assert len(source) > 0, "source field should not be empty"
        print(f"PASS: source='{source}'")
