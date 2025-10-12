const db = require('../database/db');

class VehicleHandler {
  async handleRequest(message, driver, intent) {
    try {
      const messageLower = message.toLowerCase();
      
      // Get driver's assigned vehicle
      const vehicle = await db.getDriverVehicle(driver.id);

      if (!vehicle) {
        return `Hello ${driver.first_name}!\n\nYou don't have a vehicle assigned yet. Please contact dispatch:\n\n📞 +49 123 456 789\n\nBest Regards,\nTree Logistics Team`;
      }

      let response = `Hello ${driver.first_name}! 🚗\n\n`;

      // Determine query type
      if (this.isDamageReport(messageLower)) {
        response = await this.handleDamageReport(driver, vehicle, message);
      } else if (this.isMaintenanceQuery(messageLower)) {
        response = await this.handleMaintenanceQuery(driver, vehicle);
      } else if (this.isFuelQuery(messageLower)) {
        response = await this.handleFuelQuery(driver, vehicle);
      } else {
        response = await this.handleGeneralVehicle(driver, vehicle);
      }

      return response;

    } catch (error) {
      console.error('Error in vehicle handler:', error);
      return this.getErrorResponse(driver.first_name);
    }
  }

  isDamageReport(message) {
    const damageKeywords = ['damage', 'damaged', 'broken', 'accident', 'hit', 'scratch', 'dent', 'mirror', 'tire', 'flat'];
    return damageKeywords.some(keyword => message.includes(keyword));
  }

  isMaintenanceQuery(message) {
    const maintenanceKeywords = ['maintenance', 'service', 'check', 'oil', 'repair', 'noise', 'problem'];
    return maintenanceKeywords.some(keyword => message.includes(keyword));
  }

  isFuelQuery(message) {
    const fuelKeywords = ['fuel', 'gas', 'tank', 'fuel card', 'refuel'];
    return fuelKeywords.some(keyword => message.includes(keyword));
  }

  async handleDamageReport(driver, vehicle, message) {
    // Create incident record
    const severity = this.detectSeverity(message);
    
    const incident = await db.createVehicleIncident({
      vehicle_id: vehicle.id,
      driver_id: driver.id,
      incident_type: 'damage',
      description: message,
      severity: severity,
      photo_url: null,
      location: null
    });

    const incidentId = `DMG-${Date.now()}`;

    let response = `🚨 Vehicle Damage Report\n\n`;
    response += `Vehicle: ${vehicle.vehicle_type} #${vehicle.vehicle_number}\n`;
    response += `Driver: ${driver.first_name} ${driver.last_name}\n`;
    response += `Reported: ${this.formatDateTime(new Date())}\n`;
    response += `Severity: ${severity.toUpperCase()}\n\n`;
    
    response += `Incident ID: ${incidentId}\n\n`;
    
    if (severity === 'critical' || severity === 'major') {
      response += `🚨 HIGH PRIORITY\n\n`;
      response += `📸 Please send photos of the damage immediately\n\n`;
      response += `⚠️ DO NOT continue driving if unsafe!\n`;
      response += `Emergency Contact: +49 123 456 789\n\n`;
    } else {
      response += `📸 Please send photos of the damage\n\n`;
      response += `Next Steps:\n`;
      response += `1. Take photos from multiple angles\n`;
      response += `2. Note exact location if accident occurred\n`;
      response += `3. Complete incident form (link sent via email)\n\n`;
    }
    
    response += `✅ Fleet manager notified\n`;
    response += `✅ Incident logged\n\n`;
    
    if (severity === 'minor') {
      response += `Is the vehicle still safe to drive?\n`;
      response += `Reply: "Yes" or "No"\n\n`;
    }
    
    response += `Best Regards,\nTree Logistics Team`;
    
    return response;
  }

