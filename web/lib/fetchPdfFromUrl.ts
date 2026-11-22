export const MAX_ETIQUETA_PDF_BYTES = Math.floor(1.35 * 1024 * 1024);

/** Baixa URL (link temporário de etiqueta) e devolve base64 do PDF, com limite de tamanho para gravar no Postgres. */
export async function fetchUrlAsPdfBase64(url: string, maxBytes = MAX_ETIQUETA_PDF_BYTES): Promise<string | null> {
  const u = url.trim();
  if (!u.startsWith("http")) return null;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 45_000);
  try {
    const res = await fetch(u, { redirect: "follow", signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) return null;
    const cl = res.headers.get("content-length");
    if (cl && Number(cl) > maxBytes) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength > maxBytes) return null;
    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    const looksPdf =
      ct.includes("pdf") ||
      ct.includes("octet-stream") ||
      u.toLowerCase().includes(".pdf") ||
      u.toLowerCase().includes("pdf");
    if (!looksPdf) return null;
    return Buffer.from(buf).toString("base64");
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
