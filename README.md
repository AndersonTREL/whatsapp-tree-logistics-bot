# WhatsApp Driver Support Webhook

A simple WhatsApp webhook that collects essential driver information and stores it in Google Sheets.

## Features

- **WhatsApp Integration**: Receives and responds to WhatsApp messages via Twilio
- **Google Sheets Integration**: Stores all requests in a Google Spreadsheet
- **Simple Data Collection**: Collects only 5 essential pieces of information
- **User Onboarding**: Collects driver information (name, station, request)

## Setup

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Environment Configuration**
   Copy `env.example` to `.env` and configure:
   ```bash
   cp env.example .env
   ```

3. **Required Environment Variables**
   - `TWILIO_ACCOUNT_SID`: Your Twilio Account SID
   - `TWILIO_AUTH_TOKEN`: Your Twilio Auth Token
   - `TWILIO_WHATSAPP_NUMBER`: Your Twilio WhatsApp number
   - `GOOGLE_SHEET_ID`: Your Google Spreadsheet ID
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL`: Google Service Account email
   - `GOOGLE_APPLICATION_CREDENTIALS`: Path to Google credentials JSON file

4. **Google Sheets Setup**
   - Create a Google Service Account
   - Download the credentials JSON file to `credentials/google-credentials.json`
   - Share your Google Spreadsheet with the service account email

5. **Start the Application**
   ```bash
   npm start
   ```

## API Endpoints

- `POST /webhook/whatsapp` - Main WhatsApp webhook endpoint
- `GET /health` - Health check endpoint
- `POST /test` - Test endpoint
- `POST /clear-flows` - Clear all conversation flows (debug)

## How It Works

1. **Driver sends WhatsApp message** to your Twilio number
2. **Webhook asks for 3 pieces of info** in one message:
   - First Name
   - Last Name  
   - Station (DBE3 or DBE2)
3. **Driver responds** with all 3 pieces: "John Smith DBE3"
4. **Webhook asks for request/question** - What they need help with
5. **Request submission** - Data is saved to Google Sheets with timestamp
6. **Confirmation** - Driver receives confirmation with Request ID

## Data Collected

The app collects exactly 4 pieces of information:

1. **First Name** - Driver's first name
2. **Last Name** - Driver's last name  
3. **Station** - DBE3 or DBE2
4. **Request/Question** - What the driver needs help with
5. **Timestamp** - Automatically captured when request is made

## Example Conversation

**Driver:** "Hello"  
**Bot:** "Please provide: First Name, Last Name, Station (DBE3 or DBE2). Example: 'John Smith DBE3'"

**Driver:** "John Smith DBE3"  
**Bot:** "Perfect! John Smith from DBE3. Now, what do you need help with?"

**Driver:** "I need a new scanner"  
**Bot:** "Request submitted! Request ID: REQ-1234567890"

## Dependencies

- `express` - Web framework
- `twilio` - WhatsApp integration
- `googleapis` - Google Sheets integration
- `dotenv` - Environment variables
- `node-cron` - Scheduled tasks

## License

ISC