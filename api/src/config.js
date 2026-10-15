const env = process.env;

function required(name) {
  if (!env[name]) throw new Error(`missing required env var ${name}`);
  return env[name];
}

export const config = {
  port: Number(env.PORT) || 3000,
  isProd: env.NODE_ENV === 'production',
  appSecret: required('APP_SECRET'),
  publicUrl: (env.PUBLIC_URL || 'http://localhost').replace(/\/$/, ''),
  sessionDays: Number(env.SESSION_DAYS) || 14,
  s3: {
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION || 'us-east-1',
    accessKey: env.S3_ACCESS_KEY,
    secretKey: env.S3_SECRET_KEY,
    bucket: env.S3_BUCKET || 'texrec',
  },
  bootstrapAdmin: {
    email: env.BOOTSTRAP_ADMIN_EMAIL,
    password: env.BOOTSTRAP_ADMIN_PASSWORD,
    name: env.BOOTSTRAP_ADMIN_NAME || 'TexRec Admin',
  },
  seedDemo: env.SEED_DEMO === '1',
};
