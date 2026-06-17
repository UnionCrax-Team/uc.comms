import crypto from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import type { Server } from 'socket.io';
import { consumeInviteCode, createSession, createUser, deleteSession, getSessionFromRequest, getUserById, registerSchema, requireAdmin, requireAuth, verifyPassword, SESSION_COOKIE, cookieOptions } from './auth.js';
import { config } from './config.js';
import { db, GENERAL_CHANNEL_ID } from './db.js';
import { createMessage, deleteMessage, getMessages, messageCreateSchema } from './messages.js';
import { saveUploadedMedia, upload } from './upload.js';

export const apiRouter = Router();

let io: Server;

export function setSocketIo(serverIo: Server) {
  io = serverIo;
}

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false
});

apiRouter.use(apiLimiter);

apiRouter.get('/health', (_request, response) => {
  response.json({ ok: true, service: 'uc-comms' });
});

apiRouter.post('/register', (request, response) => {
  const parsed = registerSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ error: 'Invalid registration data.', details: parsed.error.flatten() });
    return;
  }

  if (config.signupDisabled && !consumeInviteCode(parsed.data.inviteCode)) {
    response.status(403).json({ error: 'Registration is invite-only.' });
    return;
  }

  try {
    const user = createUser(parsed.data.username, parsed.data.displayName, parsed.data.password);
    const session = createSession(user.id);
    joinChannel(user.id, GENERAL_CHANNEL_ID);

    response.cookie(SESSION_COOKIE, session.token, cookieOptions());
    response.json({ user });
  } catch (error) {
    if (isUniqueViolation(error)) {
      response.status(409).json({ error: 'Username is already taken.' });
      return;
    }

    throw error;
  }
});

apiRouter.post('/login', (request, response) => {
  const username = String(request.body?.username ?? '').trim();
  const password = String(request.body?.password ?? '');
  const user = verifyPassword(username, password);

  if (!user) {
    response.status(401).json({ error: 'Invalid username or password.' });
    return;
  }
    const session = createSession(user.id);

    response.cookie(SESSION_COOKIE, session.token, cookieOptions());
    response.json({ user });
});

apiRouter.post('/logout', requireAuth, (request, response) => {
  deleteSession(getSessionFromRequest(request));
  response.clearCookie(SESSION_COOKIE, cookieOptions());
  response.json({ ok: true });
});

apiRouter.get('/me', requireAuth, (request, response) => {
  response.json({ user: request.user });
});

apiRouter.get('/messages', requireAuth, (request, response) => {
  const channelId = typeof request.query.channelId === 'string' ? request.query.channelId : GENERAL_CHANNEL_ID;
  const limit = Number(request.query.limit ?? 200);
  const before = typeof request.query.before === 'string' ? request.query.before : undefined;

  verifyChannelAccess(channelId, request.user!.id, response);
  if (response.headersSent) return;

  const messages = getMessages(channelId, limit, before);
  response.json({ messages });
});

apiRouter.post('/messages', requireAuth, (request, response) => {
  const parsed = messageCreateSchema.safeParse(request.body);

  if (!parsed.success) {
    response.status(400).json({ error: 'Invalid message data.', details: parsed.error.flatten() });
    return;
  }

  const channelId = typeof request.body.channelId === 'string' ? request.body.channelId : GENERAL_CHANNEL_ID;

  verifyChannelAccess(channelId, request.user!.id, response);
  if (response.headersSent) return;

  const message = createMessage({
    authorId: request.user!.id,
    kind: parsed.data.type,
    text: parsed.data.type === 'text' ? parsed.data.text : parsed.data.text ?? null,
    mediaUrl: parsed.data.type === 'media' ? parsed.data.mediaUrl : null,
    mediaType: parsed.data.type === 'media' ? parsed.data.mediaType : null,
    mediaSize: parsed.data.type === 'media' ? parsed.data.mediaSize : null,
    channelId
  });

  response.json({ message });
});

apiRouter.delete('/messages/:id', requireAuth, (request, response) => {
  const result = deleteMessage(request.params.id, request.user!.id);
  if ('error' in result) {
    response.status(403).json({ error: result.error });
    return;
  }
  if (io) {
    io.to(result.channelId).emit('message:deleted', { messageId: result.messageId, channelId: result.channelId });
  }
  response.json({ ok: true });
});

apiRouter.post('/messages/media', requireAuth, upload.single('media'), (request, response) => {
  if (!request.file) {
    response.status(400).json({ error: 'No media file was uploaded.' });
    return;
  }

  const mediaUrl = saveUploadedMedia(request.file);
  response.json({ mediaUrl, mediaType: request.file.mimetype, mediaSize: request.file.size });
});

apiRouter.post('/invites', requireAdmin, (request, response) => {
  const code = String(request.body?.code ?? '').trim();

  if (!code) {
    response.status(400).json({ error: 'Invite code is required.' });
    return;
  }

  response.json({ ok: true, inviteCode: code });
});

apiRouter.get('/channels', requireAuth, (request, response) => {
  const userId = request.user!.id;
  const rows = db.prepare(`
    SELECT c.id, c.name, c.kind, c.created_at AS createdAt
    FROM channels c
    JOIN channel_members cm ON cm.channel_id = c.id
    WHERE cm.user_id = ?
    ORDER BY c.created_at ASC
  `).all(userId) as Record<string, unknown>[];

  const channels = rows.map((row) => {
    const ch = rowToChannel(row);
    if (ch.kind === 'dm') {
      const partner = db.prepare(`
        SELECT u.display_name AS displayName, u.username
        FROM channel_members cm
        JOIN users u ON u.id = cm.user_id
        WHERE cm.channel_id = ? AND cm.user_id != ?
      `).get(ch.id, userId) as { displayName: string; username: string } | undefined;
      if (partner) {
        (ch as Record<string, unknown>).partnerName = partner.displayName;
        (ch as Record<string, unknown>).partnerUsername = partner.username;
      }
    }
    return ch;
  });

  response.json({ channels });
});

