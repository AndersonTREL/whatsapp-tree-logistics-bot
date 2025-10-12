const googleSheetsService = require('./googleSheets');
const whatsappService = require('./whatsapp');

class StatusMonitor {
  constructor() {
    this.processedRequests = new Set(); // Track already notified requests
  }

  async checkAndNotify() {
    try {
      console.log('Checking for completed requests...');

      // Get all requests with 'done' status
      const completedRequests = await googleSheetsService.getRequestsWithStatus('done');

      for (const request of completedRequests) {
        const requestKey = `${request.rowId}-${request.status}`;
        
        // Skip if already processed
        if (this.processedRequests.has(requestKey)) {
          continue;
        }

        // Send completion notification
        await whatsappService.sendCompletionNotification(
          request.phoneNumber,
          request.firstName
        );

        // Mark as notified
        this.processedRequests.add(requestKey);

        // Optional: Update status to 'notified' to track
        await googleSheetsService.updateStatus(request.rowNumber, 'notified');

        console.log(`Sent completion notification for request: ${request.rowId}`);
      }

      if (completedRequests.length === 0) {
        console.log('No new completed requests found.');
      }

      return { processed: completedRequests.length };
    } catch (error) {
      console.error('Error in status monitor:', error);
      throw error;
    }
  }
}

module.exports = new StatusMonitor();

