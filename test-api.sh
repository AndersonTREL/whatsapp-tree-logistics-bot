#!/bin/bash

# Tree Logistics API Testing Script
# Tests all API endpoints

echo "🧪 Tree Logistics - API Testing Script"
echo "========================================"
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

BASE_URL="http://localhost:3000"
PHONE_NUMBER="whatsapp:+4917616626841"
PHONE_NUMBER_2="whatsapp:+4917673562457"

PASSED=0
FAILED=0

# Function to test endpoint
test_endpoint() {
    local name="$1"
    local method="$2"
    local endpoint="$3"
    local data="$4"
    
    echo "Testing: $name"
    
    if [ "$method" = "GET" ]; then
        response=$(curl -s -w "\n%{http_code}" "$BASE_URL$endpoint")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$BASE_URL$endpoint" \
            -H "Content-Type: application/json" \
            -d "$data")
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ]; then
        echo -e "${GREEN}✅ PASSED${NC} - HTTP $http_code"
        echo "Response: $body"
        ((PASSED++))
    else
        echo -e "${RED}❌ FAILED${NC} - HTTP $http_code"
        echo "Response: $body"
        ((FAILED++))
    fi
    echo ""
}

# Test 1: Health Check
echo "TEST 1: Server Health Check"
echo "----------------------------"
test_endpoint "Root Endpoint" "GET" "/" ""

# Test 2: Manual Status Check
echo "TEST 2: Manual Status Check"
echo "---------------------------"
test_endpoint "Check Status Endpoint" "POST" "/check-status" ""

# Test 3: Broadcast - Single Recipient
echo "TEST 3: Broadcast to Single Recipient"
echo "-------------------------------------"
broadcast_data='{
  "message": "🧪 TEST BROADCAST\n\nThis is an automated test message.\nPlease ignore.\n\nBest Regards,\nTree Logistics Team",
  "phoneNumbers": ["'$PHONE_NUMBER'"]
}'
test_endpoint "Broadcast Single" "POST" "/broadcast" "$broadcast_data"

# Test 4: Broadcast - Multiple Recipients
echo "TEST 4: Broadcast to Multiple Recipients"
echo "----------------------------------------"
broadcast_data_multi='{
  "message": "🧪 MULTI-RECIPIENT TEST\n\nTesting broadcast to multiple numbers.\n\nBest Regards,\nTree Logistics Team",
  "phoneNumbers": ["'$PHONE_NUMBER'", "'$PHONE_NUMBER_2'"]
}'
test_endpoint "Broadcast Multiple" "POST" "/broadcast" "$broadcast_data_multi"

# Test 5: Shift Reminder
echo "TEST 5: Shift Reminder"
echo "----------------------"
shift_data='{
  "phoneNumber": "'$PHONE_NUMBER'",
  "firstName": "Anderson",
  "shiftDetails": {
    "startTime": "06:00",
    "station": "DA10",
    "zone": "Zone 4",
    "vehicle": "Sprinter #205",
    "packages": 185
  }
}'
test_endpoint "Shift Reminder" "POST" "/send-shift-reminder" "$shift_data"

# Test 6: Broadcast - Invalid Data (should fail)
echo "TEST 6: Broadcast with Invalid Data"
echo "------------------------------------"
echo "Testing: Broadcast without message"
response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/broadcast" \
    -H "Content-Type: application/json" \
    -d '{"phoneNumbers": ["'$PHONE_NUMBER'"]}')
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" = "400" ]; then
    echo -e "${GREEN}✅ PASSED${NC} - Correctly rejected invalid data (HTTP $http_code)"
    echo "Response: $body"
    ((PASSED++))
else
    echo -e "${RED}❌ FAILED${NC} - Should have returned 400 (got HTTP $http_code)"
    echo "Response: $body"
    ((FAILED++))
fi
echo ""

# Test 7: Shift Reminder - Invalid Data (should fail)
echo "TEST 7: Shift Reminder with Invalid Data"
echo "-----------------------------------------"
echo "Testing: Shift reminder without shiftDetails"
response=$(curl -s -w "\n%{http_code}" -X POST "$BASE_URL/send-shift-reminder" \
    -H "Content-Type: application/json" \
    -d '{"phoneNumber": "'$PHONE_NUMBER'", "firstName": "Anderson"}')
http_code=$(echo "$response" | tail -n1)
body=$(echo "$response" | sed '$d')

if [ "$http_code" = "400" ]; then
    echo -e "${GREEN}✅ PASSED${NC} - Correctly rejected invalid data (HTTP $http_code)"
    echo "Response: $body"
    ((PASSED++))
else
    echo -e "${RED}❌ FAILED${NC} - Should have returned 400 (got HTTP $http_code)"
    echo "Response: $body"
    ((FAILED++))
fi
echo ""

# Summary
echo "========================================"
echo "TEST SUMMARY"
echo "========================================"
echo -e "Total Tests: $(($PASSED + $FAILED))"
echo -e "${GREEN}Passed: $PASSED${NC}"
echo -e "${RED}Failed: $FAILED${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 ALL API TESTS PASSED!${NC}"
    exit 0
else
    echo -e "${YELLOW}⚠️  SOME TESTS FAILED${NC}"
    exit 1
fi


