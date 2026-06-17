export type MessageKind = 'text' | 'media';
export type ChannelKind = 'room' | 'dm';

export interface User {
  id: string;
  username: string;
  displayName: string;
  role: 'admin' | 'member';
  avatarColor: string;
  discordId: string | null;
  createdAt: string;
}

export interface UserSettings {
  discordId?: string;
}

export interface Message {
  id: string;
  authorId: string;
  username: string;
  displayName: string;
  avatarColor: string;
  discordId: string | null;
  kind: MessageKind;
  text: string | null;
  mediaUrl: string | null;
  mediaType: string | null;
  mediaSize: number | null;
  channelId: string;
  createdAt: string;
}

export interface Channel {
  id: string;
  name: string | null;
  kind: ChannelKind;
  createdAt: string;
  partnerName?: string;
  partnerUsername?: string;
}

export interface AuthResponse {
  user: User;
}

export interface ApiErrorBody {
  error: string;
  details?: unknown;
}
