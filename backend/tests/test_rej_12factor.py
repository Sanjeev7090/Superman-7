"""
Backend tests for REJ Option Flow 12-factor checklist
Tests: /api/rej/option-flow (NIFTY) and /api/rej/sensex-option-flow (SENSEX)
Verifies: 12 criteria keys, score/signal structure, weight fields
"""
import pytest
import requests
import os

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")

EXPECTED_CRITERIA_KEYS = {
    "future_oi_vol",
    "iv_ok",
    "delta_range",
    "vanna",
    "net_gex",
    "gap_fii_bias",
    "pcr_level",
    "oi_walls",
    "chart_pa",
    "sector_breadth",
    "preopen_imbalance",
}

# put_buy has "call_writing_put_unwind" for NIFTY, "put_writing_call_unwind" for call_buy side
CALL_BUY_EXTRA_KEY = "put_writing_call_unwind"
PUT_BUY_EXTRA_KEY  = "call_writing_put_unwind"


@pytest.fixture(scope="module")
def nifty_flow():
    """Fetch NIFTY option-flow once for all tests in this module"""
    resp = requests.get(f"{BASE_URL}/api/rej/option-flow", timeout=30)
    assert resp.status_code == 200, f"NIFTY option-flow returned {resp.status_code}: {resp.text[:200]}"
    return resp.json()


@pytest.fixture(scope="module")
def sensex_flow():
    """Fetch SENSEX option-flow once for all tests in this module"""
    resp = requests.get(f"{BASE_URL}/api/rej/sensex-option-flow", timeout=30)
    assert resp.status_code == 200, f"SENSEX option-flow returned {resp.status_code}: {resp.text[:200]}"
    return resp.json()


# ── NIFTY option-flow tests ───────────────────────────────────────────────────

