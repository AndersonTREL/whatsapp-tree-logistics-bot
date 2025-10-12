const express = require('express');
const { MessagingResponse } = require('twilio').twiml;
require('dotenv').config();

// Import services
const aiService = require('./services/aiService');
const conversationFlow = require('./services/conversationFlow');
const googleSheets = require('./services/googleSheets');
const aiMemory = require('./services/aiMemory');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Categories
const CATEGORIES = {
  '1': 'Salary',
  '2': 'HR', 
  '3': 'Accident/Damage',
  '4': 'Equipment',
  '5': 'Report',
  '6': 'Vacation/Sick Leave',
  '7': 'Request Status'
};

// ChatGPT-Style Message Handler
async function handleMessage(body, from, profileName) {
  const message = body.trim();
  
  console.log(`📱 Received from ${from}: "${message}"`);
  
  // Get user info and conversation history from AI memory
  const userInfo = aiMemory.getUserInfo(from);
  const conversationHistory = aiMemory.getConversationHistory(from, 3);
  
  // Check for active conversation flow
  const flowState = conversationFlow.getFlowState(from);
  
  if (flowState) {
    return await handleActiveFlow(flowState, message, from, profileName);
  }
  
  // Check if this is a satisfaction rating (1-3) - use AI to detect context
  if (['1', '2', '3'].includes(message) && !flowState) {
    try {
      const aiResult = await aiService.detectIntent(`User just responded with: ${message}`);
      if (aiResult.success && aiResult.category === 'Satisfaction Rating') {
        return await handleSatisfactionRating(message, from, { profileName });
      }
    } catch (error) {
      console.error('AI satisfaction detection error:', error);
    }
  }
  
  // Check if this is a category selection (1-7) - but only if no user info
  const category = CATEGORIES[message];
  if (category && !userInfo) {
    return await handleCategorySelection(message, from, { profileName });
  }
  
  // Check for status requests - ChatGPT-style natural language
  const statusKeywords = ['status', 'request status', 'my request', 'check status', 'my requests', 'request history', 'check my', 'show my', 'where is my'];
  const isStatusRequest = statusKeywords.some(keyword => 
    message.toLowerCase().includes(keyword) || 
    (message.toLowerCase().includes('check') && message.toLowerCase().includes('status')) ||
    (message.toLowerCase().includes('show') && message.toLowerCase().includes('request'))
  );
  
  if (isStatusRequest) {
    return await handleStatusCheck(from, profileName);
  }
  
  // ChatGPT-Style: Natural conversation with AI
  try {
    // Use AI to understand intent with conversation context FIRST
    const contextMessage = conversationHistory.length > 0
      ? `Previous context: ${conversationHistory.map(h => `User: ${h.userMessage}, Bot: ${h.botResponse}`).join('; ')}\n\nCurrent message: ${message}`
      : message;
    
    const aiResult = await aiService.detectIntent(contextMessage);
    
    // If user is not onboarded but mentions specific equipment issues, handle them
    if ((!userInfo || !userInfo.firstName) && aiResult.success && 
        (aiResult.category === 'Equipment' || message.toLowerCase().includes('sim') || 
         message.toLowerCase().includes('scanner') || message.toLowerCase().includes('broken'))) {
      // Handle equipment issue directly with AI
      return await handleAIIntent(aiResult, message, from, profileName, userInfo);
    }
    
    // If user is not onboarded, start onboarding
    if (!userInfo || !userInfo.firstName) {
      return await startOnboardingFlow(from, profileName);
    }
    
    console.log(`🤖 AI Result:`, aiResult);
    
    // ChatGPT-style: Always respond naturally, even for greetings
    if (aiResult.success) {
      if (aiResult.category === 'Greeting') {
        return await handleGreeting(from, userInfo);
      }
      
      if (aiResult.confidence > 0.6) {
        return await handleAIIntent(aiResult, message, from, profileName, userInfo);
      }
    }
    
    // Low confidence - ask clarifying question like ChatGPT
    return await handleLowConfidenceIntent(message, from, userInfo);
    
  } catch (error) {
    console.error('AI Error:', error);
    return `I apologize, but I'm having trouble understanding your request right now. Could you please rephrase that? 🤔\n\nOr you can tell me which category your request is about:\n💰 Salary | 👥 HR | 🚨 Accident | 🔧 Equipment | 📝 Report | 🏖️ Vacation/Sick Leave`;
  }
}

