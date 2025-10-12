const db = require('../database/db');

class PerformanceHandler {
  async handleRequest(message, driver, intent) {
    try {
      const messageLower = message.toLowerCase();
      
      let response;

      if (this.isDailyStats(messageLower)) {
        response = await this.handleDailyStats(driver);
      } else if (this.isMonthlyStats(messageLower)) {
        response = await this.handleMonthlyStats(driver);
      } else {
        response = await this.handleGeneralPerformance(driver);
      }

      return response;

    } catch (error) {
      console.error('Error in performance handler:', error);
      return this.getErrorResponse(driver.first_name);
    }
  }

  isDailyStats(message) {
    return message.includes('today') || message.includes('daily') || message.includes('current');
  }

  isMonthlyStats(message) {
    return message.includes('month') || message.includes('overall') || message.includes('summary');
  }

  async handleDailyStats(driver) {
    const today = new Date().toISOString().split('T')[0];
    const todayMetrics = await db.get(
      'SELECT * FROM performance_metrics WHERE driver_id = ? AND date = ?',
      [driver.id, today]
    );

    if (!todayMetrics) {
      return `Hello ${driver.first_name}! 📊\n\nNo performance data available for today yet.\n\nData updates after route completion.\n\nBest Regards,\nTree Logistics Team`;
    }

    let response = `Hello ${driver.first_name}! 📊\n\n`;
    response += `Today's Performance - ${this.formatDate(today)}\n\n`;
    
    response += `📦 Delivery Stats:\n`;
    response += `├─ Packages Delivered: ${todayMetrics.packages_delivered}\n`;
    response += `├─ Packages Assigned: ${todayMetrics.packages_assigned}\n`;
    response += `├─ Success Rate: ${todayMetrics.success_rate.toFixed(1)}% ${this.getRatingEmoji(todayMetrics.success_rate)}\n`;
    response += `└─ Packages/Hour: ${todayMetrics.packages_per_hour.toFixed(1)}\n\n`;
    
    response += `⭐ Quality Metrics:\n`;
    response += `├─ Customer Rating: ${todayMetrics.customer_rating.toFixed(1)}/5.0 ${this.getStars(todayMetrics.customer_rating)}\n`;
    response += `├─ Photo Compliance: ${todayMetrics.photo_compliance.toFixed(1)}%\n`;
    response += `└─ Safety Score: ${todayMetrics.safety_score.toFixed(1)}% ✅\n\n`;
    
    // Performance feedback
    if (todayMetrics.success_rate >= 98 && todayMetrics.packages_per_hour >= 20) {
      response += `🏆 Excellent Work!\n`;
      response += `You're exceeding all targets!\n\n`;
    } else if (todayMetrics.success_rate >= 95) {
      response += `👍 Good Performance!\n`;
      response += `Keep up the good work!\n\n`;
    }
    
    response += `Best Regards,\nTree Logistics Team`;
    
    return response;
  }

  async handleMonthlyStats(driver) {
    const summary = await db.getDriverPerformanceSummary(driver.id);

    if (!summary || summary.days_worked === 0) {
      return `Hello ${driver.first_name}! 📊\n\nNo performance data available for this month yet.\n\nBest Regards,\nTree Logistics Team`;
    }

    const currentMonth = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

    let response = `Hello ${driver.first_name}! 📊\n\n`;
    response += `Your Performance - ${currentMonth}\n`;
    response += `Period: Last ${summary.days_worked} working days\n\n`;
    
    response += `🎯 Delivery Metrics:\n`;
    response += `├─ Total Packages: ${summary.total_packages}\n`;
    response += `├─ Success Rate: ${summary.avg_success_rate.toFixed(1)}% ${this.getRatingEmoji(summary.avg_success_rate)}\n`;
    response += `├─ Avg Packages/Hour: ${summary.avg_packages_per_hour.toFixed(1)}\n`;
    response += `└─ Target: 20 packages/hour ${summary.avg_packages_per_hour >= 20 ? '✅' : '⚠️'}\n\n`;
    
    response += `⭐ Quality Scores:\n`;
    response += `├─ Customer Rating: ${summary.avg_customer_rating.toFixed(1)}/5.0 ${this.getStars(summary.avg_customer_rating)}\n`;
    response += `├─ Photo Compliance: ${summary.avg_photo_compliance.toFixed(1)}%\n`;
    response += `└─ Safety Score: ${summary.avg_safety_score.toFixed(1)}% ✅\n\n`;
    
    // Calculate bonus eligibility
    const bonusEligible = this.calculateBonus(summary);
    if (bonusEligible.total > 0) {
      response += `💰 Bonus Eligible:\n`;
      if (bonusEligible.quality > 0) {
        response += `✅ Quality Bonus: +${bonusEligible.quality} EUR\n`;
      }
      if (bonusEligible.safety > 0) {
        response += `✅ Safety Bonus: +${bonusEligible.safety} EUR\n`;
      }
      if (bonusEligible.performance > 0) {
        response += `✅ Performance Bonus: +${bonusEligible.performance} EUR\n`;
      }
      response += `💵 Total Extra: ${bonusEligible.total} EUR this month!\n\n`;
    }
    
    // Ranking (mock data for now)
    const ranking = Math.floor(Math.random() * 10) + 1;
    response += `🏆 Your Ranking: #${ranking} out of 45 drivers\n\n`;
    
    if (summary.avg_success_rate >= 98) {
      response += `🌟 Outstanding Performance!\nKeep up the excellent work!\n\n`;
    }
    
    response += `Best Regards,\nTree Logistics Team`;
    
    return response;
  }

  async handleGeneralPerformance(driver) {
    return `Hello ${driver.first_name}! 📊\n\nI can show you:\n\n📅 Today's Performance\n   "How am I doing today?"\n\n📆 Monthly Summary\n   "Show my performance this month"\n\n🎯 Specific Metrics\n   "What's my success rate?"\n   "What's my customer rating?"\n\nWhat would you like to see?\n\nBest Regards,\nTree Logistics Team`;
  }

  calculateBonus(summary) {
    let quality = 0;
    let safety = 0;
    let performance = 0;

    // Quality bonus (>98% success rate + >4.5 rating)
    if (summary.avg_success_rate >= 98 && summary.avg_customer_rating >= 4.5) {
      quality = 50;
    }

    // Safety bonus (100% safety score)
    if (summary.avg_safety_score >= 99) {
      safety = 50;
    }

    // Performance bonus (>22 packages/hour)
    if (summary.avg_packages_per_hour >= 22) {
      performance = 100;
    }

    return {
      quality,
      safety,
      performance,
      total: quality + safety + performance
    };
  }

  getRatingEmoji(rate) {
    if (rate >= 98) return '🌟';
    if (rate >= 95) return '✅';
    if (rate >= 90) return '👍';
    return '⚠️';
  }

  getStars(rating) {
    const fullStars = Math.floor(rating);
    return '⭐'.repeat(fullStars);
  }

  formatDate(dateStr) {
    const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;
    return date.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    });
  }

  getErrorResponse(firstName) {
    return `Hello ${firstName}!\n\nI'm having trouble accessing performance data. Please contact your manager:\n\n📞 +49 123 456 789\n\nBest Regards,\nTree Logistics Team`;
  }
}

module.exports = new PerformanceHandler();

