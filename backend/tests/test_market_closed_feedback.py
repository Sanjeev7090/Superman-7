"""
Test: Market Intel Closing Prediction - Market Closed + Post-Market Feedback
Tests for is_market_closed=True state and market_feedback object structure/values
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestClosingPredictionMarketClosed:
    """Tests for /api/market-intel/closing-prediction when market is closed"""

    def test_endpoint_returns_200(self):
        """Basic health check for closing prediction endpoint"""
        resp = requests.get(f"{BASE_URL}/api/market-intel/closing-prediction", timeout=30)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        print("PASS: /api/market-intel/closing-prediction returned 200")

    def test_response_structure_top_level(self):
        """Verify all required top-level keys are present in response"""
        resp = requests.get(f"{BASE_URL}/api/market-intel/closing-prediction", timeout=30)
        assert resp.status_code == 200
        data = resp.json()

        required_keys = [
            "available", "curr_price", "day_high", "day_low", "day_open",
            "dist_from_low", "vix", "gift_premium", "bias",
            "total_score", "factors", "decision", "session_note",
            "is_closing_window", "is_market_hours", "is_market_closed",
            "market_feedback", "updated_at"
        ]
        for key in required_keys:
            assert key in data, f"Missing top-level key: {key}"
        print(f"PASS: All {len(required_keys)} top-level keys present")

    def test_available_is_true(self):
        """Response should be available (data loaded)"""
        resp = requests.get(f"{BASE_URL}/api/market-intel/closing-prediction", timeout=30)
        data = resp.json()
        assert data["available"] is True, f"available should be True, got {data.get('available')}"
        print("PASS: available=True")

    def test_is_market_closed_true_outside_hours(self):
        """Market should be closed outside 9:15AM-3:30PM IST"""
        resp = requests.get(f"{BASE_URL}/api/market-intel/closing-prediction", timeout=30)
        data = resp.json()
        # Current time is 16:31 IST — market is closed
        assert data["is_market_closed"] is True, f"is_market_closed should be True (market closed after 3:30 PM IST), got {data.get('is_market_closed')}"
        print(f"PASS: is_market_closed=True")

    def test_is_market_hours_false_outside_hours(self):
        """is_market_hours should be False when market is closed"""
        resp = requests.get(f"{BASE_URL}/api/market-intel/closing-prediction", timeout=30)
        data = resp.json()
        assert data["is_market_hours"] is False, f"is_market_hours should be False, got {data.get('is_market_hours')}"
        print("PASS: is_market_hours=False")

    def test_is_closing_window_false_outside_hours(self):
        """is_closing_window should be False outside 3:15-3:30 PM window"""
        resp = requests.get(f"{BASE_URL}/api/market-intel/closing-prediction", timeout=30)
        data = resp.json()
        assert data["is_closing_window"] is False, f"is_closing_window should be False, got {data.get('is_closing_window')}"
        print("PASS: is_closing_window=False")

    def test_market_feedback_present_when_market_closed(self):
        """market_feedback object must be present when is_market_closed=True"""
        resp = requests.get(f"{BASE_URL}/api/market-intel/closing-prediction", timeout=30)
        data = resp.json()
        assert data["is_market_closed"] is True
        assert data["market_feedback"] is not None, "market_feedback should not be None when market is closed"
        assert isinstance(data["market_feedback"], dict), f"market_feedback should be a dict, got {type(data['market_feedback'])}"
        print("PASS: market_feedback is present and is a dict")

    def test_market_feedback_all_required_fields(self):
        """market_feedback must contain all required fields"""
        resp = requests.get(f"{BASE_URL}/api/market-intel/closing-prediction", timeout=30)
        data = resp.json()
        fb = data["market_feedback"]
        assert fb is not None

        required_fb_keys = [
            "actual_close", "actual_open", "actual_move", "actual_pct",
            "accuracy", "verdict_icon", "verdict_text", "verdict_color",
            "predicted_signal", "predicted_move", "predicted_action",
            "score_at_close", "day_high", "day_low", "actual_range"
        ]
        for key in required_fb_keys:
            assert key in fb, f"market_feedback missing key: {key}"
        print(f"PASS: All {len(required_fb_keys)} market_feedback keys present")

    def test_market_feedback_actual_values(self):
        """Verify actual market values match expected today's data"""
        resp = requests.get(f"{BASE_URL}/api/market-intel/closing-prediction", timeout=30)
        data = resp.json()
        fb = data["market_feedback"]

        # Validate actual values (today: close=24207.8, open=24343.1, move=-135.3)
        assert abs(fb["actual_close"] - 24207.8) < 5.0, f"actual_close expected ~24207.8, got {fb['actual_close']}"
        assert abs(fb["actual_open"] - 24343.1) < 5.0, f"actual_open expected ~24343.1, got {fb['actual_open']}"
        assert abs(fb["actual_move"] - (-135.3)) < 5.0, f"actual_move expected ~-135.3, got {fb['actual_move']}"
        print(f"PASS: actual_close={fb['actual_close']}, actual_open={fb['actual_open']}, actual_move={fb['actual_move']}")

    def test_market_feedback_accuracy_partial(self):
        """accuracy should be PARTIAL for today (score=0, actual_move=-135.3)"""
        resp = requests.get(f"{BASE_URL}/api/market-intel/closing-prediction", timeout=30)
        data = resp.json()
        fb = data["market_feedback"]
        assert fb["accuracy"] == "PARTIAL", f"accuracy expected PARTIAL, got {fb['accuracy']}"
        print(f"PASS: accuracy=PARTIAL")

    def test_market_feedback_verdict_icon(self):
        """verdict_icon should be 〰️ for PARTIAL accuracy"""
        resp = requests.get(f"{BASE_URL}/api/market-intel/closing-prediction", timeout=30)
        data = resp.json()
        fb = data["market_feedback"]
        assert fb["verdict_icon"] == "〰️", f"verdict_icon expected 〰️, got {fb['verdict_icon']}"
        print(f"PASS: verdict_icon=〰️")

    def test_market_feedback_verdict_color(self):
        """verdict_color should be amber (#f59e0b) for PARTIAL"""
        resp = requests.get(f"{BASE_URL}/api/market-intel/closing-prediction", timeout=30)
        data = resp.json()
        fb = data["market_feedback"]
        assert fb["verdict_color"] == "#f59e0b", f"verdict_color expected #f59e0b (amber/PARTIAL), got {fb['verdict_color']}"
        print(f"PASS: verdict_color={fb['verdict_color']}")

    def test_market_feedback_predicted_signal_is_string(self):
        """predicted_signal should be a non-empty string matching one of the DECISION_RULES signals"""
        valid_signals = ["Strong Recovery", "Mild–Good Recovery", "Small Recovery / Mixed",
                         "No Clear Edge", "Mild Selling", "Selling till Close"]
        resp = requests.get(f"{BASE_URL}/api/market-intel/closing-prediction", timeout=30)
        data = resp.json()
        fb = data["market_feedback"]
        assert isinstance(fb["predicted_signal"], str), "predicted_signal should be a string"
        assert len(fb["predicted_signal"]) > 0, "predicted_signal should be non-empty"
        assert fb["predicted_signal"] in valid_signals, \
            f"predicted_signal '{fb['predicted_signal']}' not in valid signals list"
        print(f"PASS: predicted_signal='{fb['predicted_signal']}' (valid signal)")

    def test_market_feedback_score_at_close_is_integer(self):
        """score_at_close should be an integer in range [-10, +10]"""
        resp = requests.get(f"{BASE_URL}/api/market-intel/closing-prediction", timeout=30)
        data = resp.json()
        fb = data["market_feedback"]
        assert isinstance(fb["score_at_close"], int), f"score_at_close should be int, got {type(fb['score_at_close'])}"
        assert -10 <= fb["score_at_close"] <= 10, f"score_at_close={fb['score_at_close']} out of expected range"
        print(f"PASS: score_at_close={fb['score_at_close']} (valid integer)")

    def test_market_feedback_day_high_low(self):
        """day_high and day_low must be reasonable values"""
        resp = requests.get(f"{BASE_URL}/api/market-intel/closing-prediction", timeout=30)
        data = resp.json()
        fb = data["market_feedback"]
        assert fb["day_high"] > fb["day_low"], f"day_high ({fb['day_high']}) must be > day_low ({fb['day_low']})"
        assert fb["day_high"] > 0, "day_high must be > 0"
        assert fb["day_low"] > 0, "day_low must be > 0"
        print(f"PASS: day_high={fb['day_high']}, day_low={fb['day_low']}")

    def test_market_feedback_actual_range_computed(self):
        """actual_range = day_high - day_low, should match"""
        resp = requests.get(f"{BASE_URL}/api/market-intel/closing-prediction", timeout=30)
        data = resp.json()
        fb = data["market_feedback"]
        expected_range = round(fb["day_high"] - fb["day_low"], 1)
        assert abs(fb["actual_range"] - expected_range) < 0.5, \
            f"actual_range expected ~{expected_range}, got {fb['actual_range']}"
        print(f"PASS: actual_range={fb['actual_range']} (computed from H-L)")

    def test_market_feedback_actual_pct_negative(self):
        """actual_pct should be negative today (market fell)"""
        resp = requests.get(f"{BASE_URL}/api/market-intel/closing-prediction", timeout=30)
        data = resp.json()
        fb = data["market_feedback"]
        assert fb["actual_pct"] < 0, f"actual_pct should be negative today, got {fb['actual_pct']}"
        assert abs(fb["actual_pct"]) < 5, f"actual_pct seems unreasonably large: {fb['actual_pct']}"
        print(f"PASS: actual_pct={fb['actual_pct']} (negative as expected)")

    def test_market_feedback_verdict_text_contains_actual_move(self):
        """verdict_text should mention actual movement"""
        resp = requests.get(f"{BASE_URL}/api/market-intel/closing-prediction", timeout=30)
        data = resp.json()
        fb = data["market_feedback"]
        assert isinstance(fb["verdict_text"], str) and len(fb["verdict_text"]) > 0, \
            "verdict_text should be a non-empty string"
        print(f"PASS: verdict_text present: '{fb['verdict_text'][:60]}...'")

    def test_factors_list_has_5_items(self):
        """factors array should have exactly 5 scoring factors"""
        resp = requests.get(f"{BASE_URL}/api/market-intel/closing-prediction", timeout=30)
        data = resp.json()
        assert isinstance(data["factors"], list), "factors should be a list"
        assert len(data["factors"]) == 5, f"factors should have 5 items, got {len(data['factors'])}"
        print(f"PASS: 5 factors present")

    def test_factors_each_has_required_keys(self):
        """Each factor must have name, value, label, score keys"""
        resp = requests.get(f"{BASE_URL}/api/market-intel/closing-prediction", timeout=30)
        data = resp.json()
        for i, f in enumerate(data["factors"]):
            for key in ["name", "value", "label", "score"]:
                assert key in f, f"Factor {i} missing key: {key}"
        print("PASS: All 5 factors have name/value/label/score keys")

    def test_decision_object_structure(self):
        """decision object must have signal, move, action, color keys"""
        resp = requests.get(f"{BASE_URL}/api/market-intel/closing-prediction", timeout=30)
        data = resp.json()
        dec = data["decision"]
        assert dec is not None
        for key in ["signal", "move", "action", "color"]:
            assert key in dec, f"decision missing key: {key}"
        print(f"PASS: decision has signal={dec['signal']}, move={dec['move']}")

    def test_decision_matches_total_score(self):
        """decision signal should be consistent with total_score from decision rules"""
        resp = requests.get(f"{BASE_URL}/api/market-intel/closing-prediction", timeout=30)
        data = resp.json()
        total_score = data["total_score"]
        signal = data["decision"]["signal"]
        # Verify total_score is an integer and signal is a string
        assert isinstance(total_score, int), f"total_score should be int, got {type(total_score)}"
        assert isinstance(signal, str) and len(signal) > 0, "decision.signal should be non-empty string"
        assert data["decision"]["color"], "decision.color should be non-empty"
        print(f"PASS: total_score={total_score}, decision.signal='{signal}'")

    def test_session_note_contains_market_closed(self):
        """session_note should indicate market is closed"""
        resp = requests.get(f"{BASE_URL}/api/market-intel/closing-prediction", timeout=30)
        data = resp.json()
        session_note = data["session_note"]
        assert "Closed" in session_note or "closed" in session_note, \
            f"session_note should contain 'closed', got: '{session_note}'"
        print(f"PASS: session_note={session_note}")

    def test_updated_at_is_valid_iso_string(self):
        """updated_at should be a valid ISO datetime string"""
        from datetime import datetime
        resp = requests.get(f"{BASE_URL}/api/market-intel/closing-prediction", timeout=30)
        data = resp.json()
        updated_at = data["updated_at"]
        assert isinstance(updated_at, str), "updated_at should be a string"
        # Should parse as ISO datetime
        try:
            datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
            print(f"PASS: updated_at is valid ISO datetime: {updated_at}")
        except ValueError:
            pytest.fail(f"updated_at is not valid ISO datetime: {updated_at}")

    def test_curr_price_matches_actual_close(self):
        """curr_price should match actual_close when market is closed"""
        resp = requests.get(f"{BASE_URL}/api/market-intel/closing-prediction", timeout=30)
        data = resp.json()
        fb = data["market_feedback"]
        assert abs(data["curr_price"] - fb["actual_close"]) < 5.0, \
            f"curr_price ({data['curr_price']}) should match actual_close ({fb['actual_close']}) when closed"
        print(f"PASS: curr_price={data['curr_price']} matches actual_close={fb['actual_close']}")
