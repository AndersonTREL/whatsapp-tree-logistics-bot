/**
 * Daily Open Requests Email Report
 * 
 * Sends a summary of all open requests (To be contacted, Not started, needs to be clarified)
 * every weekday at 08:00 AM CET to the specified recipients.
 * 
 * SETUP INSTRUCTIONS:
 * 1. Open your Google Sheet → Extensions → Apps Script
 * 2. Delete any existing code and paste this entire script
 * 3. Click Save (💾)
 * 4. Run "setupDailyTrigger" once from the function dropdown → click Run
 * 5. Authorize the script when prompted
 * 6. Done! The email will be sent Mon-Fri at 8 AM automatically.
 */

// ==================== CONFIGURATION ====================

const RECIPIENTS = [
  'amnery.jofre@treelogistics.de',
  'anderson.meta@treelogistics.de',
  'ayse@treelogistics.de',
  'fadi.nader@treelogistics.de',
  'hugo@treelogistics.de',
  'maen.alkhateeb@treelogistics.de'
];

const SHEET_NAME = 'Driver Requests';
const OPEN_STATUSES = ['To be contacted', 'Not started', 'needs to be clarified'];
const STATUS_COLUMN = 8; // Column H (1-indexed)

// ==================== MAIN FUNCTION ====================

