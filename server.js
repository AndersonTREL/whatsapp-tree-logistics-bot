const express = require('express');
const { MessagingResponse } = require('twilio').twiml;
require('dotenv').config();

// Import services
const conversationFlow = require('./services/conversationFlow');
const googleSheets = require('./services/googleSheets');

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

// Handle active conversation flow
async function handleActiveFlow(flowState, message, from, profileName) {
  console.log(`📱 Handling active flow:`, flowState);
  
  const { step, ...data } = flowState;
  
  if (step === 'data_collection') {
    return await handleDataCollection(message, from, data);
  }
  
  return await startDataCollectionFlow(from, profileName);
}

// Start data collection flow - asks for all 3 pieces of info at once
async function startDataCollectionFlow(from, profileName) {
  conversationFlow.startFlow(from, {
    step: 'data_collection',
    profileName: profileName,
    flow: 'data_collection'
  });
  
  return `Welcome to Tree Logistics Support! 🌳\nSubmit your request anytime — our team is ready to assist you.\n\nPlease provide your first name, last name, and the station where you work to get started.`;
}

// Handle data collection - parse the single message for all 3 pieces of info
async function handleDataCollection(message, from, data) {
  try {
    // Parse the message to extract the 3 pieces of information
    const parsedData = parseDriverInfo(message);
    
    if (!parsedData.isValid) {
      return `❌ Please provide the information in the correct format:\n\n📝 **First Name**\n📝 **Last Name**\n🏢 **Station** (DBE3 or DBE2)\n\nPlease try again.`;
    }
    
    // Now ask for their request/question
    conversationFlow.updateFlow(from, {
      ...data,
      firstName: parsedData.firstName,
      lastName: parsedData.lastName,
      station: parsedData.station,
      step: 'request_collection'
    });
    
    return `✅ Perfect! ${parsedData.firstName} ${parsedData.lastName} from ${parsedData.station} 📍\n\nNow, please tell me what you need help with. Describe your request or question:`;
    
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

// Handle request collection - get the actual request/question
async function handleRequestCollection(message, from, data) {
  // Save the complete request
  await saveRequest(from, data, message.trim());
  
  // Clear the flow
  conversationFlow.clearFlow(from);
  
  const requestId = `REQ-${Date.now()}`;
  const fullName = `${data.firstName} ${data.lastName}`;
  return `Thank you for reaching out ${fullName}! Your request has been submitted successfully. Our team will review it and contact you soon.\n\n🆔 Request ID: ${requestId}`;
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
    await googleSheets.addRequest({
      timestamp: timestamp,
      firstName: data.firstName,
      lastName: data.lastName,
      phoneNumber: from,
      station: data.station,
      request: requestText,
      status: 'review',
      rowId: `REQ-${Date.now()}`,
    });
    
    console.log(`✅ Request saved for ${data.firstName} ${data.lastName} from ${data.station}`);
  } catch (error) {
    console.error('Google Sheets Error:', error);
  }
}

// WhatsApp webhook endpoint
app.post('/webhook/whatsapp', async (req, res) => {
  try {
    const { Body: body, From: from, ProfileName: profileName } = req.body;
    
    if (!body || !from) {
      return res.status(400).send('Missing required parameters');
    }
    
    const responseMessage = await handleMessage(body, from, profileName);
    
    const twiml = new MessagingResponse();
    twiml.message(responseMessage);
    
    res.writeHead(200, { 
      'Content-Type': 'text/xml; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    res.end(twiml.toString());

  } catch (error) {
    console.error('Webhook Error:', error);
    
    const twiml = new MessagingResponse();
    twiml.message('Sorry, there was an error processing your request. Please try again.');
    
    res.writeHead(200, { 'Content-Type': 'text/xml' });
    res.end(twiml.toString());
  }
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

// Clear flows endpoint (for debugging)
app.post('/clear-flows', (req, res) => {
  conversationFlow.clearAllFlows();
  res.json({ success: true, message: 'All conversation flows cleared' });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Tree Logistics WhatsApp Bot running on port ${PORT}`);
  console.log(`📱 Webhook: http://localhost:${PORT}/webhook/whatsapp`);
  console.log(`🏥 Health: http://localhost:${PORT}/health`);
  console.log(`🧪 Test: POST http://localhost:${PORT}/test`);
});