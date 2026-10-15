import { query } from './db.js';
import { config } from './config.js';
import { hashPassword } from './lib/crypto.js';
import { seedDemo } from './seed.js';

// First-boot setup: create the first admin from BOOTSTRAP_ADMIN_* when no admin exists,
// and load demo data when SEED_DEMO=1 and the database has no courses yet. Idempotent.
export async function bootstrap() {
  const { rows: [{ n }] } = await query(`SELECT count(*)::int AS n FROM users WHERE role='admin'`);
  if (n === 0) {
    const { email, password, name } = config.bootstrapAdmin;
    if (!email || !password) {
      console.warn('no admin account exists and BOOTSTRAP_ADMIN_EMAIL/PASSWORD are not set');
    } else {
      const [first, ...rest] = name.split(' ');
      await query(`INSERT INTO users (email, password_hash, role, first_name, last_name, must_change_password) VALUES ($1,$2,'admin',$3,$4,true)`,
        [email.toLowerCase(), await hashPassword(password), first, rest.join(' ')]);
      await query(`INSERT INTO staff_profiles (user_id, title, public) SELECT id, 'Owner', false FROM users WHERE lower(email)=$1`, [email.toLowerCase()]);
      console.log(`created first admin ${email}`);
    }
  }
  if (config.seedDemo) {
    const { rows: [{ c }] } = await query('SELECT count(*)::int AS c FROM courses');
    if (c === 0) { await seedDemo(); console.log('loaded demo data'); }
  }
}
