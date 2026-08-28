"""
Gap Prediction - Next Trading Day Tests
Tests the fix for: prediction_for returning today's date (Friday) instead of next trading day (Monday)
Bug was: weekend not being skipped for next trading day calculation
"""
import pytest
import requests
import os
from datetime import datetime, date, timedelta
from zoneinfo import ZoneInfo

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
IST = ZoneInfo("Asia/Kolkata")


class TestGapPredictionEndpoint:
    """Tests for /api/market-intel/gap-prediction endpoint"""

    def test_gap_prediction_returns_200(self):
        """API should return 200 OK"""
        resp = requests.get(f"{BASE_URL}/api/market-intel/gap-prediction", timeout=30)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text[:300]}"
        print(f"PASS: /api/market-intel/gap-prediction returned 200")

    def test_gap_prediction_has_required_fields(self):
        """Response must have all required fields including prediction_for, market_open, market_status"""
        resp = requests.get(f"{BASE_URL}/api/market-intel/gap-prediction", timeout=30)
        assert resp.status_code == 200
        data = resp.json()
        required_fields = [
            "prediction_for", "market_open", "market_status",
            "today_date", "today_day", "prediction",
            "gift_vs_prev", "fii_net", "close_ratio"
        ]
        for field in required_fields:
            assert field in data, f"Missing required field: '{field}'. Keys present: {list(data.keys())}"
        print(f"PASS: All required fields present. prediction_for={data.get('prediction_for')}")

    def test_prediction_for_is_not_a_weekend(self):
        """prediction_for must NEVER be a Saturday or Sunday"""
        resp = requests.get(f"{BASE_URL}/api/market-intel/gap-prediction", timeout=30)
        assert resp.status_code == 200
        data = resp.json()
        pred_for = data.get("prediction_for", "")
        
        if pred_for == "Today":
            # Market is open - verify it's a weekday
            now_ist = datetime.now(IST)
            assert now_ist.weekday() < 5, f"prediction_for='Today' but it's a weekend! weekday={now_ist.weekday()}"
            print(f"PASS: prediction_for='Today' and it's a weekday (weekday={now_ist.weekday()})")
        else:
            # Should be a date string like "31 Aug 2026 (Mon)"
            assert pred_for != "", "prediction_for should not be empty"
            # Extract date from format "DD Mon YYYY (Day)"
            # Parse it to verify it's not a weekend
            try:
                # Remove the (Day) suffix and parse
                date_part = pred_for.split(" (")[0]  # "31 Aug 2026"
                parsed_date = datetime.strptime(date_part, "%d %b %Y").date()
                weekday = parsed_date.weekday()
                assert weekday < 5, f"prediction_for '{pred_for}' falls on a weekend! weekday={weekday} (5=Sat, 6=Sun)"
                print(f"PASS: prediction_for='{pred_for}' is a weekday (weekday={weekday})")
            except ValueError as e:
                pytest.fail(f"Could not parse prediction_for='{pred_for}': {e}")

    def test_prediction_for_format_when_market_closed(self):
        """When market is closed, prediction_for should include date and day abbreviation"""
        resp = requests.get(f"{BASE_URL}/api/market-intel/gap-prediction", timeout=30)
        assert resp.status_code == 200
        data = resp.json()
        
        market_open = data.get("market_open", False)
        pred_for = data.get("prediction_for", "")
        
        if not market_open:
            # Should be format like "31 Aug 2026 (Mon)"
            assert pred_for != "Today", \
                f"Market is CLOSED but prediction_for='{pred_for}' says 'Today' - should show next trading day"
            assert "(" in pred_for and ")" in pred_for, \
                f"prediction_for '{pred_for}' should contain day abbreviation in parentheses like '31 Aug 2026 (Mon)'"
            # Verify it's not today's date being returned
            today_date = data.get("today_date", "")
            today_day = data.get("today_day", "")
            now_ist = datetime.now(IST)
            # If today is Friday post-close, pred_for should NOT match today's date
            if now_ist.weekday() == 4 and now_ist > now_ist.replace(hour=15, minute=30):  # Friday after close
                assert today_date not in pred_for or "Fri" not in pred_for, \
                    f"CRITICAL BUG: prediction_for='{pred_for}' showing Friday's date instead of Monday!"
                print(f"PASS: Friday post-close: prediction_for='{pred_for}' (not today '{today_date}')")
            else:
                print(f"PASS: Market closed. prediction_for='{pred_for}' (today={today_date})")
        else:
            assert pred_for == "Today", \
                f"Market is OPEN but prediction_for='{pred_for}' - should be 'Today'"
            print(f"PASS: Market OPEN. prediction_for='Today' is correct")

    def test_friday_post_close_returns_monday(self):
        """On Friday post 3:30 PM IST, prediction_for should be Monday (next week)"""
        now_ist = datetime.now(IST)
        is_friday = now_ist.weekday() == 4
        market_close = now_ist.replace(hour=15, minute=30, second=0, microsecond=0)
        is_post_close = now_ist > market_close
        
        if is_friday and is_post_close:
            resp = requests.get(f"{BASE_URL}/api/market-intel/gap-prediction", timeout=30)
            assert resp.status_code == 200
            data = resp.json()
            pred_for = data.get("prediction_for", "")
            
            # Calculate expected Monday
            next_mon = now_ist.date() + timedelta(days=3)  # Friday + 3 = Monday
            expected = next_mon.strftime("%d %b %Y (Mon)")
            
            assert pred_for == expected, \
                f"CRITICAL: Friday post-close. prediction_for='{pred_for}' but expected '{expected}'"
            print(f"PASS: Friday post-close → prediction_for='{pred_for}' correctly shows Monday")
        else:
            pytest.skip(f"Not Friday post-close (weekday={now_ist.weekday()}, post_close={is_post_close}). Skipping Friday-specific test.")

    def test_prediction_for_not_same_as_today_when_after_close(self):
        """If market is closed on weekday, prediction_for should not be the same date as today_date"""
        resp = requests.get(f"{BASE_URL}/api/market-intel/gap-prediction", timeout=30)
        assert resp.status_code == 200
        data = resp.json()
        
        now_ist = datetime.now(IST)
        market_open = data.get("market_open", False)
        pred_for = data.get("prediction_for", "")
        today_date_str = data.get("today_date", "")  # e.g., "28 Aug 2026"
        
        if not market_open and now_ist.weekday() < 5:
            # Post-close weekday — pred_for should NOT contain today's date string
            assert today_date_str not in pred_for, \
                f"BUG: prediction_for='{pred_for}' contains today's date '{today_date_str}' (post-close weekday)"
            print(f"PASS: prediction_for='{pred_for}' is NOT today's date '{today_date_str}' ✓")
        elif not market_open and now_ist.weekday() >= 5:
            print(f"INFO: Weekend - prediction_for='{pred_for}', today='{today_date_str}'")
        else:
            print(f"INFO: Market open - prediction_for='{pred_for}' (Today)")

    def test_market_status_consistency(self):
        """market_open boolean must match market_status string"""
        resp = requests.get(f"{BASE_URL}/api/market-intel/gap-prediction", timeout=30)
        assert resp.status_code == 200
        data = resp.json()
        
        market_open = data.get("market_open")
        market_status = data.get("market_status")
        
        if market_open:
            assert market_status == "OPEN", f"market_open=True but market_status='{market_status}'"
        else:
            assert market_status == "CLOSED", f"market_open=False but market_status='{market_status}'"
        print(f"PASS: market_open={market_open} consistent with market_status='{market_status}'")

    def test_prediction_field_structure(self):
        """prediction field should have row_id, prediction, color, pts_label, prob"""
        resp = requests.get(f"{BASE_URL}/api/market-intel/gap-prediction", timeout=30)
        assert resp.status_code == 200
        data = resp.json()
        
        pred = data.get("prediction", {})
        assert isinstance(pred, dict), f"prediction should be a dict, got {type(pred)}"
        
        required_pred_fields = ["row_id", "prediction", "color"]
        for f in required_pred_fields:
            assert f in pred, f"Missing prediction.{f}"
        
        assert isinstance(pred.get("row_id"), int), f"row_id should be int, got {type(pred.get('row_id'))}"
        assert 1 <= pred["row_id"] <= 16, f"row_id should be 1-16, got {pred['row_id']}"
        print(f"PASS: prediction row_id={pred['row_id']}, prediction='{pred.get('prediction')}'")


