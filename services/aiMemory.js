/**
 * AI Memory Service
 * Stores and retrieves conversation context and user preferences
 */

class AIMemoryService {
  constructor() {
    this.memory = new Map(); // phoneNumber -> user memory
    this.conversationHistory = new Map(); // phoneNumber -> conversation history
  }

  /**
   * Store user information and preferences
   */
  storeUserInfo(phoneNumber, userInfo) {
    if (!this.memory.has(phoneNumber)) {
      this.memory.set(phoneNumber, {
        firstName: '',
        lastName: '',
        station: '',
        preferences: {},
        lastInteraction: null,
        totalRequests: 0,
        commonCategories: new Map(),
        language: 'en'
      });
    }

    const userMemory = this.memory.get(phoneNumber);
    
    // Update user info
    if (userInfo.firstName) userMemory.firstName = userInfo.firstName;
    if (userInfo.lastName) userMemory.lastName = userInfo.lastName;
    if (userInfo.station) userMemory.station = userInfo.station;
    if (userInfo.language) userMemory.language = userInfo.language;
    
    userMemory.lastInteraction = new Date().toISOString();
    
    return userMemory;
  }

  /**
   * Get user information
   */
  getUserInfo(phoneNumber) {
    return this.memory.get(phoneNumber) || null;
  }

  /**
   * Store conversation context
   */
  storeConversation(phoneNumber, message, response, category = null) {
    if (!this.conversationHistory.has(phoneNumber)) {
      this.conversationHistory.set(phoneNumber, []);
    }

    const history = this.conversationHistory.get(phoneNumber);
    
    // Keep only last 10 conversations to manage memory
    if (history.length >= 10) {
      history.shift();
    }

    history.push({
      timestamp: new Date().toISOString(),
      userMessage: message,
      botResponse: response,
      category: category
    });

    // Update user statistics
    const userMemory = this.memory.get(phoneNumber);
    if (userMemory) {
      if (category) {
        userMemory.totalRequests++;
        const currentCount = userMemory.commonCategories.get(category) || 0;
        userMemory.commonCategories.set(category, currentCount + 1);
      }
    }
  }

  /**
   * Get conversation history
   */
  getConversationHistory(phoneNumber, limit = 5) {
    const history = this.conversationHistory.get(phoneNumber) || [];
    return history.slice(-limit);
  }

  /**
   * Get personalized greeting based on user history
   */
  getPersonalizedGreeting(phoneNumber) {
    const userInfo = this.getUserInfo(phoneNumber);
    if (!userInfo) {
      return "Hello! Welcome to Tree Logistics support.";
    }

    const { firstName, lastName, station, totalRequests } = userInfo;
    const fullName = `${firstName} ${lastName}`.trim();
    
    if (totalRequests > 0) {
      return `Welcome back, ${fullName}! 👋 You've made ${totalRequests} request(s) with us. How can I help you today?`;
    } else {
      return `Hello ${fullName}! Welcome to Tree Logistics support. How can I assist you today?`;
    }
  }

  /**
   * Get user's most common categories
   */
  getCommonCategories(phoneNumber, limit = 3) {
    const userInfo = this.getUserInfo(phoneNumber);
    if (!userInfo || userInfo.commonCategories.size === 0) {
      return [];
    }

    // Sort categories by frequency
    const sortedCategories = Array.from(userInfo.commonCategories.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([category, count]) => ({ category, count }));

    return sortedCategories;
  }

  /**
   * Generate contextual suggestions based on user history
   */
  getContextualSuggestions(phoneNumber) {
    const userInfo = this.getUserInfo(phoneNumber);
    const history = this.getConversationHistory(phoneNumber, 3);
    
    if (!userInfo || history.length === 0) {
      return null;
    }

    // Analyze recent conversations for patterns
    const recentCategories = history
      .filter(h => h.category)
      .map(h => h.category)
      .slice(-3);

    if (recentCategories.length > 0) {
      const mostRecent = recentCategories[recentCategories.length - 1];
      return {
        suggestedCategory: mostRecent,
        message: `I notice you recently asked about ${mostRecent}. Would you like to check the status of that request or make a new ${mostRecent} request?`
      };
    }

    return null;
  }

  /**
   * Clear user memory (for testing or privacy)
   */
  clearUserMemory(phoneNumber) {
    this.memory.delete(phoneNumber);
    this.conversationHistory.delete(phoneNumber);
  }

  /**
   * Get memory statistics
   */
  getMemoryStats() {
    return {
      totalUsers: this.memory.size,
      totalConversations: Array.from(this.conversationHistory.values())
        .reduce((total, history) => total + history.length, 0),
      activeUsers: Array.from(this.memory.values())
        .filter(user => {
          const lastInteraction = new Date(user.lastInteraction);
          const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
          return lastInteraction > oneDayAgo;
        }).length
    };
  }
}

module.exports = new AIMemoryService();
