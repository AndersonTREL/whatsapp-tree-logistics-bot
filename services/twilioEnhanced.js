const twilio = require('twilio');

class TwilioEnhancedService {
  constructor() {
    this.client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    this.fromNumber = process.env.TWILIO_WHATSAPP_NUMBER;
  }

  // Send message with interactive buttons
  async sendMessageWithButtons(toNumber, messageText, buttons) {
    try {
      const formattedNumber = toNumber.startsWith('whatsapp:') ? toNumber : `whatsapp:${toNumber}`;

      // Twilio interactive message with buttons (requires WhatsApp Business API)
      // For sandbox, we'll send text with emoji buttons
      let fullMessage = messageText + '\n\n';
      buttons.forEach((btn, index) => {
        fullMessage += `${index + 1}. ${btn.text}\n`;
      });
      fullMessage += '\nReply with the number (1, 2, 3, etc.)';

      const result = await this.client.messages.create({
        body: fullMessage,
        from: this.fromNumber,
        to: formattedNumber
      });

      console.log('Interactive message sent:', result.sid);
      return { success: true, messageSid: result.sid };
    } catch (error) {
      console.error('Error sending interactive message:', error);
      throw error;
    }
  }

  // Send message with list menu (for upgraded accounts)
  async sendListMessage(toNumber, headerText, bodyText, listItems) {
    try {
      const formattedNumber = toNumber.startsWith('whatsapp:') ? toNumber : `whatsapp:${toNumber}`;

      // For sandbox, format as text list
      let fullMessage = `${headerText}\n\n${bodyText}\n\n`;
      fullMessage += '📋 Select Category:\n\n';
      listItems.forEach((item, index) => {
        fullMessage += `${index + 1}. ${item.icon} ${item.title}\n`;
      });
      fullMessage += '\nReply with the number of your choice.';

      const result = await this.client.messages.create({
        body: fullMessage,
        from: this.fromNumber,
        to: formattedNumber
      });

      console.log('List message sent:', result.sid);
      return { success: true, messageSid: result.sid };
    } catch (error) {
      console.error('Error sending list message:', error);
      throw error;
    }
  }

  // Send message with media attachment
  async sendMessageWithMedia(toNumber, messageText, mediaUrl) {
    try {
      const formattedNumber = toNumber.startsWith('whatsapp:') ? toNumber : `whatsapp:${toNumber}`;

      const result = await this.client.messages.create({
        body: messageText,
        from: this.fromNumber,
        to: formattedNumber,
        mediaUrl: [mediaUrl]
      });

      console.log('Message with media sent:', result.sid);
      return { success: true, messageSid: result.sid };
    } catch (error) {
      console.error('Error sending message with media:', error);
      throw error;
    }
  }

  // Broadcast message to multiple numbers
  async broadcastMessage(phoneNumbers, messageText) {
    try {
      const results = [];
      
      for (const number of phoneNumbers) {
        const formattedNumber = number.startsWith('whatsapp:') ? number : `whatsapp:${number}`;
        
        const result = await this.client.messages.create({
          body: messageText,
          from: this.fromNumber,
          to: formattedNumber
        });
        
        results.push({ 
          to: number, 
          success: true, 
          messageSid: result.sid 
        });
        
        // Small delay to avoid rate limiting
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log(`Broadcast sent to ${results.length} drivers`);
      return { success: true, sent: results.length, results };
    } catch (error) {
      console.error('Error broadcasting message:', error);
      throw error;
    }
  }

  // Send reminder notification
  async sendShiftReminder(toNumber, firstName, shiftDetails) {
    const message = `Good Morning ${firstName}! ☀️

Shift Reminder for Today:

⏰ Start Time: ${shiftDetails.startTime}
📍 Station: ${shiftDetails.station}
🗺️ Zone: ${shiftDetails.zone}
🚚 Vehicle: ${shiftDetails.vehicle}
📦 Packages: ~${shiftDetails.packages}

Please arrive 15 minutes early for vehicle check.

Have a great shift! 🚀

Best Regards,
Tree Logistics Team`;

    return this.sendMessage(toNumber, message);
  }

  // Send status update
  async sendStatusUpdate(toNumber, firstName, requestId, status, assignedTo) {
    let message = `Hello ${firstName}! 📋\n\n`;
    message += `Update: Request #${requestId}\n\n`;
    
    switch (status) {
      case 'acknowledged':
        message += `✅ Status: Received\n`;
        message += `Your request is being reviewed.\n`;
        break;
      case 'in_progress':
        message += `🔄 Status: In Progress\n`;
        message += `Assigned to: ${assignedTo}\n`;
        message += `We're working on your request.\n`;
        break;
      case 'resolved':
        message += `✅ Status: Resolved\n`;
        message += `Your request has been completed.\n`;
        break;
    }
    
    message += `\nBest Regards,\nTree Logistics Team`;
    
    return this.sendMessage(toNumber, message);
  }

  // Send feedback request
  async sendFeedbackRequest(toNumber, firstName, requestId) {
    const message = `Hello ${firstName}! 💬

Your request #${requestId} has been completed.

How satisfied are you with our service?

1. 😊 Very Satisfied
2. 😐 Satisfied
3. 😞 Not Satisfied

Reply with 1, 2, or 3

Your feedback helps us improve!

Best Regards,
Tree Logistics Team`;

    return this.sendMessage(toNumber, message);
  }

  // Basic send message (fallback)
  async sendMessage(toNumber, message) {
    try {
      const formattedNumber = toNumber.startsWith('whatsapp:') ? toNumber : `whatsapp:${toNumber}`;

      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: formattedNumber
      });

      console.log('WhatsApp message sent:', result.sid);
      return { success: true, messageSid: result.sid };
    } catch (error) {
      console.error('Error sending WhatsApp message:', error);
      throw error;
    }
  }
}

module.exports = new TwilioEnhancedService();

