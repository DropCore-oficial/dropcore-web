"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { gestoresIaSellerPermitido } from "./gestoresIaAcesso";

/** Cache em memória do módulo — evita rechamar /api/org/me a cada navegação client-side
 * (SellerNav é remontado em toda página do seller, não vive num layout compartilhado). */
let cache: boolean | null = null;

/** true só pro seller Galileus (piloto restrito dos Gestores de IA) — ver gestoresIaAcesso.ts. */
export function useGestoresIaPermitido(): boolean {
  const [permitido, setPermitido] = useState(cache ?? false);

  useEffect(() => {
    if (cache !== null) {
      setPermitido(cache);
      return;
    }
    let cancelled = false;
    (async () => {
      const {
        data: { session },
      } = await supabaseBrowser.auth.getSession();
      if (!session?.access_token) return;
      const res = await fetch("/api/org/me", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      if (cancelled || !res.ok) return;
      const data = (await res.json().catch(() => ({}))) as { seller_id?: string | null };
      const ok = gestoresIaSellerPermitido(data.seller_id);
      cache = ok;
      if (!cancelled) setPermitido(ok);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return permitido;
}