// Handle greeting messages naturally
async function handleGreeting(from, userInfo) {
  const { firstName, lastName, station, totalRequests } = userInfo;
  const fullName = `${firstName} ${lastName}`.trim();
  
  let greeting = `Hello ${fullName}! 👋\n\n`;
  
  if (totalRequests > 0) {
    greeting += `Great to see you again! You've made ${totalRequests} request(s) with us.\n\n`;
  } else {
    greeting += `Welcome to Tree Logistics support! I'm here to help you with any questions or requests.\n\n`;
  }
  
  greeting += `How can I assist you today? Feel free to tell me what you need in your own words. 😊\n\n`;
  greeting += `For example, you can say:\n`;
  greeting += `• "I need my payslip for December"\n`;
  greeting += `• "I broke my scanner"\n`;
  greeting += `• "I want to report sick leave"\n`;
  greeting += `• "Check status of my requests"\n\n`;
  greeting += `I'm here to help with anything related to: Salary, HR, Accidents, Equipment, Reports, or Vacation/Sick Leave.`;
  
  return greeting;
}

// Handle low confidence intent - ask clarifying questions
async function handleLowConfidenceIntent(message, from, userInfo) {
  let response = `I understand you're reaching out, but I'd like to make sure I help you with the right thing. 🤔\n\n`;
  response += `You mentioned: "${message}"\n\n`;
  response += `Could you please tell me a bit more about what you need? For example:\n\n`;
  response += `• If it's about **payment or salary**, tell me which month or what information you need\n`;
  response += `• If it's about **equipment issues**, describe what's broken or what you need\n`;
  response += `• If it's about **sick leave or vacation**, let me know the dates\n`;
  response += `• If you want to **check your requests**, just say "check status"\n\n`;
  response += `I'm here to help! Just explain in your own words. 😊`;
  
  return response;
}

