const { google } = require('googleapis');
const path = require('path');

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
                      columnCount: 7
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
            values: [
              ['Timestamp', 'First Name', 'Last Name', 'Station', 'Request/Question', 'Request ID', 'Phone Number', 'Status']
            ]
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

  async addRequest(requestData) {
    try {
      console.log(`📊 Adding request to Google Sheets - Sheet ID: ${this.spreadsheetId}, Sheet Name: ${this.sheetName}`);
      
      await this.ensureSheetExists();

      // Get current row count to generate Row ID
      console.log('📊 Getting current row count...');
      const currentData = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A:A`,
      });

      const rowCount = currentData.data.values ? currentData.data.values.length : 1;
      const rowId = `REQ-${Date.now()}-${rowCount}`;
      console.log(`📊 Current row count: ${rowCount}, Generated Row ID: ${rowId}`);

      // Structure with 6 required fields + Request ID + Phone Number
      const values = [
        [
          requestData.timestamp,           // A: Timestamp
          requestData.firstName,           // B: First Name
          requestData.lastName,            // C: Last Name
          requestData.station,             // D: Station
          requestData.request,             // E: Request/Question
          rowId,                           // F: Request ID
          requestData.phoneNumber          // G: Phone Number
        ],
      ];

      console.log(`📝 Appending data to sheet "${this.sheetName}"...`);
      const response = await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A:G`,
        valueInputOption: 'RAW',
        resource: { values },
      });

      console.log('✅ Request successfully added to Google Sheets');
      console.log('📊 Response details:', {
        spreadsheetId: response.data.spreadsheetId,
        updatedRange: response.data.updates?.updatedRange,
        updatedRows: response.data.updates?.updatedRows
      });
      
      return { success: true, rowId };
    } catch (error) {
      console.error('❌ Error adding request to Google Sheets:');
      console.error('Error message:', error.message);
      console.error('Error code:', error.code);
      console.error('Error details:', error.errors || error.response?.data);
      
      // Provide more specific error messages
      if (error.code === 401) {
        throw new Error('Authentication failed. Please check your Google credentials.');
      } else if (error.code === 403) {
        throw new Error('Permission denied. The service account does not have access to the spreadsheet.');
      } else if (error.code === 404) {
        throw new Error(`Spreadsheet or sheet not found. Please check the spreadsheet ID (${this.spreadsheetId}) and sheet name (${this.sheetName}).`);
      } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
        throw new Error('Network error. Cannot reach Google Sheets API. Please check your internet connection.');
      }
      
      throw error;
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
      'inprogress': 'In Progress',
      'not started': 'Not started',
      'notstarted': 'Not started',
      'not-started': 'Not started',
      'not_started': 'Not started',
      'needs to be clarified': 'needs to be clarified',
      'needstobeclarified': 'needs to be clarified',
      'needs clarification': 'needs to be clarified',
      'review': 'Review',
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

  async updateRequestFeedback(rowNumber, rating, feedbackText) {
    try {
      if (!this.sheets) {
        await this.authenticate();
      }

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!M${rowNumber}`,
        valueInputOption: 'RAW',
        resource: {
          values: [[`${rating} - ${feedbackText}`]]
        }
      });

      console.log(`✅ Updated feedback for row ${rowNumber}: ${rating} - ${feedbackText}`);
      return { success: true };
    } catch (error) {
      console.error('Error updating feedback:', error);
      throw error;
    }
  }

  async cleanupDuplicateFeedback() {
    try {
      const allRequests = await this.getAllRequests();
      let cleanedRows = 0;

      // This is a simplified cleanup - in a real scenario you'd implement
      // more sophisticated duplicate detection logic
      console.log(`📊 Found ${allRequests.length} total requests`);
      
      return {
        success: true,
        totalRows: allRequests.length,
        cleanedRows: cleanedRows
      };
    } catch (error) {
      console.error('Error cleaning up feedback:', error);
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
      const exactStatuses = {
        'Completed': 'Completed',
        'In Progress': 'In Progress',
        'In progress': 'In Progress', // Normalize to "In Progress"
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
}

module.exports = new GoogleSheetsService();