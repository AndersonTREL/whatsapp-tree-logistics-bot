const twilio = require('twilio');

class MultiSenderWhatsAppService {
  constructor() {
    this.client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    
    // Multiple sender configuration
    this.senders = {
      primary: process.env.TWILIO_WHATSAPP_NUMBER || 'whatsapp:+15558791704',
      secondary: process.env.TWILIO_WHATSAPP_NUMBER_2 || 'whatsapp:+15558791705', // Add your second number
      support: process.env.TWILIO_WHATSAPP_SUPPORT || 'whatsapp:+15558791704',
      hr: process.env.TWILIO_WHATSAPP_HR || 'whatsapp:+15558791704'
    };
    
    // Default sender
    this.defaultSender = this.senders.primary;
  }

  // Get appropriate sender based on category
  getSenderForCategory(category) {
    switch (category?.toLowerCase()) {
      case 'hr':
      case 'vacation/sick leave':
        return this.senders.hr;
      case 'support':
      case 'general':
        return this.senders.support;
      default:
        return this.defaultSender;
    }
  }

  // Clean and format phone number
  cleanPhoneNumber(toNumber) {
    let cleanNumber = toNumber.trim();
    if (cleanNumber.startsWith('whatsapp:')) {
      cleanNumber = cleanNumber.replace('whatsapp: ', 'whatsapp:+');
      if (!cleanNumber.includes('+')) {
        cleanNumber = cleanNumber.replace('whatsapp:', 'whatsapp:+');
      }
    } else {
      cleanNumber = `whatsapp:+${cleanNumber}`;
    }
    return cleanNumber;
  }

  async sendMessage(toNumber, message, category = null) {
    try {
      const cleanNumber = this.cleanPhoneNumber(toNumber);
      const fromNumber = category ? this.getSenderForCategory(category) : this.defaultSender;

      console.log(`📱 Sending message from ${fromNumber} to ${cleanNumber}`);

      const result = await this.client.messages.create({
        body: message,
        from: fromNumber,
        to: cleanNumber
      });

      console.log('WhatsApp message sent:', result.sid);
      return { success: true, messageSid: result.sid, fromNumber };
    } catch (error) {
      console.error('Error sending WhatsApp message:', error);
      throw error;
    }
  }

  async sendCompletionNotification(toNumber, firstName, category = null, language = 'en') {
    const now = new Date();
    const europeanDate = now.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
    
    const multiLanguage = require('./multiLanguage');
    const baseMessage = multiLanguage.getCompletionMessage(firstName, europeanDate, language);
    
    // Add feedback request
    const feedbackPrompt = language === 'sq' ? 
      '\n\nSa të kënaqur jeni?\n\n1. 😊 Shumë i kënaqur\n2. 😐 I kënaqur\n3. 😞 Jo i kënaqur\n\nPërgjigjuni me 1, 2, ose 3' :
      language === 'de' ?
      '\n\nWie zufrieden sind Sie?\n\n1. 😊 Sehr zufrieden\n2. 😐 Zufrieden\n3. 😞 Nicht zufrieden\n\nAntworten Sie mit 1, 2 oder 3' :
      '\n\nHow satisfied are you?\n\n1. 😊 Very Satisfied\n2. 😐 Satisfied\n3. 😞 Not Satisfied\n\nReply with 1, 2, or 3';
    
    const messageWithFeedback = baseMessage + feedbackPrompt;
    
    // Set a flow state to track satisfaction responses
    const conversationFlow = require('./conversationFlow');
    conversationFlow.startFlow(toNumber, {
      step: 'satisfaction_rating',
      profileName: firstName,
      flow: 'feedback_collection'
    });
    
    return this.sendMessage(toNumber, messageWithFeedback, category);
  }

  // List all configured senders
  listSenders() {
    return {
      senders: this.senders,
      default: this.defaultSender,
      total: Object.keys(this.senders).length
    };
  }

  // Update sender configuration
  updateSender(type, number) {
    if (this.senders[type]) {
      this.senders[type] = `whatsapp:+${number.replace(/^\+/, '')}`;
      console.log(`✅ Updated ${type} sender to ${this.senders[type]}`);
    } else {
      console.error(`❌ Unknown sender type: ${type}`);
    }
  }
}

module.exports = new MultiSenderWhatsAppService();
