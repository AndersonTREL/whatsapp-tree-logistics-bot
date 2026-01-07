require('dotenv').config();
const googleSheets = require('../services/googleSheets');

async function checkLastRequest() {
    console.log('🔍 Fetching requests from Google Sheets...');
    try {
        const requests = await googleSheets.getAllRequests();

        if (requests.length === 0) {
            console.log('❌ No requests found in the sheet.');
            return;
        }

        // Parse timestamp helper
        const parseTimestamp = (ts) => {
            if (!ts) return new Date(0);
            // Format: DD/MM/YYYY, HH:MM:SS or similar
            // Try to handle standard formats
            const parts = ts.split(/[\/, :]/);
            if (parts.length >= 5) {
                // approximate parsing for DD/MM/YYYY, HH:MM:SS
                // parts[0]=DD, parts[1]=MM, parts[2]=YYYY
                return new Date(`${parts[2]}-${parts[1]}-${parts[0]}T${parts[3]}:${parts[4]}:${parts[5] || '00'}`);
            }
            return new Date(ts);
        };

        // Sort by date descending
        const sortedRequests = [...requests].sort((a, b) => {
            return parseTimestamp(b.timestamp) - parseTimestamp(a.timestamp);
        });

        const latest = sortedRequests[0];

        console.log('📊 Total Requests:', requests.length);
        if (latest) {
            console.log('\n📅 TRUE LATEST REQUEST (Chronological):');
            console.log('   Timestamp:', latest.timestamp);
            console.log('   Row:', latest.rowNumber);
            console.log('   User:', `${latest.firstName} ${latest.lastName}`);
            console.log('   Content:', latest.request);
        }

        // Check for IBAN requests
        const ibanRequests = requests.filter(r =>
            r.request && r.request.toLowerCase().includes('iban')
        );

        if (ibanRequests.length > 0) {
            console.log(`\n💳 Found ${ibanRequests.length} IBAN requests:`);
            ibanRequests.forEach(r => {
                console.log(`\n   ---------------------------------------------------`);
                console.log(`   📅 Timestamp: ${r.timestamp}`);
                console.log(`   👤 User: ${r.firstName} ${r.lastName}`);
                console.log(`   📝 Request: ${r.request}`);
                console.log(`   📍 Row: ${r.rowNumber}`);
            });
        } else {
            console.log('\n❌ No IBAN requests found.');
        }

    } catch (error) {
        console.error('❌ Error fetching requests:', error);
    }
}

checkLastRequest();
