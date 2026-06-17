import { forwardRef, useState } from 'react';
import type { Message, User } from '../types.js';
import { useLanyard } from './LanyardStatus.js';

export const MessageList = forwardRef<HTMLDivElement, { messages: Message[]; currentUser: User; usersById: Record<string, User>; onDeleteMessage?: (messageId: string) => void }>(function MessageList({ messages, currentUser, usersById, onDeleteMessage }, ref) {
  if (messages.length === 0) {
    return (
      <div ref={ref} className="message-list empty-list">
        <div className="empty-state">
          <div className="empty-mark" />
          <h2>404 || No messages found</h2>
          <p>A rare moment. Take your time and enjoy the silence.</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={ref} className="message-list">
      {messages.map((message, index) => {
        const showAuthor = index === 0 || messages[index - 1].authorId !== message.authorId || timeGap(message.createdAt, messages[index - 1].createdAt);
        const isMine = message.authorId === currentUser.id;

        return (
          <article key={message.id} className={`message-row ${isMine ? 'mine' : 'theirs'}`}>
            {showAuthor ? <MessageAvatar message={message} usersById={usersById} /> : <div className="message-spacer" />}
            <div className="message-bubble">
              {showAuthor && (
                <div className="message-author">
                  <strong>{message.displayName}</strong>
                  <span>{formatTime(message.createdAt)}</span>
                </div>
              )}
              {message.text && <p className="message-text">{message.text}</p>}
              {message.mediaUrl && <MediaPreview message={message} />}
              {isMine && onDeleteMessage && (
                <button className="message-delete" onClick={() => onDeleteMessage(message.id)} title="Delete message">&#10005;</button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
});

function MessageAvatar({ message, usersById }: { message: Message; usersById: Record<string, User> }) {
  const { getAvatarUrl } = useLanyard();
  const [avatarFailed, setAvatarFailed] = useState(false);
  const author = usersById[message.authorId];
  const discordId = message.discordId ?? author?.discordId;
  const avatarUrl = discordId ? getAvatarUrl(discordId) : null;
  const initial = message.displayName.trim().charAt(0).toUpperCase() || '?';

  if (avatarUrl && !avatarFailed) {
    return (
      <div className="message-avatar">
        <img className="message-avatar-img" src={avatarUrl} alt="" onError={() => setAvatarFailed(true)} />
      </div>
    );
  }
  return <div className="message-avatar" style={{ backgroundColor: message.avatarColor }}>{initial}</div>;
}

function MediaPreview({ message }: { message: Message }) {
  const src = message.mediaUrl ?? '';

  if (message.mediaType?.startsWith('image/')) {
    return <img className="media-preview" src={src} alt={message.text ?? 'Shared image'} loading="lazy" />;
  }

  if (message.mediaType?.startsWith('video/')) {
    return <video className="media-preview" src={src} controls />;
  }

  if (message.mediaType?.startsWith('audio/')) {
    return <audio className="audio-preview" src={src} controls />;
  }

  return <a href={src}>Open media</a>;
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
}

function timeGap(current: string, previous: string) {
  return new Date(current).getTime() - new Date(previous).getTime() > 5 * 60 * 1000;
}
