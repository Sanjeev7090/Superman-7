#!/usr/bin/env python3
"""
Backend API Test Suite for Insider Tracker Endpoints
Tests the NaN/Inf float serialization fix
"""
import httpx
import json
import sys
import math
from datetime import datetime

# Base URL from frontend/.env
BASE_URL = "https://insider-alerts-3.preview.emergentagent.com/api"

def check_nan_inf_in_value(value, path=""):
    """Recursively check for NaN/Inf in nested structures"""
    issues = []
    
    if isinstance(value, dict):
        for k, v in value.items():
            issues.extend(check_nan_inf_in_value(v, f"{path}.{k}" if path else k))
    elif isinstance(value, list):
        for i, v in enumerate(value):
            issues.extend(check_nan_inf_in_value(v, f"{path}[{i}]"))
    elif isinstance(value, float):
        if math.isnan(value):
            issues.append(f"NaN found at {path}")
        elif math.isinf(value):
            issues.append(f"Inf found at {path}")
    
    return issues

def test_endpoint(name, url, expected_fields, timeout=120):
    """Test a single endpoint"""
    print(f"\n{'='*80}")
    print(f"TEST: {name}")
    print(f"URL: {url}")
    print(f"{'='*80}")
    
    try:
        start = datetime.now()
        response = httpx.get(url, timeout=timeout, follow_redirects=True)
        elapsed = (datetime.now() - start).total_seconds()
        
        print(f"✓ HTTP Status: {response.status_code}")
        print(f"✓ Response Time: {elapsed:.2f}s")
        
        # Check if response is valid JSON
        try:
            data = response.json()
            print(f"✓ Valid JSON response")
        except json.JSONDecodeError as e:
            print(f"✗ FAILED: Invalid JSON - {e}")
            print(f"  Response text (first 500 chars): {response.text[:500]}")
            return False
        
        # Check for expected fields
        missing_fields = []
        for field in expected_fields:
            if field not in data:
                missing_fields.append(field)
        
        if missing_fields:
            print(f"✗ FAILED: Missing fields: {missing_fields}")
            print(f"  Available fields: {list(data.keys())}")
            return False
        else:
            print(f"✓ All expected fields present: {expected_fields}")
        
        # Check for NaN/Inf values
        nan_inf_issues = check_nan_inf_in_value(data)
        if nan_inf_issues:
            print(f"✗ FAILED: NaN/Inf values found:")
            for issue in nan_inf_issues[:10]:  # Show first 10 issues
                print(f"  - {issue}")
            return False
        else:
            print(f"✓ No NaN/Inf values in response")
        
        # Print key metrics
        print(f"\n📊 Response Summary:")
        for field in expected_fields:
            value = data.get(field)
            if isinstance(value, list):
                print(f"  - {field}: {len(value)} items")
                if len(value) > 0 and isinstance(value[0], dict):
                    print(f"    Sample keys: {list(value[0].keys())[:5]}")
            elif isinstance(value, dict):
                print(f"  - {field}: {len(value)} keys")
            else:
                print(f"  - {field}: {value}")
        
        # Additional validation for specific endpoints
        if name == "GET /api/insider/detections":
            detections = data.get("detections", [])
            if detections:
                sample = detections[0]
                print(f"\n  Sample detection fields: {list(sample.keys())}")
                # Check critical float fields
                for field in ["score", "vol_ratio", "price"]:
                    if field in sample:
                        val = sample[field]
                        if isinstance(val, (int, float)):
                            print(f"    - {field}: {val} (type: {type(val).__name__})")
        
        elif "pattern-scan" in name:
            results = data.get("results", [])
            if results:
                sample = results[0]
                print(f"\n  Sample result fields: {list(sample.keys())}")
                # Check critical float fields
                for field in ["price", "vol_ratio", "rsi", "pct_from_52w"]:
                    if field in sample:
                        val = sample[field]
                        if isinstance(val, (int, float)):
                            print(f"    - {field}: {val} (type: {type(val).__name__})")
        
        elif name == "GET /api/insider/stock-news":
            news = data.get("news", [])
            if news:
                sample = news[0]
                print(f"\n  Sample news item: {sample.get('title', '')[:80]}...")
                print(f"  Fields: {list(sample.keys())}")
        
        elif name == "GET /api/insider/economic-calendar":
            events = data.get("events", [])
            if events:
                sample = events[0]
                print(f"\n  Sample event: {sample.get('event', '')}")
                print(f"  Date: {sample.get('date', '')}, Impact: {sample.get('impact', '')}")
        
        print(f"\n✅ TEST PASSED: {name}")
        return True
        
    except httpx.TimeoutException:
        print(f"✗ FAILED: Request timeout after {timeout}s")
        return False
    except Exception as e:
        print(f"✗ FAILED: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return False

def main():
    print("="*80)
    print("INSIDER TRACKER BACKEND API TEST SUITE")
    print("Testing NaN/Inf Float Serialization Fix")
    print("="*80)
    
    tests = [
        {
            "name": "GET /api/insider/detections",
            "url": f"{BASE_URL}/insider/detections",
            "expected_fields": ["detections", "count", "source", "updated_at"],
            "timeout": 30
        },
        {
            "name": "GET /api/insider/pattern-scan (full scan)",
            "url": f"{BASE_URL}/insider/pattern-scan",
            "expected_fields": ["results", "count", "scanned_stocks", "updated_at"],
            "timeout": 90  # Full scan may take 30-60s
        },
        {
            "name": "GET /api/insider/pattern-scan?symbols=RELIANCE,TCS",
            "url": f"{BASE_URL}/insider/pattern-scan?symbols=RELIANCE,TCS",
            "expected_fields": ["results", "count", "updated_at"],
            "timeout": 30
        },
        {
            "name": "GET /api/insider/stock-news",
            "url": f"{BASE_URL}/insider/stock-news",
            "expected_fields": ["news", "updated_at", "total"],
            "timeout": 60
        },
        {
            "name": "GET /api/insider/economic-calendar",
            "url": f"{BASE_URL}/insider/economic-calendar",
            "expected_fields": ["events", "month", "year", "month_name", "today"],
            "timeout": 10
        }
    ]
    
    results = []
    for test in tests:
        passed = test_endpoint(
            test["name"],
            test["url"],
            test["expected_fields"],
            test["timeout"]
        )
        results.append((test["name"], passed))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed_count = sum(1 for _, passed in results if passed)
    total_count = len(results)
    
    for name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"{status} - {name}")
    
    print(f"\n{'='*80}")
    print(f"TOTAL: {passed_count}/{total_count} tests passed ({passed_count/total_count*100:.1f}%)")
    print(f"{'='*80}")
    
    # Exit with appropriate code
    sys.exit(0 if passed_count == total_count else 1)

if __name__ == "__main__":
    main()
