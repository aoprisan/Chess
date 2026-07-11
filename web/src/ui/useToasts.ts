import { useEffect, useRef, useState, useCallback } from 'react';

export interface Toast {
  id: number;
  text: string;
  accent: string;
}

/**
 * Toast queue with auto-expiry, tap-to-dismiss, and a stacking cap: pushing
 * past `max` evicts the oldest toast so a busy battle outcome can't flood
 * the screen.
 */
export function useToasts(max = 4, ttl = 4000) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const remove = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) clearTimeout(timer);
    timers.current.delete(id);
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const pushToast = useCallback(
    (text: string, accent = '#00e5ff') => {
      const id = ++nextId.current;
      setToasts((t) => {
        const next = [...t, { id, text, accent }];
        for (const evicted of next.slice(0, Math.max(0, next.length - max))) {
          const timer = timers.current.get(evicted.id);
          if (timer !== undefined) clearTimeout(timer);
          timers.current.delete(evicted.id);
        }
        return next.slice(-max);
      });
      timers.current.set(
        id,
        setTimeout(() => remove(id), ttl),
      );
    },
    [max, ttl, remove],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  return { toasts, pushToast, dismissToast: remove };
}
