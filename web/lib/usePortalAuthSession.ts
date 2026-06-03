"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

/** `true` quando há access token Supabase (seller, fornecedor ou admin logado). */
export function usePortalAuthSession(): boolean {
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!cancelled) setHasSession(!!session?.access_token);
    };

    void sync();

    const {
      data: { subscription },
    } = supabaseBrowser.auth.onAuthStateChange(() => {
      void sync();
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  return hasSession;
}
