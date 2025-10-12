const db = require('../database/db');

class ScheduleHandler {
  async handleRequest(message, driver, intent) {
    try {
      const messageLower = message.toLowerCase();
      
      let response;

      if (this.isTodayQuery(messageLower)) {
        response = await this.handleTodaySchedule(driver);
      } else if (this.isWeekQuery(messageLower)) {
        response = await this.handleWeekSchedule(driver);
      } else if (this.isSwapRequest(messageLower)) {
        response = await this.handleShiftSwapRequest(driver, message);
      } else {
        response = await this.handleGeneralSchedule(driver);
      }

      return response;

    } catch (error) {
      console.error('Error in schedule handler:', error);
      return this.getErrorResponse(driver.first_name);
    }
  }

  isTodayQuery(message) {
    return message.includes('today') || message.includes('now') || message.includes('current');
  }

  isWeekQuery(message) {
    return message.includes('week') || message.includes('next') || message.includes('schedule');
  }

  isSwapRequest(message) {
    return message.includes('swap') || message.includes('change shift') || message.includes('trade');
  }

  async handleTodaySchedule(driver) {
    const todayShift = await db.getTodayShift(driver.id);

    if (!todayShift) {
      return `Hello ${driver.first_name}! 📅\n\nYou have no shift scheduled for today.\n\nEnjoy your day off! ✅\n\nBest Regards,\nTree Logistics Team`;
    }

    let response = `Hello ${driver.first_name}! 📅\n\n`;
    response += `Today's Assignment - ${this.formatDate(new Date())}\n\n`;
    response += `📍 Station: ${todayShift.station}\n`;
    response += `⏰ Shift: ${todayShift.start_time} - ${todayShift.end_time}\n`;
    response += `🗺️ Zone: ${todayShift.zone}\n`;
    response += `🚚 Vehicle: ${todayShift.vehicle_number || 'TBA'}\n`;
    response += `📦 Estimated Packages: ${todayShift.estimated_packages}\n`;
    response += `✅ Status: ${todayShift.status.toUpperCase()}\n\n`;
    
    const hours = this.calculateHours(todayShift.start_time, todayShift.end_time);
    response += `Shift Duration: ${hours} hours\n`;
    response += `Estimated Finish: ${todayShift.end_time}\n\n`;
    
    response += `Route Notes:\n`;
    response += `• Please arrive 15 minutes early\n`;
    response += `• Check vehicle before departure\n`;
    response += `• Load scanner and fuel card\n\n`;
    
    response += `Have a great shift! 🚀\n\n`;
    response += `Best Regards,\nTree Logistics Team`;
    
    return response;
  }

  async handleWeekSchedule(driver) {
    const startDate = this.getNextMonday();
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);

    const shifts = await db.getDriverSchedule(
      driver.id,
      startDate.toISOString().split('T')[0],
      endDate.toISOString().split('T')[0]
    );

    let response = `Hello ${driver.first_name}! 📅\n\n`;
    response += `Your Schedule - Week ${this.getWeekNumber(startDate)}\n`;
    response += `${this.formatDate(startDate)} - ${this.formatDate(endDate)}\n\n`;

    const daysOfWeek = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    let totalHours = 0;
    let workingDays = 0;

    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(currentDate.setDate() + i);
      const dateStr = currentDate.toISOString().split('T')[0];
      
      const shift = shifts.find(s => s.shift_date === dateStr);
      
      response += `📍 ${daysOfWeek[i]} ${this.formatDateShort(currentDate)}\n`;
      
      if (shift) {
        response += `├─ Shift: ${shift.start_time} - ${shift.end_time}\n`;
        response += `├─ Station: ${shift.station}\n`;
        response += `├─ Zone: ${shift.zone}\n`;
        response += `├─ Vehicle: ${shift.vehicle_number || 'TBA'}\n`;
        response += `└─ Packages: ~${shift.estimated_packages}\n\n`;
        
        const hours = this.calculateHours(shift.start_time, shift.end_time);
        totalHours += hours;
        workingDays++;
      } else {
        response += `└─ DAY OFF ✅\n\n`;
      }
    }

    response += `Weekly Summary:\n`;
    response += `• Working Days: ${workingDays} days\n`;
    response += `• Rest Days: ${7 - workingDays} days\n`;
    response += `• Total Hours: ${totalHours} hours\n`;
    response += `• Estimated Earnings: ~${(totalHours * 15.625).toFixed(0)} EUR\n\n`;
    
    response += `Need changes?\n`;
    response += `Reply: "I need to swap my [day] shift"\n\n`;
    response += `Best Regards,\nTree Logistics Team`;
    
    return response;
  }

  async handleShiftSwapRequest(driver, message) {
    let response = `Hello ${driver.first_name}! 🔄\n\n`;
    response += `Shift Swap Request\n\n`;
    response += `Please provide:\n`;
    response += `1. Which day do you want to swap?\n`;
    response += `2. What day would you prefer instead?\n`;
    response += `3. Reason for swap (optional)\n\n`;
    response += `Example:\n`;
    response += `"I want to swap my Monday shift for Saturday"\n\n`;
    response += `Or contact dispatch:\n`;
    response += `📞 +49 123 456 789\n\n`;
    response += `Best Regards,\nTree Logistics Team`;
    
    return response;
  }

  async handleGeneralSchedule(driver) {
    const todayShift = await db.getTodayShift(driver.id);

    let response = `Hello ${driver.first_name}! 📅\n\n`;
    
    if (todayShift) {
      response += `Today: Working ${todayShift.start_time}-${todayShift.end_time} ✅\n\n`;
    } else {
      response += `Today: Day Off ✅\n\n`;
    }
    
    response += `I can help you with:\n\n`;
    response += `📅 Today's Schedule\n   "What's my shift today?"\n\n`;
    response += `📆 Week Schedule\n   "Show me next week schedule"\n\n`;
    response += `🔄 Shift Swaps\n   "I need to swap my Monday shift"\n\n`;
    response += `What would you like to know?\n\n`;
    response += `Best Regards,\nTree Logistics Team`;
    
    return response;
  }

  getNextMonday() {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + daysUntilMonday);
    nextMonday.setHours(0, 0, 0, 0);
    return nextMonday;
  }

  getWeekNumber(date) {
    const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
    const pastDaysOfYear = (date - firstDayOfYear) / 86400000;
    return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
  }

  calculateHours(startTime, endTime) {
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);
    return (endHour * 60 + endMin - startHour * 60 - startMin) / 60;
  }

  calculateDaysUntil(dateStr) {
    if (!dateStr) return 999;
    const targetDate = new Date(dateStr);
    const today = new Date();
    const diff = targetDate - today;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
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

  formatDate(date) {
    if (!date) return 'N/A';
    if (typeof date === 'string') date = new Date(date);
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  formatDateShort(date) {
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit'
    });
  }

  getErrorResponse(firstName) {
    return `Hello ${firstName}!\n\nI'm having trouble accessing schedule information. Please contact dispatch:\n\n📞 +49 123 456 789\n📧 dispatch@treelogistics.com\n\nBest Regards,\nTree Logistics Team`;
  }
}

module.exports = new ScheduleHandler();