class TestNiftyOptionFlow:
    """Tests for /api/rej/option-flow — 12-factor checklist"""

    def test_status_200(self):
        resp = requests.get(f"{BASE_URL}/api/rej/option-flow", timeout=30)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        print(f"PASS: NIFTY option-flow status 200")

    def test_has_call_buy_and_put_buy(self, nifty_flow):
        assert "call_buy" in nifty_flow, "Missing 'call_buy' key"
        assert "put_buy"  in nifty_flow, "Missing 'put_buy' key"
        print(f"PASS: call_buy and put_buy keys present")

    def test_call_buy_score_structure(self, nifty_flow):
        cb = nifty_flow["call_buy"]
        assert "score"    in cb, "Missing 'score' in call_buy"
        assert "signal"   in cb, "Missing 'signal' in call_buy"
        assert "criteria" in cb, "Missing 'criteria' in call_buy"
        assert isinstance(cb["score"], int), "score should be int"
        assert cb["signal"] in ("STRONG", "PARTIAL", "WEAK"), f"Invalid signal: {cb['signal']}"
        print(f"PASS: call_buy score={cb['score']}/12, signal={cb['signal']}")

    def test_call_buy_has_12_criteria(self, nifty_flow):
        criteria = nifty_flow["call_buy"]["criteria"]
        assert len(criteria) == 12, f"Expected 12 criteria, got {len(criteria)}: {list(criteria.keys())}"
        print(f"PASS: call_buy has 12 criteria: {list(criteria.keys())}")

    def test_call_buy_criteria_keys(self, nifty_flow):
        criteria = nifty_flow["call_buy"]["criteria"]
        # Check all expected keys exist (11 shared + 1 side-specific)
        missing = EXPECTED_CRITERIA_KEYS - set(criteria.keys())
        assert not missing, f"Missing criteria keys in call_buy: {missing}"
        assert CALL_BUY_EXTRA_KEY in criteria, f"Missing '{CALL_BUY_EXTRA_KEY}' in call_buy criteria"
        print(f"PASS: All 12 call_buy criteria keys present")

    def test_call_buy_criteria_structure(self, nifty_flow):
        criteria = nifty_flow["call_buy"]["criteria"]
        for key, item in criteria.items():
            assert "pass"   in item, f"Missing 'pass' in criteria[{key}]"
            assert "label"  in item, f"Missing 'label' in criteria[{key}]"
            assert "detail" in item, f"Missing 'detail' in criteria[{key}]"
            assert "weight" in item, f"Missing 'weight' in criteria[{key}]"
            assert isinstance(item["pass"], bool), f"criteria[{key}].pass should be bool"
            assert item["weight"] in ("Mandatory", "High", "Medium"), f"Invalid weight: {item['weight']}"
        print(f"PASS: All call_buy criteria have correct structure (pass/label/detail/weight)")

    def test_put_buy_has_12_criteria(self, nifty_flow):
        criteria = nifty_flow["put_buy"]["criteria"]
        assert len(criteria) == 12, f"Expected 12 criteria, got {len(criteria)}: {list(criteria.keys())}"
        print(f"PASS: put_buy has 12 criteria")

    def test_put_buy_criteria_keys(self, nifty_flow):
        criteria = nifty_flow["put_buy"]["criteria"]
        missing = EXPECTED_CRITERIA_KEYS - set(criteria.keys())
        assert not missing, f"Missing criteria keys in put_buy: {missing}"
        assert PUT_BUY_EXTRA_KEY in criteria, f"Missing '{PUT_BUY_EXTRA_KEY}' in put_buy criteria"
        print(f"PASS: All 12 put_buy criteria keys present")

    def test_put_buy_score_range(self, nifty_flow):
        pb = nifty_flow["put_buy"]
        score = pb["score"]
        assert 0 <= score <= 12, f"put_buy score {score} out of range 0-12"
        print(f"PASS: put_buy score={score}/12, signal={pb['signal']}")

    def test_call_buy_score_range(self, nifty_flow):
        cb = nifty_flow["call_buy"]
        score = cb["score"]
        assert 0 <= score <= 12, f"call_buy score {score} out of range 0-12"
        print(f"PASS: call_buy score={score}/12")

    def test_recommended_field(self, nifty_flow):
        rec = nifty_flow.get("recommended")
        assert rec in ("CALL_BUY", "PUT_BUY", "NEUTRAL"), f"Invalid recommended: {rec}"
        # Check logic: if CALL_BUY recommended, call_score >= 6
        cs = nifty_flow["call_buy"]["score"]
        ps = nifty_flow["put_buy"]["score"]
        if rec == "CALL_BUY":
            assert cs >= 6, f"CALL_BUY recommended but call_score={cs} < 6"
        elif rec == "PUT_BUY":
            assert ps >= 6, f"PUT_BUY recommended but put_score={ps} < 6"
        print(f"PASS: recommended={rec} (call={cs}, put={ps})")

    def test_mandatory_criteria_present(self, nifty_flow):
        """Verify Mandatory-weight criteria: future_oi_vol and chart_pa"""
        cb = nifty_flow["call_buy"]["criteria"]
        assert cb["future_oi_vol"]["weight"] == "Mandatory", "future_oi_vol should be Mandatory"
        assert cb["chart_pa"]["weight"] == "Mandatory", "chart_pa should be Mandatory"
        pb = nifty_flow["put_buy"]["criteria"]
        assert pb["future_oi_vol"]["weight"] == "Mandatory", "put_buy future_oi_vol should be Mandatory"
        assert pb["chart_pa"]["weight"] == "Mandatory", "put_buy chart_pa should be Mandatory"
        print(f"PASS: Mandatory weight criteria confirmed for future_oi_vol and chart_pa")

    def test_high_criteria_weights(self, nifty_flow):
        """Verify High-weight criteria in call_buy"""
        cb = nifty_flow["call_buy"]["criteria"]
        high_keys = ["iv_ok", "put_writing_call_unwind", "delta_range", "net_gex", "gap_fii_bias"]
        for k in high_keys:
            assert cb[k]["weight"] == "High", f"Expected High weight for {k}, got {cb[k]['weight']}"
        print(f"PASS: High-weight criteria confirmed: {high_keys}")

    def test_score_matches_pass_count(self, nifty_flow):
        """Verify call_buy score == count of True passes"""
        cb = nifty_flow["call_buy"]
        actual_passes = sum(1 for item in cb["criteria"].values() if item["pass"])
        assert cb["score"] == actual_passes, f"Score mismatch: reported {cb['score']}, counted {actual_passes}"
        pb = nifty_flow["put_buy"]
        actual_passes_p = sum(1 for item in pb["criteria"].values() if item["pass"])
        assert pb["score"] == actual_passes_p, f"Put score mismatch: reported {pb['score']}, counted {actual_passes_p}"
        print(f"PASS: Score matches pass count (call={cb['score']}, put={pb['score']})")

    def test_iv_and_vol_fields_present(self, nifty_flow):
        """Verify top-level flow fields for UI strip"""
        for field in ["avg_iv", "iv_status", "total_ce_vol", "total_pe_vol"]:
            assert field in nifty_flow, f"Missing field: {field}"
            assert nifty_flow[field] is not None, f"Field is None: {field}"
        print(f"PASS: avg_iv={nifty_flow['avg_iv']}, total_ce_vol={nifty_flow['total_ce_vol']}")


# ── SENSEX option-flow tests ──────────────────────────────────────────────────

