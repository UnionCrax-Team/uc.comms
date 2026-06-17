import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';
import { db } from './db.js';
import { hashSessionToken, randomSessionToken } from './security.js';
import type { UserRecord } from './types.js';
import { config } from './config.js';

export const SESSION_COOKIE = 'uc_session';

export const registerSchema = z.object({
  username: z.string().trim().min(3).max(32).regex(/^[a-zA-Z0-9_.-]+$/),
  displayName: z.string().trim().min(1).max(64),
  password: z.string().min(8).max(128),
  inviteCode: z.string().trim().max(128).optional()
});

function rowToUser(row: Record<string, unknown>): UserRecord {
  return {
    id: row.id as string,
    username: row.username as string,
    displayName: row.display_name as string,
    role: row.role as 'admin' | 'member',
    avatarColor: row.avatar_color as string,
    discordId: (row.discord_id as string) ?? null,
    createdAt: row.created_at as string
  };
}

export function createUser(username: string, displayName: string, password: string, role: 'admin' | 'member' = 'member') {
  const id = cryptoRandomId();
  const now = new Date().toISOString();
  const avatarColor = pickAvatarColor(username);

  db.prepare(`
    INSERT INTO users (id, username, display_name, password_hash, role, avatar_color, discord_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, username, displayName, bcrypt.hashSync(password, 12), role, avatarColor, null, now);

  return getUserById(id)!;
}

export function getUserByUsername(username: string) {
  const row = db.prepare('SELECT * FROM users WHERE username = ?').get(username) as Record<string, unknown> | undefined;
  return row ? rowToUser(row) : undefined;
}

export function getUserById(id: string) {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? rowToUser(row) : undefined;
}

export function verifyPassword(username: string, password: string) {
  const user = getUserByUsername(username);
  if (!user) return undefined;

  const row = db.prepare('SELECT password_hash FROM users WHERE username = ?').get(username) as { password_hash: string } | undefined;
  if (!row || !bcrypt.compareSync(password, row.password_hash)) return undefined;

  return user;
}

export function createSession(userId: string) {
  const token = randomSessionToken();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  db.prepare(`
    INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
    VALUES (?, ?, ?, ?)
  `).run(hashSessionToken(token), userId, now.toISOString(), expiresAt.toISOString());

  return { token, expiresAt };
}

export function getUserFromSessionToken(token: string | undefined) {
  if (!token || !config.sessionSecret) return undefined;

  const row = db.prepare(`
    SELECT u.*
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?
  `).get(hashSessionToken(token), new Date().toISOString()) as Record<string, unknown> | undefined;

  return row ? rowToUser(row) : undefined;
}

export function deleteSession(token: string | undefined) {
  if (!token) return;
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashSessionToken(token));
}

export function getSessionFromRequest(request: Request) {
  return typeof request.cookies?.[SESSION_COOKIE] === 'string' ? request.cookies[SESSION_COOKIE] : undefined;
}

export function requireAuth(request: Request, response: Response, next: NextFunction) {
  const user = getUserFromSessionToken(getSessionFromRequest(request));

  if (!user) {
    response.status(401).json({ error: 'Authentication required.' });
    return;
  }

  request.user = user;
  next();
}

export function requireAdmin(request: Request, response: Response, next: NextFunction) {
  if (request.user?.role !== 'admin') {
    response.status(403).json({ error: 'Admin permission required.' });
    return;
  }

  next();
}

export function consumeInviteCode(code: string | undefined) {
  if (!code) return false;

  const row = db.prepare('SELECT * FROM invite_codes WHERE code_hash = ? AND (expires_at IS NULL OR expires_at > ?)').get(
    hashSessionToken(code),
    new Date().toISOString()
  ) as { id: string; uses: number; max_uses: number } | undefined;

  if (!row || row.uses >= row.max_uses) return false;

  db.prepare('UPDATE invite_codes SET uses = uses + 1 WHERE id = ?').run(row.id);
  return true;
}

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'none' as const,
    path: '/',
    maxAge: 30 * 24 * 60 * 60 * 1000
  };
}

function pickAvatarColor(seed: string) {
  const colors = ['#7c3aed', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#14b8a6'];
  let hash = 0;

  for (const char of seed) {
    hash = (hash * 31 + char.charCodeAt(0)) % colors.length;
  }

  return colors[Math.abs(hash)];
}

function cryptoRandomId() {
  return randomUUID();
}

declare global {
  namespace Express {
    interface Request {
      user?: UserRecord;
    }
  }
}