apiRouter.post('/channels', requireAuth, (request, response) => {
  const { name, memberIds } = request.body as { name?: string; memberIds?: string[] };
  const userId = request.user!.id;

  if (name && typeof name === 'string') {
    if (name.trim().length < 1 || name.trim().length > 32) {
      response.status(400).json({ error: 'Channel name must be 1-32 characters.' });
      return;
    }
    if (!/^[a-zA-Z0-9 _-]+$/.test(name.trim())) {
      response.status(400).json({ error: 'Channel name can only contain letters, numbers, spaces, hyphens, and underscores.' });
      return;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO channels (id, name, kind, created_at) VALUES (?, ?, 'room', ?)`).run(id, name.trim(), now);
    joinChannel(userId, id);

    if (Array.isArray(memberIds)) {
      for (const mid of memberIds) {
        if (mid !== userId) joinChannel(mid, id);
      }
    }

    response.json({ channel: { id, name: name.trim(), kind: 'room', createdAt: now } });
    return;
  }

  if (Array.isArray(memberIds) && memberIds.length === 1 && memberIds[0] !== userId) {
    const existing = db.prepare(`
      SELECT cm1.channel_id FROM channel_members cm1
      JOIN channel_members cm2 ON cm2.channel_id = cm1.channel_id
      JOIN channels c ON c.id = cm1.channel_id
      WHERE c.kind = 'dm' AND cm1.user_id = ? AND cm2.user_id = ?
    `).get(userId, memberIds[0]);

    if (existing) {
      const ch = db.prepare('SELECT id, name, kind, created_at AS createdAt FROM channels WHERE id = ?').get((existing as { channel_id: string }).channel_id) as Record<string, unknown>;
      response.json({ channel: rowToChannel(ch) });
      return;
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO channels (id, name, kind, created_at) VALUES (?, NULL, 'dm', ?)`).run(id, now);
    joinChannel(userId, id);
    joinChannel(memberIds[0], id);
    response.json({ channel: { id, name: null, kind: 'dm', createdAt: now } });
    return;
  }

  response.status(400).json({ error: 'Provide a channel name or a single member ID for a DM.' });
});

apiRouter.get('/channels/:id/messages', requireAuth, (request, response) => {
  const { id } = request.params;
  const limit = Number(request.query.limit ?? 200);
  const before = typeof request.query.before === 'string' ? request.query.before : undefined;

  verifyChannelAccess(id, request.user!.id, response);
  if (response.headersSent) return;

  const messages = getMessages(id, limit, before);
  response.json({ messages });
});

apiRouter.post('/channels/:id/join', requireAuth, (request, response) => {
  const { id } = request.params;
  const channel = db.prepare('SELECT kind FROM channels WHERE id = ?').get(id) as { kind: string } | undefined;

  if (!channel) {
    response.status(404).json({ error: 'Channel not found.' });
    return;
  }

  if (channel.kind === 'dm') {
    response.status(403).json({ error: 'Cannot join a DM channel.' });
    return;
  }

  joinChannel(request.user!.id, id);
  response.json({ ok: true });
});

apiRouter.get('/users', requireAuth, (_request, response) => {
  const rows = db.prepare('SELECT id, username, display_name AS displayName, role, avatar_color AS avatarColor, discord_id AS discordId, created_at AS createdAt FROM users ORDER BY username ASC').all() as Record<string, unknown>[];
  response.json({ users: rows.map(rowToUser) });
});

apiRouter.patch('/me/settings', requireAuth, (request, response) => {
  const { discordId } = request.body as { discordId?: string };
  const userId = request.user!.id;

  if (discordId !== undefined) {
    if (discordId !== '' && !/^\d{17,20}$/.test(discordId)) {
      response.status(400).json({ error: 'Invalid Discord user ID.' });
      return;
    }
    db.prepare('UPDATE users SET discord_id = ? WHERE id = ?').run(discordId || null, userId);
  }

  const user = getUserById(userId);
  response.json({ user });
});

function rowToUser(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    username: row.username as string,
    displayName: row.displayName as string,
    role: row.role as string,
    avatarColor: row.avatarColor as string,
    discordId: (row.discordId as string) ?? null,
    createdAt: row.createdAt as string
  };
}

function rowToChannel(row: Record<string, unknown>) {
  return {
    id: row.id as string,
    name: (row.name as string) ?? null,
    kind: row.kind as 'room' | 'dm',
    createdAt: row.createdAt as string
  };
}

function verifyChannelAccess(channelId: string, userId: string, response: import('express').Response) {
  const member = db.prepare('SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?').get(channelId, userId);
  if (!member) {
    response.status(403).json({ error: 'You are not a member of this channel.' });
  }
}

function joinChannel(userId: string, channelId: string) {
  const existing = db.prepare('SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?').get(channelId, userId);
  if (!existing) {
    db.prepare('INSERT INTO channel_members (channel_id, user_id, joined_at) VALUES (?, ?, ?)').run(channelId, userId, new Date().toISOString());
  }
}

function isUniqueViolation(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'SQLITE_CONSTRAINT_UNIQUE';
}
