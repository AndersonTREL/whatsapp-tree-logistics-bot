const express = require('express');
const { MessagingResponse } = require('twilio').twiml;
require('dotenv').config();

// Import services
const conversationFlow = require('./services/conversationFlow');
const googleSheets = require('./services/googleSheets');
const messaging = require('./services/messaging');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Simple message handler - collects all info in one message
async function handleMessage(body, from, profileName) {
  const message = body.trim();
  
  console.log(`📱 Received from ${from}: "${message}"`);
  
  // Check for active conversation flow
  const flowState = conversationFlow.getFlowState(from);
  
  if (flowState) {
    return await handleActiveFlow(flowState, message, from, profileName);
  }
  
  // Start the simple data collection flow
  return await startDataCollectionFlow(from, profileName);
}


// Start data collection flow - asks for all 3 pieces of info at once
async function startDataCollectionFlow(from, profileName) {
  conversationFlow.startFlow(from, {
    step: 'data_collection',
    profileName: profileName,
    flow: 'data_collection'
  });
  
  return `🌳 Welcome to Tree Logistics Office Support! 

We are glad that you reached out! To get started, please provide your first name, last name, and the station where you work (DBE2, DBE3).`;
}

// Handle data collection - parse the single message for all 3 pieces of info
async function handleDataCollection(message, from, data) {
  try {
    // Parse the message to extract the 3 pieces of information
    const parsedData = parseDriverInfo(message);
    
    if (!parsedData.isValid) {
      return `❌ Please provide the information in the correct format:

📝 **First Name**
📝 **Last Name** 
🏢 **Station** (DBE3 or DBE2)

Please try again.`;
    }
    
    // Now ask for their request/question
    conversationFlow.updateFlow(from, {
      ...data,
      firstName: parsedData.firstName,
      lastName: parsedData.lastName,
      station: parsedData.station,
      step: 'request_collection'
    });
    
    return `---------
✅ Perfect! ${parsedData.firstName} ${parsedData.lastName}, from ${parsedData.station} 📍

Now, please tell us what you need help with. 

📝 The more details you provide, the faster we can help you!

Examples:
• "I need a new scanner because mine stopped working"
• "I want to change my IBAN to DE12 5001 0517 0648 4898 90 because I opened a new bank account"
• "My delivery route shows the wrong address for customer John Smith"

What can we help you with?
---------`;
    
  } catch (error) {
    console.error('Error parsing driver info:', error);
    return `❌ Please provide the information in the correct format:\n\n📝 **First Name**\n📝 **Last Name**\n🏢 **Station** (DBE3 or DBE2)\n\nPlease try again.`;
  }
}

// Parse driver information from a single message
function parseDriverInfo(message) {
  const words = message.trim().split(/\s+/);
  
  if (words.length < 3) {
    return { isValid: false, error: 'Not enough information provided' };
  }
  
  // Find the station (DBE3 or DBE2)
  const stationIndex = words.findIndex(word => 
    word.toUpperCase() === 'DBE3' || word.toUpperCase() === 'DBE2'
  );
  
  if (stationIndex === -1) {
    return { isValid: false, error: 'Station not found. Please specify DBE3 or DBE2' };
  }
  
  // Extract first name, last name, and station
  const firstName = words[0];
  const lastName = words.slice(1, stationIndex).join(' ');
  const station = words[stationIndex].toUpperCase();
  
  // Validate station
  if (station !== 'DBE3' && station !== 'DBE2') {
    return { isValid: false, error: 'Invalid station. Please specify DBE3 or DBE2' };
  }
  
  return {
    isValid: true,
    firstName: firstName,
    lastName: lastName,
    station: station
  };
}

