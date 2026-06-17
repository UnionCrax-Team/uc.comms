import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createChannel, createDm, createMessage, deleteMessageApi, getChannels, getErrorMessage, getMessages, getUsers, logout, uploadMedia, updateSettings } from '../api.js';
import { connectChatSocket, selectChannel as socketSelectChannel, sendSocketMessage, sendTyping } from '../socket.js';
import type { Channel, Message, User } from '../types.js';
import { LanyardProvider, useLanyard, STATUS_COLORS, STATUS_LABELS } from './LanyardStatus.js';
import { MessageComposer } from './MessageComposer.js';
import { MessageList } from './MessageList.js';

const FALBACK_AVATAR = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="%231a3a1a"/><text x="50" y="56" font-size="44" text-anchor="middle" fill="%2350f050" font-family="monospace">?</text></svg>';
const NOTIFICATION_SOUND = '/notification.mp3';

function sendDesktopNotification(title: string, body: string, tag: string) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    const notif = new Notification(title, { body, tag });
    notif.onclick = () => { window.focus(); notif.close(); };
    return;
  }
  if (Notification.permission === 'default') {
    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') {
        const notif = new Notification(title, { body, tag });
        notif.onclick = () => { window.focus(); notif.close(); };
      }
    });
  }
}

export function ChatShell({ user }: { user: User }) {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [activeChannelId, setActiveChannelId] = useState<string>('general');
  const [messagesByChannel, setMessagesByChannel] = useState<Record<string, Message[]>>({});
  const [draft, setDraft] = useState('');
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [socketState, setSocketState] = useState<'connecting' | 'connected' | 'offline'>('connecting');
  const [typingUsers, setTypingUsers] = useState<Record<string, Record<string, string>>>({});
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loadingChannels, setLoadingChannels] = useState(true);
  const [flyoutUserId, setFlyoutUserId] = useState<string | null>(null);
  const [myDiscordId, setMyDiscordId] = useState(user.discordId || '');
  const [notification, setNotification] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const socketInitRef = useRef(false);

  const messagesByChannelRef = useRef(messagesByChannel);
  messagesByChannelRef.current = messagesByChannel;

  const typingUsersRef = useRef(typingUsers);
  typingUsersRef.current = typingUsers;

  const activeChannelIdRef = useRef(activeChannelId);
  activeChannelIdRef.current = activeChannelId;

  const channelsRef = useRef(channels);
  channelsRef.current = channels;

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioPrimedRef = useRef(false);

  const activeChannel = useMemo(() => channels.find((c) => c.id === activeChannelId), [channels, activeChannelId]);
  const activeMessages = messagesByChannel[activeChannelId] ?? [];

  const allDiscordIds = useMemo(() => {
    const ids = allUsers.map((u) => u.discordId).filter(Boolean) as string[];
    if (myDiscordId && !ids.includes(myDiscordId)) ids.push(myDiscordId);
    return [...new Set(ids)];
  }, [allUsers, myDiscordId]);

  function channelName(ch: Channel) {
    if (ch.kind === 'dm') return ch.partnerName || ch.partnerUsername || 'Unknown';
    return ch.name || 'Unnamed';
  }

  const onHistory = useCallback((messages: Message[], channelId: string) => {
    setMessagesByChannel((prev) => ({ ...prev, [channelId]: messages }));
  }, []);

  const onMessage = useCallback((message: Message) => {
    setMessagesByChannel((prev) => {
      const list = prev[message.channelId] ?? [];
      if (list.some((m) => m.id === message.id)) return prev;
      return { ...prev, [message.channelId]: [...list, message] };
    });

    if (message.authorId === user.id) return;

    const shouldNotify = message.channelId !== activeChannelIdRef.current || document.hidden;
    if (!shouldNotify) return;

    const ch = channelsRef.current.find((c) => c.id === message.channelId);
    const channelLabel = ch ? (ch.kind === 'dm' ? `DM from ${ch.partnerName || ch.partnerUsername || 'Unknown'}` : `#${ch.name}`) : 'Unknown channel';

    sendDesktopNotification(
      channelLabel,
      `${message.displayName}: ${message.text ?? 'Sent a file'}`,
      message.channelId
    );

    audioRef.current?.play().catch(() => {});
  }, [user.id]);

  const onMessageDeleted = useCallback((payload: { messageId: string; channelId: string }) => {
    setMessagesByChannel((prev) => {
      const list = prev[payload.channelId];
      if (!list) return prev;
      return { ...prev, [payload.channelId]: list.filter((m) => m.id !== payload.messageId) };
    });
  }, []);

  const onTyping = useCallback((payload: { userId: string; displayName: string; isTyping: boolean; channelId: string }) => {
    const chId = payload.channelId || activeChannelIdRef.current;
    setTypingUsers((prev) => {
      const channelTyping = { ...(prev[chId] ?? {}) };
      if (payload.isTyping) {
        channelTyping[payload.userId] = payload.displayName;
      } else {
        delete channelTyping[payload.userId];
      }
      return { ...prev, [chId]: channelTyping };
    });
  }, []);

  useEffect(() => {
    let mounted = true;

    getChannels()
      .then((res) => {
        if (!mounted) return;
        setChannels(res.channels);
        setLoadingChannels(false);
      })
      .catch((err) => {
        console.error('Failed to load channels:', err);
        if (mounted) setLoadingChannels(false);
      });

    getUsers()
      .then((res) => {
        if (!mounted) return;
        setAllUsers(res.users);
      })
      .catch((err) => console.error('Failed to load users:', err));

    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (loadingChannels || socketInitRef.current) return;

    const socket = connectChatSocket({
      onHistory,
      onMessage,
      onMessageDeleted,
      onTyping,
      onConnect: () => setSocketState('connected'),
      onDisconnect: () => setSocketState('offline')
    });

    socketInitRef.current = true;
    setSocketState(socket.connected ? 'connected' : 'connecting');
  }, [loadingChannels, onHistory, onMessage, onMessageDeleted, onTyping]);

  useEffect(() => {
    if (loadingChannels || !socketInitRef.current) return;

    sendTyping(false, activeChannelIdRef.current);
    socketSelectChannel(activeChannelId);
  }, [activeChannelId, loadingChannels]);

  function primeNotifications() {
    if (audioPrimedRef.current) return;
    audioPrimedRef.current = true;
    const audio = new Audio(NOTIFICATION_SOUND);
    audio.preload = 'auto';
    audio.load();
    audioRef.current = audio;
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }

  useEffect(() => {
    document.addEventListener('pointerdown', primeNotifications, { once: true });
    document.addEventListener('keydown', primeNotifications, { once: true });
  }, []);

  useEffect(() => {
    if (!notification) return;
    const id = setTimeout(() => setNotification(null), 4000);
    return () => clearTimeout(id);
  }, [notification]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
    }, 80);

    return () => window.clearTimeout(timer);
  }, [activeMessages.length]);

  const typingText = useMemo(() => {
    const names = Object.values(typingUsers[activeChannelId] ?? {});
    if (names.length === 0) return '';
    if (names.length === 1) return `${names[0]} is typing`;
    return `${names.slice(0, -1).join(', ')} and ${names.at(-1)} are typing`;
  }, [typingUsers, activeChannelId]);

  function handleSelectChannel(channelId: string) {
    if (channelId === activeChannelIdRef.current) return;

    const prevId = activeChannelIdRef.current;
    sendTyping(false, prevId);
    setActiveChannelId(channelId);

    if (!messagesByChannelRef.current[channelId]) {
      getMessages(channelId, 200).then((res) => {
        setMessagesByChannel((prev) => {
          if (prev[channelId]) return prev;
          return { ...prev, [channelId]: res.messages };
        });
      }).catch((err) => console.error(`Failed to load messages for channel ${channelId}:`, err));
    }
  }

  async function handleCommand(text: string) {
    const parts = text.slice(1).split(/\s+/);
    const cmd = parts[0].toLowerCase();

    switch (cmd) {
      case 'help': {
        setNotification(
          'Available commands:\n/discord <id> — Link your Discord account\n/cleardiscord — Unlink your Discord account\n/help — Show this help'
        );
        return true;
      }
      case 'discord': {
        const id = parts[1];
        if (!id || !/^\d{17,20}$/.test(id)) {
          setNotification('Usage: /discord <user id>  (17-20 digit Discord user ID)');
          return true;
        }
        try {
          const res = await updateSettings({ discordId: id });
          setMyDiscordId(res.user.discordId || '');
          setNotification('Discord account linked!');
        } catch (err: unknown) {
          setNotification(getErrorMessage(err));
        }
        return true;
      }
      case 'cleardiscord': {
        try {
          const res = await updateSettings({ discordId: '' });
          setMyDiscordId(res.user.discordId || '');
          setNotification('Discord account unlinked.');
        } catch (err: unknown) {
          setNotification(getErrorMessage(err));
        }
        return true;
      }
      default:
        setNotification(`Unknown command: /${cmd}. Type /help for available commands.`);
        return true;
    }
  }

  async function handleDeleteMessage(messageId: string) {
    if (!window.confirm('Delete this message?')) return;
    try {
      await deleteMessageApi(messageId);
      setMessagesByChannel((prev) => {
        const next: Record<string, Message[]> = {};
        for (const key of Object.keys(prev)) {
          next[key] = prev[key].filter((m) => m.id !== messageId);
        }
        return next;
      });
    } catch (err: unknown) {
      setNotification(getErrorMessage(err));
    }
  }

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = draft.trim();
    if ((!text && pendingFiles.length === 0) || sending) return;

    if (text.startsWith('/')) {
      setDraft('');
      handleCommand(text);
      return;
    }

    setSending(true);

    try {
      if (pendingFiles.length > 0) {
        for (const file of pendingFiles) {
          const uploaded = await uploadMedia(file);
          await sendSocketMessage({
            type: 'media',
            text: text || undefined,
            mediaUrl: uploaded.mediaUrl,
            mediaType: uploaded.mediaType,
            mediaSize: uploaded.mediaSize,
            channelId: activeChannelId
          });
        }
      } else {
        await sendSocketMessage({ type: 'text', text, channelId: activeChannelId });
      }
      setDraft('');
      setPendingFiles([]);
    } catch (error) {
      try {
        await createMessage({ type: 'text', text: text || 'Failed to send.', channelId: activeChannelId });
      } catch {
        window.alert(getErrorMessage(error));
      }
    } finally {
      setSending(false);
    }
  }

  async function handleCreateChannel(name: string) {
    try {
      const res = await createChannel(name);
      setChannels((prev) => [...prev, res.channel]);
      setShowCreatePanel(false);
      handleSelectChannel(res.channel.id);
    } catch (err) {
      console.error('Failed to create channel:', err);
    }
  }

  async function handleCreateDm(otherUserId: string) {
    try {
      const res = await createDm(otherUserId);
      setChannels((prev) => {
        if (prev.some((c) => c.id === res.channel.id)) return prev;
        const partner = allUsers.find((u) => u.id === otherUserId);
        if (partner) {
          res.channel.partnerName = partner.displayName;
          res.channel.partnerUsername = partner.username;
        }
        return [...prev, res.channel];
      });
      setShowCreatePanel(false);
      handleSelectChannel(res.channel.id);
    } catch (err) {
      console.error('Failed to create DM:', err);
    }
  }

  async function handleLogout() {
    await logout();
    window.location.reload();
  }

  const otherUsers = allUsers.filter((u) => u.id !== user.id);

  return (
    <LanyardProvider discordIds={allDiscordIds}>
      <ChatContent
        user={user}
        channels={channels}
        activeChannelId={activeChannelId}
        activeChannel={activeChannel}
        activeMessages={activeMessages}
        draft={draft}
        setDraft={setDraft}
        pendingFiles={pendingFiles}
        setPendingFiles={setPendingFiles}
        sending={sending}
        socketState={socketState}
        typingText={typingText}
        showCreatePanel={showCreatePanel}
        setShowCreatePanel={setShowCreatePanel}
        allUsers={allUsers}
        otherUsers={otherUsers}
        flyoutUserId={flyoutUserId}
        setFlyoutUserId={setFlyoutUserId}
        myDiscordId={myDiscordId}
        setMyDiscordId={setMyDiscordId}
        notification={notification}
        setNotification={setNotification}
        channelName={channelName}
        handleSelectChannel={handleSelectChannel}
        submit={submit}
        handleDeleteMessage={handleDeleteMessage}
        handleCreateChannel={handleCreateChannel}
        handleCreateDm={handleCreateDm}
        handleLogout={handleLogout}
        listRef={listRef}
      />
    </LanyardProvider>
  );
}

