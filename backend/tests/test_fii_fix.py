"""
FII/DII Activity Bug Fix Tests (iteration 30)
Tests:
  - /api/market-intel/fii endpoint response structure
  - source field = 'NSE F&O Archive' (not NSE Live)
  - fii.buy/sell/net are contract numbers (not crore values like 84.95)
  - history array has 3 entries
  - Frontend display: NSE F&O label, contracts format, no ₹ sign in badge
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')


class TestFiiEndpoint:
    """Tests for /api/market-intel/fii after NSE F&O CSV fix"""

    def test_fii_returns_200(self):
        resp = requests.get(f"{BASE_URL}/api/market-intel/fii", timeout=30)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text[:200]}"
        print("PASS: /api/market-intel/fii returned 200")

    def test_fii_source_is_nse_fo_archive(self):
        """source must be 'NSE F&O Archive', not old crore-based label"""
        resp = requests.get(f"{BASE_URL}/api/market-intel/fii", timeout=30)
        data = resp.json()
        assert "source" in data, "Missing 'source' field"
        assert data["source"] == "NSE F&O Archive", \
            f"Expected source='NSE F&O Archive', got '{data['source']}'"
        print(f"PASS: source = '{data['source']}'")

    def test_fii_buy_sell_net_are_contracts_not_crores(self):
        """FII buy/sell/net must be large integer contract numbers (>100),
        NOT crore-scale decimals like 84.95 which were the old bug."""
        resp = requests.get(f"{BASE_URL}/api/market-intel/fii", timeout=30)
        data = resp.json()
        fii = data.get("fii")
        assert fii is not None, "Missing 'fii' field in response"

        buy  = fii.get("buy", 0)
        sell = fii.get("sell", 0)
        net  = fii.get("net", 0)

        # Values should be integer contract counts, not small floats (crores)
        assert isinstance(buy, (int, float)), f"fii.buy should be numeric, got {type(buy)}"
        assert isinstance(sell, (int, float)), f"fii.sell should be numeric, got {type(sell)}"
        assert isinstance(net, (int, float)), f"fii.net should be numeric, got {type(net)}"

        # Contract values are typically in thousands; crore values would be < 200
        # If buy > 200 it's definitely contract format not crore format
        # Net can be negative so we check buy (always positive)
        assert buy > 200 or sell > 200, \
            f"fii.buy={buy}, fii.sell={sell} look like crore values (< 200). Expected contract numbers > 1000"
        print(f"PASS: FII contracts format - buy={buy}, sell={sell}, net={net}")

    def test_fii_history_has_3_entries(self):
        """history array must have 3 entries (last 3 trading days)"""
        resp = requests.get(f"{BASE_URL}/api/market-intel/fii", timeout=30)
        data = resp.json()
        history = data.get("history", [])
        assert len(history) >= 1, "history array is empty"
        assert len(history) >= 3, \
            f"Expected 3 history entries (last 3 trading days), got {len(history)}"
        print(f"PASS: history has {len(history)} entries")

    def test_fii_history_entries_have_correct_structure(self):
        """Each history entry must have date, fii, dii, classification"""
        resp = requests.get(f"{BASE_URL}/api/market-intel/fii", timeout=30)
        data = resp.json()
        history = data.get("history", [])
        assert len(history) > 0, "history is empty"

        for i, entry in enumerate(history):
            assert "date" in entry,           f"history[{i}] missing 'date'"
            assert "fii" in entry,            f"history[{i}] missing 'fii'"
            assert "classification" in entry, f"history[{i}] missing 'classification'"
            # FII values in each history entry should also be contracts
            fii_buy = entry["fii"].get("buy", 0)
            assert fii_buy >= 0, f"history[{i}].fii.buy is negative: {fii_buy}"
        print(f"PASS: All {len(history)} history entries have correct structure")

    def test_fii_history_values_are_contracts_not_crores(self):
        """Each history row's FII buy/sell values must be contract numbers"""
        resp = requests.get(f"{BASE_URL}/api/market-intel/fii", timeout=30)
        data = resp.json()
        history = data.get("history", [])
        for i, entry in enumerate(history):
            fii = entry.get("fii", {})
            buy  = fii.get("buy", 0)
            sell = fii.get("sell", 0)
            net  = fii.get("net", 0)
            # At least one of buy/sell should be > 200 (contracts, not crores)
            if buy > 0 or sell > 0:
                assert max(buy, sell) > 200, \
                    f"history[{i}] fii.buy={buy}, sell={sell} look like crore values"
        print("PASS: All history FII values are in contract format")

    def test_fii_net_badge_format_is_not_crore_value(self):
        """fii.net must be a contract integer so the header badge shows 'lots' format,
        not '₹128Cr Net' format. Net should be > -50 and < 50 only if crore-based."""
        resp = requests.get(f"{BASE_URL}/api/market-intel/fii", timeout=30)
        data = resp.json()
        net = data.get("fii", {}).get("net", 0)
        # Net value in crore format would be a small float like -84.95 or 128.0
        # Contract format would be integers like 12826 or -10352
        # If abs(net) > 200 it's very likely contracts
        # (Small nets like 50 contracts are theoretically possible but rare)
        if net != 0:
            assert abs(net) != round(abs(net), 2) or abs(net) > 100, \
                f"net={net} looks suspicious — could still be crore format"
        print(f"PASS: FII net={net} (contract format confirmed)")

    def test_fii_classification_action_is_valid(self):
        """classification.action must be one of the valid F&O contract thresholds"""
        resp = requests.get(f"{BASE_URL}/api/market-intel/fii", timeout=30)
        data = resp.json()
        cls = data.get("classification", {})
        valid_actions = ["Heavy Buying", "Moderate Buying", "Neutral", "Mild Selling", "Heavy Selling"]
        assert cls.get("action") in valid_actions, \
            f"classification.action='{cls.get('action')}' not in {valid_actions}"
        print(f"PASS: classification.action='{cls.get('action')}'")

    def test_fii_dii_present(self):
        """DII data should be in response alongside FII"""
        resp = requests.get(f"{BASE_URL}/api/market-intel/fii", timeout=30)
        data = resp.json()
        assert "dii" in data, "Missing 'dii' field"
        dii = data["dii"]
        assert "buy" in dii, "Missing dii.buy"
        assert "sell" in dii, "Missing dii.sell"
        assert "net" in dii, "Missing dii.net"
        print(f"PASS: DII data present - buy={dii['buy']}, sell={dii['sell']}, net={dii['net']}")
