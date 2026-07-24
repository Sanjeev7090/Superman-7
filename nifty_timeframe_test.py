#!/usr/bin/env python3
"""
Nifty 50 Timeframe Bug Fix Verification Test
Tests the fix for missing interval_map combinations in /api/stock/bars/{ticker}
"""

import requests
import sys
import json
from typing import List, Dict, Tuple

class NiftyTimeframeTest:
    def __init__(self, base_url="https://gann-trader-dev.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_passed = 0
        self.tests_failed = 0
        self.failed_tests = []
        
    def log_pass(self, test_name: str, details: str = ""):
        """Log a passing test"""
        self.tests_passed += 1
        print(f"✅ PASS: {test_name}")
        if details:
            print(f"   {details}")
    
    def log_fail(self, test_name: str, reason: str):
        """Log a failing test"""
        self.tests_failed += 1
        self.failed_tests.append({"test": test_name, "reason": reason})
        print(f"❌ FAIL: {test_name}")
        print(f"   Reason: {reason}")
    
    def test_root_endpoint(self) -> bool:
        """Test 1: GET /api/ - health check"""
        print("\n[TEST 1] Root API Health Check")
        print("-" * 60)
        
        try:
            response = requests.get(f"{self.api_url}/", timeout=10)
            
            if response.status_code != 200:
                self.log_fail("Root endpoint", f"Expected 200, got {response.status_code}")
                return False
            
            data = response.json()
            expected_message = "Gann Angles Trader API - NSE Edition"
            
            if data.get("message") == expected_message:
                self.log_pass("Root endpoint", f"Message: {data.get('message')}")
                return True
            else:
                self.log_fail("Root endpoint", f"Expected message '{expected_message}', got '{data.get('message')}'")
                return False
                
        except Exception as e:
            self.log_fail("Root endpoint", f"Exception: {str(e)}")
            return False
    
    def test_nifty_timeframe_combo(self, multiplier: int, timespan: str, is_intraday: bool) -> bool:
        """Test a single (multiplier, timespan) combination for ^NSEI"""
        test_name = f"^NSEI {multiplier}{timespan[0]}"
        
        try:
            # URL-encode ^NSEI as %5ENSEI
            ticker = "%5ENSEI"
            params = {
                "multiplier": multiplier,
                "timespan": timespan,
                "limit": 200
            }
            
            url = f"{self.api_url}/stock/bars/{ticker}"
            response = requests.get(url, params=params, timeout=30)
            
            # Check HTTP 200
            if response.status_code != 200:
                self.log_fail(test_name, f"HTTP {response.status_code} (expected 200)")
                return False
            
            data = response.json()
            bars = data.get("bars", [])
            
            # Check bars array length >= 15
            if len(bars) < 15:
                self.log_fail(test_name, f"Only {len(bars)} bars returned (expected >= 15)")
                return False
            
            # For intraday, check timestamp spacing < 24 hours
            if is_intraday and len(bars) >= 2:
                ts1 = bars[0].get("timestamp")
                ts2 = bars[1].get("timestamp")
                
                if ts1 is None or ts2 is None:
                    self.log_fail(test_name, "Missing timestamp in bars")
                    return False
                
                # Calculate spacing in milliseconds
                spacing_ms = abs(ts2 - ts1)
                spacing_hours = spacing_ms / (1000 * 60 * 60)
                
                # Should be < 24 hours for intraday
                if spacing_ms >= 86_400_000:  # 24 hours in ms
                    self.log_fail(test_name, 
                                f"Timestamp spacing {spacing_hours:.1f}h >= 24h (looks like daily data, not intraday)")
                    return False
                
                self.log_pass(test_name, 
                            f"{len(bars)} bars, spacing {spacing_hours:.2f}h (intraday confirmed)")
            else:
                # Daily/weekly - no spacing check needed
                self.log_pass(test_name, f"{len(bars)} bars returned")
            
            return True
            
        except Exception as e:
            self.log_fail(test_name, f"Exception: {str(e)}")
            return False
    
    def test_all_nifty_timeframes(self) -> bool:
        """Test 2: All (multiplier, timespan) combos for ^NSEI"""
        print("\n[TEST 2] Nifty 50 Timeframe Combinations")
        print("-" * 60)
        
        # Define all combos to test: (multiplier, timespan, is_intraday)
        combos = [
            (1, "minute", True),    # INTRADAY
            (2, "minute", True),    # INTRADAY - NEWLY FIXED
            (3, "minute", True),    # INTRADAY - NEWLY FIXED (maps to 5m)
            (5, "minute", True),    # INTRADAY - NEWLY FIXED
            (10, "minute", True),   # INTRADAY (maps to 15m)
            (15, "minute", True),   # INTRADAY - NEWLY FIXED
            (30, "minute", True),   # INTRADAY
            (45, "minute", True),   # INTRADAY - NEWLY FIXED (maps to 30m)
            (1, "hour", True),      # INTRADAY
            (2, "hour", True),      # INTRADAY - NEWLY FIXED (maps to 1h)
            (4, "hour", True),      # INTRADAY
            (1, "day", False),      # DAILY
            (1, "week", False),     # WEEKLY
        ]
        
        all_passed = True
        for multiplier, timespan, is_intraday in combos:
            passed = self.test_nifty_timeframe_combo(multiplier, timespan, is_intraday)
            if not passed:
                all_passed = False
        
        return all_passed
    
    def test_orderflow_zero_volume(self) -> bool:
        """Test 3: POST /api/orderflow/analyze with zero-volume bars"""
        print("\n[TEST 3] Order Flow Analysis with Zero-Volume Bars")
        print("-" * 60)
        
        try:
            # First, get some bars from ^NSEI
            ticker = "%5ENSEI"
            params = {
                "multiplier": 5,
                "timespan": "minute",
                "limit": 200
            }
            
            url = f"{self.api_url}/stock/bars/{ticker}"
            response = requests.get(url, params=params, timeout=30)
            
            if response.status_code != 200:
                self.log_fail("Get bars for orderflow test", f"HTTP {response.status_code}")
                return False
            
            data = response.json()
            bars = data.get("bars", [])
            
            if len(bars) < 15:
                self.log_fail("Get bars for orderflow test", f"Only {len(bars)} bars")
                return False
            
            # Set all volumes to 0 (simulating NSE option intraday)
            for bar in bars:
                bar["volume"] = 0
            
            # Now POST to /api/orderflow/analyze
            orderflow_request = {
                "ticker": "TEST",
                "bars": bars,
                "n_vp_bins": 24,
                "n_fp_levels": 8,
                "vp_lookback": 50
            }
            
            orderflow_url = f"{self.api_url}/orderflow/analyze"
            orderflow_response = requests.post(orderflow_url, json=orderflow_request, timeout=30)
            
            if orderflow_response.status_code != 200:
                self.log_fail("Orderflow analyze with zero volume", 
                            f"HTTP {orderflow_response.status_code}")
                return False
            
            orderflow_data = orderflow_response.json()
            
            # Check for non-empty footprint array
            footprint = orderflow_data.get("footprint", [])
            if len(footprint) < 1:
                self.log_fail("Orderflow footprint", "Empty footprint array")
                return False
            
            # Check for non-empty vp_bins array
            vp_bins = orderflow_data.get("vp_bins", [])
            if len(vp_bins) < 1:
                self.log_fail("Orderflow vp_bins", "Empty vp_bins array")
                return False
            
            self.log_pass("Orderflow with zero-volume bars", 
                        f"footprint: {len(footprint)} items, vp_bins: {len(vp_bins)} items")
            return True
            
        except Exception as e:
            self.log_fail("Orderflow analyze", f"Exception: {str(e)}")
            return False
    
    def test_groww_nsei_candles(self) -> bool:
        """Test 4: GET /api/groww/candles/NSEI"""
        print("\n[TEST 4] Groww NSEI Candles Endpoint")
        print("-" * 60)
        
        try:
            params = {
                "interval": "1m",
                "days_back": 1
            }
            
            url = f"{self.api_url}/groww/candles/NSEI"
            response = requests.get(url, params=params, timeout=30)
            
            if response.status_code != 200:
                self.log_fail("Groww NSEI candles", f"HTTP {response.status_code} (expected 200)")
                return False
            
            # Note: bars array may be empty for indices - that's expected
            data = response.json()
            bars = data.get("bars", [])
            
            self.log_pass("Groww NSEI candles", 
                        f"HTTP 200, bars: {len(bars)} (empty is OK for indices)")
            return True
            
        except Exception as e:
            self.log_fail("Groww NSEI candles", f"Exception: {str(e)}")
            return False
    
    def run_all_tests(self) -> int:
        """Run all tests and return exit code"""
        print("=" * 60)
        print("🧪 NIFTY 50 TIMEFRAME BUG FIX VERIFICATION")
        print("=" * 60)
        print(f"Testing against: {self.base_url}")
        print()
        
        # Run all tests
        self.test_root_endpoint()
        self.test_all_nifty_timeframes()
        self.test_orderflow_zero_volume()
        self.test_groww_nsei_candles()
        
        # Print summary
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        total_tests = self.tests_passed + self.tests_failed
        print(f"Total tests: {total_tests}")
        print(f"✅ Passed: {self.tests_passed}")
        print(f"❌ Failed: {self.tests_failed}")
        
        if self.tests_failed > 0:
            print("\n❌ FAILED TESTS:")
            for failed in self.failed_tests:
                print(f"  • {failed['test']}: {failed['reason']}")
            print("\n⚠️  Some tests FAILED - bug fix needs attention")
            return 1
        else:
            print("\n🎉 ALL TESTS PASSED - Bug fix verified!")
            return 0

def main():
    tester = NiftyTimeframeTest()
    return tester.run_all_tests()

if __name__ == "__main__":
    sys.exit(main())