// Handle AI-detected intent with ChatGPT-style natural responses
async function handleAIIntent(aiResult, message, from, profileName, userInfo) {
  const { category, extractedInfo, confidence } = aiResult;
  
  console.log(`🤖 AI detected: ${category} (${confidence} confidence)`);
  
  if (category === 'Greeting') {
    return await handleGreeting(from, userInfo);
  }
  
  const fullName = userInfo ? `${userInfo.firstName} ${userInfo.lastName}`.trim() : profileName;
  
  // ChatGPT-style natural response with empathy
  let naturalResponse = `Got it, ${fullName}! `;
  
  // Category-specific natural responses
  switch(category) {
    case 'Salary':
      naturalResponse += `I can help you with salary-related questions. `;
      break;
    case 'HR':
      naturalResponse += `I'm here to help with your HR matter. `;
      break;
    case 'Accident/Damage':
      naturalResponse += `I understand you need to report an accident or damage. This is important, and I'll make sure it's handled urgently. `;
      break;
    case 'Equipment':
      naturalResponse += `I can help you with equipment issues. `;
      break;
    case 'Report':
      naturalResponse += `Thank you for bringing this to our attention. I'll help you document this report. `;
      break;
    case 'Vacation/Sick Leave':
      naturalResponse += `I can help you with your leave request. `;
      break;
    default:
      naturalResponse += `I'm here to help you with that. `;
  }
  
  // Handle special case: Vacation/Sick Leave
  if (category === 'Vacation/Sick Leave') {
    conversationFlow.startFlow(from, {
      step: 'collecting_details',
      category: category,
      profileName: fullName,
      initialMessage: message,
      extractedInfo: extractedInfo,
      sickLeaveStep: 'dates',
      firstName: userInfo?.firstName,
      lastName: userInfo?.lastName,
      station: userInfo?.station
    });
    
    return naturalResponse + `\n\nTo get started, could you please tell me the dates you need for your leave?\n\nFor example: "December 15-17, 2024" or "From December 15 to December 17"`;
  }
  
  // Start conversation flow for detected category
  conversationFlow.startFlow(from, {
    category,
    aiExtractedInfo: extractedInfo,
    initialMessage: message,
    profileName: fullName,
    step: 'collecting_details',
    flow: 'ai_detected',
    firstName: userInfo?.firstName,
    lastName: userInfo?.lastName,
    station: userInfo?.station
  });
  
  // ChatGPT-style: Be smart about what information we need
  let infoSummary = '';
  if (extractedInfo && Object.keys(extractedInfo).length > 0) {
    const infoStr = JSON.stringify(extractedInfo).replace(/[{}\"]/g, '').replace(/:/g, ': ').replace(/,/g, ', ');
    infoSummary = `\n\nFrom what you've told me: ${infoStr}\n\n`;
  } else {
    infoSummary = '\n\n';
  }
  
  // ChatGPT-style: Generate smart follow-up based on what we already know
  const followUpQuestions = await aiService.generateFollowUpQuestions(
    category, 
    extractedInfo, 
    message
  );
  
  // ChatGPT-5 Level Intelligence - Perfect Context Understanding
  let smartQuestion = '';
  
  // Use ChatGPT-5 level AI for perfect question generation
  if (followUpQuestions.success && followUpQuestions.questions.length > 0) {
    smartQuestion = followUpQuestions.questions[0];
    console.log('🤖 ChatGPT-5 Generated Question:', smartQuestion);
  }
  
  // ChatGPT-style: Don't ask for information we already have
  if (userInfo && userInfo.firstName && userInfo.lastName) {
    // Replace any questions about name/ID with more relevant ones
    smartQuestion = smartQuestion.replace(/employee ID|name for|identification|department/gi, 'additional details');
    smartQuestion = smartQuestion.replace(/What is your|What's your/gi, 'Is there any specific');
    
    // If the question is still about personal info, skip it entirely
    if (smartQuestion.toLowerCase().includes('employee id') || 
        smartQuestion.toLowerCase().includes('name') ||
        smartQuestion.toLowerCase().includes('identification')) {
      smartQuestion = 'Is there anything else I should know to help you with this request?';
    }
  }
  
  return naturalResponse + infoSummary + smartQuestion;
  
  // ChatGPT-style: If we have enough info, just ask for final details
  if (extractedInfo && Object.keys(extractedInfo).length > 1) {
    return naturalResponse + infoSummary + `Is there anything else I should know to help you with this request?`;
  }
  
  return naturalResponse + `\n\nCould you tell me more about what you need? I want to make sure I can help you properly. 😊`;
}

// Handle active conversation flow
async function handleActiveFlow(flowState, message, from, profileName) {
  console.log(`📱 Handling active flow:`, flowState);
  
  const { step, category, ...data } = flowState;
  
  if (step === 'category_selection') {
    return await handleCategorySelection(message, from, data);
  }
  
  if (step === 'collecting_details' || category) {
    return await handleDetailsCollection(message, from, { ...data, category });
  }
  
  if (step === 'satisfaction_rating') {
    return await handleSatisfactionRating(message, from, data);
  }
  
  if (step === 'onboarding') {
    return await handleOnboardingFlow(message, from, data);
  }
  
  return await showCategoryMenu(from, profileName);
}

// Handle category selection
async function handleCategorySelection(message, from, data) {
  const category = CATEGORIES[message];
  
  if (category) {
    // Handle Request Status category specially
    if (category === 'Request Status') {
      return await handleStatusCheck(from, data.profileName);
    }
    
    // Special handling for Vacation/Sick Leave
    if (category === 'Vacation/Sick Leave') {
      conversationFlow.updateFlow(from, {
        ...data,
        category,
        step: 'collecting_details',
        sickLeaveStep: 'dates'
      });
      
      return `📋 ${category} Request\n\nPlease provide the dates for your leave request.\n\nExample: "December 15-17, 2024" or "From Dec 15 to Dec 17, 2024"`;
    }
    
    conversationFlow.updateFlow(from, {
      ...data,
      category,
      step: 'collecting_details'
    });
    
    // Generate AI questions for this category
    const questions = await aiService.generateFollowUpQuestions(
      category,
      {},
      data.initialMessage || ''
    );
    
    if (questions.success && questions.questions.length > 0) {
      const questionList = questions.questions.map((q, i) => `${i + 1}. ${q}`).join('\n');
      return `📋 ${category} Request\n\nPlease provide these details:\n\n${questionList}\n\nYou can answer all at once or one by one.`;
    }
    
    return `📋 ${category} Request\n\nPlease provide details about your request:`;
  }
  
  return '❌ Invalid selection. Please choose 1-7:';
}

// Handle details collection
async function handleDetailsCollection(message, from, data) {
  if (!data) {
    console.error('No data in flow state');
    return 'Sorry, there was an error. Please start over by sending "hello".';
  }
  
  const { category, collectedDetails = [], step } = data;
  
  // Special handling for sick leave
  if (category === 'Vacation/Sick Leave' && (step === 'collecting_details' || data.sickLeaveStep)) {
    return await handleSickLeaveFlow(message, from, data);
  }
  
  // Add new details
  collectedDetails.push(message);
  
  // For ALL categories, limit to 2 questions maximum - questions are SUGGESTED only
  if (collectedDetails.length >= 2) {
    // We have enough info - submit the request (questions are suggested, not mandatory)
    await saveRequest(from, data, collectedDetails);
    
    const requestId = `REQ-${Date.now()}`;
    return `🌲 Perfect! I've submitted your ${category} request. ✅\n\n🆔 Request ID: ${requestId}\n\nOur professional team will review this and get back to you within 24-48 hours.\n\n🌲 Best regards,\nTree Logistics Team\n📧 support@treelogistics.com`;
  }
  
  // Use AI to determine if we need more information for other categories
  const needsMore = await aiService.needsMoreInfo(category, collectedDetails);
  
  if (needsMore.success && needsMore.needsMore && collectedDetails.length < 3) {
    conversationFlow.updateFlow(from, {
      ...data,
      collectedDetails
    });
    
    // Keep questions super simple and direct
    let followUpQuestion = needsMore.nextQuestion || 'Anything else I should know?';
    
    // ChatGPT-5 Level Intelligence - Use AI for perfect follow-up questions
    const aiFollowUp = await aiService.generateFollowUpQuestions(
      category,
      data.extractedInfo || {},
      data.initialMessage || ''
    );
    
    if (aiFollowUp.success && aiFollowUp.questions.length > 0) {
      followUpQuestion = aiFollowUp.questions[0];
      console.log('🤖 ChatGPT-5 Follow-up Question:', followUpQuestion);
    }
    
    // Simple conversational follow-up
    return `Got it! ${followUpQuestion}`;
  }
  
  // Save request and complete
  await saveRequest(from, data, collectedDetails);
  
  // ChatGPT-style completion message - NO feedback prompt
  const requestId = `REQ-${Date.now()}`;
  return `🌲 Perfect! I've submitted your ${category} request. ✅\n\n🆔 Request ID: ${requestId}\n\nOur professional team will review this and get back to you within 24-48 hours. You can always check the status by asking me "check status" anytime.\n\n🌲 Best regards,\nTree Logistics Team\n📧 support@treelogistics.com`;
}

// Handle sick leave special flow
async function handleSickLeaveFlow(message, from, data) {
  const { collectedDetails = [], sickLeaveStep = 'dates' } = data;
  
  if (sickLeaveStep === 'dates') {
    // First step: Collect dates
    collectedDetails.push(message);
    conversationFlow.updateFlow(from, {
      ...data,
      collectedDetails,
      sickLeaveStep: 'photo'
    });
    
    return `Perfect! I've noted the dates: ${message} 📅\n\nNow, I'll need you to upload a photo of your sick leave certificate. You can send the photo directly in this chat, or if you have it, just let me know and I'll mark it as received.\n\n📸 Please make sure the photo is clear and all text is readable!`;
    
  } else if (sickLeaveStep === 'photo') {
    // Second step: Handle photo upload
    collectedDetails.push(`Photo: ${message}`);
    
    // Save request with dates and photo info
    await saveRequest(from, data, collectedDetails);
    
    // Sick leave completion - NO feedback prompt
    const requestId = `REQ-${Date.now()}`;
    return `🌲 Excellent! I've submitted your sick leave request. ✅\n\n📅 Dates: ${collectedDetails[0]}\n📸 Photo: Received\n🆔 Request ID: ${requestId}\n\nI hope you feel better soon! Our HR team will review your request and get back to you within 24-48 hours.\n\n🌲 Best regards,\nTree Logistics Team\n📧 hr@treelogistics.com`;
  }
  
  return 'Processing your sick leave request...';
}

// Set satisfaction flow state (called after request completion)
function setSatisfactionFlow(from, profileName) {
  conversationFlow.startFlow(from, {
    step: 'satisfaction_rating',
    profileName: profileName,
    flow: 'feedback_collection'
  });
}

// Handle satisfaction rating
async function handleSatisfactionRating(rating, from, data) {
  const satisfactionLevels = {
    '1': { emoji: '😊', text: 'Very Satisfied' },
    '2': { emoji: '😐', text: 'Satisfied' },
    '3': { emoji: '😞', text: 'Not Satisfied' }
  };
  
  const satisfaction = satisfactionLevels[rating];
  
  if (satisfaction) {
    // Log satisfaction feedback
    console.log(`📊 Satisfaction rating from ${from}: ${rating} (${satisfaction.text})`);
    
    // Update the most recent request with feedback instead of creating new row
    try {
      const recentRequests = await googleSheets.getRequestsByPhoneNumber(from);
      if (recentRequests && recentRequests.length > 0) {
        // Find the most recent non-feedback request
        const latestRequest = recentRequests
          .filter(req => req.category !== 'Feedback')
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
        
        if (latestRequest) {
          // Update the existing request with feedback
          await googleSheets.updateRequestFeedback(latestRequest.rowNumber, rating, satisfaction.text);
          console.log(`✅ Updated request ${latestRequest.rowNumber} with feedback: ${satisfaction.text}`);
        }
      }
    } catch (error) {
      console.error('Error updating request with feedback:', error);
    }
    
    // Clear any active flow
    conversationFlow.clearFlow(from);
    
    // Send thank you message and close chat (don't show categories again)
    return `${satisfaction.emoji} Thank you for your feedback!\n\nRating: ${satisfaction.text}\n\nYour feedback helps us improve our service.\n\nBest Regards,\nTree Logistics Team\n\n✅ Chat closed. Have a great day!`;
  }
  
  return '❌ Invalid satisfaction rating. Please reply with 1, 2, or 3.';
}

// Handle status check requests
async function handleStatusCheck(from, profileName) {
  try {
    // Get recent requests for this phone number
    const requests = await googleSheets.getRequestsByPhoneNumber(from);
    
    if (!requests || requests.length === 0) {
      return `📋 No requests found for ${profileName || 'you'}.\n\nYou can submit a new request by selecting a category from the menu below.\n\n${await showCategoryMenu(from, profileName)}`;
    }
    
    // Show recent requests (last 5)
    const recentRequests = requests.slice(-5).reverse();
    let statusMessage = `📋 Your Recent Requests (${profileName || 'Driver'}):\n\n`;
    
    recentRequests.forEach((request, index) => {
      const statusEmoji = getStatusEmoji(request.status);
      const date = new Date(request.timestamp).toLocaleDateString('en-GB');
      
      statusMessage += `${index + 1}. ${statusEmoji} ${request.category}\n`;
      statusMessage += `   📅 ${date}\n`;
      statusMessage += `   🆔 ${request.rowId}\n`;
      statusMessage += `   📊 Status: ${request.status}\n`;
      
      if (request.station) {
        statusMessage += `   🏢 Station: ${request.station}\n`;
      }
      
      if (request.resolvedAt) {
        statusMessage += `   ✅ Resolved: ${request.resolvedAt}\n`;
      }
      
      statusMessage += '\n';
    });
    
    // Check for pending requests
    const pendingRequests = recentRequests.filter(req => 
      req.status === 'review' || req.status === 'urgent' || req.status === 'pending'
    );
    
    if (pendingRequests.length > 0) {
      statusMessage += `\n⏳ You have ${pendingRequests.length} pending request(s). We'll get back to you as soon as possible!`;
    }
    
    statusMessage += `\n---\n\nNeed help with something else?\n\n${await showCategoryMenu(from, profileName)}`;
    
    return statusMessage;
    
  } catch (error) {
    console.error('Error checking status:', error);
    return `❌ Sorry, there was an error checking your request status.\n\nPlease try again or contact support.\n\n${await showCategoryMenu(from, profileName)}`;
  }
}

// Get status emoji
function getStatusEmoji(status) {
  const statusEmojis = {
    'review': '🔄',
    'urgent': '🚨',
    'done': '✅',
    'notified': '📧',
    'feedback': '📊',
    'pending': '⏳'
  };
  return statusEmojis[status?.toLowerCase()] || '📋';
}

// Start onboarding flow
async function startOnboardingFlow(from, profileName) {
  conversationFlow.startFlow(from, {
    step: 'onboarding',
    profileName: profileName,
    flow: 'user_onboarding',
    onboardingStep: 'first_name'
  });
  
  return `🚛 Tree Logistics Support\n\nHello${profileName ? ` ${profileName}` : ''}! Welcome to our support system.\n\nTo help you better, I need a few details.\n\nWhat is your first name?`;
}

// Handle onboarding flow
async function handleOnboardingFlow(message, from, data) {
  const { onboardingStep = 'first_name', firstName = '', lastName = '', station = '' } = data;
  
  if (onboardingStep === 'first_name') {
    // Collect first name
    conversationFlow.updateFlow(from, {
      ...data,
      firstName: message.trim(),
      onboardingStep: 'last_name'
    });
    
    return `Thank you, ${message.trim()}! 👋\n\nWhat is your last name?`;
    
  } else if (onboardingStep === 'last_name') {
    // Collect last name
    conversationFlow.updateFlow(from, {
      ...data,
      lastName: message.trim(),
      onboardingStep: 'station'
    });
    
    return `Thank you, ${data.firstName} ${message.trim()}! 👋\n\nWhich station do you work at?\n\n1. DBE3\n2. DBE2\n\nPlease reply with 1 or 2.`;
    
  } else if (onboardingStep === 'station') {
    // Collect station
    let stationName = '';
    if (message === '1') {
      stationName = 'DBE3';
    } else if (message === '2') {
      stationName = 'DBE2';
    } else {
      return '❌ Invalid selection. Please choose 1 for DBE3 or 2 for DBE2.';
    }
    
    // Save user information to AI memory
    const fullName = `${data.firstName} ${data.lastName}`;
    aiMemory.storeUserInfo(from, {
      firstName: data.firstName,
      lastName: data.lastName,
      station: stationName
    });
    
    // Clear onboarding flow
    conversationFlow.clearFlow(from);
    
    // Show category menu with personalized greeting
    return `🌲 Perfect! Welcome ${fullName} from ${stationName}! 🎉\n\nYou're now connected to Tree Logistics Support.\n\n${await showCategoryMenu(from, fullName)}`;
  }
  
  return 'Processing your information...';
}

// Save request to Google Sheets
async function saveRequest(from, data, details) {
  // Format message properly for Google Sheets
  let formattedMessage = '';
  
  if (details && details.length > 0) {
    // Clean up the message format
    formattedMessage = details
      .map(detail => detail.trim())
      .filter(detail => detail.length > 0)
      .join(' | '); // Use pipe separator for cleaner display
  }
  
  // Extract user information from aiMemory or flow data or use defaults
  const userInfo = aiMemory.getUserInfo(from);
  const firstName = userInfo?.firstName || data.firstName || data.profileName || 'Unknown';
  const lastName = userInfo?.lastName || data.lastName || '';
  const station = userInfo?.station || data.station || '';
  
  try {
    await googleSheets.addRequest({
      timestamp: new Date().toLocaleString('en-GB', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
      }),
      firstName: firstName,
      lastName: lastName,
      phoneNumber: from,
      category: data.category,
      priority: data.category === 'Accident/Damage' ? 'Critical' : 'Medium',
      message: formattedMessage,
      status: data.category === 'Accident/Damage' ? 'urgent' : 'review',
      station: station,
      assignedTo: '',
      resolvedAt: '',
      feedback: '',
      rowId: `REQ-${Date.now()}`,
      // Clean organized structure - no scattered questions
    });
  } catch (error) {
    console.error('Google Sheets Error:', error);
  }
}

// Show category menu
async function showCategoryMenu(from, profileName) {
  // Get personalized greeting from AI memory
  const userInfo = aiMemory.getUserInfo(from);
  const contextualSuggestions = aiMemory.getContextualSuggestions(from);
  
  let greeting = `🚛 Tree Logistics Support\n\nHello${profileName ? ` ${profileName}` : ''}! Please select your request category:`;
  
  // Add contextual suggestions if available
  if (contextualSuggestions) {
    greeting += `\n\n💡 ${contextualSuggestions.message}`;
  }
  
  const menu = `${greeting}

📋 Categories:
1. 💰 Salary
2. 👥 HR
3. 🚨 Accident/Damage
4. 🔧 Equipment
5. 📝 Report
6. 🏖️ Vacation/Sick Leave
7. 📊 Request Status

Reply with the number (1-7) of your category.`;

  conversationFlow.startFlow(from, {
    profileName,
    step: 'category_selection',
    initialMessage: 'Category selection'
  });
  
  return menu;
}

// WhatsApp webhook endpoint
app.post('/webhook/whatsapp', async (req, res) => {
  try {
    const { Body: body, From: from, ProfileName: profileName } = req.body;
    
    if (!body || !from) {
      return res.status(400).send('Missing required parameters');
    }
    
    const responseMessage = await handleMessage(body, from, profileName);
    
    // Store conversation in AI memory
    aiMemory.storeConversation(from, body, responseMessage);
    
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
    timestamp: new Date().toISOString(),
    aiConfigured: aiService.isConfigured()
  });
});

// Cleanup duplicate feedback rows
app.post('/cleanup-feedback', async (req, res) => {
  try {
    const result = await googleSheets.cleanupDuplicateFeedback();
    res.json({ 
      success: true, 
      message: `Cleaned up ${result.cleanedRows} rows`,
      result 
    });
  } catch (error) {
    console.error('Cleanup error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Force update Google Sheets headers
app.post('/update-headers', async (req, res) => {
  try {
    await googleSheets.ensureSheetExists();
    res.json({ 
      success: true, 
      message: 'Google Sheets headers updated with proper structure'
    });
  } catch (error) {
    console.error('Header update error:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Simple test endpoint
app.post('/test', (req, res) => {
  console.log('🧪 TEST ENDPOINT HIT:', req.body);
  const twiml = new MessagingResponse();
  twiml.message('TEST MESSAGE - If you see this, delivery works!');
  res.writeHead(200, { 'Content-Type': 'text/xml' });
  res.end(twiml.toString());
});

// Ultra simple endpoint
app.post('/simple', (req, res) => {
  console.log('📱 SIMPLE ENDPOINT HIT:', req.body);
  res.writeHead(200, { 'Content-Type': 'text/xml' });
  res.end('<?xml version="1.0" encoding="UTF-8"?><Response><Message>Simple test message</Message></Response>');
});

// Diagnostic endpoint - logs everything
app.post('/diagnostic', (req, res) => {
  console.log('🔍 DIAGNOSTIC REQUEST RECEIVED:');
  console.log('Headers:', req.headers);
  console.log('Body:', req.body);
  console.log('Timestamp:', new Date().toISOString());
  
  const twiml = new MessagingResponse();
  twiml.message('🔍 DIAGNOSTIC: Server received your message successfully! Check server logs for details.');
  
  res.writeHead(200, { 
    'Content-Type': 'text/xml',
    'Cache-Control': 'no-cache',
    'X-Twilio-Signature': 'diagnostic'
  });
  res.end(twiml.toString());
});

// Clear flows endpoint (for debugging)
app.post('/clear-flows', (req, res) => {
  conversationFlow.clearAllFlows();
  res.json({ success: true, message: 'All conversation flows cleared' });
});

// Debug endpoint to check request data
app.get('/debug-request/:rowNumber', async (req, res) => {
  try {
    const rowNumber = req.params.rowNumber;
    const allRequests = await googleSheets.getAllRequests();
    const request = allRequests.find(r => r.rowNumber == rowNumber);
    
    res.json({
      success: true,
      rowNumber: rowNumber,
      request: request,
      allRequestsCount: allRequests.length
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Mark request as done endpoint
app.post('/mark-done/:rowNumber', async (req, res) => {
  try {
    const rowNumber = req.params.rowNumber;
    const { message } = req.body;
    
    console.log(`🔧 MARK DONE: Processing row ${rowNumber}`);
    
    // Get request details BEFORE updating status
    const allRequests = await googleSheets.getAllRequests();
    const request = allRequests.find(r => r.rowNumber == rowNumber);
    
    console.log(`🔧 MARK DONE: Found request:`, request);
    
    if (!request) {
      console.log(`❌ MARK DONE: Request ${rowNumber} not found`);
      return res.status(404).json({ 
        success: false, 
        message: `Request with row number ${rowNumber} not found` 
      });
    }
    
    // Update status to done
    console.log(`🔧 MARK DONE: Updating status to done for row ${rowNumber}`);
    await googleSheets.updateStatus(rowNumber, 'done');
    
    if (request) {
      console.log(`🔧 MARK DONE: Sending notification to ${request.phoneNumber}`);
      // Import whatsapp service
      const whatsappService = require('./services/whatsapp');
      
      // Send completion notification to driver
      await whatsappService.sendCompletionNotification(
        request.phoneNumber,
        request.firstName,
        'en' // Default language
      );
      
      console.log(`✅ Request ${rowNumber} marked as done and notification sent to ${request.phoneNumber}`);
    }
    
    res.json({ 
      success: true, 
      message: `Request ${rowNumber} marked as done and notification sent` 
    });
    
  } catch (error) {
    console.error('Error marking request as done:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Trigger status monitor manually
app.post('/check-status', async (req, res) => {
  try {
    const statusMonitor = require('./services/statusMonitor');
    const result = await statusMonitor.checkAndNotify();
    
    res.json({
      success: true,
      message: `Processed ${result.processed} completed requests` 
    });
    
  } catch (error) {
    console.error('Error checking status:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Simulate satisfaction rating flow
app.post('/simulate-satisfaction/:phoneNumber/:rating', async (req, res) => {
  try {
    const phoneNumber = req.params.phoneNumber;
    const rating = req.params.rating;
    
    // Set satisfaction flow state
    conversationFlow.startFlow(`whatsapp:${phoneNumber}`, {
      step: 'satisfaction_rating',
      profileName: 'Test',
      flow: 'feedback_collection'
    });
    
    // Handle the satisfaction rating
    const response = await handleSatisfactionRating(rating, `whatsapp:${phoneNumber}`, { profileName: 'Test' });
    
    res.json({
      success: true,
      message: `Satisfaction rating ${rating} processed`,
      response: response
    });
    
  } catch (error) {
    console.error('Error simulating satisfaction:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Start status monitoring (check every 2 minutes)
const statusMonitor = require('./services/statusMonitor');
setInterval(async () => {
  try {
    await statusMonitor.checkAndNotify();
  } catch (error) {
    console.error('Status monitor error:', error);
  }
}, 2 * 60 * 1000); // Every 2 minutes

console.log('⏰ Status monitor started - checking for completed requests every 2 minutes');

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Tree Logistics WhatsApp Bot running on port ${PORT}`);
  console.log(`🤖 AI Service: ${aiService.isConfigured() ? 'Configured' : 'Not configured'}`);
  console.log(`📱 Webhook: http://localhost:${PORT}/webhook/whatsapp`);
  console.log(`🏥 Health: http://localhost:${PORT}/health`);
  console.log(`✅ Mark as done: POST http://localhost:${PORT}/mark-done/:rowNumber`);
  console.log(`🔍 Check status: POST http://localhost:${PORT}/check-status`);
});