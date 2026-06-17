import fs from 'node:fs';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';
import { config } from './config.js';
import { hashSessionToken } from './security.js';

fs.mkdirSync(config.dataDir, { recursive: true });
fs.mkdirSync(config.uploadsDir, { recursive: true });

export const db = new Database(`${config.dataDir}/uc-comms.sqlite`);

export const GENERAL_CHANNEL_ID = 'general';

export function initializeDatabase() {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'member')),
      avatar_color TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK (kind IN ('text', 'media')),
      text TEXT,
      media_url TEXT,
      media_type TEXT,
      media_size INTEGER,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS channels (
      id TEXT PRIMARY KEY,
      name TEXT,
      kind TEXT NOT NULL CHECK (kind IN ('room', 'dm')),
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS channel_members (
      channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at TEXT NOT NULL,
      PRIMARY KEY (channel_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS invite_codes (
      id TEXT PRIMARY KEY,
      code_hash TEXT NOT NULL UNIQUE,
      uses INTEGER NOT NULL DEFAULT 0,
      max_uses INTEGER NOT NULL DEFAULT 1,
      expires_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
  `);

  const columns = db.prepare("PRAGMA table_info('messages')").all() as { name: string }[];
  if (!columns.some((col) => col.name === 'channel_id')) {
    db.exec("ALTER TABLE messages ADD COLUMN channel_id TEXT NOT NULL DEFAULT 'general'");
    db.exec('CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel_id, created_at DESC)');
  }

  const userColumns = db.prepare("PRAGMA table_info('users')").all() as { name: string }[];
  if (!userColumns.some((col) => col.name === 'discord_id')) {
    db.exec("ALTER TABLE users ADD COLUMN discord_id TEXT DEFAULT NULL");
  }

  const channelCount = db.prepare('SELECT COUNT(*) AS count FROM channels').get() as { count: number };
  if (channelCount.count === 0) {
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO channels (id, name, kind, created_at) VALUES (?, ?, 'room', ?)`).run(GENERAL_CHANNEL_ID, 'general', now);
  }

  const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number };

  if (userCount.count === 0) {
    if (!config.adminPassword) {
      throw new Error('ADMIN_PASSWORD must be set before the first admin user is created.');
    }

    const now = new Date().toISOString();
    const adminId = randomUUID();
    db.prepare(`
      INSERT INTO users (id, username, display_name, password_hash, role, avatar_color, created_at)
      VALUES (?, ?, ?, ?, 'admin', '#7c3aed', ?)
    `).run(adminId, config.adminUsername, 'Team Lead', bcrypt.hashSync(config.adminPassword, 12), now);
    db.prepare('INSERT INTO channel_members (channel_id, user_id, joined_at) VALUES (?, ?, ?)').run(GENERAL_CHANNEL_ID, adminId, now);
  } else {
    const admin = db.prepare("SELECT * FROM users WHERE username = ? AND role = 'admin'").get(config.adminUsername) as { id?: string } | undefined;
    if (admin && config.adminPassword) {
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(config.adminPassword, 12), admin.id);
    }
  }

  if (config.inviteCode && !db.prepare('SELECT 1 FROM invite_codes WHERE code_hash = ?').get(hashSessionToken(config.inviteCode))) {
    db.prepare(`
      INSERT INTO invite_codes (id, code_hash, uses, max_uses, expires_at, created_at)
      VALUES (?, ?, 0, 25, NULL, ?)
    `).run(randomUUID(), hashSessionToken(config.inviteCode), new Date().toISOString());
  }
}
