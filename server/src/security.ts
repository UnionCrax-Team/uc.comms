import crypto from 'node:crypto';
import { config } from './config.js';

export function hashSessionToken(token: string) {
  return crypto.createHmac('sha256', config.sessionSecret).update(token).digest('hex');
}

export function randomSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}
