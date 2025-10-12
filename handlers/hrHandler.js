const db = require('../database/db');

class HRHandler {
  async handleRequest(message, driver, intent) {
    try {
      const { entities } = intent;
      
      let response = `Hello ${driver.first_name}! `;

      // Determine specific HR query type
      const messageLower = message.toLowerCase();

      if (this.isSalaryQuery(messageLower)) {
        response = await this.handleSalaryQuery(driver, entities);
      } else if (this.isVacationQuery(messageLower)) {
        response = await this.handleVacationQuery(driver, entities);
      } else if (this.isContractQuery(messageLower)) {
        response = await this.handleContractQuery(driver);
      } else {
        response = await this.handleGeneralHR(driver);
      }

      return response;

    } catch (error) {
      console.error('Error in HR handler:', error);
      return this.getErrorResponse(driver.first_name);
    }
  }

  isSalaryQuery(message) {
    const salaryKeywords = ['salary', 'payment', 'paid', 'earn', 'wage', 'payslip', 'money', 'eur'];
    return salaryKeywords.some(keyword => message.includes(keyword));
  }

  isVacationQuery(message) {
    const vacationKeywords = ['vacation', 'holiday', 'time off', 'leave', 'days off', 'absence'];
    return vacationKeywords.some(keyword => message.includes(keyword));
  }

  isContractQuery(message) {
    const contractKeywords = ['contract', 'probation', 'employment', 'hire date', 'start date'];
    return contractKeywords.some(keyword => message.includes(keyword));
  }

  async handleSalaryQuery(driver, entities) {
    // Get the month from entities or use last month
    const requestedMonth = entities.month || this.getLastMonth();
    
    const salaryData = await db.getDriverSalary(driver.id, requestedMonth);

    if (!salaryData) {
      return `Hello ${driver.first_name}! 💰\n\nI don't have salary data for ${this.formatMonth(requestedMonth)} yet.\n\nYour latest salary record will be available after payday.\n\nFor questions, contact HR:\n📧 hr@treelogistics.com\n\nBest Regards,\nTree Logistics Team`;
    }

    let response = `Hello ${driver.first_name}! 💰\n\n`;
    response += `${this.formatMonth(requestedMonth)} Salary Breakdown:\n\n`;
    response += `Earnings:\n`;
    response += `├─ Base Salary: ${salaryData.base_salary.toFixed(2)} EUR\n`;
    
    if (salaryData.overtime_hours > 0) {
      response += `├─ Overtime (${salaryData.overtime_hours}h): ${salaryData.overtime_pay.toFixed(2)} EUR\n`;
    }
    
    if (salaryData.bonus > 0) {
      response += `├─ Bonuses: ${salaryData.bonus.toFixed(2)} EUR\n`;
    }
    
    const grossSalary = salaryData.base_salary + salaryData.overtime_pay + salaryData.bonus;
    response += `└─ Gross Total: ${grossSalary.toFixed(2)} EUR\n\n`;
    
    response += `Deductions:\n`;
    response += `└─ Total Deductions: -${salaryData.deductions.toFixed(2)} EUR\n\n`;
    
    response += `💳 NET SALARY: ${salaryData.net_salary.toFixed(2)} EUR\n\n`;
    
    response += `Payment Details:\n`;
    response += `📅 Payment Date: ${this.formatDate(salaryData.payment_date)}\n`;
    response += `✅ Status: ${salaryData.payment_status.toUpperCase()}\n\n`;
    
    if (salaryData.payment_status === 'paid') {
      response += `Payment has been processed to your bank account.\n\n`;
    } else {
      response += `Payment will be processed on ${this.formatDate(salaryData.payment_date)}.\n\n`;
    }
    
    response += `Questions about deductions or discrepancies?\nContact HR: hr@treelogistics.com\n\n`;
    response += `Best Regards,\nTree Logistics Team`;
    
    return response;
  }

