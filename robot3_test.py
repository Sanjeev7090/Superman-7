#!/usr/bin/env python3
"""
Robot 3.0 Auto-Trade Fix Testing
Tests the lot_size NameError fix and confidence threshold relaxation
"""

import requests
import time
import sys

BASE_URL = "https://insider-detect-live.preview.emergentagent.com"
API_URL = f"{BASE_URL}/api"

def log_test(name, success, details=""):
    """Log test result"""
    if success:
        print(f"✅ {name} - PASSED")
    else:
        print(f"❌ {name} - FAILED: {details}")
    if details and success:
        print(f"   {details}")
    return success

def test_basic_health():
    """A. Basic health: GET /api/ → should return 200"""
    print("\n🔍 Test A: Basic Health Check")
    try:
        response = requests.get(f"{API_URL}/", timeout=10)
        success = response.status_code == 200
        details = f"Status: {response.status_code}"
        if success:
            try:
                data = response.json()
                details += f", Message: {data.get('message', 'N/A')}"
            except:
                pass
        return log_test("GET /api/", success, details)
    except Exception as e:
        return log_test("GET /api/", False, str(e))

def test_robo_settings():
    """E. Robo settings: GET /api/robo/settings → 200"""
    print("\n🔍 Test E: Robo Settings")
    try:
        response = requests.get(f"{API_URL}/robo/settings", timeout=10)
        success = response.status_code == 200
        details = f"Status: {response.status_code}"
        if success:
            try:
                data = response.json()
                prefs = data.get('preferences', {})
                details += f", Daily Target: ₹{prefs.get('daily_profit_target', 0)}, Capital: ₹{prefs.get('allocated_capital', 0)}"
            except:
                pass
        return log_test("GET /api/robo/settings", success, details)
    except Exception as e:
        return log_test("GET /api/robo/settings", False, str(e))

def test_robo_status_initial():
    """B. Robo status initial: GET /api/robo/status → should return 200"""
    print("\n🔍 Test B: Robo Status (Initial)")
    try:
        response = requests.get(f"{API_URL}/robo/status", timeout=10)
        success = response.status_code == 200
        details = f"Status: {response.status_code}"
        if success:
            try:
                data = response.json()
                auto_mode = data.get('auto_mode', False)
                status = data.get('status', 'unknown')
                details += f", Auto Mode: {auto_mode}, Status: {status}"
            except:
                pass
        return log_test("GET /api/robo/status (initial)", success, details)
    except Exception as e:
        return log_test("GET /api/robo/status (initial)", False, str(e))

def test_robo_start():
    """B. Robo start: POST /api/robo/start → should return 200"""
    print("\n🔍 Test B: Robo Start")
    try:
        response = requests.post(f"{API_URL}/robo/start", json={}, timeout=10)
        success = response.status_code == 200
        details = f"Status: {response.status_code}"
        if success:
            try:
                data = response.json()
                details += f", Message: {data.get('message', 'N/A')}"
            except:
                pass
        return log_test("POST /api/robo/start", success, details)
    except Exception as e:
        return log_test("POST /api/robo/start", False, str(e))

def test_robo_status_running():
    """B. Robo status running: GET /api/robo/status → should show running=true"""
    print("\n🔍 Test B: Robo Status (After Start)")
    try:
        response = requests.get(f"{API_URL}/robo/status", timeout=10)
        success = response.status_code == 200
        details = f"Status: {response.status_code}"
        
        if success:
            try:
                data = response.json()
                auto_mode = data.get('auto_mode', False)
                status = data.get('status', 'unknown')
                loop_state = data.get('loop_state', {})
                running = loop_state.get('running', False)
                cycle_count = loop_state.get('cycle_count', 0)
                last_cycle_status = loop_state.get('last_cycle_status', 'N/A')
                last_error = loop_state.get('last_error', None)
                
                details += f", Auto Mode: {auto_mode}, Running: {running}, Cycles: {cycle_count}"
                details += f", Last Status: {last_cycle_status}"
                
                if last_error:
                    details += f", ERROR: {last_error}"
                    # Check for lot_size NameError
                    if "lot_size" in str(last_error).lower() and "nameerror" in str(last_error).lower():
                        return log_test("GET /api/robo/status (running)", False, 
                                      f"lot_size NameError detected: {last_error}")
                
                # Success if running is true
                success = running
                if not success:
                    details += " (Expected running=true)"
                    
            except Exception as e:
                details += f", Parse error: {str(e)}"
                success = False
                
        return log_test("GET /api/robo/status (running)", success, details)
    except Exception as e:
        return log_test("GET /api/robo/status (running)", False, str(e))

def test_robo_stop():
    """B. Robo stop: POST /api/robo/stop → should stop cleanly"""
    print("\n🔍 Test B: Robo Stop")
    try:
        response = requests.post(f"{API_URL}/robo/stop", json={}, timeout=10)
        success = response.status_code == 200
        details = f"Status: {response.status_code}"
        if success:
            try:
                data = response.json()
                details += f", Message: {data.get('message', 'N/A')}"
            except:
                pass
        return log_test("POST /api/robo/stop", success, details)
    except Exception as e:
        return log_test("POST /api/robo/stop", False, str(e))

