# 📢 Broadcast Messaging Guide

## Overview

The broadcast messaging feature allows you to send WhatsApp messages to all users who have previously submitted requests through the bot. This is useful for:
- System updates
- Important announcements
- Maintenance notifications
- General communications

## Authentication

These endpoints can message every driver and list every phone number, and they sit
on a public URL, so they require a shared secret. Send it as an `x-admin-secret`
header on every call below.

The value lives in Railway -> service `whatsapp-tree-logistics-bot` -> Variables ->
`ADMIN_SECRET`. Without the header the endpoints return:

```json
{ "success": false, "error": "Forbidden" }
```

The driver-facing webhook is NOT affected — drivers keep messaging the bot exactly
as before. Only these admin endpoints changed.

The same secret also guards `/normalize-statuses`, `/fix-completed-statuses`,
`/force-fix-all-statuses`, `/format-sheet` and `/clear-flows`.

## How to Use

### 1. Check Recipients (Optional)

Before sending, you can check how many people will receive the message:

```bash
curl http://localhost:3000/broadcast/recipients \
  -H "x-admin-secret: $ADMIN_SECRET"
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
  -H "x-admin-secret: $ADMIN_SECRET" \
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
   - `x-admin-secret: <ADMIN_SECRET from Railway>`
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
  -H "x-admin-secret: $ADMIN_SECRET" \
  -d '{
    "message": "Your message here"
  }'
```

## Security Considerations

✅ **Authentication is in place.** `ADMIN_SECRET` is set on the Railway service and
every admin endpoint compares it in constant time, so a wrong value cannot be
guessed by timing. Requests without the header get a 403 and are logged.

This guide previously noted the endpoint was open — it no longer is.

Still worth knowing:

1. **Rate limiting** — there is none. A valid secret can trigger an unlimited
   number of broadcasts, and each one messages every driver in the sheet.
2. **No dry run** — `/broadcast` sends immediately. Check
   `/broadcast/recipients` first to see who would receive it.
3. **Rotating the secret** — change `ADMIN_SECRET` in Railway. The service restarts
   and the old value stops working at once.
4. **Removing the gate** — deleting `ADMIN_SECRET` returns these endpoints to being
   public. That is deliberate, so the choice is explicit rather than accidental.

The driver-facing webhook is separate and unaffected: it is verified by Twilio's
own request signature (see `TWILIO_VALIDATE_SIGNATURE` in the main README).

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


