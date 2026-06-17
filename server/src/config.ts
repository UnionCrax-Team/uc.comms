import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function envNumber(name: string, fallback: number) {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  port: envNumber('PORT', 3000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  appBaseUrl: process.env.APP_BASE_URL ?? 'http://localhost:3000',
  trustProxy: process.env.TRUST_PROXY === 'true',
  dataDir: process.env.DATA_DIR ?? path.resolve(process.cwd(), 'data'),
  uploadsDir: path.join(process.env.DATA_DIR ?? path.resolve(process.cwd(), 'data'), 'uploads'),
  adminUsername: process.env.ADMIN_USERNAME ?? 'admin',
  adminPassword: process.env.ADMIN_PASSWORD ?? '',
  signupDisabled: process.env.SIGNUP_DISABLED !== 'false',
  inviteCode: process.env.INVITE_CODE ?? '',
  maxUploadMb: envNumber('MAX_UPLOAD_MB', 20),
  sessionSecret: process.env.SESSION_SECRET ?? (process.env.NODE_ENV === 'production' ? '' : 'dev-session-secret-change-me'),
  get cookieSecure() {
    return process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === 'true' : this.appBaseUrl.startsWith('https://');
  },
  publicDistDir: path.resolve(__dirname, '../../web/dist')
};
