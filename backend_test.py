#!/usr/bin/env python3
"""
Backend Test Suite for Closing Prediction Logic
================================================
Tests the new "Last 15-min (3:15-3:30) Closing Prediction Logic" endpoint.

Test Coverage:
1. GET /api/market-intel/closing-prediction returns HTTP 200
2. Response structure validation (all required fields present)
3. 5 factors with correct names and numeric scores
4. total_score correctly matches sum of factor scores
5. decision.signal matches total_score per decision rules
6. Cache behavior (second call within 2 minutes should be fast)
"""

import requests
import time
import sys
from typing import Dict, Any

# Backend URL from environment
BACKEND_URL = "https://insider-detect-live.preview.emergentagent.com"
API_ENDPOINT = f"{BACKEND_URL}/api/market-intel/closing-prediction"

# Expected factor names (exact match required)
EXPECTED_FACTOR_NAMES = [
    "Distance from Day Low",
    "Last 45-min Structure",
    "India VIX",
    "Matrix Bias",
    "GIFT / Closing Cue",
]

# Decision rules mapping (score range -> expected signal)
DECISION_RULES = [
    {"score_min": 6,   "score_max": 99,  "signal": "Strong Recovery"},
    {"score_min": 3,   "score_max": 6,   "signal": "Mild–Good Recovery"},
    {"score_min": 1,   "score_max": 3,   "signal": "Small Recovery / Mixed"},
    {"score_min": 0,   "score_max": 1,   "signal": "No Clear Edge"},
    {"score_min": -4,  "score_max": 0,   "signal": "Mild Selling"},
    {"score_min": -99, "score_max": -5,  "signal": "Selling till Close"},
]


class TestResult:
    def __init__(self):
        self.passed = []
        self.failed = []
        self.warnings = []
    
    def add_pass(self, test_name: str, details: str = ""):
        self.passed.append({"test": test_name, "details": details})
        print(f"✅ PASS: {test_name}")
        if details:
            print(f"   └─ {details}")
    
    def add_fail(self, test_name: str, reason: str):
        self.failed.append({"test": test_name, "reason": reason})
        print(f"❌ FAIL: {test_name}")
        print(f"   └─ {reason}")
    
    def add_warning(self, test_name: str, message: str):
        self.warnings.append({"test": test_name, "message": message})
        print(f"⚠️  WARN: {test_name}")
        print(f"   └─ {message}")
    
    def summary(self):
        total = len(self.passed) + len(self.failed)
        print("\n" + "="*80)
        print("TEST SUMMARY")
        print("="*80)
        print(f"Total Tests: {total}")
        print(f"✅ Passed: {len(self.passed)}")
        print(f"❌ Failed: {len(self.failed)}")
        print(f"⚠️  Warnings: {len(self.warnings)}")
        
        if self.failed:
            print("\n❌ FAILED TESTS:")
            for f in self.failed:
                print(f"  • {f['test']}: {f['reason']}")
        
        if self.warnings:
            print("\n⚠️  WARNINGS:")
            for w in self.warnings:
                print(f"  • {w['test']}: {w['message']}")
        
        print("="*80)
        return len(self.failed) == 0


def get_expected_signal(score: int) -> str:
    """Get expected signal based on total_score and decision rules."""
    for rule in DECISION_RULES:
        if rule["score_min"] <= score < rule["score_max"]:
            return rule["signal"]
    return "No Clear Edge"  # default


