import { parse as parseCookie } from 'cookie';
import type { Socket } from 'socket.io';
import type { Server } from 'socket.io';

type NextFunction = (err?: Error) => void;
import { getUserFromSessionToken, SESSION_COOKIE } from './auth.js';
import { createMessage, getMessages, messageCreateSchema } from './messages.js';
import { db, GENERAL_CHANNEL_ID } from './db.js';

export function setupSocket(io: Server) {
  io.use((socket, next: NextFunction) => {
    const token = getSessionTokenFromSocket(socket);
    const user = getUserFromSessionToken(token);

    if (!user) {
      next(new Error('Unauthorized'));
      return;
    }

    socket.data.user = user;
    next();
  });

  io.on('connection', (socket) => {
    const userId = socket.data.user.id;

    const channelRows = db.prepare('SELECT channel_id FROM channel_members WHERE user_id = ?').all(userId) as { channel_id: string }[];
    for (const row of channelRows) {
      socket.join(row.channel_id);
    }

    socket.on('channel:select', (channelId: string) => {
      const member = db.prepare('SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?').get(channelId, userId);
      if (!member) return;

      socket.join(channelId);
      socket.emit('messages:history', { messages: getMessages(channelId, 200), channelId });
    });

    socket.on('message:create', (payload, acknowledge) => {
      const parsed = messageCreateSchema.safeParse(payload);

      if (!parsed.success) {
        acknowledge?.({ ok: false, error: 'Invalid message data.', details: parsed.error.flatten() });
        return;
      }

      const channelId = typeof payload.channelId === 'string' ? payload.channelId : GENERAL_CHANNEL_ID;

      const member = db.prepare('SELECT 1 FROM channel_members WHERE channel_id = ? AND user_id = ?').get(channelId, userId);
      if (!member) {
        acknowledge?.({ ok: false, error: 'Not a member of this channel.' });
        return;
      }

      const message = createMessage({
        authorId: userId,
        kind: parsed.data.type,
        text: parsed.data.type === 'text' ? parsed.data.text : parsed.data.text ?? null,
        mediaUrl: parsed.data.type === 'media' ? parsed.data.mediaUrl : null,
        mediaType: parsed.data.type === 'media' ? parsed.data.mediaType : null,
        mediaSize: parsed.data.type === 'media' ? parsed.data.mediaSize : null,
        channelId
      });

      io.to(channelId).emit('message:new', message);
      acknowledge?.({ ok: true, message });
    });

    socket.on('message:typing', (payload: { isTyping: boolean; channelId?: string }) => {
      const channelId = typeof payload === 'object' ? payload.channelId || GENERAL_CHANNEL_ID : GENERAL_CHANNEL_ID;
      const isTyping = typeof payload === 'object' ? payload.isTyping : payload;
      socket.to(channelId).emit('message:typing', {
        userId,
        displayName: socket.data.user.displayName,
        isTyping,
        channelId
      });
    });
  });
}

function getSessionTokenFromSocket(socket: Socket) {
  const cookieHeader = socket.handshake.headers.cookie;
  if (!cookieHeader) return undefined;

  const cookies = parseCookie(cookieHeader);
  return cookies[SESSION_COOKIE];
}
