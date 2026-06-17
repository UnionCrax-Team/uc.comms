import { createContext, useContext, useEffect, useRef, useState } from 'react';

const LANYARD_WS = 'wss://api.lanyard.rest/socket';

export interface LanyardData {
  discord_status: 'online' | 'idle' | 'dnd' | 'offline';
  discord_user: {
    id: string;
    username: string;
    discriminator: string;
    avatar: string;
  };
  activities: {
    id: string;
    name: string;
    type: number;
    state?: string;
    details?: string;
    timestamps?: { start?: number; end?: number };
    application_id?: string;
    assets?: { large_image?: string; large_text?: string; small_image?: string; small_text?: string };
    emoji?: { name: string; id?: string; animated?: boolean };
  }[];
  listening_to_spotify: boolean;
  spotify: {
    track_id: string;
    timestamps: { start: number; end: number };
    song: string;
    artist: string;
    album_art_url: string;
    album: string;
  } | null;
}

interface LanyardContextValue {
  presences: Record<string, LanyardData>;
  getAvatarUrl: (discordId: string) => string | null;
}

const LanyardContext = createContext<LanyardContextValue>({
  presences: {},
  getAvatarUrl: () => null
});

export function useLanyard() {
  return useContext(LanyardContext);
}

export const STATUS_LABELS: Record<string, string> = {
  online: 'Online',
  idle: 'Idle',
  dnd: 'Do Not Disturb',
  offline: 'Offline'
};

export const STATUS_COLORS: Record<string, string> = {
  online: 'var(--green-bright)',
  idle: 'var(--amber)',
  dnd: 'var(--danger)',
  offline: 'var(--muted)'
};

export function getAvatarUrl(discordId: string, avatar: string) {
  if (avatar.startsWith('a_')) {
    return `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.gif`;
  }
  return `https://cdn.discordapp.com/avatars/${discordId}/${avatar}.png`;
}

export function LanyardProvider({ discordIds, children }: { discordIds: string[]; children: React.ReactNode }) {
  const [presences, setPresences] = useState<Record<string, LanyardData>>({});
  const wsRef = useRef<WebSocket | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const subscribedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const activeIds = discordIds.filter(Boolean);
    if (activeIds.length === 0) return;

    let mounted = true;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      if (!mounted) return;
      const ws = new WebSocket(LANYARD_WS);
      wsRef.current = ws;

      ws.onopen = () => {};

      ws.onmessage = (event) => {
        if (!mounted) return;
        try {
          const msg = JSON.parse(event.data);

          if (msg.op === 1) {
            const interval = msg.d?.heartbeat_interval ?? 30000;
            if (heartbeatRef.current) clearInterval(heartbeatRef.current);
            heartbeatRef.current = setInterval(() => {
              ws.send(JSON.stringify({ op: 3 }));
            }, interval);

            for (const id of activeIds) {
              ws.send(JSON.stringify({ op: 2, d: { subscribe_to_id: id } }));
              subscribedRef.current.add(id);
            }
          }

          if (msg.op === 0) {
            const data = msg.d as LanyardData;
            if (data.discord_user?.id) {
              setPresences((prev) => ({ ...prev, [data.discord_user.id]: data }));
            }
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onerror = (err) => { console.error('Lanyard WS error', err); };

      ws.onclose = () => {
        if (!mounted) return;
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current);
          heartbeatRef.current = null;
        }
        reconnectTimer = setTimeout(connect, 5000);
      };
    }

    connect();

    return () => {
      mounted = false;
      if (heartbeatRef.current) clearInterval(heartbeatRef.current);
      if (wsRef.current) wsRef.current.close();
      clearTimeout(reconnectTimer);
    };
  }, [discordIds.join(',')]);

  function getAvatar(discordId: string): string | null {
    const presence = presences[discordId];
    if (!presence?.discord_user?.avatar) return null;
    return getAvatarUrl(discordId, presence.discord_user.avatar);
  }

  return (
    <LanyardContext.Provider value={{ presences, getAvatarUrl: getAvatar }}>
      {children}
    </LanyardContext.Provider>
  );
}
