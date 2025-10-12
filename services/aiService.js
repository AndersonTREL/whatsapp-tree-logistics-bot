const OpenAI = require('openai');

class AIService {
  constructor() {
    this.openai = null;
    this.initializeOpenAI();
  }

  initializeOpenAI() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
      console.log('🤖 ChatGPT-5 Level AI initialized successfully');
    } else {
      console.log('🤖 OpenAI not configured - AI features disabled');
    }
  }

  isConfigured() {
    return !!this.openai && !!process.env.OPENAI_API_KEY;
  }

  async detectIntent(message) {
    if (!this.openai) {
      return { success: false, error: 'OpenAI not configured' };
    }

    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { 
            role: "system", 
            content: `You are a ChatGPT-5 level AI assistant for Tree Logistics, a German logistics company. You are extremely intelligent and context-aware.

Your task: Analyze the user's message with perfect understanding and determine the most appropriate category.

Categories:
1. Salary - Payroll, overtime, salary questions, payslips, missing payments
2. HR - Human resources, policies, procedures, benefits, workplace issues
3. Equipment - Scanner, SIM card, uniform, tools, devices, technical issues
4. Accident/Damage - Accidents, damages, safety incidents, vehicle problems
5. Report - General reports, complaints, observations, misconduct
6. Vacation/Sick Leave - Time off, sick days, vacation requests, leave balance
7. Request Status - Checking status of previous requests

CRITICAL EQUIPMENT CATEGORY INTELLIGENCE:
- SIM CARD ISSUES: "SIM card doesn't work", "no signal", "SIM problems", "SIM card broken", "SIM card not working"
- SCANNER ISSUES: "scanner broken", "scanner not working", "scanner problems", "scanner damaged"
- UNIFORM ISSUES: "need uniform", "uniform problems", "clothing issues", "uniform size"
- INTERNET ISSUES: "no internet", "connection problems", "network issues", "internet not working"

Be extremely precise and intelligent. Understand context perfectly.

Respond in JSON format:
{
  "category": "Exact Category Name",
  "confidence": 0.95,
  "extractedInfo": {
    "issue": "precise description",
    "device": "specific device if mentioned",
    "problem": "exact problem description"
  },
  "suggestedAction": "intelligent action suggestion"
}` 
          },
          { 
            role: "user", 
            content: message 
          }
        ],
        temperature: 0.05,
      });

      const response = JSON.parse(completion.choices[0].message.content);
      return {
        success: true,
        category: response.category,
        confidence: response.confidence,
        extractedInfo: response.extractedInfo || {},
        suggestedAction: response.suggestedAction || 'I will help you with that request.'
      };

    } catch (error) {
      console.error('AI Intent Detection Error:', error);
      return { 
        success: false, 
        category: 'Equipment', 
        confidence: 0.5,
        extractedInfo: {},
        suggestedAction: 'Please provide more details about your request.'
      };
    }
  }

  async generateFollowUpQuestions(category, extractedInfo, initialMessage) {
    if (!this.openai) {
      return { success: false, questions: [] };
    }

    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { 
            role: "system", 
            content: `You are a ChatGPT-5 level AI assistant. Generate the PERFECT follow-up question for the user's request.

CRITICAL INTELLIGENCE RULES:
1. For SIM CARD ISSUES: If user said "SIM card doesn't work" or "broken", ask ONLY for SIM card number - DO NOT ask if it's broken again
2. For SCANNER ISSUES: Ask which part is broken
3. For UNIFORM ISSUES: Ask what size or type needed
4. For INTERNET ISSUES: Ask for scanner phone number
5. Be context-aware and intelligent
6. Don't ask redundant questions
7. Ask only ONE perfect question

Generate ONE intelligent follow-up question that makes perfect sense for the specific issue.

Respond with just the question text, no JSON.` 
          },
          { 
            role: "user", 
            content: `Category: ${category}\nInitial Message: ${initialMessage}\nExtracted Info: ${JSON.stringify(extractedInfo)}` 
          }
        ],
        temperature: 0.1,
      });

      const question = completion.choices[0].message.content.trim();
      return {
        success: true,
        questions: [question]
      };

    } catch (error) {
      console.error('AI Follow-up Generation Error:', error);
      return { success: false, questions: [] };
    }
  }

  async needsMoreInfo(category, collectedDetails) {
    if (!this.openai) {
      return { success: false, needsMore: false };
    }

    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { 
            role: "system", 
            content: `You are a ChatGPT-5 level AI assistant. Determine if we need more information for a ${category} request.

CRITICAL RULES:
1. For SIM CARD ISSUES: If we have SIM card number and problem description, we have enough info
2. For SCANNER ISSUES: If we have which part is broken and severity, we have enough info
3. For ALL CATEGORIES: Maximum 2 questions - questions are SUGGESTED only, not mandatory
4. Be intelligent and context-aware

Respond in JSON format:
{
  "needsMore": true/false,
  "nextQuestion": "perfect follow-up question if needed"
}` 
          },
          { 
            role: "user", 
            content: `Category: ${category}\nCollected Details: ${JSON.stringify(collectedDetails)}` 
          }
        ],
        temperature: 0.1,
      });

      const response = JSON.parse(completion.choices[0].message.content);
      return {
        success: true,
        needsMore: response.needsMore || false,
        nextQuestion: response.nextQuestion || null,
        confidence: response.confidence || 0.5
      };

    } catch (error) {
      console.error('AI Info Analysis Error:', error);
      return { 
        success: false, 
        needsMore: false,
        nextQuestion: null 
      };
    }
  }

  async processRequest(category, details) {
    if (!this.openai) {
      return { success: false, summary: details.join('\n') };
    }

    try {
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { 
            role: "system", 
            content: `You are a ChatGPT-5 level AI assistant for Tree Logistics. Create a perfect, professional summary for a ${category} request.

Make it clear, concise, and actionable for our support team.` 
          },
          { 
            role: "user", 
            content: `Category: ${category}\nDetails: ${details.join('\n')}` 
          }
        ],
        temperature: 0.3,
      });

      const summary = completion.choices[0].message.content;
      return { success: true, summary };

    } catch (error) {
      console.error('AI Request Processing Error:', error);
      return { success: false, summary: details.join('\n') };
    }
  }
}

module.exports = new AIService();
