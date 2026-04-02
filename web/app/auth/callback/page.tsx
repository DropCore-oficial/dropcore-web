"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function AuthCallback() {
  const router = useRouter();

  useEffect(() => {
    supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        router.replace("/reset-password");
      }

      if (event === "SIGNED_IN") {
        router.replace("/org/membros");
      }
    });
  }, [router]);

  return <p>Processando autenticação…</p>;
}
