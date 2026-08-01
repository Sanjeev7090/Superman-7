"""Strategy Builder API tests - /api/vibe/strategy-build and /api/vibe/strategy-execute"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

SAMPLE_BARS = [
    {"open": 100, "high": 110, "low": 95, "close": 105, "volume": 1000, "timestamp": 1700000000 + i * 60}
    for i in range(50)
]


class TestStrategyBuild:
    """Test POST /api/vibe/strategy-build"""

    def test_strategy_build_valid_prompt(self):
        resp = requests.post(f"{BASE_URL}/api/vibe/strategy-build", json={
            "prompt": "RSI 14 strategy: buy when RSI < 30, sell when RSI > 70"
        }, timeout=60)
        assert resp.status_code == 200
        data = resp.json()
        assert "code" in data
        assert "prompt" in data
        assert len(data["code"]) > 10
        print(f"PASS: strategy-build returned code length={len(data['code'])}")

    def test_strategy_build_empty_prompt(self):
        resp = requests.post(f"{BASE_URL}/api/vibe/strategy-build", json={"prompt": ""}, timeout=10)
        assert resp.status_code == 400
        print("PASS: empty prompt rejected with 400")


class TestStrategyExecute:
    """Test POST /api/vibe/strategy-execute"""

    def test_execute_valid_code(self):
        code = """
for i, bar in enumerate(bars):
    if bar['close'] > bar['open']:
        signals.append({'timestamp': bar['timestamp'], 'type': 'buy', 'price': bar['close']})
    elif bar['close'] < bar['open']:
        signals.append({'timestamp': bar['timestamp'], 'type': 'sell', 'price': bar['close']})
"""
        resp = requests.post(f"{BASE_URL}/api/vibe/strategy-execute", json={
            "code": code, "bars": SAMPLE_BARS
        }, timeout=15)
        assert resp.status_code == 200
        data = resp.json()
        assert "markers" in data
        assert "count" in data
        assert "buy_count" in data
        assert "sell_count" in data
        print(f"PASS: strategy-execute returned markers count={data['count']}")

    def test_execute_blocked_import_os(self):
        code = "import os\nprint(os.getcwd())"
        resp = requests.post(f"{BASE_URL}/api/vibe/strategy-execute", json={
            "code": code, "bars": SAMPLE_BARS
        }, timeout=10)
        assert resp.status_code == 400
        assert "blocked" in resp.json().get("detail", "").lower()
        print("PASS: import os correctly blocked with 400")

    def test_execute_empty_code(self):
        resp = requests.post(f"{BASE_URL}/api/vibe/strategy-execute", json={
            "code": "", "bars": SAMPLE_BARS
        }, timeout=10)
        assert resp.status_code == 400
        print("PASS: empty code rejected with 400")

    def test_execute_no_bars(self):
        resp = requests.post(f"{BASE_URL}/api/vibe/strategy-execute", json={
            "code": "signals.append({'type':'buy','timestamp':1,'price':100})", "bars": []
        }, timeout=10)
        assert resp.status_code == 400
        print("PASS: empty bars rejected with 400")
