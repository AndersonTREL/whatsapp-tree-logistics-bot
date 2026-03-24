require('dotenv').config();
const googleSheets = require('../services/googleSheets');

async function testConnection() {
    console.log('🧪 Testing Google Sheets Connection...');
    try {
        const timestamp = new Date().toLocaleString();
        const result = await googleSheets.addRequest({
            timestamp: timestamp,
            firstName: 'Test',
            lastName: 'User',
            station: 'DBE3',
            request: 'This is a test request from the connection test script',
            phoneNumber: 'whatsapp:+1234567890',
            status: 'review'
        });

        console.log('✅ Connection Sucessful!');
        console.log('Result:', result);
    } catch (error) {
        console.error('❌ Connection Failed!');
        console.error(error);
    }
}

testConnection();