function sendDailyOpenRequestsReport() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  
  if (!sheet) {
    Logger.log('Sheet "' + SHEET_NAME + '" not found!');
    return;
  }

  const data = sheet.getDataRange().getValues();
  const headers = data[0];
  
  // Find open requests
  const openRequests = [];
  
  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const status = (row[STATUS_COLUMN - 1] || '').toString().trim();
    
    // Skip empty rows
    if (!row[0] && !row[1]) continue;
    
    if (OPEN_STATUSES.some(s => s.toLowerCase() === status.toLowerCase())) {
      openRequests.push({
        rowNumber: i + 1,
        timestamp: row[0],
        firstName: row[1],
        lastName: row[2],
        station: row[3],
        request: row[4],
        requestId: row[5],
        phoneNumber: row[6],
        status: status
      });
    }
  }

  // Don't send email if there are no open requests
  if (openRequests.length === 0) {
    Logger.log('No open requests found. Skipping email.');
    return;
  }

  // Group by status
  const grouped = {};
  OPEN_STATUSES.forEach(s => { grouped[s] = []; });
  
  openRequests.forEach(req => {
    const matchedStatus = OPEN_STATUSES.find(s => s.toLowerCase() === req.status.toLowerCase());
    if (matchedStatus) {
      grouped[matchedStatus].push(req);
    }
  });

  // Build HTML email
  const today = new Date().toLocaleDateString('de-DE', { 
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
  });
  
  const statusColors = {
    'To be contacted': '#FF9800',
    'Not started': '#F44336',
    'needs to be clarified': '#FFC107'
  };

  let html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 800px; margin: 0 auto;">
      <div style="background: #22783C; color: white; padding: 20px 24px; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 22px;">📋 Daily Open Requests Report</h1>
        <p style="margin: 4px 0 0; opacity: 0.9; font-size: 14px;">${today}</p>
      </div>
      
      <div style="background: #f8f9fa; padding: 16px 24px; border-bottom: 1px solid #e0e0e0;">
        <p style="margin: 0; font-size: 16px;">
          <strong>${openRequests.length}</strong> open request${openRequests.length !== 1 ? 's' : ''} requiring attention
        </p>
      </div>
      
      <div style="padding: 0 24px 24px; background: white;">
  `;

  // Render each status group
  OPEN_STATUSES.forEach(status => {
    const requests = grouped[status];
    if (requests.length === 0) return;
    
    const color = statusColors[status] || '#999';
    
    html += `
      <div style="margin-top: 20px;">
        <h2 style="font-size: 16px; margin: 0 0 12px; padding: 8px 12px; background: ${color}20; border-left: 4px solid ${color}; border-radius: 4px;">
          <span style="color: ${color};">●</span> ${status} (${requests.length})
        </h2>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
          <tr style="background: #f5f5f5;">
            <th style="padding: 8px 10px; text-align: left; border: 1px solid #e0e0e0;">Name</th>
            <th style="padding: 8px 10px; text-align: left; border: 1px solid #e0e0e0;">Station</th>
            <th style="padding: 8px 10px; text-align: left; border: 1px solid #e0e0e0;">Request</th>
            <th style="padding: 8px 10px; text-align: left; border: 1px solid #e0e0e0;">Date</th>
            <th style="padding: 8px 10px; text-align: left; border: 1px solid #e0e0e0;">Request ID</th>
          </tr>
    `;
    
    requests.forEach((req, idx) => {
      const bgColor = idx % 2 === 0 ? 'white' : '#fafafa';
      const timestamp = typeof req.timestamp === 'object' 
        ? req.timestamp.toLocaleDateString('de-DE') 
        : req.timestamp;
      
      html += `
        <tr style="background: ${bgColor};">
          <td style="padding: 8px 10px; border: 1px solid #e0e0e0;">${req.firstName} ${req.lastName}</td>
          <td style="padding: 8px 10px; border: 1px solid #e0e0e0; text-align: center;">${req.station}</td>
          <td style="padding: 8px 10px; border: 1px solid #e0e0e0;">${req.request}</td>
          <td style="padding: 8px 10px; border: 1px solid #e0e0e0; white-space: nowrap;">${timestamp}</td>
          <td style="padding: 8px 10px; border: 1px solid #e0e0e0; font-family: monospace; font-size: 11px;">${req.requestId}</td>
        </tr>
      `;
    });
    
    html += '</table></div>';
  });

  // Footer
  const sheetUrl = SpreadsheetApp.getActiveSpreadsheet().getUrl();
  html += `
      <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e0e0e0; text-align: center;">
        <a href="${sheetUrl}" style="display: inline-block; padding: 10px 24px; background: #22783C; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
          📊 Open Google Sheet
        </a>
        <p style="margin-top: 12px; font-size: 12px; color: #999;">
          This report is generated automatically by Tree Logistics Support Bot
        </p>
      </div>
    </div>
  </div>`;

  // Send the email
  const subject = `📋 TREL Open Requests: ${openRequests.length} pending — ${today}`;
  
  RECIPIENTS.forEach(email => {
    try {
      MailApp.sendEmail({
        to: email,
        subject: subject,
        htmlBody: html
      });
      Logger.log('✅ Email sent to: ' + email);
    } catch (e) {
      Logger.log('❌ Failed to send to ' + email + ': ' + e.message);
    }
  });

  Logger.log('📧 Daily report sent! ' + openRequests.length + ' open requests reported.');
}

// ==================== TRIGGER SETUP ====================

/**
 * Run this function ONCE to set up the daily 8 AM trigger.
 * Go to: Run → select "setupDailyTrigger" → click Run
 */
function setupDailyTrigger() {
  // Remove any existing triggers first
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(trigger => {
    if (trigger.getHandlerFunction() === 'sendDailyOpenRequestsReport') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  
  // Create new daily trigger at 8 AM (Mon-Fri handled in the function)
  ScriptApp.newTrigger('sendDailyOpenRequestsReport')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(8)
    .create();
  
  ScriptApp.newTrigger('sendDailyOpenRequestsReport')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.TUESDAY)
    .atHour(8)
    .create();
  
  ScriptApp.newTrigger('sendDailyOpenRequestsReport')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.WEDNESDAY)
    .atHour(8)
    .create();
  
  ScriptApp.newTrigger('sendDailyOpenRequestsReport')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.THURSDAY)
    .atHour(8)
    .create();
  
  ScriptApp.newTrigger('sendDailyOpenRequestsReport')
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.FRIDAY)
    .atHour(8)
    .create();
  
  Logger.log('✅ Daily trigger set! Reports will be sent Mon-Fri at 8:00 AM.');
  Logger.log('📧 Recipients: ' + RECIPIENTS.join(', '));
}

/**
 * Test function — sends the report immediately (for testing)
 */
function testSendReport() {
  sendDailyOpenRequestsReport();
}
