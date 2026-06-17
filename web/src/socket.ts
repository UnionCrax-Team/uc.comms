import { io, type Socket } from 'socket.io-client';
import type { Message } from './types.js';

const apiBaseUrl = (import.meta.env.VITE_UC_COMMS_API_URL ?? '').replace(/\/$/, '');

let socket: Socket | undefined;

type TypingPayload = { userId: string; displayName: string; isTyping: boolean; channelId: string };

type ConnectionState = 'connecting' | 'connected' | 'offline';

type SocketCallbacks = {
  onHistory: (messages: Message[], channelId: string) => void;
  onMessage: (message: Message) => void;
  onMessageDeleted: (payload: { messageId: string; channelId: string }) => void;
  onTyping: (payload: TypingPayload) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
};

export function connectChatSocket(callbacks: SocketCallbacks) {
  if (socket?.connected) {
    socket.off('messages:history');
    socket.off('message:new');
    socket.off('message:deleted');
    socket.off('message:typing');
    socket.off('connect');
    socket.off('disconnect');
  } else {
    socket = io(apiBaseUrl || undefined, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 500,
      withCredentials: true
    });
  }

  socket.on('messages:history', (payload: { messages: Message[]; channelId: string }) => {
    callbacks.onHistory(payload.messages, payload.channelId);
  });

  socket.on('message:new', (message: Message) => {
    callbacks.onMessage(message);
  });

  socket.on('message:deleted', (payload: { messageId: string; channelId: string }) => {
    callbacks.onMessageDeleted(payload);
  });

  socket.on('message:typing', (payload: TypingPayload) => {
    callbacks.onTyping(payload);
  });

  socket.on('connect', () => {
    callbacks.onConnect?.();
    socket?.emit('message:typing', { isTyping: false });
  });

  socket.on('disconnect', () => {
    callbacks.onDisconnect?.();
  });

  return socket;
}

export function selectChannel(channelId: string) {
  socket?.emit('channel:select', channelId);
}

export function sendTyping(isTyping: boolean, channelId: string) {
  socket?.emit('message:typing', { isTyping, channelId });
}

export function sendSocketMessage(message: { type: 'text'; text: string; channelId?: string } | { type: 'media'; text?: string; mediaUrl: string; mediaType: string; mediaSize: number; channelId?: string }) {
  return new Promise<Message>((resolve, reject) => {
    if (!socket?.connected) {
      reject(new Error('Chat socket is not connected.'));
      return;
    }

    socket.emit('message:create', message, (response: { ok: boolean; message?: Message; error?: string }) => {
      if (response.ok && response.message) {
        resolve(response.message);
        return;
      }

      reject(new Error(response.error ?? 'Message was not sent.'));
    });
  });
}

export function getSocketState(): ConnectionState {
  if (!socket) return 'offline';
  if (socket.connected) return 'connected';
  return 'connecting';
}
