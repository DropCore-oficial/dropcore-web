"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Notif = {
  id: string;
  titulo: string;
  mensagem: string;
  tipo: string;
};

const POLL_MS = 15000;

export function NotificationToasts() {
  const [toasts, setToasts] = useState<Notif[]>([]);

  const fetchAndShow = async () => {
    const { data: { session } } = await supabaseBrowser.auth.getSession();
    if (!session?.access_token) return;
    try {
      const res = await fetch("/api/notifications?mark_read=1", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const json = await res.json();
      const items = (json.items ?? []).filter((n: { lido?: boolean }) => !n.lido);
      if (items.length) {
        const newNotifs = items.slice(0, 5).map((n: { id: string; titulo: string; mensagem: string; tipo: string }) => ({
          id: n.id,
          titulo: n.titulo,
          mensagem: n.mensagem ?? "",
          tipo: n.tipo,
        }));
        setToasts((prev) => {
          const seen = new Set(prev.map((t) => t.id));
          const added = newNotifs.filter((n: Notif) => !seen.has(n.id));
          return [...added, ...prev].slice(0, 5);
        });
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchAndShow();
    const t = setInterval(fetchAndShow, POLL_MS);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (toasts.length === 0) return;
    const id = toasts[0]?.id;
    const timer = setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 5000);
    return () => clearTimeout(timer);
  }, [toasts]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map((n) => (
        <div
          key={n.id}
          className="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/80 dark:bg-opacity-95 px-4 py-3 shadow-lg animate-in slide-in-from-right-5"
        >
          <p className="font-semibold text-emerald-900 dark:text-emerald-100 text-sm">{n.titulo}</p>
          {n.mensagem && <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">{n.mensagem}</p>}
        </div>
      ))}
    </div>
  );
}