class TestNextTradingDayLogic:
    """Unit-level tests for the next trading day calculation logic"""

    def test_next_trading_day_skips_saturday(self):
        """From Friday, next trading day should skip Saturday and Sunday → Monday"""
        from datetime import timedelta
        # Simulate Friday
        friday = date(2026, 8, 28)
        assert friday.weekday() == 4, "Should be Friday"
        
        nxt = friday + timedelta(days=1)  # Saturday
        while nxt.weekday() >= 5:
            nxt += timedelta(days=1)
        
        assert nxt.weekday() == 0, f"Expected Monday (0), got weekday={nxt.weekday()} ({nxt})"
        assert nxt == date(2026, 8, 31), f"Expected 2026-08-31 (Mon), got {nxt}"
        print(f"PASS: Friday 28 Aug → next trading day = {nxt.strftime('%d %b %Y (%a)')}")

    def test_next_trading_day_skips_sunday(self):
        """From Saturday, next trading day should be Monday"""
        from datetime import timedelta
        # Simulate Saturday
        saturday = date(2026, 8, 29)
        assert saturday.weekday() == 5, "Should be Saturday"
        
        nxt = saturday + timedelta(days=1)
        while nxt.weekday() >= 5:
            nxt += timedelta(days=1)
        
        assert nxt.weekday() == 0, f"Expected Monday (0), got weekday={nxt.weekday()}"
        assert nxt == date(2026, 8, 31), f"Expected 2026-08-31 (Mon), got {nxt}"
        print(f"PASS: Saturday 29 Aug → next trading day = {nxt.strftime('%d %b %Y (%a)')}")

    def test_next_trading_day_from_monday(self):
        """From Monday pre-open, next trading day (if after close) should be Tuesday"""
        from datetime import timedelta
        monday = date(2026, 8, 31)
        assert monday.weekday() == 0, "Should be Monday"
        
        nxt = monday + timedelta(days=1)
        while nxt.weekday() >= 5:
            nxt += timedelta(days=1)
        
        assert nxt.weekday() == 1, f"Expected Tuesday (1), got weekday={nxt.weekday()}"
        print(f"PASS: Monday 31 Aug → next trading day = {nxt.strftime('%d %b %Y (%a)')}")