  async handleMaintenanceQuery(driver, vehicle) {
    let response = `Hello ${driver.first_name}! 🔧\n\n`;
    response += `Vehicle: ${vehicle.vehicle_type} #${vehicle.vehicle_number}\n`;
    response += `License Plate: ${vehicle.license_plate}\n\n`;
    
    response += `Maintenance Status:\n`;
    response += `├─ Last Service: ${this.formatDate(vehicle.last_service_date)}\n`;
    response += `├─ Next Service: ${this.formatDate(vehicle.next_service_date)}\n`;
    response += `├─ Current Mileage: ${vehicle.mileage.toLocaleString()} km\n`;
    
    const nextServiceKm = vehicle.mileage + 5000;
    response += `└─ Next Service At: ${nextServiceKm.toLocaleString()} km\n\n`;
    
    const daysUntilService = this.calculateDaysUntil(vehicle.next_service_date);
    if (daysUntilService < 7) {
      response += `⚠️ Service due soon (${daysUntilService} days)\n\n`;
    }
    
    response += `Current Status: ${vehicle.status.toUpperCase()}\n\n`;
    
    response += `Experiencing issues?\n`;
    response += `Describe the problem and I'll help:\n`;
    response += `• Strange noises\n`;
    response += `• Warning lights\n`;
    response += `• Performance issues\n\n`;
    
    response += `Emergency Repairs: +49 987 654 321\n\n`;
    response += `Best Regards,\nTree Logistics Team`;
    
    return response;
  }

  async handleFuelQuery(driver, vehicle) {
    let response = `Hello ${driver.first_name}! ⛽\n\n`;
    response += `Fuel Card Information:\n\n`;
    response += `├─ Card Number: ***${vehicle.fuel_card_number?.slice(-4) || '****'}\n`;
    response += `├─ Status: ACTIVE ✅\n`;
    response += `├─ Daily Limit: 150 EUR\n`;
    response += `└─ Monthly Limit: 2,000 EUR\n\n`;
    
    response += `Approved Stations:\n`;
    response += `• Shell\n`;
    response += `• BP\n`;
    response += `• Aral\n`;
    response += `• Total\n\n`;
    
    response += `Fuel Card Issues?\n`;
    response += `1. Check card expiry date\n`;
    response += `2. Try chip reading (not contactless)\n`;
    response += `3. Ensure you're at approved station\n\n`;
    
    response += `Card not working?\n`;
    response += `Emergency Contact: +49 123 456 789\n\n`;
    response += `Best Regards,\nTree Logistics Team`;
    
    return response;
  }

  async handleGeneralVehicle(driver, vehicle) {
    let response = `Hello ${driver.first_name}! 🚗\n\n`;
    response += `Your Assigned Vehicle:\n\n`;
    response += `Vehicle: ${vehicle.vehicle_type} #${vehicle.vehicle_number}\n`;
    response += `License: ${vehicle.license_plate}\n`;
    response += `Status: ${vehicle.status.toUpperCase()} ✅\n`;
    response += `Mileage: ${vehicle.mileage.toLocaleString()} km\n\n`;
    
    response += `I can help you with:\n\n`;
    response += `🔧 Maintenance\n   "When is next service?"\n\n`;
    response += `⛽ Fuel Card\n   "Fuel card not working"\n\n`;
    response += `🚨 Damage/Accident\n   "I damaged the mirror"\n\n`;
    response += `📸 Report Issue\n   "Vehicle makes strange noise"\n\n`;
    
    response += `What do you need help with?\n\n`;
    response += `Best Regards,\nTree Logistics Team`;
    
    return response;
  }

  detectSeverity(message) {
    const messageLower = message.toLowerCase();
    
    if (messageLower.includes('accident') || messageLower.includes('crash') || 
        messageLower.includes('emergency') || messageLower.includes('critical')) {
      return 'critical';
    }
    
    if (messageLower.includes('major') || messageLower.includes('cannot drive') || 
        messageLower.includes('broken down') || messageLower.includes('tow')) {
      return 'major';
    }
    
    if (messageLower.includes('dent') || messageLower.includes('scratch') || 
        messageLower.includes('warning light')) {
      return 'moderate';
    }
    
    return 'minor';
  }

  formatDateTime(date) {
    return date.toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }

  formatDate(dateStr) {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  calculateDaysUntil(dateStr) {
    if (!dateStr) return 999;
    const targetDate = new Date(dateStr);
    const today = new Date();
    const diff = targetDate - today;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  getErrorResponse(firstName) {
    return `Hello ${firstName}!\n\nI'm having trouble accessing vehicle information. Please contact fleet management:\n\n📞 +49 123 456 789\n📧 fleet@treelogistics.com\n\nBest Regards,\nTree Logistics Team`;
  }
}

module.exports = new VehicleHandler();

