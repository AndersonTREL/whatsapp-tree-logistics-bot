const twilio = require('twilio');

class MessagingService {
  constructor() {
    this.client = null;
    this.whatsappNumber = process.env.TWILIO_WHATSAPP_NUMBER || null;
    this.initializeClient();
  }

  initializeClient() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;

    if (!accountSid || !authToken) {
      console.error('❌ Twilio credentials not found. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN');
      return;
    }

    if (!this.whatsappNumber) {
      console.error('❌ TWILIO_WHATSAPP_NUMBER not set');
      return;
    }

    this.client = twilio(accountSid, authToken);
    console.log('✅ Twilio messaging client initialized');
  }

  /**
   * Send a WhatsApp message to a single phone number
   * @param {string} to - Phone number in E.164 format (e.g., +4917616626841)
   * @param {string} message - Message text to send
   * @returns {Promise<Object>} - Twilio message object
   */
  async sendMessage(to, message) {
    if (!this.client) {
      throw new Error('Twilio client not initialized. Check your credentials.');
    }

    if (!this.whatsappNumber) {
      throw new Error('TWILIO_WHATSAPP_NUMBER not configured');
    }

    try {
      // Ensure phone number is in correct format
      const formattedTo = this.formatPhoneNumber(to);
      
      const result = await this.client.messages.create({
        from: this.whatsappNumber,
        to: `whatsapp:${formattedTo}`,
        body: message
      });

      console.log(`✅ Message sent to ${formattedTo}: ${result.sid}`);
      return {
        success: true,
        messageSid: result.sid,
        to: formattedTo,
        status: result.status
      };
    } catch (error) {
      console.error(`❌ Failed to send message to ${to}:`, error.message);
      throw error;
    }
  }

  /**
   * Send messages to multiple phone numbers
   * @param {Array<string>} phoneNumbers - Array of phone numbers
   * @param {string} message - Message text to send
   * @param {Object} options - Options for sending (delay between messages, etc.)
   * @returns {Promise<Object>} - Results with success/failure counts
   */
  async sendBulkMessages(phoneNumbers, message, options = {}) {
    const {
      delayBetweenMessages = 1000, // 1 second delay to avoid rate limits
      continueOnError = true
    } = options;

    const results = {
      total: phoneNumbers.length,
      successful: 0,
      failed: 0,
      errors: []
    };

    console.log(`📤 Starting bulk message send to ${phoneNumbers.length} recipients...`);

    for (let i = 0; i < phoneNumbers.length; i++) {
      const phoneNumber = phoneNumbers[i];
      
      try {
        await this.sendMessage(phoneNumber, message);
        results.successful++;
        
        // Log progress every 10 messages
        if ((i + 1) % 10 === 0) {
          console.log(`⏳ Progress: ${i + 1}/${phoneNumbers.length} messages sent`);
        }
      } catch (error) {
        results.failed++;
        results.errors.push({
          phoneNumber,
          error: error.message
        });
        
        if (!continueOnError) {
          throw error;
        }
      }

      // Delay between messages to avoid rate limiting
      if (i < phoneNumbers.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delayBetweenMessages));
      }
    }

    console.log(`✅ Bulk send complete: ${results.successful} successful, ${results.failed} failed`);
    return results;
  }

  /**
   * Format phone number to E.164 format
   * @param {string} phoneNumber - Phone number in various formats
   * @returns {string} - Formatted phone number
   */
  formatPhoneNumber(phoneNumber) {
    if (!phoneNumber) {
      throw new Error('Phone number is required');
    }

    // Remove all non-digit characters except +
    let cleaned = phoneNumber.replace(/[^\d+]/g, '');

    // Remove whatsapp: prefix if present
    cleaned = cleaned.replace(/^whatsapp:/i, '');

    // If doesn't start with +, assume it needs country code
    // You may need to adjust this based on your default country code
    if (!cleaned.startsWith('+')) {
      // If starts with 0, remove it (common in some countries)
      if (cleaned.startsWith('0')) {
        cleaned = cleaned.substring(1);
      }
      // Add default country code (Germany: +49)
      // Adjust this based on your needs
      cleaned = '+49' + cleaned;
    }

    return cleaned;
  }

  /**
   * Validate if Twilio is properly configured
   * @returns {boolean}
   */
  isConfigured() {
    return !!(this.client && this.whatsappNumber);
  }
}

module.exports = new MessagingService();


