# 🚀 Tree Logistics WhatsApp AI Bot

A completely rebuilt, AI-powered WhatsApp bot for Tree Logistics with upgraded Twilio integration.

## ✨ Features

### 🤖 AI-First Approach
- **OpenAI Integration**: Uses GPT-4o-mini for intelligent intent detection
- **Smart Routing**: Automatically detects category from natural language
- **Dynamic Questions**: AI generates context-specific follow-up questions
- **Intelligent Completion**: AI determines when enough information is collected

### 📋 Categories Supported
1. **💰 Salary** - Payroll, payslips, salary inquiries
2. **👥 HR** - Contract questions, HR policies, employment info
3. **🚨 Accident/Damage** - Accident reports, damage claims
4. **🔧 Equipment** - Scanner issues, equipment problems, uniform requests
5. **📝 Report** - General reports, incidents, suggestions
6. **🏖️ Vacation/Sick Leave** - Leave requests, sick leave, vacation balance

### 🔄 Conversation Flow
1. **AI Intent Detection**: Understands natural language requests
2. **Smart Questions**: Asks relevant follow-up questions
3. **Data Collection**: Gathers all necessary information
4. **Auto-Completion**: Submits complete requests to Google Sheets

## 🛠️ Technical Stack

- **Node.js + Express**: Backend server
- **Twilio WhatsApp API**: Message handling
- **OpenAI GPT-4o-mini**: AI intelligence
- **Google Sheets API**: Request logging
- **ngrok**: Public webhook access

## 📁 Project Structure

```
├── server.js                 # Main server with AI integration
├── services/
│   ├── aiService.js         # OpenAI integration
│   ├── conversationFlow.js  # Flow management
│   └── googleSheets.js      # Google Sheets integration
├── credentials/
│   └── google-credentials.json
├── .env                     # Environment variables
└── package.json
```

## 🚀 Setup

### 1. Install Dependencies
```bash
npm install
```

### 2. Environment Variables
Create `.env` file:
```env
OPENAI_API_KEY=your_openai_api_key
PORT=3000
```

### 3. Start Services
```bash
# Start ngrok (in separate terminal)
ngrok http 3000

# Start server
npm start
```

### 4. Configure Twilio
- **Webhook URL**: `https://your-ngrok-url.ngrok-free.dev/webhook/whatsapp`
- **Method**: HTTP POST
- **Use your upgraded Twilio WhatsApp number** (not sandbox)

## 🧪 Testing

### Test AI Intent Detection
```bash
curl -X POST https://your-ngrok-url.ngrok-free.dev/webhook/whatsapp \
  -d "Body=I broke my scanner&From=whatsapp:+4917616626841&ProfileName=Anderson"
```

### Test Category Selection
```bash
curl -X POST https://your-ngrok-url.ngrok-free.dev/webhook/whatsapp \
  -d "Body=4&From=whatsapp:+4917616626841&ProfileName=Anderson"
```

### Test Complete Flow
```bash
# 1. AI detects intent
curl -X POST https://your-ngrok-url.ngrok-free.dev/webhook/whatsapp \
  -d "Body=I need my payslip&From=whatsapp:+4917616626841&ProfileName=Anderson"

# 2. Provide details
curl -X POST https://your-ngrok-url.ngrok-free.dev/webhook/whatsapp \
  -d "Body=September 2025 missing&From=whatsapp:+4917616626841&ProfileName=Anderson"

# 3. Complete request
curl -X POST https://your-ngrok-url.ngrok-free.dev/webhook/whatsapp \
  -d "Body=Employee ID 12345&From=whatsapp:+4917616626841&ProfileName=Anderson"
```

## 🎯 Key Improvements

### ✅ What's Fixed
- **No more sandbox dependencies** - Works with upgraded Twilio
- **AI-first approach** - Intelligent from the start
- **Clean codebase** - Removed all old/unnecessary files
- **Proper flow management** - Conversations work smoothly
- **Smart completion** - AI decides when to submit requests

### 🔧 Technical Improvements
- **Simplified architecture** - Only essential services
- **Better error handling** - Graceful failures
- **Improved logging** - Better debugging
- **Clean response format** - Twilio-compatible XML

## 📱 Usage Examples

### Natural Language Input
```
User: "I broke my scanner"
Bot: 🤖 I understand you need help with equipment.
     Please provide these details:
     1. What is the model and serial number of the scanner?
     2. Can you describe the issue in detail?
     3. Is the scanner completely broken or partially working?

User: "Scanner model ABC123, screen is cracked"
Bot: Thank you! Please provide any additional details:

User: "I need a replacement urgently"
Bot: ✅ Equipment Request Submitted!
     🆔 Request ID: REQ-1697123456789
     Our team will review and respond within 24-48 hours.
```

### Category Selection
```
User: "Hello"
Bot: 🚛 Tree Logistics Support
     Hello! Please select your request category:
     1. 💰 Salary
     2. 👥 HR
     3. 🚨 Accident/Damage
     4. 🔧 Equipment
     5. 📝 Report
     6. 🏖️ Vacation/Sick Leave

User: "1"
Bot: 📋 Salary Request
     Please provide these details:
     1. What specific payroll information do you need?
     2. Which month or period are you asking about?
     3. Have you checked your online portal?
```

## 🎉 Ready to Use!

Your AI-powered WhatsApp bot is now ready for production use with your upgraded Twilio account!

**Webhook URL**: `https://uncommutable-eve-waxiest.ngrok-free.dev/webhook/whatsapp`
**Status**: ✅ Active and tested
**AI**: ✅ Configured and working
**Categories**: ✅ All 6 categories supported

Send messages to your Twilio WhatsApp number and experience the intelligent AI interactions! 🤖✨