  async handleVacationQuery(driver, entities) {
    const currentYear = new Date().getFullYear();
    const vacationBalance = await db.getVacationBalance(driver.id, currentYear);

    if (!vacationBalance) {
      return `Hello ${driver.first_name}! 🏖️\n\nI don't have your vacation balance information. Please contact HR:\n\n📧 hr@treelogistics.com\n📞 +49 123 456 789\n\nBest Regards,\nTree Logistics Team`;
    }

    let response = `Hello ${driver.first_name}! 🏖️\n\n`;
    response += `Your ${currentYear} Vacation Balance:\n\n`;
    response += `├─ Total Annual: ${vacationBalance.total_days} days\n`;
    response += `├─ Used: ${vacationBalance.used_days} days\n`;
    response += `├─ Pending: ${vacationBalance.pending_days} days (requests submitted)\n`;
    response += `└─ Available: ${vacationBalance.remaining_days} days\n\n`;

    // Get recent leave requests
    const recentLeaves = await db.all(
      `SELECT * FROM leave_requests 
       WHERE driver_id = ? AND start_date >= date('now', '-60 days') 
       ORDER BY start_date DESC LIMIT 3`,
      [driver.id]
    );

    if (recentLeaves.length > 0) {
      response += `Recent Leaves:\n`;
      recentLeaves.forEach(leave => {
        const icon = leave.leave_type === 'vacation' ? '🏖️' : leave.leave_type === 'sick' ? '🏥' : '📅';
        response += `${icon} ${this.formatDate(leave.start_date)} to ${this.formatDate(leave.end_date)}: ${leave.days_count} days (${leave.leave_type})\n`;
      });
      response += `\n`;
    }

    response += `Want to request time off?\n`;
    response += `Just tell me: "I need vacation from Oct 20 to Oct 23"\n\n`;
    response += `Best Regards,\nTree Logistics Team`;
    
    return response;
  }

  async handleContractQuery(driver) {
    let response = `Hello ${driver.first_name}! 📋\n\n`;
    response += `Your Employment Details:\n\n`;
    response += `├─ Employee ID: ${driver.employee_id}\n`;
    response += `├─ Start Date: ${this.formatDate(driver.hire_date)}\n`;
    response += `├─ Contract Type: ${driver.contract_type}\n`;
    
    // Calculate probation end date (3 months from hire)
    const hireDate = new Date(driver.hire_date);
    const probationEnd = new Date(hireDate);
    probationEnd.setMonth(probationEnd.getMonth() + 3);
    const today = new Date();
    
    if (today > probationEnd) {
      response += `└─ Probation: COMPLETED ✅ (${this.formatDate(probationEnd)})\n\n`;
      response += `Current Status: Permanent Employee\n\n`;
    } else {
      response += `└─ Probation End: ${this.formatDate(probationEnd)}\n\n`;
      const daysLeft = Math.ceil((probationEnd - today) / (1000 * 60 * 60 * 24));
      response += `Probation Status: ${daysLeft} days remaining\n\n`;
    }
    
    response += `Employment Type: ${driver.contract_type}\n`;
    response += `Status: ${driver.status}\n\n`;
    
    response += `Need your contract document?\nContact HR: hr@treelogistics.com\n\n`;
    response += `Best Regards,\nTree Logistics Team`;
    
    return response;
  }

  async handleGeneralHR(driver) {
    return `Hello ${driver.first_name}! 👥\n\nI can help you with:\n\n💰 Salary Questions\n   "What's my September salary?"\n\n🏖️ Vacation Balance\n   "How many vacation days do I have?"\n\n📋 Contract Information\n   "When does my probation end?"\n\n📄 Documents\n   "I need my contract"\n\nWhat would you like to know?\n\nBest Regards,\nTree Logistics Team`;
  }

  getLastMonth() {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  formatMonth(monthStr) {
    const [year, month] = monthStr.split('-');
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
                       'July', 'August', 'September', 'October', 'November', 'December'];
    return `${monthNames[parseInt(month) - 1]} ${year}`;
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

  getErrorResponse(firstName) {
    return `Hello ${firstName}!\n\nI'm having trouble accessing HR information. Please contact HR directly:\n\n📧 hr@treelogistics.com\n📞 +49 123 456 789\n\nBest Regards,\nTree Logistics Team`;
  }
}

module.exports = new HRHandler();

