import type { ApiErrorBody, AuthResponse, Channel, Message, User } from './types.js';

const apiBaseUrl = (import.meta.env.VITE_UC_COMMS_API_URL ?? '').replace(/\/$/, '');

function apiUrl(path: string) {
  return apiBaseUrl ? `${apiBaseUrl}${path.startsWith('/') ? path : `/${path}`}` : path;
}

class ApiError extends Error {
  constructor(public status: number, public body: ApiErrorBody) {
    super(body.error);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(apiUrl(path), {
    credentials: 'include',
    headers: {
      ...(init?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...init?.headers
    },
    ...init
  });

  const body = (await response.json().catch(() => ({}))) as ApiErrorBody | T;

  if (!response.ok) {
    throw new ApiError(response.status, body as ApiErrorBody);
  }

  return body as T;
}

export async function login(username: string, password: string) {
  return request<AuthResponse>('/api/login', {
    method: 'POST',
    body: JSON.stringify({ username, password })
  });
}

export async function register(username: string, displayName: string, password: string, inviteCode?: string) {
  return request<AuthResponse>('/api/register', {
    method: 'POST',
    body: JSON.stringify({ username, displayName, password, inviteCode })
  });
}

export async function logout() {
  return request<{ ok: true }>('/api/logout', { method: 'POST' });
}

export async function getMe() {
  return request<{ user: User }>('/api/me');
}

export async function getMessages(channelId: string, limit = 200, before?: string) {
  const query = new URLSearchParams({ channelId, limit: String(limit) });
  if (before) query.set('before', before);
  return request<{ messages: Message[] }>(`/api/messages?${query.toString()}`);
}

export async function createMessage(message: { type: 'text'; text: string; channelId?: string } | { type: 'media'; text?: string; mediaUrl: string; mediaType: string; mediaSize: number; channelId?: string }) {
  return request<{ message: Message }>('/api/messages', {
    method: 'POST',
    body: JSON.stringify(message)
  });
}

export async function uploadMedia(file: File) {
  const form = new FormData();
  form.append('media', file);

  return request<{ mediaUrl: string; mediaType: string; mediaSize: number }>('/api/messages/media', {
    method: 'POST',
    body: form
  });
}

export async function getChannels() {
  return request<{ channels: Channel[] }>('/api/channels');
}

export async function createChannel(name: string, memberIds?: string[]) {
  return request<{ channel: Channel }>('/api/channels', {
    method: 'POST',
    body: JSON.stringify({ name, memberIds })
  });
}

export async function createDm(otherUserId: string) {
  return request<{ channel: Channel }>('/api/channels', {
    method: 'POST',
    body: JSON.stringify({ memberIds: [otherUserId] })
  });
}

export async function getUsers() {
  return request<{ users: User[] }>('/api/users');
}

export async function getChannelMessages(channelId: string, limit = 200, before?: string) {
  const query = new URLSearchParams({ limit: String(limit) });
  if (before) query.set('before', before);
  return request<{ messages: Message[] }>(`/api/channels/${channelId}/messages?${query.toString()}`);
}

export async function deleteMessageApi(messageId: string) {
  return request<{ ok: true }>(`/api/messages/${messageId}`, { method: 'DELETE' });
}

export async function updateSettings(settings: { discordId?: string }) {
  return request<{ user: User }>('/api/me/settings', {
    method: 'PATCH',
    body: JSON.stringify(settings)
  });
}

export function getErrorMessage(error: unknown) {
  if (error instanceof ApiError) return error.body.error;
  if (error instanceof Error) return error.message;
  return 'Something went wrong.';
}
