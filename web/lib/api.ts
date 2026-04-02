// web/lib/api.ts
import { supabaseBrowser } from "./supabaseBrowser";

export async function apiGet<T>(path: string) {
  const { data } = await supabaseBrowser.auth.getSession();
  const token = data.session?.access_token;

  const res = await fetch(path, {
    method: "GET",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    cache: "no-store",
  });

  // se a rota voltou HTML/erro, a gente captura texto pra debug
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`API não retornou JSON. Status ${res.status}. Body: ${text.slice(0, 200)}`);
  }

  if (!res.ok) {
    throw new Error(json?.error || `Erro API ${res.status}`);
  }

  return json as T;
}
