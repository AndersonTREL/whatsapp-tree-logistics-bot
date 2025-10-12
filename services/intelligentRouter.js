const db = require('../database/db');
const aiService = require('./aiService');
const equipmentHandler = require('../handlers/equipmentHandler');
const hrHandler = require('../handlers/hrHandler');
const vehicleHandler = require('../handlers/vehicleHandler');
const scheduleHandler = require('../handlers/scheduleHandler');
const performanceHandler = require('../handlers/performanceHandler');

class IntelligentRouter {
  async processMessage(message, phoneNumber, senderName) {
    try {
      // Get or create driver record
      let driver = await db.getDriverByPhone(phoneNumber);
      
      if (!driver) {
        // Extract name from message or use profile name
        const messageParser = require('../utils/messageParser');
        const parsedData = messageParser.parseMessage(message, senderName);
        
        // Create new driver record
        await db.createDriver({
          phone_number: phoneNumber,
          first_name: parsedData.firstName,
          last_name: parsedData.lastName,
          employee_id: `TL-${Date.now()}`
        });
        
        driver = await db.getDriverByPhone(phoneNumber);
      }

      // Analyze intent using AI
      const intent = await this.analyzeIntent(message, driver);
      
      console.log('Intent Analysis:', intent);

      // Route to appropriate handler
      let response;
      
      switch (intent.category.toUpperCase()) {
        case 'EQUIPMENT':
          response = await equipmentHandler.handleRequest(message, driver, intent);
          break;
          
        case 'SALARY':
        case 'HR':
        case 'VACATION':
          response = await hrHandler.handleRequest(message, driver, intent);
          break;
          
        case 'VEHICLE':
          response = await vehicleHandler.handleRequest(message, driver, intent);
          break;
          
        case 'SCHEDULE':
          response = await scheduleHandler.handleRequest(message, driver, intent);
          break;
          
        case 'PERFORMANCE':
          response = await performanceHandler.handleRequest(message, driver, intent);
          break;
          
        case 'GENERAL':
        default:
          response = await this.handleGeneralQuery(message, driver, intent);
          break;
      }

      // Save conversation context
      await aiService.addToConversationHistory(phoneNumber, 'user', message);
      await aiService.addToConversationHistory(phoneNumber, 'assistant', response);

      return {
        response,
        intent,
        driver
      };

    } catch (error) {
      console.error('Error in intelligent router:', error);
      return {
        response: this.getErrorResponse(),
        intent: { category: 'ERROR', urgency: 'low' },
        driver: null
      };
    }
  }

  async analyzeIntent(message, driver) {
    // Simple keyword-based intent detection (fallback if AI fails)
    const messageLower = message.toLowerCase();
    
    // Equipment keywords
    if (this.containsAny(messageLower, ['scanner', 'sim', 'uniform', 'cable', 'battery', 'equipment', 'charger'])) {
      return {
        category: 'EQUIPMENT',
        intent: 'equipment_request',
        entities: this.extractEquipmentEntities(message),
        urgency: 'medium',
        requires_data: ['equipment_inventory']
      };
    }
    
    // Salary/HR keywords
    if (this.containsAny(messageLower, ['salary', 'payment', 'paid', 'earn', 'wage', 'payslip', 'money', 'eur'])) {
      return {
        category: 'SALARY',
        intent: 'salary_inquiry',
        entities: this.extractSalaryEntities(message),
        urgency: 'medium',
        requires_data: ['salary_records']
      };
    }
    
    // Vacation keywords
    if (this.containsAny(messageLower, ['vacation', 'holiday', 'time off', 'leave', 'days off', 'absence'])) {
      return {
        category: 'VACATION',
        intent: 'vacation_inquiry',
        entities: {},
        urgency: 'medium',
        requires_data: ['vacation_balance']
      };
    }
    
    // Vehicle keywords
    if (this.containsAny(messageLower, ['vehicle', 'van', 'truck', 'car', 'damage', 'accident', 'fuel', 'maintenance'])) {
      return {
        category: 'VEHICLE',
        intent: 'vehicle_inquiry',
        entities: {},
        urgency: messageLower.includes('accident') || messageLower.includes('emergency') ? 'critical' : 'medium',
        requires_data: ['vehicle_info']
      };
    }
    
    // Schedule keywords
    if (this.containsAny(messageLower, ['schedule', 'shift', 'route', 'work', 'when', 'today', 'tomorrow', 'week'])) {
      return {
        category: 'SCHEDULE',
        intent: 'schedule_inquiry',
        entities: {},
        urgency: 'low',
        requires_data: ['shifts']
      };
    }
    
    // Performance keywords
    if (this.containsAny(messageLower, ['performance', 'metrics', 'stats', 'rating', 'how am i doing', 'score'])) {
      return {
        category: 'PERFORMANCE',
        intent: 'performance_inquiry',
        entities: {},
        urgency: 'low',
        requires_data: ['performance_metrics']
      };
    }
    
    return {
      category: 'GENERAL',
      intent: 'general_inquiry',
      entities: {},
      urgency: 'low',
      requires_data: []
    };
  }

  containsAny(text, keywords) {
    return keywords.some(keyword => text.includes(keyword));
  }

  extractEquipmentEntities(message) {
    const entities = {};
    const messageLower = message.toLowerCase();
    
    if (messageLower.includes('scanner')) entities.item_type = 'scanner';
    else if (messageLower.includes('sim')) entities.item_type = 'sim_card';
    else if (messageLower.includes('uniform')) entities.item_type = 'uniform';
    else if (messageLower.includes('cable')) entities.item_type = 'cable';
    else if (messageLower.includes('battery')) entities.item_type = 'battery';
    
    // Extract size if mentioned
    const sizeMatch = message.match(/size\s+([SML]|small|medium|large)/i);
    if (sizeMatch) {
      entities.size = sizeMatch[1];
    }
    
    return entities;
  }

  extractSalaryEntities(message) {
    const entities = {};
    
    // Try to extract month
    const months = ['january', 'february', 'march', 'april', 'may', 'june',
                   'july', 'august', 'september', 'october', 'november', 'december'];
    
    const messageLower = message.toLowerCase();
    months.forEach((month, index) => {
      if (messageLower.includes(month)) {
        const year = new Date().getFullYear();
        entities.month = `${year}-${String(index + 1).padStart(2, '0')}`;
      }
    });
    
    // Default to last month if not specified
    if (!entities.month) {
      const date = new Date();
      date.setMonth(date.getMonth() - 1);
      entities.month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }
    
    return entities;
  }

  async handleGeneralQuery(message, driver, intent) {
    let response = `Hello ${driver.first_name}! 👋\n\n`;
    response += `I can help you with:\n\n`;
    response += `📦 Equipment Requests\n   "I need a scanner"\n\n`;
    response += `💰 Salary & HR\n   "What's my September salary?"\n\n`;
    response += `🚗 Vehicle Support\n   "Vehicle damage report"\n\n`;
    response += `📅 Schedule & Shifts\n   "What's my schedule next week?"\n\n`;
    response += `📊 Performance Metrics\n   "How am I performing?"\n\n`;
    response += `🏖️ Vacation Balance\n   "How many vacation days do I have?"\n\n`;
    response += `What do you need help with?\n\n`;
    response += `Best Regards,\nTree Logistics Team`;
    
    return response;
  }

  getErrorResponse() {
    return `Hello!\n\nI'm experiencing technical difficulties. Please try again in a moment or contact support:\n\n📞 +49 123 456 789\n📧 support@treelogistics.com\n\nBest Regards,\nTree Logistics Team`;
  }
}

module.exports = new IntelligentRouter();

