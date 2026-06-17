export type MessageKind = 'text' | 'media';
export type ChannelKind = 'room' | 'dm';

export interface UserRecord {
  id: string;
  username: string;
  displayName: string;
  role: 'admin' | 'member';
  avatarColor: string;
  discordId: string | null;
  createdAt: string;
}

export interface MessageRecord {
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

export interface ChannelRecord {
  id: string;
  name: string | null;
  kind: ChannelKind;
  createdAt: string;
}

export interface ChannelMemberRecord {
  channelId: string;
  userId: string;
  joinedAt: string;
}

export interface InviteCodeRecord {
  id: string;
  codeHash: string;
  uses: number;
  maxUses: number;
  expiresAt: string | null;
  createdAt: string;
}
