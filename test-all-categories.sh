#!/bin/bash

# Test All Categories - Verification Script
# Tests that all 6 categories respond correctly

echo "🧪 Testing All 6 Categories"
echo "══════════════════════════════════════"
echo ""

BASE_URL="http://localhost:3000/webhook/whatsapp"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

test_category() {
    local num="$1"
    local name="$2"
    local phone="whatsapp:+491761662684$num"
    
    echo "Testing Category $num: $name"
    
    response=$(curl -s -X POST "$BASE_URL" \
        -d "Body=$num&From=$phone&ProfileName=TestUser")
    
    if echo "$response" | grep -q "<Message>"; then
        # Extract first line of message
        first_line=$(echo "$response" | grep -o '<Message>[^<]*' | sed 's/<Message>//' | head -1)
        echo -e "${GREEN}✅ WORKS${NC} - Response: $first_line..."
    else
        echo -e "${RED}❌ FAILED${NC} - No message returned"
    fi
    echo ""
}

# Test all categories
test_category "1" "Salary"
test_category "2" "HR"
test_category "3" "Accident/Damage"
test_category "4" "Equipment"
test_category "5" "Report"
test_category "6" "Vacation/Sick Leave"

echo "══════════════════════════════════════"
echo "✅ Category testing complete!"
echo ""
echo "If all categories show ✅ WORKS, then all categories"
echo "are functioning correctly on the server."
echo ""
echo "⚠️ If you're not receiving messages in WhatsApp,"
echo "the issue is with Twilio webhook configuration."
echo ""
echo "Webhook URL must be set to:"
echo "https://uncommutable-eve-waxiest.ngrok-free.dev/webhook/whatsapp"

