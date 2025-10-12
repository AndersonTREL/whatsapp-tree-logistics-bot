const { google } = require('googleapis');
const path = require('path');

class GoogleSheetsService {
  constructor() {
    this.sheets = null;
    this.spreadsheetId = process.env.GOOGLE_SHEET_ID;
    this.sheetName = 'Driver Requests'; // Name of the sheet tab
  }

  async authenticate() {
    try {
      const auth = new google.auth.GoogleAuth({
        keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
      });

      const client = await auth.getClient();
      this.sheets = google.sheets({ version: 'v4', auth: client });
      
      return this.sheets;
    } catch (error) {
      console.error('Error authenticating with Google Sheets:', error);
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
        // Create the sheet with headers
        await this.sheets.spreadsheets.batchUpdate({
          spreadsheetId: this.spreadsheetId,
          resource: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title: this.sheetName,
                  },
                },
              },
            ],
          },
        });

        // Add headers - MATCH USER'S ACTUAL GOOGLE SHEET STRUCTURE
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `${this.sheetName}!A1:M1`,
          valueInputOption: 'RAW',
          resource: {
            values: [
              [
                'Timestamp',        // A
                'First Name',       // B
                'Last Name',        // C
                'Phone Number',     // D
                'Station',          // E ← Station column as per user's sheet
                'Category',         // F
                'Priority',         // G
                'Message',          // H
                'Status',           // I
                'Assigned To',      // J
                'Resolved At',      // K
                'Row ID',           // L
                'Feedback'          // M
              ],
            ],
          },
        });

        console.log('Sheet created with headers');
      }
    } catch (error) {
      console.error('Error ensuring sheet exists:', error);
      throw error;
    }
  }

  async addRequest(requestData) {
    try {
      await this.ensureSheetExists();

      // Get current row count to generate Row ID
      const currentData = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A:A`,
      });

      const rowCount = currentData.data.values ? currentData.data.values.length : 1;
      const rowId = `REQ-${Date.now()}-${rowCount}`;

      // MATCH USER'S ACTUAL GOOGLE SHEET STRUCTURE - ALL COLUMNS FILLED CORRECTLY
      const values = [
        [
          requestData.timestamp,           // A: Timestamp
          requestData.firstName,           // B: First Name
          requestData.lastName,            // C: Last Name
          requestData.phoneNumber,         // D: Phone Number
          requestData.station || '',       // E: Station ← Correct position as per user's sheet
          requestData.category,            // F: Category
          requestData.priority,            // G: Priority
          requestData.message,             // H: Message
          requestData.status,              // I: Status
          requestData.assignedTo || '',    // J: Assigned To
          requestData.resolvedAt || '',    // K: Resolved At
          rowId,                          // L: Row ID
          requestData.feedback || ''       // M: Feedback
        ],
      ];

      const response = await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A:M`,
        valueInputOption: 'RAW',
        resource: { values },
      });

      console.log('Request added to Google Sheets:', response.data);
      return { success: true, rowId };
    } catch (error) {
      console.error('Error adding request to Google Sheets:', error);
      throw error;
    }
  }

  async getRequestsWithStatus(status) {
    try {
      if (!this.sheets) {
        await this.authenticate();
      }

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A2:M`, // Skip header row, include all columns A-M
      });

      const rows = response.data.values || [];
      
      return rows
        .map((row, index) => ({
          rowNumber: index + 2, // +2 because we skip header and array is 0-indexed
          timestamp: row[0] || '',      // A: Timestamp
          firstName: row[1] || '',      // B: First Name
          lastName: row[2] || '',       // C: Last Name
          phoneNumber: row[3] || '',    // D: Phone Number
          station: row[4] || '',        // E: Station
          category: row[5] || '',       // F: Category
          priority: row[6] || '',       // G: Priority
          message: row[7] || '',        // H: Message
          status: row[8] || '',         // I: Status
          assignedTo: row[9] || '',     // J: Assigned To
          resolvedAt: row[10] || '',    // K: Resolved At
          rowId: row[11] || '',         // L: Row ID
          feedback: row[12] || ''       // M: Feedback
        }))
        .filter(row => row.status?.toLowerCase() === status.toLowerCase());
    } catch (error) {
      console.error('Error getting requests with status:', error);
      throw error;
    }
  }

  async updateStatus(rowNumber, newStatus) {
    try {
      if (!this.sheets) {
        await this.authenticate();
      }

      // Update status (Column I in our structure)
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!I${rowNumber}`, // Column I is status (as per user's sheet structure)
        valueInputOption: 'RAW',
        resource: {
          values: [[newStatus]],
        },
      });

      // If marking as done, also update the resolved timestamp
      if (newStatus === 'done' || newStatus === 'notified') {
        const now = new Date();
        const europeanTimestamp = now.toLocaleString('en-GB', {
          day: '2-digit',
          month: '2-digit', 
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false
        });

        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `${this.sheetName}!K${rowNumber}`, // Column K is Resolved At (as per user's sheet structure)
          valueInputOption: 'RAW',
          resource: {
            values: [[europeanTimestamp]],
          },
        });

        console.log(`Updated row ${rowNumber} status to: ${newStatus} and resolved at: ${europeanTimestamp}`);
      } else {
        console.log(`Updated row ${rowNumber} status to: ${newStatus}`);
      }

      return { success: true };
    } catch (error) {
      console.error('Error updating status:', error);
      throw error;
    }
  }

  async getRequestsByPhoneNumber(phoneNumber) {
    try {
      if (!this.sheets) {
        await this.authenticate();
      }

      // Get all data from the sheet
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A:L`,
      });

      const rows = response.data.values;
      if (!rows || rows.length <= 1) {
        return [];
      }

      // Filter requests by phone number
      return rows.slice(1).map((row, index) => ({
        rowNumber: index + 2, // +2 because we skip header and arrays are 0-indexed
        timestamp: row[0] || '',
        firstName: row[1] || '',
        lastName: row[2] || '',
        phoneNumber: row[3] || '',
        category: row[4] || '',
        priority: row[5] || '',
        message: row[6] || '',
        status: row[7] || '',
        assignedTo: row[8] || '',
        resolvedAt: row[9] || '',
        station: row[10] || '',
        rowId: row[11] || ''
      }))
      .filter(request => 
        request.phoneNumber && 
        (request.phoneNumber.includes(phoneNumber) || phoneNumber.includes(request.phoneNumber))
      );

    } catch (error) {
      console.error('Error getting requests by phone number:', error);
      throw error;
    }
  }

  async updateCategoryAndPriority(phoneNumber, requestId, newCategory, newPriority) {
    try {
      if (!this.sheets) {
        await this.authenticate();
      }

      // Get all requests to find the matching one
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A2:K`,
      });

      const rows = response.data.values || [];
      
      // Find the row with matching phone number and request ID
      let rowNumber = null;
      for (let i = 0; i < rows.length; i++) {
        const rowPhoneNumber = rows[i][3] || ''; // Column D (index 3)
        const rowRequestId = rows[i][10] || ''; // Column K (index 10)
        
        if (rowPhoneNumber === phoneNumber || rowRequestId === requestId) {
          rowNumber = i + 2; // +2 because we skip header and array is 0-indexed
          break;
        }
      }

      if (!rowNumber) {
        console.log(`Request not found for phone ${phoneNumber} and ID ${requestId}`);
        return { success: false, message: 'Request not found' };
      }

      // Update both category (column E) and priority (column F)
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!E${rowNumber}:F${rowNumber}`,
        valueInputOption: 'RAW',
        resource: {
          values: [[newCategory, newPriority]],
        },
      });

      console.log(`Updated row ${rowNumber} category to: ${newCategory} and priority to: ${newPriority}`);
      return { success: true };
    } catch (error) {
      console.error('Error updating category and priority:', error);
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
        range: `${this.sheetName}!A2:M`, // Skip header row, include all columns A-M
      });

      const rows = response.data.values || [];
      
      const requests = rows.map((row, index) => ({
        rowNumber: index + 2, // +2 because we skip header and array is 0-indexed
        timestamp: row[0] || '',      // A: Timestamp
        firstName: row[1] || '',      // B: First Name
        lastName: row[2] || '',       // C: Last Name
        phoneNumber: row[3] || '',    // D: Phone Number
        station: row[4] || '',        // E: Station
        category: row[5] || '',       // F: Category
        priority: row[6] || '',       // G: Priority
        message: row[7] || '',        // H: Message
        status: row[8] || '',         // I: Status
        assignedTo: row[9] || '',     // J: Assigned To
        resolvedAt: row[10] || '',    // K: Resolved At
        rowId: row[11] || '',         // L: Row ID
        feedback: row[12] || ''       // M: Feedback
      }));

      // Sort by timestamp (newest first)
      return requests.sort((a, b) => {
        // Convert timestamps to Date objects for comparison
        const dateA = new Date(a.timestamp);
        const dateB = new Date(b.timestamp);
        return dateB - dateA; // Newest first
      });
    } catch (error) {
      console.error('Error getting all requests:', error);
      throw error;
    }
  }

  async markRequestComplete(rowId) {
    try {
      const requests = await this.getAllRequests();
      const request = requests.find(r => r.rowId === rowId);
      
      if (request) {
        await this.updateStatus(request.rowNumber, 'done');
        return { success: true };
      } else {
        throw new Error('Request not found');
      }
    } catch (error) {
      console.error('Error marking request complete:', error);
      throw error;
    }
  }

  // Update request with feedback in the same row
  async updateRequestFeedback(rowNumber, rating, feedbackText) {
    try {
      if (!this.sheets) {
        await this.authenticate();
      }

      // Update the feedback column (Column M for feedback)
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!M${rowNumber}`,
        valueInputOption: 'RAW',
        resource: {
          values: [[`${rating} - ${feedbackText}`]],
        },
      });

      console.log(`Updated row ${rowNumber} with feedback: ${feedbackText}`);
      return { success: true };
    } catch (error) {
      console.error('Error updating request feedback:', error);
      throw error;
    }
  }

  // Clean up duplicate feedback rows
  async cleanupDuplicateFeedback() {
    try {
      if (!this.sheets) {
        await this.authenticate();
      }

      // Get all data
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A2:M`,
      });

      const rows = response.data.values || [];
      const cleanedRows = [];
      const processedRequests = new Set();

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const category = row[4]; // Column E
        const phoneNumber = row[3]; // Column D
        const timestamp = row[0]; // Column A

        // Skip feedback rows that have a corresponding request
        if (category === 'Feedback') {
          // Check if there's a corresponding request for this phone number
          const hasCorrespondingRequest = rows.some((otherRow, otherIndex) => 
            otherIndex !== i && 
            otherRow[3] === phoneNumber && 
            otherRow[4] !== 'Feedback' &&
            new Date(otherRow[0]) < new Date(timestamp)
          );
          
          if (hasCorrespondingRequest) {
            console.log(`Skipping duplicate feedback row ${i + 2}`);
            continue; // Skip this feedback row
          }
        }

        cleanedRows.push(row);
      }

      // Clear the sheet and write cleaned data
      await this.sheets.spreadsheets.values.clear({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A2:M`,
      });

      if (cleanedRows.length > 0) {
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `${this.sheetName}!A2:M`,
          valueInputOption: 'RAW',
          resource: {
            values: cleanedRows,
          },
        });
      }

      console.log(`Cleaned up duplicate feedback rows. Kept ${cleanedRows.length} rows.`);
      return { success: true, cleanedRows: cleanedRows.length };
    } catch (error) {
      console.error('Error cleaning up duplicate feedback:', error);
      throw error;
    }
  }

  // CLEAN GOOGLE SHEETS - NO SCATTERED QUESTIONS
}

module.exports = new GoogleSheetsService();

