"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function TestePage() {
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        setError("");
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) throw new Error("Sem sessão. Faça login primeiro.");

        const res = await fetch("/api/org/me", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });

        const text = await res.text();
        let json: any = null;
        try {
          json = text ? JSON.parse(text) : null;
        } catch {
          throw new Error(text || "Resposta inválida");
        }

        if (!res.ok) throw new Error(json?.error || "Erro na API");
        setResult(json);
      } catch (e: any) {
        setError(e?.message || "Erro desconhecido");
      }
    })();
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <h1>Teste /api/org/me</h1>
      {error ? (
        <pre style={{ color: "red", whiteSpace: "pre-wrap" }}>{error}</pre>
      ) : (
        <pre style={{ whiteSpace: "pre-wrap" }}>
          {result ? JSON.stringify(result, null, 2) : "Carregando..."}
        </pre>
      )}
    </div>
  );
}
