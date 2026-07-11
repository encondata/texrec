// Create or update a portal account (upsert by email).
// Usage: node server/create-admin.js <email> <password> [name] [role]
//        role: admin (default) | staff | instructor
const crypto = require('crypto');
const { pool } = require('./db');

const [email, password, name, role] = process.argv.slice(2);
if (!email || !password || (role && !['superadmin', 'admin', 'staff', 'instructor'].includes(role))) {
  console.error('Usage: node server/create-admin.js <email> <password> [name] [role: superadmin|admin|staff|instructor]');
  process.exit(1);
}

const salt = crypto.randomBytes(16).toString('hex');
const hash = `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;

pool.query(
  `INSERT INTO admin_users (email, name, password_hash, role) VALUES ($1, $2, $3, $4)
   ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name,
     password_hash = EXCLUDED.password_hash, role = EXCLUDED.role
   RETURNING id, email, name, role`,
  [email.toLowerCase(), name || email.split('@')[0], hash, role || 'admin']
).then(({ rows: [a] }) => {
  console.log(`Account ready: ${a.name} <${a.email}> — role ${a.role} (id ${a.id})`);
  return pool.end();
}).catch(e => { console.error(e.message); process.exit(1); });
