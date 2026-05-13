const BLING_API_ORIGIN = "https://api.bling.com.br";

function normalizeCompanyId(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed.slice(0, 128) : null;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value).slice(0, 128);
  }
  return null;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length < 2) return null;
  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = Buffer.from(padded, "base64").toString("utf8");
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function findCompanyIdInObject(value: unknown, depth = 0): string | null {
  if (depth > 6) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findCompanyIdInObject(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (!value || typeof value !== "object") return null;

  const record = value as Record<string, unknown>;
  for (const key of ["companyId", "company_id", "idEmpresa", "id_empresa"]) {
    const normalized = normalizeCompanyId(record[key]);
    if (normalized) return normalized;
  }

  for (const nested of Object.values(record)) {
    const found = findCompanyIdInObject(nested, depth + 1);
    if (found) return found;
  }
  return null;
}

export function extractCompanyIdFromBlingAccessToken(accessToken: string): string | null {
  const payload = decodeJwtPayload(accessToken.trim());
  if (!payload) return null;
  return findCompanyIdInObject(payload);
}

async function fetchCompanyIdFromBlingApi(accessToken: string): Promise<string | null> {
  const paths = ["/Api/v3/empresas/dados-basicos", "/Api/v3/empresas"];
  for (const path of paths) {
    const res = await fetch(`${BLING_API_ORIGIN}${path}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken.trim()}`,
        Accept: "application/json",
        "enable-jwt": "1",
      },
      cache: "no-store",
    });
    if (!res.ok) continue;
    const json = (await res.json().catch(() => null)) as unknown;
    const found = findCompanyIdInObject(json);
    if (found) return found;
  }
  return null;
}

export async function resolveBlingCompanyId(accessToken: string): Promise<string | null> {
  const fromJwt = extractCompanyIdFromBlingAccessToken(accessToken);
  if (fromJwt) return fromJwt;
  return fetchCompanyIdFromBlingApi(accessToken);
}

export function isBlingClientIdMisusedAsCompanyId(companyId: string | null | undefined): boolean {
  const clientId = process.env.BLING_CLIENT_ID?.trim().toLowerCase() ?? "";
  const normalized = companyId?.trim().toLowerCase() ?? "";
  return Boolean(clientId && normalized && normalized === clientId);
}

export function pickBlingCompanyIdForStorage(
  existing: string | null | undefined,
  resolved: string | null | undefined,
): string | null {
  const resolvedNormalized = resolved?.trim() ?? "";
  if (resolvedNormalized) return resolvedNormalized.slice(0, 128);

  const existingNormalized = existing?.trim() ?? "";
  if (!existingNormalized) return null;
  if (isBlingClientIdMisusedAsCompanyId(existingNormalized)) return null;
  return existingNormalized.slice(0, 128);
}