class TestSensexOptionFlow:
    """Tests for /api/rej/sensex-option-flow — 12-factor checklist"""

    def test_status_200(self):
        resp = requests.get(f"{BASE_URL}/api/rej/sensex-option-flow", timeout=30)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text[:200]}"
        print(f"PASS: SENSEX option-flow status 200")

    def test_has_call_buy_and_put_buy(self, sensex_flow):
        assert "call_buy" in sensex_flow
        assert "put_buy"  in sensex_flow
        print(f"PASS: SENSEX call_buy and put_buy present")

    def test_call_buy_has_12_criteria(self, sensex_flow):
        criteria = sensex_flow["call_buy"]["criteria"]
        assert len(criteria) == 12, f"Expected 12 criteria, got {len(criteria)}: {list(criteria.keys())}"
        print(f"PASS: SENSEX call_buy has 12 criteria")

    def test_put_buy_has_12_criteria(self, sensex_flow):
        criteria = sensex_flow["put_buy"]["criteria"]
        assert len(criteria) == 12, f"Expected 12 criteria, got {len(criteria)}: {list(criteria.keys())}"
        print(f"PASS: SENSEX put_buy has 12 criteria")

    def test_sensex_call_criteria_keys(self, sensex_flow):
        criteria = sensex_flow["call_buy"]["criteria"]
        missing = EXPECTED_CRITERIA_KEYS - set(criteria.keys())
        assert not missing, f"SENSEX missing call_buy criteria keys: {missing}"
        assert CALL_BUY_EXTRA_KEY in criteria, f"SENSEX missing '{CALL_BUY_EXTRA_KEY}' in call_buy"
        print(f"PASS: SENSEX call_buy criteria keys correct")

    def test_sensex_put_criteria_keys(self, sensex_flow):
        criteria = sensex_flow["put_buy"]["criteria"]
        missing = EXPECTED_CRITERIA_KEYS - set(criteria.keys())
        assert not missing, f"SENSEX missing put_buy criteria keys: {missing}"
        assert PUT_BUY_EXTRA_KEY in criteria, f"SENSEX missing '{PUT_BUY_EXTRA_KEY}' in put_buy"
        print(f"PASS: SENSEX put_buy criteria keys correct")

    def test_sensex_criteria_structure(self, sensex_flow):
        """Each criteria item has pass (bool), label, detail, weight"""
        for side_key in ("call_buy", "put_buy"):
            criteria = sensex_flow[side_key]["criteria"]
            for key, item in criteria.items():
                assert "pass"   in item, f"SENSEX [{side_key}][{key}] missing 'pass'"
                assert "label"  in item, f"SENSEX [{side_key}][{key}] missing 'label'"
                assert "detail" in item, f"SENSEX [{side_key}][{key}] missing 'detail'"
                assert "weight" in item, f"SENSEX [{side_key}][{key}] missing 'weight'"
                assert isinstance(item["pass"], bool)
                assert item["weight"] in ("Mandatory", "High", "Medium")
        print(f"PASS: SENSEX criteria structure valid for both sides")

    def test_sensex_score_range(self, sensex_flow):
        cs = sensex_flow["call_buy"]["score"]
        ps = sensex_flow["put_buy"]["score"]
        assert 0 <= cs <= 12, f"SENSEX call_score {cs} out of range"
        assert 0 <= ps <= 12, f"SENSEX put_score {ps} out of range"
        print(f"PASS: SENSEX scores in range: call={cs}/12, put={ps}/12")

    def test_sensex_recommended_logic(self, sensex_flow):
        rec = sensex_flow.get("recommended")
        assert rec in ("CALL_BUY", "PUT_BUY", "NEUTRAL"), f"Invalid recommended: {rec}"
        cs = sensex_flow["call_buy"]["score"]
        ps = sensex_flow["put_buy"]["score"]
        if rec == "CALL_BUY":
            assert cs >= 6, f"CALL_BUY recommended but call_score={cs} < 6"
            assert cs > ps, f"CALL_BUY recommended but call_score={cs} not > put_score={ps}"
        elif rec == "PUT_BUY":
            assert ps >= 6, f"PUT_BUY recommended but put_score={ps} < 6"
        print(f"PASS: SENSEX recommended={rec} (call={cs}, put={ps})")

    def test_sensex_score_matches_pass_count(self, sensex_flow):
        cb = sensex_flow["call_buy"]
        actual_passes_c = sum(1 for item in cb["criteria"].values() if item["pass"])
        assert cb["score"] == actual_passes_c, f"SENSEX call score mismatch: {cb['score']} vs {actual_passes_c}"
        pb = sensex_flow["put_buy"]
        actual_passes_p = sum(1 for item in pb["criteria"].values() if item["pass"])
        assert pb["score"] == actual_passes_p, f"SENSEX put score mismatch: {pb['score']} vs {actual_passes_p}"
        print(f"PASS: SENSEX score matches pass count")

    def test_sensex_iv_vol_fields(self, sensex_flow):
        for field in ["avg_iv", "iv_status", "total_ce_vol", "total_pe_vol"]:
            assert field in sensex_flow, f"SENSEX missing field: {field}"
        print(f"PASS: SENSEX flow strip fields present")

    def test_sensex_oi_fields(self, sensex_flow):
        """SENSEX has extra OI fields for UI badge"""
        for field in ["is_real_oi", "total_ce_oi", "total_pe_oi", "pcr_oi"]:
            assert field in sensex_flow, f"SENSEX missing OI field: {field}"
        print(f"PASS: SENSEX OI fields present (is_real_oi={sensex_flow['is_real_oi']})")

    def test_sensex_mandatory_criteria(self, sensex_flow):
        cb = sensex_flow["call_buy"]["criteria"]
        assert cb["future_oi_vol"]["weight"] == "Mandatory"
        assert cb["chart_pa"]["weight"] == "Mandatory"
        pb = sensex_flow["put_buy"]["criteria"]
        assert pb["future_oi_vol"]["weight"] == "Mandatory"
        assert pb["chart_pa"]["weight"] == "Mandatory"
        print(f"PASS: SENSEX Mandatory criteria confirmed")
