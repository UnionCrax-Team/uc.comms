import type { Server } from 'socket.io';
import { z } from 'zod';
import { db, GENERAL_CHANNEL_ID } from './db.js';
import type { MessageRecord } from './types.js';
import { randomUUID } from 'node:crypto';

export const textMessageSchema = z.object({
  type: z.literal('text'),
  text: z.string().trim().min(1).max(4000)
});

export const mediaMessageSchema = z.object({
  type: z.literal('media'),
  text: z.string().trim().max(500).optional(),
  mediaUrl: z
    .string()
    .trim()
    .regex(/^\/uploads\/[a-f0-9/_.-]+$/i)
    .refine((value) => !value.includes('..') && !value.includes('\\')),
  mediaType: z.string().trim().max(128),
  mediaSize: z.number().int().positive().max(250 * 1024 * 1024)
});

export const messageCreateSchema = z.discriminatedUnion('type', [textMessageSchema, mediaMessageSchema]);

export function getMessages(channelId: string, limit = 200, before?: string) {
  const safeLimit = Math.min(Math.max(limit, 1), 200);
  const rows = before
    ? db
        .prepare(
          `
          SELECT
            m.id,
            m.author_id AS authorId,
            m.kind,
            m.text,
            m.media_url AS mediaUrl,
            m.media_type AS mediaType,
            m.media_size AS mediaSize,
            m.created_at AS createdAt,
            m.channel_id AS channelId,
            u.username,
            u.display_name AS displayName,
            u.avatar_color AS avatarColor,
            u.discord_id AS discordId
          FROM messages m
          JOIN users u ON u.id = m.author_id
          WHERE m.channel_id = ? AND m.created_at < ?
          ORDER BY m.created_at DESC
          LIMIT ?
        `
        )
        .all(channelId, before, safeLimit)
    : db
        .prepare(
          `
          SELECT
            m.id,
            m.author_id AS authorId,
            m.kind,
            m.text,
            m.media_url AS mediaUrl,
            m.media_type AS mediaType,
            m.media_size AS mediaSize,
            m.created_at AS createdAt,
            m.channel_id AS channelId,
            u.username,
            u.display_name AS displayName,
            u.avatar_color AS avatarColor,
            u.discord_id AS discordId
          FROM messages m
          JOIN users u ON u.id = m.author_id
          WHERE m.channel_id = ?
          ORDER BY m.created_at DESC
          LIMIT ?
        `
        )
        .all(channelId, safeLimit);

  return (rows as Record<string, unknown>[]).reverse().map(rowToMessage);
}

export function createMessage(input: {
  authorId: string;
  kind: 'text' | 'media';
  text?: string | null;
  mediaUrl?: string | null;
  mediaType?: string | null;
  mediaSize?: number | null;
  channelId?: string;
}) {
  const id = randomUUID();
  const createdAt = new Date().toISOString();
  const channelId = input.channelId || GENERAL_CHANNEL_ID;

  db.prepare(`
    INSERT INTO messages (id, author_id, kind, text, media_url, media_type, media_size, channel_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, input.authorId, input.kind, input.text ?? null, input.mediaUrl ?? null, input.mediaType ?? null, input.mediaSize ?? null, channelId, createdAt);

  const message = getMessages(channelId, 1).at(-1);
  if (!message) throw new Error('Message was not created.');

  return message;
}

export function deleteMessage(messageId: string, userId: string) {
  const message = db.prepare('SELECT id, author_id AS authorId, channel_id AS channelId FROM messages WHERE id = ?').get(messageId) as { id: string; authorId: string; channelId: string } | undefined;
  if (!message) return { error: 'Message not found.' };
  if (message.authorId !== userId) return { error: 'Not your message.' };
  db.prepare('DELETE FROM messages WHERE id = ?').run(messageId);
  return { ok: true, channelId: message.channelId, messageId: message.id };
}

export function broadcastMessage(io: Server, message: MessageRecord) {
  io.to(message.channelId).emit('message:new', message);
}

function rowToMessage(row: Record<string, unknown>): MessageRecord {
  return {
    id: row.id as string,
    authorId: row.authorId as string,
    username: row.username as string,
    displayName: row.displayName as string,
    avatarColor: row.avatarColor as string,
    discordId: (row.discordId as string) ?? null,
    kind: row.kind as 'text' | 'media',
    text: row.text as string | null,
    mediaUrl: row.mediaUrl as string | null,
    mediaType: row.mediaType as string | null,
    mediaSize: typeof row.mediaSize === 'number' ? row.mediaSize : null,
    channelId: row.channelId as string,
    createdAt: row.createdAt as string
  };
}
