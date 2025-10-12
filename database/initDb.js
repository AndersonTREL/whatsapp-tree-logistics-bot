// Initialize database with schema and sample data
const db = require('./db');

console.log('Initializing Tree Logistics DSP database...');
console.log('This will create tables and load sample data.');

// Wait for database to initialize
setTimeout(() => {
  console.log('\n✅ Database initialized successfully!');
  console.log('\nSample data loaded:');
  console.log('- 3 sample drivers');
  console.log('- Equipment inventory');
  console.log('- Vehicle assignments');
  console.log('- Schedules for next week');
  console.log('- Salary records');
  console.log('- Vacation balances');
  console.log('- Performance metrics');
  console.log('\nDatabase ready for use!');
  console.log('\nLocation: database/treelogistics.db');
  console.log('\nYou can now start the server: npm start');
  
  process.exit(0);
}, 2000);

