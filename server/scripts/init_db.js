const fs = require('fs');
const path = require('path');
const db = require('../src/config/db');

async function init() {
  try {
    const sqlPath = path.join(__dirname, '../database/init.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    console.log('Running init.sql...');
    await db.query(sql);
    console.log("Database initialized successfully.");
    process.exit(0);
  } catch (err) {
    console.error("Error initializing database:", err);
    process.exit(1);
  }
}

init();
