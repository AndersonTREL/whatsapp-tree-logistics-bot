const twilio = require('twilio');

class WhatsAppService {
  constructor() {
    this.client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    this.fromNumber = process.env.TWILIO_WHATSAPP_NUMBER;
  }

  async sendMessage(toNumber, message) {
    try {
      // Clean and format the phone number
      let cleanNumber = toNumber.trim();
      if (cleanNumber.startsWith('whatsapp:')) {
        // Remove any extra spaces after 'whatsapp:'
        cleanNumber = cleanNumber.replace('whatsapp: ', 'whatsapp:+');
        if (!cleanNumber.includes('+')) {
          cleanNumber = cleanNumber.replace('whatsapp:', 'whatsapp:+');
        }
      } else {
        cleanNumber = `whatsapp:+${cleanNumber}`;
      }

      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: cleanNumber
      });

      console.log('WhatsApp message sent:', result.sid);
      return { success: true, messageSid: result.sid };
    } catch (error) {
      console.error('Error sending WhatsApp message:', error);
      throw error;
    }
  }

  async sendCompletionNotification(toNumber, firstName, language = 'en') {
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
    
    return this.sendMessage(toNumber, messageWithFeedback);
  }
}

module.exports = new WhatsAppService();