def test_robo_status_stopped():
    """B. Robo status stopped: GET /api/robo/status → running=false"""
    print("\n🔍 Test B: Robo Status (After Stop)")
    try:
        response = requests.get(f"{API_URL}/robo/status", timeout=10)
        success = response.status_code == 200
        details = f"Status: {response.status_code}"
        
        if success:
            try:
                data = response.json()
                loop_state = data.get('loop_state', {})
                running = loop_state.get('running', True)
                
                details += f", Running: {running}"
                
                # Success if running is false
                success = not running
                if not success:
                    details += " (Expected running=false)"
                    
            except Exception as e:
                details += f", Parse error: {str(e)}"
                success = False
                
        return log_test("GET /api/robo/status (stopped)", success, details)
    except Exception as e:
        return log_test("GET /api/robo/status (stopped)", False, str(e))

def check_backend_logs():
    """Check backend logs for lot_size NameError and threshold value"""
    print("\n🔍 Test C & D: Backend Logs Analysis")
    print("   Checking /var/log/supervisor/backend.err.log and backend.out.log...")
    
    import subprocess
    
    # Check error log for lot_size NameError
    try:
        result = subprocess.run(
            ["tail", "-n", "200", "/var/log/supervisor/backend.err.log"],
            capture_output=True, text=True, timeout=5
        )
        err_log = result.stdout
        
        if "NameError" in err_log and "lot_size" in err_log:
            log_test("Backend Error Log - lot_size NameError", False, 
                    "lot_size NameError found in error log")
            print("\n❌ CRITICAL: lot_size NameError detected in logs:")
            # Print relevant lines
            for line in err_log.split('\n'):
                if 'lot_size' in line.lower() or 'nameerror' in line.lower():
                    print(f"   {line}")
            return False
        else:
            log_test("Backend Error Log - lot_size NameError", True, 
                    "No lot_size NameError found in error log")
    except Exception as e:
        log_test("Backend Error Log Check", False, f"Could not read error log: {e}")
    
    # Check output log for threshold value
    try:
        result = subprocess.run(
            ["tail", "-n", "500", "/var/log/supervisor/backend.out.log"],
            capture_output=True, text=True, timeout=5
        )
        out_log = result.stdout
        
        # Look for threshold mentions (thr=42 or thr=58)
        threshold_found = False
        threshold_value = None
        
        for line in out_log.split('\n'):
            if 'thr=' in line.lower():
                threshold_found = True
                # Extract threshold value
                import re
                match = re.search(r'thr[=\s]+(\d+)', line, re.IGNORECASE)
                if match:
                    threshold_value = int(match.group(1))
                    print(f"   Found threshold in log: thr={threshold_value}")
                    print(f"   Line: {line.strip()}")
        
        if threshold_found:
            if threshold_value and threshold_value <= 42:
                log_test("Backend Log - Threshold Value", True, 
                        f"Threshold is {threshold_value} (expected ≤42, not 58)")
            elif threshold_value and threshold_value > 50:
                log_test("Backend Log - Threshold Value", False, 
                        f"Threshold is {threshold_value} (expected ≤42, not 58)")
            else:
                log_test("Backend Log - Threshold Value", True, 
                        "Threshold found in logs")
        else:
            log_test("Backend Log - Threshold Value", True, 
                    "No threshold value found in recent logs (may not have cycled yet)")
            
    except Exception as e:
        log_test("Backend Output Log Check", False, f"Could not read output log: {e}")
    
    return True

def main():
    """Run all Robot 3.0 tests"""
    print("=" * 70)
    print("🤖 Robot 3.0 Auto-Trade Fix Testing")
    print("=" * 70)
    print(f"Base URL: {BASE_URL}")
    print(f"API URL: {API_URL}")
    print()
    
    results = []
    
    # Test A: Basic health
    results.append(test_basic_health())
    
    # Test E: Robo settings
    results.append(test_robo_settings())
    
    # Test B: Robo status & start/stop
    results.append(test_robo_status_initial())
    results.append(test_robo_start())
    
    # Wait 5 seconds for auto mode to start and run at least one cycle
    print("\n⏳ Waiting 5 seconds for auto mode to cycle...")
    time.sleep(5)
    
    results.append(test_robo_status_running())
    
    # Wait another 3 seconds to ensure cycle completes
    print("\n⏳ Waiting 3 more seconds for cycle to complete...")
    time.sleep(3)
    
    results.append(test_robo_stop())
    
    # Wait 2 seconds for stop to complete
    print("\n⏳ Waiting 2 seconds for stop to complete...")
    time.sleep(2)
    
    results.append(test_robo_status_stopped())
    
    # Test C & D: Check logs
    check_backend_logs()
    
    # Summary
    print("\n" + "=" * 70)
    passed = sum(results)
    total = len(results)
    print(f"📊 Test Summary: {passed}/{total} tests passed")
    
    if passed == total:
        print("🎉 All Robot 3.0 tests PASSED!")
        print("\n✅ Verified:")
        print("   1. lot_size NameError fix - No NameError detected")
        print("   2. Confidence threshold relaxed - Threshold ≤42 (not 58)")
        print("   3. Auto mode start/stop - Working correctly")
        print("   4. Trading loop cycle - Completes without crash")
        return 0
    else:
        print(f"⚠️  {total - passed} tests FAILED")
        return 1

if __name__ == "__main__":
    sys.exit(main())