// Detect request type and provide contextual help
function detectRequestType(requestText) {
  const text = requestText.trim().toLowerCase();
  
  console.log(`[DETECT] Analyzing text: "${text}"`);
  
  // IBAN/Bank account change
  if (/\b(iban|bank\s+account|account\s+number|change\s+iban|update\s+iban|new\s+iban)\b/i.test(text)) {
    console.log(`[DETECT] Detected: iban_change`);
    return 'iban_change';
  }
  
  // Scanner request - check for scanner keywords (must check before equipment to avoid false positives)
  // Match: "scanner", "need scanner", "want scanner", "new scanner", "scanner broken", etc.
  if (/\b(scanner|scanning\s+device|scan\s+device)\b/i.test(text) || 
      /\b(need|want|get|new)\s+(a\s+)?scanner\b/i.test(text) ||
      /\bscanner\s+(broken|not\s+working|doesn't\s+work)\b/i.test(text)) {
    console.log(`[DETECT] Detected: scanner`);
    return 'scanner';
  }
  
  // Vacation/Time off request
  if (/\b(vacation|holiday|time\s+off|days\s+off|leave|off\s+work|free\s+days|need\s+vacation|want\s+vacation)\b/i.test(text)) {
    console.log(`[DETECT] Detected: vacation`);
    return 'vacation';
  }
  
  // Equipment request
  if (/\b(equipment|device|tool|machine|need\s+new|broken|not\s+working)\b/i.test(text)) {
    console.log(`[DETECT] Detected: equipment`);
    return 'equipment';
  }
  
  console.log(`[DETECT] Detected: general`);
  return 'general';
}

// Validate request text - contextual and helpful validation
function validateRequestText(requestText, retryCount = 0) {
  const text = requestText.trim();
  const textLower = text.toLowerCase();
  const words = text.split(/\s+/).filter(word => word.length > 0);
  
  console.log(`[VALIDATION] Validating: "${text}" (retry: ${retryCount})`);
  
  // After 1 retry, accept the request anyway (don't frustrate users)
  const MAX_RETRIES = 1;
  if (retryCount >= MAX_RETRIES) {
    console.log(`[VALIDATION] Max retries reached, accepting request`);
    return {
      isValid: true,
      warning: true,
      message: null
    };
  }

  // Very short requests (less than 10 characters) - definitely too short
  if (text.length < 10) {
    return {
      isValid: false,
      reason: 'too_short',
      message: `📝 Your message is very short. Could you add a bit more detail?\n\nWhat can we help you with?`
    };
  }

  // Detect request type for contextual help
  const requestType = detectRequestType(text);
  console.log(`[VALIDATION] Request type detected: ${requestType}`);
  
  // IBAN Change - ask for IBAN number if not already provided (only on first attempt)
  if (requestType === 'iban_change') {
    const ibanPattern = /\b(DE|de)\s*\d{2}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{4}\s*\d{2}\b|\bDE\d{20}\b/i;
    if (!ibanPattern.test(text)) {
      console.log(`[VALIDATION] IBAN request without IBAN number, asking once`);
      return {
        isValid: false,
        reason: 'iban_missing',
        message: `📝 To update your IBAN, please also send your new IBAN number.\n\nExample: DE12 5001 0517 0648 4898 90\n\nWhat's your new IBAN? (or send any message again to save your request as-is)`
      };
    }
  }
  
  // Scanner Request - ask if it still works (only on first attempt)
  if (requestType === 'scanner') {
    console.log(`[VALIDATION] Scanner request detected, checking status...`);
    const brokenPattern = /\b(broken|not\s+working|doesn't\s+work|stopped|dead|faulty|defective|doesn't\s+turn\s+on|won't\s+work)\b/i;
    const workingPattern = /\b(working|works|fine|ok|okay|good|still\s+works)\b/i;
    
    const isBroken = brokenPattern.test(text);
    const isWorking = workingPattern.test(text);
    
    console.log(`[VALIDATION] Scanner - isBroken: ${isBroken}, isWorking: ${isWorking}`);
    
    // If broken, provide helpful info and accept immediately
    if (isBroken) {
      console.log(`[VALIDATION] ✅ Scanner is broken, accepting with helpful info`);
      return {
        isValid: true,
        requestType: 'scanner',
        helpfulInfo: "Please come to the office tomorrow to get a new scanner. We'll have one ready for you."
      };
    }
    
    // If status unclear, ask once - on next message it will be saved (MAX_RETRIES=1)
    if (!isWorking) {
      console.log(`[VALIDATION] Scanner status unclear, asking once`);
      return {
        isValid: false,
        reason: 'scanner_status',
        message: `📝 Is your scanner still working, or is it broken?\n\nIf it's broken: Please come to the office tomorrow to get a new scanner. We'll have one ready for you.\n\nIf it's still working: Let us know what the issue is and we'll help you.\n\n(Send any message again to save your request as-is)`
      };
    }
    
    console.log(`[VALIDATION] ✅ Scanner request accepted`);
  }
  
  // Vacation Request - ask for dates (only on first attempt)
  if (requestType === 'vacation') {
    console.log(`[VALIDATION] Vacation request detected, checking for dates...`);
    const datePattern = /\b(\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}|\d{1,2}\s+(january|february|march|april|may|june|july|august|september|october|november|december)|next\s+week|this\s+week|from\s+\d|to\s+\d|until|till|from\s+\d{1,2}|december|january|february|march|april|may|june|july|august|september|october|november)\b/i;
    const fromToPattern = /\b(from|starting|beginning)\s+.+\s+(to|until|till|ending)\s+/i;
    
    const hasDates = datePattern.test(text) || fromToPattern.test(text);
    console.log(`[VALIDATION] Has dates: ${hasDates}`);
    
    if (!hasDates) {
      console.log(`[VALIDATION] Vacation without dates, asking once`);
      return {
        isValid: false,
        reason: 'vacation_dates',
        message: `📝 To help with your vacation request, please include the dates.\n\nExample:\n• "I need vacation from 15.03.2026 to 22.03.2026"\n• "I need 5 days off starting next Monday"\n\nWhich dates do you need? (or send any message again to save your request as-is)`
      };
    }
    console.log(`[VALIDATION] ✅ Vacation request accepted`);
  }

  // Check for extremely vague phrases with no context (only if not a specific request type)
  if (requestType === 'general') {
    const extremelyVague = [
      { pattern: /^(i have|i've got|there is|there's)\s+(a\s+)?problem\.?$/i, example: 'I have a problem with my scanner - it stopped working yesterday' },
      { pattern: /^(i need|i want)\s+help\.?$/i, example: 'I need help changing my IBAN number' },
      { pattern: /^(i have|i've got)\s+(an\s+)?issue\.?$/i, example: 'I have an issue with my delivery route - it shows the wrong address' },
      { pattern: /^something\s+(is\s+)?wrong\.?$/i, example: "Something is wrong with my scanner - it won't turn on" }
    ];

    for (const vague of extremelyVague) {
      if (vague.pattern.test(textLower)) {
        return {
          isValid: false,
          reason: 'too_vague',
          message: `📝 Could you tell us a bit more? \n\nFor example: "${vague.example}"\n\nWhat exactly do you need help with?`
        };
      }
    }
  }

  // Request is valid
  console.log(`[VALIDATION] ✅ All validations passed, request is valid`);
  return {
    isValid: true,
    requestType: requestType
  };
}

// Handle request collection - get the actual request/question
async function handleRequestCollection(message, from, data) {
  try {
    const requestText = message.trim();
    
    // Get retry count from flow state (how many times they've tried)
    const retryCount = data.requestRetryCount || 0;
    
    console.log(`\n========== REQUEST VALIDATION START ==========`);
    console.log(`📱 User: ${data.firstName} ${data.lastName} (${from})`);
    console.log(`📝 Request text: "${requestText}"`);
    console.log(`🔄 Retry count: ${retryCount}`);
    
    // Validate the request text (contextual and helpful validation)
    const validation = validateRequestText(requestText, retryCount);
    
    console.log(`🔍 Validation result:`, JSON.stringify(validation, null, 2));
    
    // CRITICAL: Always check validation.isValid - never bypass this check
    if (validation === null || validation === undefined || !validation.isValid) {
      console.log(`❌ VALIDATION FAILED - Request will NOT be saved`);
      console.log(`📤 Returning message to user asking for more info`);
      console.log(`========== REQUEST VALIDATION END ==========\n`);
      
      // Increment retry count and update flow
      conversationFlow.updateFlow(from, {
        ...data,
        requestRetryCount: retryCount + 1
      });
      
      // Return contextual, helpful message
      return validation.message;
    }
    
    console.log(`✅ VALIDATION PASSED - Request will be saved to Google Sheets`);
    console.log(`========== REQUEST VALIDATION END ==========\n`);

    // DOUBLE CHECK: Ensure validation actually passed (safety check)
    if (!validation || !validation.isValid) {
      console.error(`🚨 CRITICAL ERROR: Validation says invalid but code reached save point!`);
      console.error(`Validation object:`, validation);
      return `⚠️ There was an error processing your request. Please try again.`;
    }

    // Request is valid - save it
    const saveResult = await saveRequest(from, data, requestText);
    
    // Clear the flow only if save was successful
    conversationFlow.clearFlow(from);
    
    const requestId = saveResult?.rowId || `REQ-${Date.now()}`;
    const fullName = `${data.firstName} ${data.lastName}`;
    
    // Add helpful info based on request type (e.g., scanner replacement instructions)
    let helpfulInfo = '';
    if (validation.helpfulInfo) {
      helpfulInfo = `\n\n💡 ${validation.helpfulInfo}`;
    }
    
    // If they had retries, acknowledge their persistence
    const retryAcknowledgment = retryCount > 0 
      ? '\n\nThanks for providing the details!' 
      : '';
    
    return `💚 Thank you ${fullName}! Your request has been submitted successfully and our team will review it and contact you soon. Have a great day!${helpfulInfo}${retryAcknowledgment}

🆔 Request ID: ${requestId}`;
  } catch (error) {
    // Log the error but don't clear the flow so user can try again
    console.error('❌ Failed to save request:', error);
    
    const fullName = `${data.firstName} ${data.lastName}`;
    return `⚠️ We're sorry ${fullName}, but we encountered an issue saving your request to our system. Please try sending your request again in a moment. 

If the problem persists, please contact support directly.`;
  }
}

// Updated handleActiveFlow to handle request collection
async function handleActiveFlow(flowState, message, from, profileName) {
  console.log(`📱 Handling active flow:`, flowState);
  
  const { step, ...data } = flowState;
  
  if (step === 'data_collection') {
    return await handleDataCollection(message, from, data);
  }
  
  if (step === 'request_collection') {
    return await handleRequestCollection(message, from, data);
  }
  
  return await startDataCollectionFlow(from, profileName);
}

// Save request to Google Sheets with only the 4 required fields
async function saveRequest(from, data, requestText) {
  const timestamp = new Date().toLocaleString('en-GB', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  });
  
  try {
    console.log(`📝 Attempting to save request to Google Sheets for ${data.firstName} ${data.lastName} from ${data.station}`);
    
    const result = await googleSheets.addRequest({
      timestamp: timestamp,
      firstName: data.firstName,
      lastName: data.lastName,
      phoneNumber: from,
      station: data.station,
      request: requestText,
      status: 'review',
      rowId: `REQ-${Date.now()}`,
    });
    
    console.log(`✅ Request saved successfully to Google Sheets:`, result);
    return { success: true, rowId: result.rowId };
  } catch (error) {
    console.error('❌ Google Sheets Error - Failed to save request:');
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    // Check for specific error types
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      console.error('❌ Network error - cannot reach Google Sheets API');
    } else if (error.code === 401 || error.message.includes('authentication')) {
      console.error('❌ Authentication error - check Google credentials');
    } else if (error.code === 403 || error.message.includes('permission')) {
      console.error('❌ Permission error - service account may not have access to the sheet');
    } else if (error.code === 404 || error.message.includes('not found')) {
      console.error('❌ Sheet not found - check spreadsheet ID and sheet name');
    }
    
    // Re-throw the error so the caller can handle it
    throw error;
  }
}

// WhatsApp webhook endpoint - GET for verification
app.get('/webhook/whatsapp', (req, res) => {
  console.log('🔍 Webhook verification request (GET)');
  res.json({ 
    status: 'webhook endpoint active',
    method: 'POST to receive messages',
    timestamp: new Date().toISOString()
  });
});

// WhatsApp webhook endpoint - POST for messages
app.post('/webhook/whatsapp', async (req, res) => {
  try {
    console.log('📥 Webhook received:', {
      method: req.method,
      url: req.url,
      headers: req.headers,
      body: req.body
    });
    
    // Twilio sends form-encoded data with capitalized field names
    const body = req.body.Body || req.body.body || '';
    const from = req.body.From || req.body.from;
    const profileName = req.body.ProfileName || req.body.profileName || 'User';
    
    console.log('📱 Parsed webhook data:', { body, from, profileName });
    
    if (!body || !from) {
      console.error('❌ Missing required parameters:', { body: !!body, from: !!from });
      return res.status(400).send('Missing required parameters');
    }
    
    const responseMessage = await handleMessage(body, from, profileName);
    
    const twiml = new MessagingResponse();
    twiml.message(responseMessage);
    
    console.log('✅ Sending response:', responseMessage);
    
    res.writeHead(200, { 
      'Content-Type': 'text/xml; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.end(twiml.toString());

  } catch (error) {
    console.error('❌ Webhook Error:', error);
    console.error('Error stack:', error.stack);
    
    const twiml = new MessagingResponse();
    twiml.message('Sorry, there was an error processing your request. Please try again.');
    
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(twiml.toString());
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    service: 'Tree Logistics WhatsApp Bot',
    status: 'running',
    endpoints: {
      webhook: 'POST /webhook/whatsapp',
      health: 'GET /health',
      test: 'POST /test',
      clearFlows: 'POST /clear-flows',
      normalizeStatuses: 'POST /normalize-statuses',
      fixCompletedStatuses: 'POST /fix-completed-statuses',
      forceFixAllStatuses: 'POST /force-fix-all-statuses',
      statusDiagnostics: 'GET /status-diagnostics',
      broadcast: 'POST /broadcast',
      broadcastRecipients: 'GET /broadcast/recipients'
    },
    timestamp: new Date().toISOString()
  });
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString()
  });
});

