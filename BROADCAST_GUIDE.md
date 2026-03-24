# 📢 Broadcast Messaging Guide

## Overview

The broadcast messaging feature allows you to send WhatsApp messages to all users who have previously submitted requests through the bot. This is useful for:
- System updates
- Important announcements
- Maintenance notifications
- General communications

## How to Use

### 1. Check Recipients (Optional)

Before sending, you can check how many people will receive the message:

```bash
curl http://localhost:3000/broadcast/recipients
```

**Response:**
```json
{
  "success": true,
  "count": 25,
  "phoneNumbers": [
    "+4917616626841",
    "+4917616626842",
    ...
  ]
}
```

### 2. Send Broadcast Message

Send a message to all recipients:

```bash
curl -X POST http://localhost:3000/broadcast \
  -H "Content-Type: application/json" \
  -d '{
    "message": "🌳 Important Update: Our support system will be under maintenance tonight from 10 PM to 2 AM. Thank you for your understanding!"
  }'
```

**Response:**
```json
{
  "success": true,
  "message": "Broadcast completed: 25 successful, 0 failed",
  "total": 25,
  "successful": 25,
  "failed": 0,
  "errors": []
}
```

### 3. Using Postman or Similar Tools

1. **Method:** POST
2. **URL:** `http://localhost:3000/broadcast` (or your production URL)
3. **Headers:**
   - `Content-Type: application/json`
4. **Body (JSON):**
   ```json
   {
     "message": "Your message here"
   }
   ```

### 4. Using JavaScript/Node.js

```javascript
const axios = require('axios');

async function sendBroadcast(message) {
  try {
    const response = await axios.post('http://localhost:3000/broadcast', {
      message: message
    });
    console.log('Broadcast result:', response.data);
  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
  }
}

// Example usage
sendBroadcast('🌳 Hello! This is a test broadcast message.');
```

## Features

### ✅ Automatic Rate Limiting
- Messages are sent with a 1-second delay between each
- Prevents hitting Twilio rate limits
- Continues even if some messages fail

### ✅ Error Handling
- Continues sending even if some numbers fail
- Returns detailed results with success/failure counts
- Shows first 10 errors for debugging

### ✅ Phone Number Formatting
- Automatically formats phone numbers
- Handles various input formats
- Adds country code if missing (defaults to +49 for Germany)

### ✅ Unique Recipients
- Automatically gets unique phone numbers from Google Sheets
- No duplicate messages to the same number
- Only includes numbers from submitted requests

## Important Notes

### ⚠️ Twilio Configuration Required

Make sure these environment variables are set:
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_NUMBER` (format: `whatsapp:+4915888725850`)

### ⚠️ Rate Limits

- Twilio has rate limits for WhatsApp messages
- The system sends 1 message per second by default
- For 100 recipients, it will take ~100 seconds (1.5 minutes)
- For 1000 recipients, it will take ~16 minutes

### ⚠️ Costs

- Each WhatsApp message sent via Twilio has a cost
- Check your Twilio pricing before sending to large lists
- Consider testing with a small group first

## Production Usage

For production, use your Railway deployment URL:

```bash
curl -X POST https://whatsapp-tree-logistics-bot-production.up.railway.app/broadcast \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Your message here"
  }'
```

## Security Considerations

⚠️ **Important:** The broadcast endpoint is currently open. Consider adding:

1. **Authentication** - Require API key or token
2. **Authorization** - Only allow specific users/IPs
3. **Rate Limiting** - Prevent abuse
4. **Webhook Verification** - Verify requests are legitimate

Example with basic auth (to be implemented):

```javascript
// Add middleware to protect the endpoint
app.post('/broadcast', authenticateAdmin, async (req, res) => {
  // ... existing code
});
```

## Example Messages

### System Maintenance
```
🌳 Important Notice

Our support system will be under maintenance on December 5th from 10 PM to 2 AM. During this time, you may experience delays in responses.

Thank you for your understanding!
```

### Update Notification
```
🌳 Good News!

We've improved our support system. You can now check your request status by sending "STATUS" followed by your Request ID.

Thank you for using Tree Logistics Support!
```

### Holiday Notice
```
🌳 Holiday Notice

Our support team will have limited availability during the holidays (Dec 24-26). Urgent requests will still be handled.

Happy Holidays! 🎄
```

## Troubleshooting

### "Twilio messaging service is not configured"
- Check that `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_WHATSAPP_NUMBER` are set
- Verify the WhatsApp number is in format: `whatsapp:+4915888725850`

### "No phone numbers found"
- Check that there are requests in Google Sheets
- Verify the Google Sheets connection is working

### Some messages fail
- Check Twilio console for error details
- Verify phone numbers are valid
- Some numbers may have opted out of WhatsApp

### Messages taking too long
- This is normal - 1 second delay per message prevents rate limits
- For faster sending, you can reduce delay (but risk rate limits)

## Future Improvements

Potential enhancements:
- [ ] Scheduled broadcasts
- [ ] Filter by station (DBE2, DBE3)
- [ ] Filter by date range
- [ ] Message templates
- [ ] Delivery status tracking
- [ ] Opt-out functionality
- [ ] Message preview before sending
- [ ] Batch sending with progress updates


