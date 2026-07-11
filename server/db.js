const { Pool, types } = require('pg');

// Return DATE columns as 'YYYY-MM-DD' strings, not JS Date objects
types.setTypeParser(1082, v => v);

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: +(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || 'texrec',
  user: process.env.PGUSER || 'texrec',
  password: process.env.PGPASSWORD || 'texrec',
});

module.exports = { pool };
