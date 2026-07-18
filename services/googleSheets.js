const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');

/**
 * Sheet layout — "Driver Requests" tab.
 *
 * Columns A-H are owned by the bot: it writes them on every new request and
 * they must stay in this exact order (addRequest, getAllRequests, formatSheet
 * and google-apps-script/daily_email_report.gs all index by position).
 *
 * Columns I onward are owned by the office team (Owner, Priority, DA Contacted,
 * Out or still with us, Action, Notes). The bot must never read or write them —
 * appends stop at H and formatting stops at H so the team's tracking is safe.
 */
const COLUMNS = ['Timestamp', 'First Name', 'Last Name', 'Station', 'Request/Question', 'Request ID', 'Phone Number', 'Status'];
const LAST_BOT_COLUMN = 'H'; // COLUMNS.length === 8

// The exact status values offered by the column H dropdown. normalizeStatusString()
// must round-trip every one of these unchanged, or the dropdown breaks.
const STATUS_OPTIONS = ['To be contacted', 'In Progress', 'Completed', 'Not started', 'needs to be clarified'];

class GoogleSheetsService {
  constructor() {
    this.sheets = null;
    // Use environment variable if available, otherwise fallback to hardcoded value
    this.spreadsheetId = process.env.GOOGLE_SHEET_ID || '1DwBYrHLGCpFpqbU6r5DUL6fyzJS8urN87tFgKAmJssQ';
    this.sheetName = 'Driver Requests'; // Name of the sheet tab

    console.log(`📊 Google Sheets Service initialized - Sheet ID: ${this.spreadsheetId}, Sheet Name: ${this.sheetName}`);
  }