def test_closing_prediction_endpoint():
    """Main test function."""
    result = TestResult()
    
    print("="*80)
    print("CLOSING PREDICTION LOGIC - BACKEND TEST")
    print("="*80)
    print(f"Backend URL: {BACKEND_URL}")
    print(f"Endpoint: {API_ENDPOINT}")
    print("="*80 + "\n")
    
    # ========================================================================
    # TEST 1: Endpoint returns HTTP 200
    # ========================================================================
    print("TEST 1: GET /api/market-intel/closing-prediction returns HTTP 200")
    try:
        response = requests.get(API_ENDPOINT, timeout=15)
        if response.status_code == 200:
            result.add_pass("HTTP 200 Response", f"Status code: {response.status_code}")
        else:
            result.add_fail("HTTP 200 Response", 
                          f"Expected 200, got {response.status_code}. Response: {response.text[:200]}")
            return result.summary()
    except Exception as e:
        result.add_fail("HTTP 200 Response", f"Request failed: {str(e)}")
        return result.summary()
    
    # Parse JSON
    try:
        data = response.json()
    except Exception as e:
        result.add_fail("JSON Parsing", f"Failed to parse JSON: {str(e)}")
        return result.summary()
    
    print(f"\n📦 Response Data Preview:")
    print(f"   available: {data.get('available')}")
    print(f"   total_score: {data.get('total_score')}")
    print(f"   decision.signal: {data.get('decision', {}).get('signal')}")
    print()
    
    # ========================================================================
    # TEST 2: Response has 'available' field
    # ========================================================================
    print("TEST 2: Response has 'available' field")
    if "available" in data:
        result.add_pass("'available' field present", f"available = {data['available']}")
    else:
        result.add_fail("'available' field present", "Field 'available' not found in response")
        return result.summary()
    
    # If not available, check for message and exit gracefully
    if not data.get("available"):
        result.add_warning("Data Availability", 
                          f"Endpoint returned available=false. Message: {data.get('message', 'N/A')}")
        print("\n⚠️  Data not available (market closed or data unavailable). Skipping remaining tests.")
        return result.summary()
    
    # ========================================================================
    # TEST 3: Required fields present when available=true
    # ========================================================================
    print("\nTEST 3: All required fields present when available=true")
    required_fields = [
        "curr_price", "day_high", "day_low", "day_open", "dist_from_low",
        "vix", "total_score", "factors", "decision", "session_note", "updated_at"
    ]
    
    missing_fields = [f for f in required_fields if f not in data]
    if not missing_fields:
        result.add_pass("Required fields present", f"All {len(required_fields)} fields found")
    else:
        result.add_fail("Required fields present", f"Missing fields: {', '.join(missing_fields)}")
    
    # ========================================================================
    # TEST 4: Field types validation
    # ========================================================================
    print("\nTEST 4: Field types validation")
    type_checks = [
        ("curr_price", (int, float)),
        ("day_high", (int, float)),
        ("day_low", (int, float)),
        ("day_open", (int, float)),
        ("dist_from_low", (int, float)),
        ("vix", (int, float)),
        ("total_score", int),
        ("factors", list),
        ("decision", dict),
        ("session_note", str),
        ("updated_at", str),
    ]
    
    type_errors = []
    for field, expected_type in type_checks:
        if field in data:
            if not isinstance(data[field], expected_type):
                type_errors.append(f"{field} (expected {expected_type}, got {type(data[field])})")
    
    if not type_errors:
        result.add_pass("Field types correct", "All field types match expected types")
    else:
        result.add_fail("Field types correct", f"Type mismatches: {', '.join(type_errors)}")
    
    # ========================================================================
    # TEST 5: Factors list has exactly 5 items
    # ========================================================================
    print("\nTEST 5: Factors list has exactly 5 items")
    factors = data.get("factors", [])
    if len(factors) == 5:
        result.add_pass("5 factors present", f"Found {len(factors)} factors")
    else:
        result.add_fail("5 factors present", f"Expected 5 factors, found {len(factors)}")
    
    # ========================================================================
    # TEST 6: Factor names match expected names
    # ========================================================================
    print("\nTEST 6: Factor names match expected names")
    actual_names = [f.get("name") for f in factors]
    
    if actual_names == EXPECTED_FACTOR_NAMES:
        result.add_pass("Factor names correct", "All factor names match expected")
    else:
        result.add_fail("Factor names correct", 
                       f"Expected: {EXPECTED_FACTOR_NAMES}\nActual: {actual_names}")
    
    # ========================================================================
    # TEST 7: Each factor has required fields
    # ========================================================================
    print("\nTEST 7: Each factor has required fields (name, value, label, score)")
    factor_field_errors = []
    for i, factor in enumerate(factors):
        missing = [f for f in ["name", "value", "label", "score"] if f not in factor]
        if missing:
            factor_field_errors.append(f"Factor {i+1} missing: {', '.join(missing)}")
    
    if not factor_field_errors:
        result.add_pass("Factor fields complete", "All factors have required fields")
    else:
        result.add_fail("Factor fields complete", "; ".join(factor_field_errors))
    
    # ========================================================================
    # TEST 8: Factor scores are numeric
    # ========================================================================
    print("\nTEST 8: Factor scores are numeric")
    non_numeric_scores = []
    for i, factor in enumerate(factors):
        score = factor.get("score")
        if not isinstance(score, (int, float)):
            non_numeric_scores.append(f"Factor {i+1} ({factor.get('name')}): {type(score)}")
    
    if not non_numeric_scores:
        result.add_pass("Factor scores numeric", "All factor scores are numeric")
    else:
        result.add_fail("Factor scores numeric", "; ".join(non_numeric_scores))
    
    # ========================================================================
    # TEST 9: total_score equals sum of factor scores
    # ========================================================================
    print("\nTEST 9: total_score equals sum of factor scores")
    total_score = data.get("total_score", 0)
    factor_scores = [f.get("score", 0) for f in factors]
    calculated_sum = sum(factor_scores)
    
    if total_score == calculated_sum:
        result.add_pass("total_score matches sum", 
                       f"total_score={total_score}, sum={calculated_sum}")
    else:
        result.add_fail("total_score matches sum", 
                       f"total_score={total_score} != sum of factors={calculated_sum}")
    
    print(f"\n   Factor scores breakdown:")
    for f in factors:
        print(f"     • {f.get('name')}: {f.get('score')} ({f.get('label')})")
    print(f"   Total: {calculated_sum}")
    
    # ========================================================================
    # TEST 10: decision object has required fields
    # ========================================================================
    print("\nTEST 10: decision object has required fields")
    decision = data.get("decision", {})
    decision_fields = ["signal", "move", "action", "color"]
    missing_decision_fields = [f for f in decision_fields if f not in decision]
    
    if not missing_decision_fields:
        result.add_pass("decision fields present", "All decision fields found")
    else:
        result.add_fail("decision fields present", 
                       f"Missing: {', '.join(missing_decision_fields)}")
    
    # ========================================================================
    # TEST 11: decision.signal matches total_score per rules
    # ========================================================================
    print("\nTEST 11: decision.signal matches total_score per decision rules")
    actual_signal = decision.get("signal", "")
    expected_signal = get_expected_signal(total_score)
    
    if actual_signal == expected_signal:
        result.add_pass("decision.signal correct", 
                       f"Score {total_score} → '{actual_signal}' ✓")
    else:
        result.add_fail("decision.signal correct", 
                       f"Score {total_score}: expected '{expected_signal}', got '{actual_signal}'")
    
    # ========================================================================
    # TEST 12: decision.signal is one of valid signals
    # ========================================================================
    print("\nTEST 12: decision.signal is one of valid signals")
    valid_signals = [
        "Strong Recovery", "Mild–Good Recovery", "Small Recovery / Mixed",
        "No Clear Edge", "Mild Selling", "Selling till Close"
    ]
    
    if actual_signal in valid_signals:
        result.add_pass("decision.signal valid", f"Signal '{actual_signal}' is valid")
    else:
        result.add_fail("decision.signal valid", 
                       f"Signal '{actual_signal}' not in valid list: {valid_signals}")
    
    # ========================================================================
    # TEST 13: updated_at is ISO datetime string
    # ========================================================================
    print("\nTEST 13: updated_at is ISO datetime string")
    updated_at = data.get("updated_at", "")
    try:
        from datetime import datetime
        datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
        result.add_pass("updated_at format", f"Valid ISO datetime: {updated_at}")
    except Exception as e:
        result.add_fail("updated_at format", f"Invalid ISO datetime: {str(e)}")
    
    # ========================================================================
    # TEST 14: Cache behavior (second call within 2 minutes)
    # ========================================================================
    print("\nTEST 14: Cache behavior - second call within 2 minutes should be fast")
    print("   Making first call and recording timestamp...")
    
    try:
        # First call (already made above, but let's make another to be sure)
        start1 = time.time()
        resp1 = requests.get(API_ENDPOINT, timeout=15)
        time1 = time.time() - start1
        
        # Wait 1 second
        time.sleep(1)
        
        # Second call (should hit cache)
        start2 = time.time()
        resp2 = requests.get(API_ENDPOINT, timeout=15)
        time2 = time.time() - start2
        
        print(f"   First call:  {time1*1000:.0f}ms")
        print(f"   Second call: {time2*1000:.0f}ms")
        
        # Cache hit should be significantly faster (< 500ms as per requirement)
        if resp2.status_code == 200:
            if time2 < 0.5:  # 500ms threshold
                result.add_pass("Cache behavior", 
                               f"Second call fast ({time2*1000:.0f}ms < 500ms) - cache working")
            else:
                result.add_warning("Cache behavior", 
                                  f"Second call took {time2*1000:.0f}ms (expected < 500ms)")
            
            # Verify data is same (cache hit)
            data2 = resp2.json()
            if data.get("updated_at") == data2.get("updated_at"):
                result.add_pass("Cache consistency", "updated_at unchanged - cache hit confirmed")
            else:
                result.add_warning("Cache consistency", 
                                  "updated_at changed - possible cache miss or refresh")
        else:
            result.add_fail("Cache behavior", f"Second call failed: {resp2.status_code}")
    
    except Exception as e:
        result.add_fail("Cache behavior", f"Cache test failed: {str(e)}")
    
    # ========================================================================
    # FINAL SUMMARY
    # ========================================================================
    print("\n" + "="*80)
    print("DETAILED RESPONSE DATA")
    print("="*80)
    print(f"Session: {data.get('session_note')}")
    print(f"Current Price: {data.get('curr_price')}")
    print(f"Day High: {data.get('day_high')}, Day Low: {data.get('day_low')}, Day Open: {data.get('day_open')}")
    print(f"Distance from Low: {data.get('dist_from_low')} pts")
    print(f"VIX: {data.get('vix')}")
    print(f"\nTotal Score: {data.get('total_score')}")
    print(f"Decision: {decision.get('signal')}")
    print(f"Expected Move: {decision.get('move')}")
    print(f"Action: {decision.get('action')}")
    print(f"Color: {decision.get('color')}")
    print("="*80)
    
    return result.summary()


if __name__ == "__main__":
    success = test_closing_prediction_endpoint()
    sys.exit(0 if success else 1)
