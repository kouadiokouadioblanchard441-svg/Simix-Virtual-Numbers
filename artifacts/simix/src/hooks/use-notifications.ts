import { useState, useEffect, useCallback, useRef } from "react";

const BASE = () => (import.meta.env.BASE_URL ?? "/").replace(/\/$/, "") + "/api";

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  type: string;
  icon?: string | null;
  link?: string | null;
  isRead: boolean;
  isGlobal: boolean;
  createdAt: string;
}

export function useNotifications(enabled = true) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const sseRef = useRef<EventSource | null>(null);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const [listRes, countRes] = await Promise.all([
        fetch(`${BASE()}/notifications?limit=30`, { credentials: "include" }),
        fetch(`${BASE()}/notifications/unread-count`, { credentials: "include" }),
      ]);
      if (listRes.ok) {
        const data = await listRes.json();
        setNotifications(data.notifications ?? []);
      }
      if (countRes.ok) {
        const data = await countRes.json();
        setUnreadCount(data.count ?? 0);
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  const connectSSE = useCallback(() => {
    if (sseRef.current) return;
    const es = new EventSource(`${BASE()}/notifications/stream`, { withCredentials: true });
    sseRef.current = es;

    es.onmessage = (e) => {
      try {
        const parsed = JSON.parse(e.data);
        if (parsed.event === "notification") {
          const notif: AppNotification = { ...parsed.data, isRead: false };
          setNotifications(prev => [notif, ...prev]);
          setUnreadCount(c => c + 1);
          playNotificationSound();
        }
      } catch { /* ignore */ }
    };

    es.onerror = () => {
      es.close();
      sseRef.current = null;
      setTimeout(connectSSE, 5000);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;
    fetchNotifications();
    connectSSE();
    return () => {
      sseRef.current?.close();
      sseRef.current = null;
    };
  }, [enabled, fetchNotifications, connectSSE]);

  const markRead = useCallback(async (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
    setUnreadCount(c => Math.max(0, c - 1));
    await fetch(`${BASE()}/notifications/${id}/read`, { method: "PATCH", credentials: "include" });
  }, []);

  const markAllRead = useCallback(async () => {
    setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
    setUnreadCount(0);
    await fetch(`${BASE()}/notifications/read-all`, { method: "PATCH", credentials: "include" });
  }, []);

  return { notifications, unreadCount, loading, fetchNotifications, markRead, markAllRead };
}

function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch { /* ignore if no audio context */ }
}