// Simple test endpoint
app.post('/test', (req, res) => {
  console.log('🧪 TEST ENDPOINT HIT:', req.body);
  const twiml = new MessagingResponse();
  twiml.message('TEST MESSAGE - If you see this, delivery works!');
  res.writeHead(200, { 'Content-Type': 'text/xml' });
  res.end(twiml.toString());
});

// Test validation endpoint - to verify validation is working
app.post('/test-validation', (req, res) => {
  const { message } = req.body;
  
  if (!message) {
    return res.json({ error: 'Please provide a message in the request body' });
  }
  
  const validation = validateRequestText(message, 0);
  
  res.json({
    message: message,
    validation: validation,
    timestamp: new Date().toISOString(),
    version: '2.0.0-validation-fix'
  });
});

// Clear flows endpoint (for debugging)
app.post('/clear-flows', (req, res) => {
  conversationFlow.clearAllFlows();
  res.json({ success: true, message: 'All conversation flows cleared' });
});

// Normalize statuses endpoint (fixes filtering issues)
app.post('/normalize-statuses', async (req, res) => {
  try {
    const result = await googleSheets.normalizeAllStatuses();
    res.json({ 
      success: true, 
      message: `Normalized ${result.processedCount} status values (${result.normalizedCount} changed)`,
      ...result
    });
  } catch (error) {
    console.error('Error normalizing statuses:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Force fix all "Completed" statuses
app.post('/fix-completed-statuses', async (req, res) => {
  try {
    const result = await googleSheets.fixCompletedStatuses();
    res.json({ 
      success: true, 
      message: `Fixed ${result.fixedCount} "Completed" statuses`,
      ...result
    });
  } catch (error) {
    console.error('Error fixing completed statuses:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Force fix ALL statuses to exact matches
app.post('/force-fix-all-statuses', async (req, res) => {
  try {
    const result = await googleSheets.forceFixAllStatuses();
    res.json({ 
      success: true, 
      message: `Force fixed ${result.fixedCount} status values`,
      ...result
    });
  } catch (error) {
    console.error('Error force fixing statuses:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Diagnostic endpoint to check status values
app.get('/status-diagnostics', async (req, res) => {
  try {
    const result = await googleSheets.getStatusDiagnostics();
    res.json(result);
  } catch (error) {
    console.error('Error getting status diagnostics:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Broadcast message endpoint - send message to all users who submitted requests
app.post('/broadcast', async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || message.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Message is required'
      });
    }

    // Check if messaging service is configured
    if (!messaging.isConfigured()) {
      return res.status(500).json({
        success: false,
        error: 'Twilio messaging service is not configured. Check TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_NUMBER environment variables.'
      });
    }

    console.log('📢 Starting broadcast message...');
    
    // Get all unique phone numbers from Google Sheets
    const phoneNumbers = await googleSheets.getUniquePhoneNumbers();

    if (phoneNumbers.length === 0) {
      return res.json({
        success: true,
        message: 'No phone numbers found in the system',
        total: 0,
        successful: 0,
        failed: 0
      });
    }

    console.log(`📱 Sending message to ${phoneNumbers.length} recipients...`);

    // Send messages with 1 second delay between each to avoid rate limits
    const results = await messaging.sendBulkMessages(
      phoneNumbers,
      message.trim(),
      {
        delayBetweenMessages: 1000, // 1 second between messages
        continueOnError: true // Continue even if some fail
      }
    );

    res.json({
      success: true,
      message: `Broadcast completed: ${results.successful} successful, ${results.failed} failed`,
      total: results.total,
      successful: results.successful,
      failed: results.failed,
      errors: results.errors.length > 0 ? results.errors.slice(0, 10) : [] // Show first 10 errors
    });

  } catch (error) {
    console.error('❌ Error sending broadcast:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get list of all unique phone numbers (for preview before broadcast)
app.get('/broadcast/recipients', async (req, res) => {
  try {
    const phoneNumbers = await googleSheets.getUniquePhoneNumbers();
    
    res.json({
      success: true,
      count: phoneNumbers.length,
      phoneNumbers: phoneNumbers
    });
  } catch (error) {
    console.error('Error getting recipients:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log('='.repeat(50));
  console.log(`🚀 Tree Logistics WhatsApp Bot running on port ${PORT}`);
  console.log(`📦 Version: 2.0.0-validation-fix`);
  console.log(`🕐 Started: ${new Date().toISOString()}`);
  console.log('='.repeat(50));
  console.log(`📱 Webhook: POST http://localhost:${PORT}/webhook/whatsapp`);
  console.log(`🏥 Health: GET http://localhost:${PORT}/health`);
  console.log(`🧪 Test: POST http://localhost:${PORT}/test`);
  console.log(`✅ Validation Test: POST http://localhost:${PORT}/test-validation`);
  console.log(`📋 Root: GET http://localhost:${PORT}/`);
  console.log('='.repeat(50));
  console.log('🔍 Validation Features:');
  console.log('  ✅ Vacation requests require dates');
  console.log('  ✅ Scanner requests require status (working/broken)');
  console.log('  ✅ IBAN changes require new IBAN number');
  console.log('='.repeat(50));
  console.log('Environment check:');
  console.log(`  - PORT: ${PORT}`);
  console.log(`  - GOOGLE_SHEET_ID: ${process.env.GOOGLE_SHEET_ID ? '✅ Set' : '❌ Missing'}`);
  console.log(`  - GOOGLE_APPLICATION_CREDENTIALS: ${process.env.GOOGLE_APPLICATION_CREDENTIALS || process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON ? '✅ Set' : '❌ Missing'}`);
  console.log('='.repeat(50));
});