  async authenticate() {
    try {
      console.log('🔐 Authenticating with Google Sheets API...');
      let auth;

      // Check if we have JSON credentials from environment variable
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
        console.log('📋 Using credentials from GOOGLE_APPLICATION_CREDENTIALS_JSON environment variable');
        try {
          const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
          auth = new google.auth.GoogleAuth({
            credentials: credentials,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
          });
          console.log('✅ Credentials parsed successfully');
        } catch (parseError) {
          console.error('❌ Failed to parse GOOGLE_APPLICATION_CREDENTIALS_JSON:', parseError.message);
          throw new Error('Invalid JSON in GOOGLE_APPLICATION_CREDENTIALS_JSON: ' + parseError.message);
        }
      } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        // Fallback to file-based credentials
        console.log('📁 Using credentials from file:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
        auth = new google.auth.GoogleAuth({
          keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
      } else {
        console.error('❌ No Google credentials found. Set either GOOGLE_APPLICATION_CREDENTIALS_JSON or GOOGLE_APPLICATION_CREDENTIALS');
        throw new Error('Missing Google credentials. Please set GOOGLE_APPLICATION_CREDENTIALS_JSON or GOOGLE_APPLICATION_CREDENTIALS environment variable.');
      }

      const client = await auth.getClient();
      this.sheets = google.sheets({ version: 'v4', auth: client });
      console.log('✅ Successfully authenticated with Google Sheets API');

      return this.sheets;
    } catch (error) {
      console.error('❌ Error authenticating with Google Sheets:', error.message);
      console.error('Error details:', {
        code: error.code,
        message: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  async ensureSheetExists() {
    try {
      if (!this.sheets) {
        await this.authenticate();
      }

      // Check if sheet exists
      const response = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });

      const sheetExists = response.data.sheets.some(
        sheet => sheet.properties.title === this.sheetName
      );

      if (!sheetExists) {
        // Create the sheet with simplified headers
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          resource: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: this.sheetName,
                    gridProperties: {
                      rowCount: 1000,
                      columnCount: 8 // A-H; headers below write through column H
                    }
                  }
                }
              }
            ]
          }
        });

        // Add headers (Status column in column H)
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `${this.sheetName}!A1:H1`,
          valueInputOption: 'RAW',
          resource: {
            values: [COLUMNS]
          }
        });

        console.log(`✅ Created sheet "${this.sheetName}" with headers`);
      }

      return true;
    } catch (error) {
      console.error('Error ensuring sheet exists:', error);
      throw error;
    }
  }



  async backupRequest(requestData) {
    try {
      const backupDir = path.join(__dirname, '../backups');
      if (!fs.existsSync(backupDir)) {
        fs.mkdirSync(backupDir, { recursive: true });
      }

      const backupFile = path.join(backupDir, 'failed_requests.json');
      let backups = [];

      if (fs.existsSync(backupFile)) {
        try {
          const content = fs.readFileSync(backupFile, 'utf8');
          backups = JSON.parse(content);
        } catch (e) {
          console.error('Error reading backup file, starting fresh');
        }
      }

      // Add status to track it hasn't been synced
      requestData._syncStatus = 'PENDING';
      requestData._backupTimestamp = new Date().toISOString();

      backups.push(requestData);

      fs.writeFileSync(backupFile, JSON.stringify(backups, null, 2));
      console.log(`💾 Request backed up locally to ${backupFile}`);
      return true;
    } catch (error) {
      console.error('❌ CRITICAL: Failed to backup request locally:', error);
      return false;
    }
  }

  /**
   * Find the sheet row number (1-indexed) holding a given Request ID.
   * Request IDs live in column F.
   * @returns {Promise<number|null>} - Row number, or null if not found
   */
  async findRowByRequestId(requestId) {
    if (!requestId) return null;

    try {
      if (!this.sheets) {
        await this.authenticate();
      }

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!F:F`,
      });

      const rows = response.data.values || [];
      const index = rows.findIndex(row => (row[0] || '').toString().trim() === requestId);

      return index === -1 ? null : index + 1;
    } catch (error) {
      console.error(`⚠️ Could not search for Request ID ${requestId}:`, error.message);
      return null;
    }
  }

  /**
   * Read back a row we just wrote and confirm the Request ID is actually there.
   * The Sheets API can report success on a write that did not land where we
   * expect, so we never tell a driver "saved" without verifying first.
   * @returns {Promise<number|null>} - Verified row number, or null if not found
   */
  async verifyRequestWritten(requestId, updatedRange) {
    const rowMatch = String(updatedRange || '').match(/(\d+)$/);

    if (rowMatch) {
      const rowNumber = parseInt(rowMatch[1], 10);
      try {
        const response = await this.sheets.spreadsheets.values.get({
          spreadsheetId: this.spreadsheetId,
          range: `${this.sheetName}!F${rowNumber}`,
        });

        const value = (response.data.values?.[0]?.[0] || '').toString().trim();
        if (value === requestId) {
          return rowNumber;
        }

        console.warn(`⚠️ Row ${rowNumber} holds "${value}", expected "${requestId}" — scanning the whole column`);
      } catch (error) {
        console.warn(`⚠️ Could not read back row ${rowNumber}:`, error.message);
      }
    }

    // Fall back to scanning the whole column in case the row landed elsewhere
    return await this.findRowByRequestId(requestId);
  }

  async addRequest(requestData) {
    const MAX_RETRIES = 3;
    let attempt = 0;

    while (attempt < MAX_RETRIES) {
      try {
        console.log(`📊 Adding request to Google Sheets (Attempt ${attempt + 1}/${MAX_RETRIES})`);

        await this.ensureSheetExists();

        // Get current row count to generate Row ID if not provided
        if (!requestData.rowId) {
          console.log('📊 Getting current row count...');
          const currentData = await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.spreadsheetId,
            range: `${this.sheetName}!A:A`,
          });

          const rowCount = currentData.data.values ? currentData.data.values.length : 1;
          requestData.rowId = `REQ-${Date.now()}-${rowCount}`;
        }

        // A previous attempt may have actually landed despite throwing (e.g. the
        // write succeeded but the response timed out). Check before appending
        // again so a retry never creates a duplicate row.
        if (attempt > 0) {
          const existingRow = await this.findRowByRequestId(requestData.rowId);
          if (existingRow) {
            console.log(`✅ Request ${requestData.rowId} already at row ${existingRow} — skipping duplicate append`);
            return { success: true, rowId: requestData.rowId, row: existingRow };
          }
        }

        // Structure with 6 required fields + Request ID + Phone Number + Status
        const values = [
          [
            requestData.timestamp,           // A: Timestamp
            requestData.firstName,           // B: First Name
            requestData.lastName,            // C: Last Name
            requestData.station,             // D: Station
            requestData.request,             // E: Request/Question
            requestData.rowId,               // F: Request ID
            requestData.phoneNumber,         // G: Phone Number
            requestData.status || 'To be contacted'   // H: Status
          ],
        ];

        console.log(`📝 Appending data to sheet "${this.sheetName}"...`);
        const response = await this.sheets.spreadsheets.values.append({
          spreadsheetId: this.spreadsheetId,
          range: `${this.sheetName}!A:H`,
          valueInputOption: 'RAW',
          // INSERT_ROWS is required. The default (OVERWRITE) writes into whatever
          // cells the API thinks come after the table, which silently overwrites
          // existing requests instead of adding a new row.
          insertDataOption: 'INSERT_ROWS',
          resource: { values },
        });

        const updatedRange = response.data.updates?.updatedRange || '';
        console.log('📊 Append response:', {
          spreadsheetId: response.data.spreadsheetId,
          updatedRange: updatedRange,
          updatedRows: response.data.updates?.updatedRows
        });

        // Never report success on an unverified write — read the row back first.
        const verifiedRow = await this.verifyRequestWritten(requestData.rowId, updatedRange);
        if (!verifiedRow) {
          throw new Error(
            `Write verification failed: ${requestData.rowId} is not in the sheet after append (reported range: ${updatedRange || 'unknown'})`
          );
        }

        console.log(`✅ Request ${requestData.rowId} verified in sheet at row ${verifiedRow}`);

        // Apply dropdown data validation to the Status cell (column H) for the new row
        try {
          const rowIndex = verifiedRow - 1; // 0-indexed for batchUpdate

          // Get the sheet ID
          const sheetInfo = await this.sheets.spreadsheets.get({
            spreadsheetId: this.spreadsheetId,
          });
          const sheet = sheetInfo.data.sheets.find(s => s.properties.title === this.sheetName);
          const sheetId = sheet ? sheet.properties.sheetId : 0;

          await this.sheets.spreadsheets.batchUpdate({
            spreadsheetId: this.spreadsheetId,
            resource: {
              requests: [{
                setDataValidation: {
                  range: {
                    sheetId: sheetId,
                    startRowIndex: rowIndex,
                    endRowIndex: rowIndex + 1,
                    startColumnIndex: 7, // Column H (0-indexed)
                    endColumnIndex: 8
                  },
                  rule: {
                    condition: {
                      type: 'ONE_OF_LIST',
                      values: STATUS_OPTIONS.map(v => ({ userEnteredValue: v }))
                    },
                    showCustomUi: true,
                    strict: false
                  }
                }
              }]
            }
          });
          console.log('✅ Dropdown data validation applied to Status cell');
        } catch (validationError) {
          // Don't fail the whole request if validation setup fails
          console.warn('⚠️ Could not apply dropdown validation:', validationError.message);
        }

        return { success: true, rowId: requestData.rowId, row: verifiedRow };

      } catch (error) {
        attempt++;
        console.error(`❌ Error adding request (Attempt ${attempt}/${MAX_RETRIES}):`, error.message);

        if (attempt >= MAX_RETRIES) {
          console.error('❌ All retries failed. This request did NOT reach Google Sheets.');

          // Emit one structured, greppable line so the request can be recovered
          // from Railway's log history. Search Railway for: REQUEST_NOT_SAVED
          console.error('🚨 REQUEST_NOT_SAVED ' + JSON.stringify({
            rowId: requestData.rowId,
            timestamp: requestData.timestamp,
            firstName: requestData.firstName,
            lastName: requestData.lastName,
            station: requestData.station,
            phoneNumber: requestData.phoneNumber,
            request: requestData.request,
            error: error.message
          }));

          // Best-effort local copy. On Railway the container filesystem is wiped
          // on every deploy and restart, so this must never be treated as a
          // successful save — we throw so the driver is told the truth.
          await this.backupRequest(requestData);

          throw error;
        }

        // Wait before retrying (exponential backoff: 1s, 2s, 4s...)
        const delay = Math.pow(2, attempt) * 1000;
        console.log(`⏳ Waiting ${delay}ms before next retry...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  async getAllRequests() {
    try {
      if (!this.sheets) {
        await this.authenticate();
      }

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A:H`,
      });

      const rows = response.data.values || [];

      if (rows.length <= 1) {
        return []; // No data rows, only headers
      }

      // Skip header row and map to objects
      const requests = rows.slice(1).map((row, index) => ({
        rowNumber: index + 2, // +2 because we skip header and arrays are 0-indexed
        timestamp: row[0] || '',
        firstName: row[1] || '',
        lastName: row[2] || '',
        station: row[3] || '',
        request: row[4] || '',
        rowId: row[5] || '',
        phoneNumber: row[6] || '',
        status: row[7] || '' // Column H (index 7)
      }));

      return requests;
    } catch (error) {
      console.error('Error getting all requests:', error);
      return [];
    }
  }

  async getRequestsByPhoneNumber(phoneNumber) {
    try {
      const allRequests = await this.getAllRequests();
      return allRequests.filter(request =>
        request.phoneNumber === phoneNumber
      );
    } catch (error) {
      console.error('Error getting requests by phone number:', error);
      return [];
    }
  }

  /**
   * Get all unique phone numbers from submitted requests
   * @returns {Promise<Array<string>>} - Array of unique phone numbers
   */
  async getUniquePhoneNumbers() {
    try {
      const allRequests = await this.getAllRequests();

      // Extract unique phone numbers
      const phoneNumbers = new Set();

      allRequests.forEach(request => {
        if (request.phoneNumber && request.phoneNumber.trim() !== '') {
          phoneNumbers.add(request.phoneNumber.trim());
        }
      });

      const uniquePhones = Array.from(phoneNumbers);
      console.log(`📱 Found ${uniquePhones.length} unique phone numbers`);

      return uniquePhones;
    } catch (error) {
      console.error('Error getting unique phone numbers:', error);
      return [];
    }
  }

  // Helper function to aggressively normalize status strings
  normalizeStatusString(status) {
    if (!status) return '';

    // Remove all types of whitespace (including non-breaking spaces, tabs, etc.)
    let cleaned = String(status)
      .replace(/[\u00A0\u2000-\u200B\u2028\u2029\u3000]/g, ' ') // Replace various unicode spaces with regular space
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .trim();

    // Convert to lowercase for matching
    const lower = cleaned.toLowerCase();

    // Comprehensive status mapping (handles all variations)
    const statusMap = {
      'completed': 'Completed',
      'complete': 'Completed',
      'complet': 'Completed',
      'completd': 'Completed',
      'in progress': 'In Progress',
      'inprogress': 'In Progress',
      'in-progress': 'In Progress',
      'in_progress': 'In Progress',
      'to be contacted': 'To be contacted',
      'tobecontacted': 'To be contacted',
      'to-be-contacted': 'To be contacted',
      'to_be_contacted': 'To be contacted',
      'not started': 'Not started',
      'notstarted': 'Not started',
      'not-started': 'Not started',
      'not_started': 'Not started',
      'needs to be clarified': 'needs to be clarified',
      'needstobeclarified': 'needs to be clarified',
      'needs clarification': 'needs to be clarified',
      'review': 'To be contacted',
      'pending': 'Pending',
      'cancelled': 'Cancelled',
      'canceled': 'Cancelled',
      'canceld': 'Cancelled'
    };

    // Check if we have a mapping
    if (statusMap[lower]) {
      return statusMap[lower];
    }

    // For unknown statuses, capitalize first letter of each word
    return cleaned
      .split(/\s+/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  async updateStatus(rowNumber, newStatus) {
    try {
      if (!this.sheets) {
        await this.authenticate();
      }

      if (!newStatus) {
        throw new Error('Status cannot be empty');
      }

      // Use the same normalization helper function
      const finalStatus = this.normalizeStatusString(newStatus);

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!H${rowNumber}`,
        valueInputOption: 'USER_ENTERED', // Use USER_ENTERED for better compatibility with filters
        resource: {
          values: [[finalStatus]]
        }
      });

      console.log(`✅ Updated status for row ${rowNumber} to "${finalStatus}" (normalized from "${newStatus}")`);
      return { success: true };
    } catch (error) {
      console.error('Error updating status:', error);
      throw error;
    }
  }

  // Normalize all status values in the sheet to fix filtering issues
  // This version updates each row individually to ensure reliability
  async normalizeAllStatuses() {
    try {
      if (!this.sheets) {
        await this.authenticate();
      }

      console.log('🔄 Normalizing all status values in the sheet...');

      // Read all status values from column H (skip header row)
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!H2:H`,
      });

      const statusRows = response.data.values || [];
      if (statusRows.length === 0) {
        console.log('✅ No status values found to normalize');
        return { success: true, normalizedCount: 0, totalRows: 0 };
      }

      console.log(`📊 Found ${statusRows.length} rows with status values`);

      const statusChanges = [];
      let normalizedCount = 0;
      let skippedCount = 0;
      let errorCount = 0;

      // Update each row individually to ensure reliability
      for (let index = 0; index < statusRows.length; index++) {
        const rowNumber = index + 2; // +2 because we start from row 2 (skip header)
        const currentStatus = statusRows[index][0] || '';
        const originalStatus = currentStatus;

        // Skip empty statuses
        if (!currentStatus || currentStatus.trim() === '') {
          skippedCount++;
          continue;
        }

        // Normalize the status
        const normalizedStatus = this.normalizeStatusString(currentStatus);

        // Always update to ensure exact match (removes any hidden characters)
        try {
          await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.spreadsheetId,
            range: `${this.sheetName}!H${rowNumber}`,
            valueInputOption: 'USER_ENTERED', // Use USER_ENTERED for better compatibility with filters
            resource: {
              values: [[normalizedStatus]]
            }
          });

          if (normalizedStatus !== originalStatus) {
            statusChanges.push({
              row: rowNumber,
              from: originalStatus,
              to: normalizedStatus
            });
            normalizedCount++;
          }

          // Small delay to avoid rate limiting
          if ((index + 1) % 10 === 0) {
            await new Promise(resolve => setTimeout(resolve, 100));
            console.log(`⏳ Processed ${index + 1}/${statusRows.length} rows...`);
          }
        } catch (error) {
          errorCount++;
          console.error(`❌ Failed to update row ${rowNumber}:`, error.message);
        }
      }

      console.log(`✅ Successfully normalized ${normalizedCount + statusRows.length - skippedCount - errorCount} status values`);
      console.log(`   - Changed: ${normalizedCount}`);
      console.log(`   - Updated (same value): ${statusRows.length - skippedCount - normalizedCount - errorCount}`);
      console.log(`   - Skipped (empty): ${skippedCount}`);
      console.log(`   - Errors: ${errorCount}`);

      // Log some examples of changes
      if (statusChanges.length > 0) {
        console.log('📋 Example changes:');
        statusChanges.slice(0, 10).forEach(change => {
          console.log(`   Row ${change.row}: "${change.from}" → "${change.to}"`);
        });
      }

      return {
        success: true,
        normalizedCount: normalizedCount,
        totalRows: statusRows.length,
        skippedCount: skippedCount,
        errorCount: errorCount,
        processedCount: statusRows.length - skippedCount - errorCount
      };
    } catch (error) {
      console.error('❌ Error normalizing statuses:', error);
      console.error('Error details:', error.message, error.stack);
      throw error;
    }
  }

  // Force fix all "Completed" statuses to exact match
  async fixCompletedStatuses() {
    try {
      if (!this.sheets) {
        await this.authenticate();
      }

      console.log('🔧 Force fixing all "Completed" statuses...');

      // Read all rows to find "Completed" statuses
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A:H`,
      });

      const rows = response.data.values || [];
      if (rows.length <= 1) {
        return { success: true, fixedCount: 0 };
      }

      const exactMatch = 'Completed'; // Exact case-sensitive match
      let fixedCount = 0;
      const fixes = [];

      // Skip header row
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        const rowNumber = i + 1;
        const currentStatus = row[7] || ''; // Column H is index 7

        // Check if this looks like "completed" (case-insensitive)
        if (currentStatus && currentStatus.toLowerCase().includes('complet')) {
          if (currentStatus !== exactMatch) {
            try {
              // Use userEnteredValue to ensure exact match
              await this.sheets.spreadsheets.values.update({
                spreadsheetId: this.spreadsheetId,
                range: `${this.sheetName}!H${rowNumber}`,
                valueInputOption: 'USER_ENTERED', // Use USER_ENTERED instead of RAW
                resource: {
                  values: [[exactMatch]]
                }
              });
              fixes.push({ row: rowNumber, from: currentStatus, to: exactMatch });
              fixedCount++;
            } catch (error) {
              console.error(`❌ Failed to fix row ${rowNumber}:`, error.message);
            }
          }
        }
      }

      console.log(`✅ Fixed ${fixedCount} "Completed" statuses`);
      if (fixes.length > 0) {
        console.log('📋 Fixed statuses:');
        fixes.slice(0, 10).forEach(fix => {
          console.log(`   Row ${fix.row}: "${fix.from}" → "${fix.to}"`);
        });
      }

      return { success: true, fixedCount };
    } catch (error) {
      console.error('❌ Error fixing completed statuses:', error);
      throw error;
    }
  }

  // Comprehensive fix: Read all statuses and force exact matches for all known statuses
  async forceFixAllStatuses() {
    try {
      if (!this.sheets) {
        await this.authenticate();
      }

      console.log('🔧 Force fixing ALL status values to exact matches...');

      // Define exact status values as they should appear in Google Sheets
      // Must stay in sync with STATUS_OPTIONS / the column H dropdown
      const exactStatuses = {
        'Completed': 'Completed',
        'In Progress': 'In Progress',
        'In progress': 'In Progress', // Normalize to "In Progress"
        'To be contacted': 'To be contacted',
        'Not started': 'Not started',
        'needs to be clarified': 'needs to be clarified'
      };

      // Read all status values
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!H2:H`,
      });

      const statusRows = response.data.values || [];
      if (statusRows.length === 0) {
        return { success: true, fixedCount: 0 };
      }

      let fixedCount = 0;
      const fixes = [];
      const statusMap = new Map();

      // Build a map of all status variations to their exact values
      Object.keys(exactStatuses).forEach(variation => {
        const exact = exactStatuses[variation];
        statusMap.set(variation.toLowerCase().trim(), exact);
        // Also map the exact value to itself
        statusMap.set(exact.toLowerCase().trim(), exact);
      });

      // Process each row
      for (let index = 0; index < statusRows.length; index++) {
        const rowNumber = index + 2;
        const currentStatus = statusRows[index][0] || '';

        if (!currentStatus || currentStatus.trim() === '') {
          continue;
        }

        // Normalize and find exact match
        const normalized = currentStatus.trim().toLowerCase();
        let exactStatus = null;

        // Check if we have a mapping
        if (statusMap.has(normalized)) {
          exactStatus = statusMap.get(normalized);
        } else {
          // Try to match partial strings
          if (normalized.includes('complet')) {
            exactStatus = 'Completed';
          } else if (normalized.includes('in progress') || normalized.includes('inprogress')) {
            exactStatus = 'In Progress';
          } else if (normalized.includes('not started') || normalized.includes('notstarted')) {
            exactStatus = 'Not started';
          } else if (normalized.includes('needs') && normalized.includes('clarif')) {
            exactStatus = 'needs to be clarified';
          } else {
            // For unknown statuses, use the normalized version
            exactStatus = this.normalizeStatusString(currentStatus);
          }
        }

        // Update if different
        if (exactStatus && exactStatus !== currentStatus) {
          try {
            await this.sheets.spreadsheets.values.update({
              spreadsheetId: this.spreadsheetId,
              range: `${this.sheetName}!H${rowNumber}`,
              valueInputOption: 'USER_ENTERED', // Use USER_ENTERED for exact matching
              resource: {
                values: [[exactStatus]]
              }
            });
            fixes.push({ row: rowNumber, from: currentStatus, to: exactStatus });
            fixedCount++;
          } catch (error) {
            console.error(`❌ Failed to fix row ${rowNumber}:`, error.message);
          }
        } else if (exactStatus) {
          // Even if it looks the same, update it to ensure no hidden characters
          try {
            await this.sheets.spreadsheets.values.update({
              spreadsheetId: this.spreadsheetId,
              range: `${this.sheetName}!H${rowNumber}`,
              valueInputOption: 'USER_ENTERED',
              resource: {
                values: [[exactStatus]]
              }
            });
          } catch (error) {
            // Ignore errors for rows that are already correct
          }
        }

        // Small delay to avoid rate limiting
        if ((index + 1) % 20 === 0) {
          await new Promise(resolve => setTimeout(resolve, 200));
          console.log(`⏳ Processed ${index + 1}/${statusRows.length} rows...`);
        }
      }

      console.log(`✅ Force fixed ${fixedCount} status values`);
      if (fixes.length > 0) {
        console.log('📋 Example fixes:');
        fixes.slice(0, 15).forEach(fix => {
          console.log(`   Row ${fix.row}: "${fix.from}" → "${fix.to}"`);
        });
      }

      return { success: true, fixedCount, totalProcessed: statusRows.length };
    } catch (error) {
      console.error('❌ Error force fixing statuses:', error);
      throw error;
    }
  }

  // Diagnostic function to see what status values exist in the sheet
  async getStatusDiagnostics() {
    try {
      if (!this.sheets) {
        await this.authenticate();
      }

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!H2:H`,
      });

      const statusRows = response.data.values || [];
      const statusCounts = {};
      const statusExamples = {};
      const issues = [];

      statusRows.forEach((row, index) => {
        const rowNumber = index + 2;
        const status = row[0] || '';
        const trimmed = String(status).trim();

        if (!trimmed) {
          return;
        }

        // Count occurrences
        const key = trimmed.toLowerCase();
        if (!statusCounts[key]) {
          statusCounts[key] = { count: 0, variations: new Set(), rows: [] };
        }
        statusCounts[key].count++;
        statusCounts[key].variations.add(status);
        statusCounts[key].rows.push(rowNumber);

        // Check for issues
        if (status !== trimmed) {
          issues.push({ row: rowNumber, issue: 'Has leading/trailing whitespace', value: `"${status}"` });
        }
        if (status.toLowerCase() !== trimmed.toLowerCase()) {
          issues.push({ row: rowNumber, issue: 'Case inconsistency', value: status });
        }
      });

      // Build summary
      const summary = Object.keys(statusCounts).map(key => {
        const data = statusCounts[key];
        const normalized = this.normalizeStatusString(key);
        return {
          original: Array.from(data.variations)[0],
          normalized: normalized,
          count: data.count,
          needsNormalization: Array.from(data.variations).some(v => v !== normalized),
          sampleRows: data.rows.slice(0, 5)
        };
      });

      return {
        success: true,
        totalRows: statusRows.length,
        uniqueStatuses: summary.length,
        issues: issues.slice(0, 20), // First 20 issues
        statusBreakdown: summary,
        recommendations: issues.length > 0 ? 'Run /normalize-statuses endpoint to fix issues' : 'All statuses appear normalized'
      };
    } catch (error) {
      console.error('Error getting status diagnostics:', error);
      throw error;
    }
  }

  // Apply professional formatting to the sheet
  async formatSheet() {
    try {
      if (!this.sheets) {
        await this.authenticate();
      }

      console.log('🎨 Applying professional formatting to sheet...');

      // Get sheet info including existing banding and conditional format rules
      const sheetInfo = await this.sheets.spreadsheets.get({
        spreadsheetId: this.spreadsheetId,
      });
      const sheet = sheetInfo.data.sheets.find(s => s.properties.title === this.sheetName);
      if (!sheet) {
        throw new Error(`Sheet "${this.sheetName}" not found`);
      }
      const sheetId = sheet.properties.sheetId;

      // Step 1: Clean up existing banding and conditional formatting so we can re-run safely
      const cleanupRequests = [];

      if (sheet.bandedRanges && sheet.bandedRanges.length > 0) {
        for (const band of sheet.bandedRanges) {
          cleanupRequests.push({ deleteBanding: { bandedRangeId: band.bandedRangeId } });
        }
        console.log(`🧹 Removing ${sheet.bandedRanges.length} existing banded ranges`);
      }

      if (sheet.conditionalFormats && sheet.conditionalFormats.length > 0) {
        for (let i = sheet.conditionalFormats.length - 1; i >= 0; i--) {
          cleanupRequests.push({ deleteConditionalFormatRule: { sheetId: sheetId, index: i } });
        }
        console.log(`🧹 Removing ${sheet.conditionalFormats.length} existing conditional format rules`);
      }

      if (cleanupRequests.length > 0) {
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          resource: { requests: cleanupRequests }
        });
        console.log('✅ Cleanup complete');
      }

      // Colors
      const headerBg = { red: 34/255, green: 120/255, blue: 60/255, alpha: 1 };
      const white = { red: 1, green: 1, blue: 1, alpha: 1 };
      const lightGray = { red: 0.95, green: 0.95, blue: 0.95, alpha: 1 };
      const statusColors = {
        completed: { red: 0.85, green: 0.95, blue: 0.85 },
        inProgress: { red: 1, green: 0.92, blue: 0.8 },
        review: { red: 0.85, green: 0.92, blue: 1 },
        notStarted: { red: 1, green: 0.85, blue: 0.85 },
        clarification: { red: 1, green: 0.97, blue: 0.8 }
      };

      // Step 2: Apply structure (header, widths, borders, center, dropdown)
      const structureRequests = [
        { updateSheetProperties: { properties: { sheetId, gridProperties: { frozenRowCount: 1 } }, fields: 'gridProperties.frozenRowCount' } },
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 8 },
            cell: { userEnteredFormat: { backgroundColor: headerBg, textFormat: { foregroundColor: white, bold: true, fontSize: 11 }, horizontalAlignment: 'CENTER', verticalAlignment: 'MIDDLE', padding: { top: 6, bottom: 6, left: 8, right: 8 } } },
            fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,verticalAlignment,padding)'
          }
        },
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 160 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 1, endIndex: 2 }, properties: { pixelSize: 120 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 2, endIndex: 3 }, properties: { pixelSize: 120 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 3, endIndex: 4 }, properties: { pixelSize: 80 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 4, endIndex: 5 }, properties: { pixelSize: 400 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 5, endIndex: 6 }, properties: { pixelSize: 180 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 6, endIndex: 7 }, properties: { pixelSize: 180 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'COLUMNS', startIndex: 7, endIndex: 8 }, properties: { pixelSize: 150 }, fields: 'pixelSize' } },
        { updateDimensionProperties: { range: { sheetId, dimension: 'ROWS', startIndex: 0, endIndex: 1 }, properties: { pixelSize: 36 }, fields: 'pixelSize' } },
        { repeatCell: { range: { sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 3, endColumnIndex: 4 }, cell: { userEnteredFormat: { horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat.horizontalAlignment' } },
        { repeatCell: { range: { sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 7, endColumnIndex: 8 }, cell: { userEnteredFormat: { horizontalAlignment: 'CENTER' } }, fields: 'userEnteredFormat.horizontalAlignment' } },
        {
          updateBorders: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1000, startColumnIndex: 0, endColumnIndex: 8 },
            top: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
            bottom: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
            left: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
            right: { style: 'SOLID', width: 1, color: { red: 0.8, green: 0.8, blue: 0.8 } },
            innerHorizontal: { style: 'SOLID', width: 1, color: { red: 0.85, green: 0.85, blue: 0.85 } },
            innerVertical: { style: 'SOLID', width: 1, color: { red: 0.85, green: 0.85, blue: 0.85 } }
          }
        },
        {
          setDataValidation: {
            range: { sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 7, endColumnIndex: 8 },
            rule: {
              condition: { type: 'ONE_OF_LIST', values: STATUS_OPTIONS.map(v => ({ userEnteredValue: v })) },
              showCustomUi: true,
              strict: false
            }
          }
        }
      ];

      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        resource: { requests: structureRequests }
      });
      console.log('✅ Structure formatting applied');

      // Step 3: Add banding
      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        resource: { requests: [{ addBanding: { bandedRange: {
          range: { sheetId, startRowIndex: 0, endRowIndex: 1000, startColumnIndex: 0, endColumnIndex: 8 },
          rowProperties: { headerColor: headerBg, firstBandColor: { red: 1, green: 1, blue: 1 }, secondBandColor: lightGray }
        }}}]}
      });
      console.log('✅ Banding applied');

      // Step 4: Add conditional formatting for status colors
      const cfRequests = [
        { status: 'Completed', color: statusColors.completed },
        { status: 'In Progress', color: statusColors.inProgress },
        { status: 'To be contacted', color: { red: 1, green: 0.8, blue: 0.4 } },
        { status: 'Not started', color: statusColors.notStarted },
        { status: 'needs to be clarified', color: statusColors.clarification }
      ].map((item, index) => ({
        addConditionalFormatRule: {
          rule: {
            ranges: [{ sheetId, startRowIndex: 1, endRowIndex: 1000, startColumnIndex: 7, endColumnIndex: 8 }],
            booleanRule: {
              condition: { type: 'TEXT_EQ', values: [{ userEnteredValue: item.status }] },
              format: { backgroundColor: item.color, textFormat: { bold: true } }
            }
          },
          index: index
        }
      }));

      await this.sheets.spreadsheets.batchUpdate({
        spreadsheetId: this.spreadsheetId,
        resource: { requests: cfRequests }
      });
      console.log('✅ Conditional formatting applied');

      console.log('🎉 All formatting applied successfully!');
      return {
        success: true,
        applied: [
          'Header: dark green background, white bold text, frozen',
          'Column widths optimized',
          'Alternating row colors (gray/white banding)',
          'Status dropdown with To be contacted option for all rows',
          'Status conditional formatting (green/orange/blue/red/yellow)',
          'Station & Status columns centered',
          'Light borders on all cells'
        ]
      };
    } catch (error) {
      console.error('❌ Error applying formatting:', error.message);
      throw error;
    }
  }
}

module.exports = new GoogleSheetsService();