# 🌳 Tree Logistics WhatsApp Support Bot

A professional WhatsApp webhook application that automatically collects driver support requests and stores them in Google Sheets for Tree Logistics. The bot runs 24/7 on Railway cloud infrastructure, providing seamless communication between drivers and the support team.

## 🚀 Live Deployment

- **WhatsApp Number:** `+4915888725850`
- **Webhook URL:** `https://whatsapp-tree-logistics-bot-production.up.railway.app/webhook/whatsapp`
- **Google Sheet:** [Driver Requests Dashboard](https://docs.google.com/spreadsheets/d/1DwBYrHLGCpFpqbU6r5DUL6fyzJS8urN87tFgKAmJssQ)

## 📋 What This App Does

The Tree Logistics WhatsApp Bot is designed to streamline driver support requests by:

1. **Automatically responding** to WhatsApp messages from drivers
2. **Collecting essential information** in a structured format
3. **Storing all requests** in a Google Spreadsheet for team review
4. **Providing confirmation** to drivers with unique request IDs
5. **Running 24/7** without requiring any local computer to be online

## 🔄 How the Data Processing Works

### Step 1: Initial Contact
When a driver sends any message to `+4915888725850`, the bot responds with:
```
🌳 Welcome to Tree Logistics Office Support! 

We are glad that you reached out! To get started, please provide your first name, last name, and the station where you work (DBE2, DBE3).
```

### Step 2: Information Collection
The driver responds with their details in one message:
```
John Smith DBE3
```

The bot parses this information and responds:
```
---------
✅ Perfect! John Smith, from DBE3 📍

Now, please tell us what you need help with. Describe your request or question in as much detail as possible:
---------
```

### Step 3: Request Submission
The driver describes their issue:
```
I need a new scanner for my delivery route
```

### Step 4: Data Storage & Confirmation
The bot automatically:
- Generates a unique Request ID (e.g., `REQ-1734567890-5`)
- Saves all data to Google Sheets with timestamp
- Sends confirmation to the driver:

```
💚 Thank you John Smith! Your request has been submitted successfully and our team will review it and contact you soon. Have a great day! 

🆔 Request ID: REQ-1734567890-5
```

## 📊 Data Structure

The bot collects exactly **7 pieces of information** for each request:

| Field | Description | Example |
|-------|-------------|---------|
| **Timestamp** | When the request was submitted | `2024-01-15 14:30:25` |
| **First Name** | Driver's first name | `John` |
| **Last Name** | Driver's last name | `Smith` |
| **Station** | Work location (DBE3 or DBE2) | `DBE3` |
| **Request/Question** | What they need help with | `I need a new scanner` |
| **Request ID** | Unique identifier | `REQ-1734567890-5` |
| **Phone Number** | Driver's WhatsApp number | `+4917616626841` |

## 🏗️ Technical Architecture

### Core Components

- **Express.js Server** - Handles HTTP requests and webhook endpoints
- **Twilio Integration** - Manages WhatsApp messaging
- **Google Sheets API** - Stores and retrieves request data
- **Conversation Flow Manager** - Tracks user interactions
- **Railway Cloud Hosting** - Provides 24/7 uptime

### Data Flow

```
WhatsApp Message → Twilio → Railway Webhook → Express Server → Google Sheets API → Confirmation
```

## 🛠️ Setup & Configuration

### Prerequisites

- Node.js 18+ installed
- Twilio account with WhatsApp number
- Google Cloud project with Sheets API enabled
- Railway account for deployment

### Environment Variables

Create a `.env` file with the following variables:

```env
# Twilio Configuration
TWILIO_ACCOUNT_SID=your_twilio_account_sid
TWILIO_AUTH_TOKEN=your_twilio_auth_token
TWILIO_WHATSAPP_NUMBER=whatsapp:+4915888725850

# Google Sheets Configuration
GOOGLE_SHEET_ID=1DwBYrHLGCpFpqbU6r5DUL6fyzJS8urN87tFgKAmJssQ
GOOGLE_APPLICATION_CREDENTIALS_JSON={"type":"service_account",...}

# Server Configuration
PORT=3000
```

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/AndersonTREL/whatsapp-tree-logistics-bot.git
   cd whatsapp-tree-logistics-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp env.example .env
   # Edit .env with your credentials
   ```

4. **Start the application**
   ```bash
   npm start
   ```

## 🌐 API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webhook/whatsapp` | POST | Main WhatsApp webhook (Twilio callback) |
| `/health` | GET | Health check endpoint |
| `/test` | POST | Test endpoint for debugging |

## 📈 Monitoring & Logs

- **Railway Dashboard** - Monitor deployment status and logs
- **Google Sheets** - View all collected requests in real-time
- **Twilio Console** - Track message delivery and webhook status

## 🔧 Troubleshooting

### Common Issues

1. **Bot not responding**
   - Check Railway deployment status
   - Verify Twilio webhook URL is correct
   - Check environment variables are set

2. **Data not saving to Google Sheets**
   - Verify Google Service Account has access to the sheet
   - Check `GOOGLE_APPLICATION_CREDENTIALS_JSON` format
   - Ensure Google Sheets API is enabled

3. **JSON parsing errors**
   - Make sure `GOOGLE_APPLICATION_CREDENTIALS_JSON` is a single-line JSON
   - Use a JSON minifier to convert multi-line JSON

## 📱 Example Conversation Flow

```
Driver: Hi
Bot: 🌳 Welcome to Tree Logistics Office Support! 
     
     We are glad that you reached out! To get started, please provide your first name, last name, and the station where you work (DBE2, DBE3).

Driver: Maria Garcia DBE2
Bot: ---------
     ✅ Perfect! Maria Garcia, from DBE2 📍
     
     Now, please tell us what you need help with. Describe your request or question in as much detail as possible:
     ---------

Driver: My delivery truck needs maintenance
Bot: 💚 Thank you Maria Garcia! Your request has been submitted successfully and our team will review it and contact you soon. Have a great day! 
     
     🆔 Request ID: REQ-1734567890-6
```

## 🚀 Deployment

This application is deployed on Railway for 24/7 availability:

1. **Automatic deployment** from GitHub repository
2. **Environment variables** configured in Railway dashboard
3. **Google credentials** stored as environment variable
4. **Health checks** ensure service availability

## 📄 License

ISC License - See LICENSE file for details

## 🤝 Support

For technical support or questions about this bot, contact the development team or create an issue in the GitHub repository.

---

**Built with ❤️ for Tree Logistics** 🌳