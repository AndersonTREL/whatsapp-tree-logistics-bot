// Simple conversation flow management
class ConversationFlow {
  constructor() {
    this.flows = new Map();
    this.userInfo = new Map(); // Store user information
    this.flowExpiry = 30 * 60 * 1000; // 30 minutes

    // Periodic cleanup of expired flows to prevent memory leaks
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredFlows();
    }, 10 * 60 * 1000); // Run every 10 minutes
  }

  cleanupExpiredFlows() {
    const now = Date.now();
    let cleaned = 0;
    for (const [phoneNumber, flow] of this.flows.entries()) {
      if (now - flow.lastActivity > this.flowExpiry) {
        this.flows.delete(phoneNumber);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(`🧹 Cleanup: removed ${cleaned} expired flows (${this.flows.size} active remaining)`);
    }
  }

  startFlow(phoneNumber, data) {
    this.flows.set(phoneNumber, {
      ...data,
      startedAt: Date.now(),
      lastActivity: Date.now()
    });
    
    console.log(`📱 Started flow for ${phoneNumber}:`, data);
  }

  updateFlow(phoneNumber, data) {
    const existingFlow = this.flows.get(phoneNumber);
    if (existingFlow) {
      this.flows.set(phoneNumber, {
        ...existingFlow,
        ...data,
        lastActivity: Date.now()
      });
      
      console.log(`📱 Updated flow for ${phoneNumber}:`, data);
    }
  }

  getFlowState(phoneNumber) {
    const flow = this.flows.get(phoneNumber);
    
    if (!flow) {
      return null;
    }

    // Check if flow has expired
    if (Date.now() - flow.lastActivity > this.flowExpiry) {
      console.log(`⏰ Flow expired for ${phoneNumber}`);
      this.flows.delete(phoneNumber);
      return null;
    }

    return flow;
  }

  clearFlow(phoneNumber) {
    if (this.flows.has(phoneNumber)) {
      console.log(`🧹 Cleared flow for ${phoneNumber}`);
      this.flows.delete(phoneNumber);
    }
  }

  clearAllFlows() {
    console.log(`🧹 Cleared all flows (${this.flows.size} active)`);
    this.flows.clear();
  }

  getActiveFlowsCount() {
    return this.flows.size;
  }

  getFlowSummary() {
    const summary = {};
    for (const [phone, flow] of this.flows.entries()) {
      summary[phone] = {
        flow: flow.flow || 'unknown',
        step: flow.step || 'unknown',
        category: flow.category || 'none',
        startedAt: new Date(flow.startedAt).toISOString(),
        lastActivity: new Date(flow.lastActivity).toISOString()
      };
    }
    return summary;
  }

  getRecentMessages(phoneNumber) {
    // For satisfaction detection, we'll check if there are recent messages
    // that might indicate a satisfaction context
    // This is a simple implementation - in a real system you'd track message history
    return null; // Return null for now, we'll use AI to detect satisfaction context
  }

  getTimeSinceLastActivity(phoneNumber) {
    const flow = this.flows.get(phoneNumber);
    if (flow) {
      return Date.now() - flow.lastActivity;
    }
    return null;
  }

  // User info management
  storeUserInfo(phoneNumber, userData) {
    this.userInfo.set(phoneNumber, {
      ...userData,
      storedAt: Date.now()
    });
    console.log(`👤 Stored user info for ${phoneNumber}:`, userData);
  }

  getUserInfo(phoneNumber) {
    return this.userInfo.get(phoneNumber);
  }

  clearUserInfo(phoneNumber) {
    if (this.userInfo.has(phoneNumber)) {
      this.userInfo.delete(phoneNumber);
      console.log(`🧹 Cleared user info for ${phoneNumber}`);
    }
  }
}

module.exports = new ConversationFlow();