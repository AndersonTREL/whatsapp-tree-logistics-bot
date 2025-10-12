class MessageParser {
  parseMessage(messageText, senderName = 'Unknown') {
    let firstName = 'Unknown';
    let lastName = '';

    // 1. Try to extract name from message text first
    const nameMatch = messageText.match(/(?:my name is|my name its|i am)\s+([a-zA-Z]+(?:\s+[a-zA-Z]+)*?)(?:\s+and|\s+with|\s+,|\s+i\s+|\s+$)/i);
    if (nameMatch && nameMatch[1]) {
      const fullMatchedName = nameMatch[1].trim();
      const nameParts = fullMatchedName.split(' ');
      firstName = nameParts[0];
      lastName = nameParts.slice(1).join(' ');
    } else if (senderName && senderName !== 'Unknown') {
      // 2. If not found in message, try to parse name from sender profile
      const nameParts = senderName.trim().split(' ');
      firstName = nameParts[0] || 'Unknown';
      lastName = nameParts.slice(1).join(' ') || '';
    }

    // Determine category based on keywords
    const category = this.categorizeMessage(messageText);

    return {
      firstName,
      lastName,
      category
    };
  }

  categorizeMessage(messageText) {
    const text = messageText.toLowerCase();

    // Define category keywords
    const categories = {
      'Salary': ['salary', 'payment', 'pay', 'money', 'wage', 'eur', 'euro', 'paid'],
      'Schedule': ['schedule', 'shift', 'hours', 'time', 'work hours', 'roster'],
      'Vehicle': ['vehicle', 'car', 'truck', 'van', 'maintenance', 'repair', 'fuel'],
      'Documentation': ['document', 'papers', 'license', 'permit', 'contract'],
      'Leave/Absence': ['leave', 'vacation', 'sick', 'absence', 'off', 'holiday'],
      'Emergency': ['emergency', 'urgent', 'accident', 'help', 'critical', 'asap'],
      'Other': []
    };

    // Check each category for keyword matches
    for (const [category, keywords] of Object.entries(categories)) {
      if (category === 'Other') continue;
      
      for (const keyword of keywords) {
        if (text.includes(keyword)) {
          return category;
        }
      }
    }

    return 'Other';
  }

  determinePriority(messageText) {
    const text = messageText.toLowerCase();

    // Critical keywords
    const criticalKeywords = ['emergency', 'urgent', 'accident', 'critical', 'asap', 'immediately'];
    const highKeywords = ['problem', 'issue', 'wrong', 'missing', 'broken', 'failed'];
    const mediumKeywords = ['question', 'help', 'need', 'want', 'request'];

    // Check for critical priority
    for (const keyword of criticalKeywords) {
      if (text.includes(keyword)) {
        return 'Critical';
      }
    }

    // Check for high priority
    for (const keyword of highKeywords) {
      if (text.includes(keyword)) {
        return 'High';
      }
    }

    // Check for medium priority
    for (const keyword of mediumKeywords) {
      if (text.includes(keyword)) {
        return 'Medium';
      }
    }

    return 'Low';
  }

  isRequestMessage(messageText) {
    const text = messageText.toLowerCase().trim();

    // Skip very short messages
    if (text.length < 10) {
      return false;
    }

    // Skip common non-request messages
    const nonRequestPatterns = [
      'thank you', 'thanks', 'thx', 'thank tou', 'ty',
      'ok', 'okay', 'fine', 'good', 'great',
      'yes', 'no', 'yep', 'nope', 'yeah',
      'hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening',
      'bye', 'goodbye', 'see you', 'later',
      'sure', 'of course', 'no problem', 'welcome'
    ];

    // Check if message matches non-request patterns
    for (const pattern of nonRequestPatterns) {
      if (text === pattern || text.startsWith(pattern + ' ') || text.endsWith(' ' + pattern)) {
        return false;
      }
    }

    // Check if message contains request indicators
    const requestIndicators = [
      'problem', 'issue', 'wrong', 'missing', 'broken', 'failed',
      'need', 'want', 'require', 'request', 'help', 'question',
      'salary', 'payment', 'pay', 'money', 'wage', 'eur', 'euro',
      'schedule', 'shift', 'hours', 'time', 'work hours',
      'vehicle', 'car', 'truck', 'van', 'maintenance', 'repair',
      'document', 'papers', 'license', 'permit', 'contract',
      'leave', 'vacation', 'sick', 'absence', 'holiday',
      'emergency', 'urgent', 'accident', 'critical', 'asap'
    ];

    // If message contains request indicators, it's likely a request
    for (const indicator of requestIndicators) {
      if (text.includes(indicator)) {
        return true;
      }
    }

    // Check for structured request patterns
    const structuredPatterns = [
      /my name is.*and.*(?:problem|issue|need|want|help)/i,
      /i have.*(?:problem|issue|need|want)/i,
      /i need.*(?:help|support|assistance)/i,
      /can you.*(?:help|support|assist)/i,
      /could you.*(?:help|support|assist)/i
    ];

    for (const pattern of structuredPatterns) {
      if (pattern.test(text)) {
        return true;
      }
    }

    // If message is longer than 20 characters and doesn't match non-request patterns, consider it a request
    return text.length > 20;
  }
}

module.exports = new MessageParser();

