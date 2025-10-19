const { google } = require('googleapis');
const path = require('path');

class GoogleSheetsService {
  constructor() {
    this.sheets = null;
    this.spreadsheetId = '1DwBYrHLGCpFpqbU6r5DUL6fyzJS8urN87tFgKAmJssQ'; // Your new Google Sheet ID
    this.sheetName = 'Driver Requests'; // Name of the sheet tab
  }

  async authenticate() {
    try {
      let auth;
      
      // Check if we have JSON credentials from environment variable
      if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
        const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
        auth = new google.auth.GoogleAuth({
          credentials: credentials,
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
      } else {
        // Fallback to file-based credentials
        auth = new google.auth.GoogleAuth({
          keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
          scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
      }

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

        // Add headers
        await this.sheets.spreadsheets.values.update({
          spreadsheetId: this.spreadsheetId,
          range: `${this.sheetName}!A1:G1`,
          valueInputOption: 'RAW',
          resource: {
            values: [
              ['Timestamp', 'First Name', 'Last Name', 'Station', 'Request/Question', 'Request ID', 'Phone Number']
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
      await this.ensureSheetExists();

      // Get current row count to generate Row ID
      const currentData = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A:A`,
      });

      const rowCount = currentData.data.values ? currentData.data.values.length : 1;
      const rowId = `REQ-${Date.now()}-${rowCount}`;

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

      const response = await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A:G`,
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

  async getAllRequests() {
    try {
      if (!this.sheets) {
        await this.authenticate();
      }

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A:G`,
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
        phoneNumber: row[6] || ''
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

  async updateStatus(rowNumber, newStatus) {
    try {
      if (!this.sheets) {
        await this.authenticate();
      }

      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!I${rowNumber}`,
        valueInputOption: 'RAW',
        resource: {
          values: [[newStatus]]
        }
      });

      console.log(`✅ Updated status for row ${rowNumber} to ${newStatus}`);
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
}

module.exports = new GoogleSheetsService();