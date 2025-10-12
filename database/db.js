const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class Database {
  constructor() {
    const dbPath = path.join(__dirname, 'treelogistics.db');
    this.db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
      } else {
        console.log('Connected to SQLite database');
        this.initialize();
      }
    });
  }

  async initialize() {
    try {
      const schemaPath = path.join(__dirname, 'schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf8');
      
      await this.run(schema);
      console.log('Database schema initialized');
      
      // Load seed data
      const seedPath = path.join(__dirname, 'seedData.sql');
      if (fs.existsSync(seedPath)) {
        const seedData = fs.readFileSync(seedPath, 'utf8');
        await this.run(seedData);
        console.log('Sample data loaded');
      }
    } catch (error) {
      console.error('Error initializing database:', error);
    }
  }

  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  }

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Driver queries
  async getDriverByPhone(phoneNumber) {
    return this.get('SELECT * FROM drivers WHERE phone_number = ?', [phoneNumber]);
  }

  async createDriver(driverData) {
    const { phone_number, first_name, last_name, employee_id } = driverData;
    return this.run(
      'INSERT INTO drivers (phone_number, first_name, last_name, employee_id) VALUES (?, ?, ?, ?)',
      [phone_number, first_name, last_name, employee_id]
    );
  }

  // Equipment queries
  async getAvailableEquipment(itemType) {
    return this.all(
      'SELECT * FROM equipment_inventory WHERE item_type = ? AND status = "available"',
      [itemType]
    );
  }

  async getDriverEquipment(driverId) {
    return this.all(
      'SELECT * FROM equipment_inventory WHERE assigned_to_driver_id = ? AND status = "assigned"',
      [driverId]
    );
  }

  async createEquipmentRequest(requestData) {
    const { driver_id, item_type, model_preference, quantity, reason } = requestData;
    return this.run(
      'INSERT INTO equipment_requests (driver_id, item_type, model_preference, quantity, reason) VALUES (?, ?, ?, ?, ?)',
      [driver_id, item_type, model_preference, quantity, reason]
    );
  }

  // Schedule queries
  async getDriverSchedule(driverId, startDate, endDate) {
    return this.all(
      `SELECT s.*, v.vehicle_number, v.vehicle_type 
       FROM shifts s 
       LEFT JOIN vehicles v ON s.vehicle_id = v.id 
       WHERE s.driver_id = ? AND s.shift_date BETWEEN ? AND ? 
       ORDER BY s.shift_date`,
      [driverId, startDate, endDate]
    );
  }

  async getTodayShift(driverId) {
    const today = new Date().toISOString().split('T')[0];
    return this.get(
      `SELECT s.*, v.vehicle_number, v.vehicle_type 
       FROM shifts s 
       LEFT JOIN vehicles v ON s.vehicle_id = v.id 
       WHERE s.driver_id = ? AND s.shift_date = ?`,
      [driverId, today]
    );
  }

  // Salary queries
  async getDriverSalary(driverId, month) {
    return this.get(
      'SELECT * FROM salary_records WHERE driver_id = ? AND month = ?',
      [driverId, month]
    );
  }

  async getLatestSalary(driverId) {
    return this.get(
      'SELECT * FROM salary_records WHERE driver_id = ? ORDER BY month DESC LIMIT 1',
      [driverId]
    );
  }

  // Vacation queries
  async getVacationBalance(driverId, year) {
    return this.get(
      'SELECT * FROM vacation_balance WHERE driver_id = ? AND year = ?',
      [driverId, year]
    );
  }

  async createLeaveRequest(requestData) {
    const { driver_id, leave_type, start_date, end_date, days_count, reason } = requestData;
    return this.run(
      'INSERT INTO leave_requests (driver_id, leave_type, start_date, end_date, days_count, reason) VALUES (?, ?, ?, ?, ?, ?)',
      [driver_id, leave_type, start_date, end_date, days_count, reason]
    );
  }

  // Vehicle queries
  async getDriverVehicle(driverId) {
    return this.get(
      'SELECT * FROM vehicles WHERE assigned_to_driver_id = ?',
      [driverId]
    );
  }

  async createVehicleIncident(incidentData) {
    const { vehicle_id, driver_id, incident_type, description, severity, photo_url, location } = incidentData;
    return this.run(
      'INSERT INTO vehicle_incidents (vehicle_id, driver_id, incident_type, description, severity, photo_url, location) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [vehicle_id, driver_id, incident_type, description, severity, photo_url, location]
    );
  }

  // Performance queries
  async getDriverPerformance(driverId, days = 10) {
    return this.all(
      `SELECT * FROM performance_metrics 
       WHERE driver_id = ? 
       ORDER BY date DESC 
       LIMIT ?`,
      [driverId, days]
    );
  }

  async getDriverPerformanceSummary(driverId) {
    return this.get(
      `SELECT 
        AVG(success_rate) as avg_success_rate,
        AVG(packages_per_hour) as avg_packages_per_hour,
        AVG(customer_rating) as avg_customer_rating,
        AVG(photo_compliance) as avg_photo_compliance,
        AVG(safety_score) as avg_safety_score,
        SUM(packages_delivered) as total_packages,
        COUNT(*) as days_worked
       FROM performance_metrics 
       WHERE driver_id = ? AND date >= date('now', '-30 days')`,
      [driverId]
    );
  }

  // Conversation context
  async getConversationContext(phoneNumber) {
    return this.get(
      'SELECT * FROM conversation_context WHERE phone_number = ? AND conversation_state = "active"',
      [phoneNumber]
    );
  }

  async saveConversationContext(phoneNumber, contextData, lastMessage) {
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 30); // 30 minute expiry
    
    return this.run(
      `INSERT OR REPLACE INTO conversation_context 
       (phone_number, context_data, last_message, conversation_state, expires_at, updated_at) 
       VALUES (?, ?, ?, 'active', ?, CURRENT_TIMESTAMP)`,
      [phoneNumber, JSON.stringify(contextData), lastMessage, expiresAt.toISOString()]
    );
  }

  async clearConversationContext(phoneNumber) {
    return this.run(
      'UPDATE conversation_context SET conversation_state = "closed" WHERE phone_number = ?',
      [phoneNumber]
    );
  }
}

module.exports = new Database();

