const db = require('../database/db');

class EquipmentHandler {
  async handleRequest(message, driver, intent) {
    try {
      const { entities } = intent;
      
      // Check available equipment
      const availableItems = await db.all(
        `SELECT item_type, model_name, COUNT(*) as quantity 
         FROM equipment_inventory 
         WHERE status = 'available' 
         GROUP BY item_type, model_name`
      );

      // Get driver's current equipment
      const driverEquipment = await db.getDriverEquipment(driver.id);

      // Build intelligent response
      let response = `Hello ${driver.first_name}! 📦\n\n`;

      if (entities.item_type) {
        // Specific item request
        const itemType = entities.item_type.toLowerCase();
        const available = availableItems.filter(item => 
          item.item_type.toLowerCase().includes(itemType)
        );

        if (available.length > 0) {
          response += `Equipment Request: ${this.formatItemType(itemType)}\n\n`;
          response += `Available Options:\n`;
          available.forEach((item, index) => {
            response += `${index + 1}. ${item.model_name} - In Stock (${item.quantity} units)\n`;
          });
          response += `\nWhich model do you need? Reply with the number (1, 2, etc.)\n\n`;
        } else {
          response += `Sorry, we don't have any ${this.formatItemType(itemType)} in stock right now.\n\n`;
          response += `📋 Request submitted: REQ-EQ-${Date.now()}\n`;
          response += `Status: Pending procurement\n`;
          response += `Expected: 3-5 business days\n\n`;
          response += `We'll notify you when available.\n\n`;
        }

        // Show current equipment
        if (driverEquipment.length > 0) {
          response += `Your Current Equipment:\n`;
          driverEquipment.forEach(eq => {
            response += `• ${eq.model_name || eq.item_type} (SN: ${eq.serial_number || 'N/A'})\n`;
          });
          response += `\n`;
        }
      } else {
        // General equipment inquiry
        response += `Equipment Available:\n\n`;
        
        const grouped = {};
        availableItems.forEach(item => {
          if (!grouped[item.item_type]) {
            grouped[item.item_type] = [];
          }
          grouped[item.item_type].push(item);
        });

        Object.keys(grouped).forEach(type => {
          response += `📱 ${this.formatItemType(type)}:\n`;
          grouped[type].forEach(item => {
            response += `   • ${item.model_name} (${item.quantity} available)\n`;
          });
          response += `\n`;
        });

        response += `What equipment do you need?\n`;
        response += `Just tell me: "I need a scanner" or "I need a uniform size L"\n\n`;
      }

      // Save request to database
      if (entities.item_type) {
        await db.createEquipmentRequest({
          driver_id: driver.id,
          item_type: entities.item_type,
          model_preference: entities.model || null,
          quantity: entities.quantity || 1,
          reason: message
        });
      }

      response += `Best Regards,\nTree Logistics Team`;
      return response;

    } catch (error) {
      console.error('Error in equipment handler:', error);
      return this.getErrorResponse(driver.first_name);
    }
  }

  formatItemType(type) {
    const map = {
      'scanner': 'Scanner',
      'sim_card': 'SIM Card',
      'uniform': 'Uniform',
      'cable': 'Charging Cable',
      'battery': 'Battery Pack'
    };
    return map[type] || type.charAt(0).toUpperCase() + type.slice(1);
  }

  getErrorResponse(firstName) {
    return `Hello ${firstName}!\n\nI'm having trouble processing your equipment request. Please contact the office directly:\n\n📞 +49 123 456 789\n📧 equipment@treelogistics.com\n\nBest Regards,\nTree Logistics Team`;
  }
}

module.exports = new EquipmentHandler();