function ChatContent({
  user, channels, activeChannelId, activeChannel, activeMessages,
  draft, setDraft, pendingFiles, setPendingFiles, sending,
  socketState, typingText,
  showCreatePanel, setShowCreatePanel, allUsers, otherUsers,
  flyoutUserId, setFlyoutUserId, myDiscordId, setMyDiscordId,
  notification, setNotification,
  channelName, handleSelectChannel, submit, handleDeleteMessage,
  handleCreateChannel, handleCreateDm, handleLogout, listRef
}: {
  user: User; channels: Channel[]; activeChannelId: string;
  activeChannel: Channel | undefined; activeMessages: Message[];
  draft: string; setDraft: (v: string) => void;
  pendingFiles: File[]; setPendingFiles: (v: File[]) => void;
  sending: boolean; socketState: string; typingText: string;
  showCreatePanel: boolean; setShowCreatePanel: (v: boolean) => void;
  allUsers: User[]; otherUsers: User[];
  flyoutUserId: string | null; setFlyoutUserId: (v: string | null) => void;
  myDiscordId: string; setMyDiscordId: (v: string) => void;
  notification: string | null; setNotification: (v: string | null) => void;
  channelName: (ch: Channel) => string;
  handleSelectChannel: (id: string) => void;
  submit: (e?: FormEvent) => Promise<void>;
  handleCreateChannel: (name: string) => Promise<void>;
  handleCreateDm: (id: string) => Promise<void>;
  handleDeleteMessage: (messageId: string) => Promise<void>;
  handleLogout: () => Promise<void>;
  listRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { presences, getAvatarUrl } = useLanyard();

  const STATUS_RANK: Record<string, number> = { online: 0, idle: 1, dnd: 2, offline: 3 };
  function sortByPresence(a: User, b: User) {
    const pa = a.discordId ? presences[a.discordId] : undefined;
    const pb = b.discordId ? presences[b.discordId] : undefined;
    const ra = pa ? STATUS_RANK[pa.discord_status] ?? 3 : 4;
    const rb = pb ? STATUS_RANK[pb.discord_status] ?? 3 : 4;
    return ra - rb;
  }
  const myPresence = myDiscordId ? presences[myDiscordId] : undefined;
  const myAvatar = myDiscordId ? getAvatarUrl(myDiscordId) : null;

  const flyoutUser = flyoutUserId ? otherUsers.find((u) => u.id === flyoutUserId) ?? user : null;
  const flyoutPresence = flyoutUser?.discordId ? presences[flyoutUser.discordId] : undefined;

  const usersById = useMemo(() => {
    const map: Record<string, User> = {};
    for (const u of allUsers) map[u.id] = u;
    return map;
  }, [allUsers]);

  function getDisplayAvatar(targetUser: User): string | undefined {
    if (targetUser.discordId) {
      const url = getAvatarUrl(targetUser.discordId);
      if (url) return url;
    }
    return undefined;
  }

  return (
    <main className="chat-shell">
      <section className="room-panel">
        <div className="tab-bar">
          <div className="tab-list">
            {channels.map((ch) => (
              <button
                key={ch.id}
                className={`tab ${ch.id === activeChannelId ? 'active' : ''}`}
                onClick={() => handleSelectChannel(ch.id)}
              >
                {ch.kind === 'dm' && <span className="tab-icon">&#9993;</span>}
                {channelName(ch)}
              </button>
            ))}
            <button className="tab tab-add" onClick={() => setShowCreatePanel(!showCreatePanel)}>
              +
            </button>
          </div>
          <div className="connection-pill" data-state={socketState}>
            <span />
            {socketState === 'connected' ? 'Live' : socketState === 'connecting' ? 'Connecting' : 'Offline'}
          </div>
        </div>

        {showCreatePanel && (
          <div className="create-panel">
            <CreateChannelForm onDone={handleCreateChannel} onClose={() => setShowCreatePanel(false)} />
            <div className="create-divider" />
            <div className="dm-list">
              <p className="create-label">Start a direct message</p>
              {otherUsers.map((u) => (
                <button key={u.id} className="dm-user" onClick={() => setFlyoutUserId(u.id)}>
                  <div className="dm-avatar-wrap">
                    <img
                      className="dm-avatar"
                      src={getDisplayAvatar(u) ?? FALBACK_AVATAR}
                      alt=""
                      onError={(e) => { (e.target as HTMLImageElement).src = FALBACK_AVATAR; }}
                    />
                    {u.discordId && presences[u.discordId] && (
                      <span className="dm-status-dot" style={{ backgroundColor: STATUS_COLORS[presences[u.discordId].discord_status] }} />
                    )}
                  </div>
                  <div className="dm-user-info">
                    <span>{u.displayName}</span>
                    <span className="dm-username">@{u.username}</span>
                    {u.discordId && presences[u.discordId] && (
                      <span className="dm-status-label">{STATUS_LABELS[presences[u.discordId].discord_status]}</span>
                    )}
                  </div>
                </button>
              ))}
              {otherUsers.length === 0 && <p className="dm-empty">No other users yet.</p>}
            </div>
          </div>
        )}

        <div className="room-header">
          <div>
            <p className="eyebrow">{activeChannel?.kind === 'dm' ? 'Direct message' : 'Channel'}</p>
            <h1>{activeChannel ? channelName(activeChannel) : ''}</h1>
          </div>
        </div>

        {notification && <div className="notification-bar">{notification}</div>}

        <MessageList ref={listRef} messages={activeMessages} currentUser={user} usersById={usersById} onDeleteMessage={handleDeleteMessage} />

        {typingText && <p className="typing-line">{typingText}</p>}

        <MessageComposer
          draft={draft}
          setDraft={setDraft}
          pendingFiles={pendingFiles}
          setPendingFiles={setPendingFiles}
          sending={sending}
          onSubmit={submit}
        />
      </section>

      <aside className="side-panel">
        <div className="profile-card">
          <div className="avatar-wrap">
            <img
              className="avatar"
              src={myAvatar ?? FALBACK_AVATAR}
              alt=""
              onError={(e) => { (e.target as HTMLImageElement).src = FALBACK_AVATAR; }}
              style={myAvatar ? {} : { backgroundColor: user.avatarColor }}
            />
            {myPresence && <span className="avatar-status-dot" style={{ backgroundColor: STATUS_COLORS[myPresence.discord_status] }} />}
          </div>
          <div>
            <p className="eyebrow">Signed in as</p>
            <h2>{user.displayName}</h2>
            <span>@{user.username}</span>
            {myPresence && <p className="profile-status">{STATUS_LABELS[myPresence.discord_status]}</p>}
          </div>
        </div>

        <div className="channel-list-panel">
          <p className="eyebrow">Channels</p>
          <ul className="channel-list">
            {channels.map((ch) => (
              <li key={ch.id}>
                <button
                  className={`channel-item ${ch.id === activeChannelId ? 'active' : ''}`}
                  onClick={() => handleSelectChannel(ch.id)}
                >
                  {ch.kind === 'dm' ? <span className="channel-icon">&#9993;</span> : <span className="channel-icon">#</span>}
                  {channelName(ch)}
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="member-list-panel">
          <p className="eyebrow">Members</p>
          <div className="member-list">
            {[...allUsers].sort(sortByPresence).map((u) => {
              const presence = u.discordId ? presences[u.discordId] : undefined;
              return (
                <button
                  key={u.id}
                  className={`member-item ${u.id === flyoutUserId ? 'active' : ''}`}
                  onClick={() => setFlyoutUserId(u.id === flyoutUserId ? null : u.id)}
                >
                  <div className="member-avatar-wrap">
                    <img
                      className="member-avatar"
                      src={getDisplayAvatar(u) ?? FALBACK_AVATAR}
                      alt=""
                      onError={(e) => { (e.target as HTMLImageElement).src = FALBACK_AVATAR; }}
                    />
                    {presence && (
                      <span className="member-status-dot" style={{ backgroundColor: STATUS_COLORS[presence.discord_status] }} />
                    )}
                  </div>
                  <div className="member-info">
                    <span className="member-name">{u.displayName}</span>
                    <span className="member-status">
                      {presence ? STATUS_LABELS[presence.discord_status] : 'Offline'}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <button className="danger-button" type="button" onClick={handleLogout}>
          Sign out
        </button>
      </aside>

      {flyoutUser && (
        <div className="flyout-overlay" onClick={() => setFlyoutUserId(null)}>
          <div className="flyout-panel" onClick={(e) => e.stopPropagation()}>
            <button className="flyout-close" onClick={() => setFlyoutUserId(null)}>×</button>

            <div className="flyout-header">
              <div className="flyout-avatar-wrap">
                <img
                  className="flyout-avatar"
                  src={getDisplayAvatar(flyoutUser) ?? FALBACK_AVATAR}
                  alt=""
                  onError={(e) => { (e.target as HTMLImageElement).src = FALBACK_AVATAR; }}
                />
                {flyoutPresence && <span className="flyout-status-dot" style={{ backgroundColor: STATUS_COLORS[flyoutPresence.discord_status] }} />}
              </div>
              <h2>{flyoutUser.displayName}</h2>
              <span className="flyout-username">@{flyoutUser.username}</span>
              {flyoutPresence && (
                <p className="flyout-status" style={{ color: STATUS_COLORS[flyoutPresence.discord_status] }}>
                  {STATUS_LABELS[flyoutPresence.discord_status]}
                </p>
              )}
            </div>

            {flyoutPresence && flyoutPresence.activities.length > 0 && (
              <div className="flyout-activities">
                <p className="eyebrow">Activities</p>
                {flyoutPresence.activities.filter((a) => a.type !== 4).map((a) => (
                  <div key={a.id} className="flyout-activity">
                    {a.assets?.large_image && (
                      <img
                        className="flyout-activity-icon"
                        src={`https://cdn.discordapp.com/app-assets/${a.application_id}/${a.assets.large_image}.png`}
                        alt=""
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    )}
                    <div>
                      <p className="flyout-activity-name">{a.name}</p>
                      {a.details && <p className="flyout-activity-line">{a.details}</p>}
                      {a.state && <p className="flyout-activity-line">{a.state}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {flyoutPresence?.listening_to_spotify && flyoutPresence.spotify && (
              <div className="flyout-spotify">
                <p className="eyebrow">Listening to Spotify</p>
                <div className="flyout-activity">
                  <img className="flyout-activity-icon" src={flyoutPresence.spotify.album_art_url} alt="" />
                  <div>
                    <p className="flyout-activity-name">{flyoutPresence.spotify.song}</p>
                    <p className="flyout-activity-line">{flyoutPresence.spotify.artist}</p>
                    <p className="flyout-activity-line">{flyoutPresence.spotify.album}</p>
                  </div>
                </div>
              </div>
            )}

            <button
              className="primary-button flyout-message"
              onClick={() => {
                handleCreateDm(flyoutUser.id);
                setFlyoutUserId(null);
              }}
            >
              Send Message
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function CreateChannelForm({ onDone, onClose }: { onDone: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState('');

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed) {
      onDone(trimmed);
      setName('');
    }
  }

  return (
    <form className="create-channel-form" onSubmit={handleSubmit}>
      <p className="create-label">New channel</p>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="channel-name"
        required
        autoFocus
      />
      <div className="create-actions">
        <button className="ghost-button" type="button" onClick={onClose}>Cancel</button>
        <button className="primary-button" type="submit" disabled={!name.trim()}>Create</button>
      </div>
    </form>
  );
}
