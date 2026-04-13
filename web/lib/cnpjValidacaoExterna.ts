/**
 * Valida existência do CNPJ nas APIs públicas (BrasilAPI + fallback ReceitaWS),
 * alinhado ao GET /api/fornecedor/cadastro/cnpj.
 */
import { isValidCnpjDigits } from "@/lib/fornecedorCadastro";

const UA = "DropCore/1.0 (+https://www.dropcore.com.br/fornecedor/cadastro)";

type ReceitaWsJson = {
  status?: string;
  message?: string;
  nome?: string;
  fantasia?: string;
};

function receitaIndicaCnpjValido(raw: ReceitaWsJson): boolean {
  if (!raw || raw.status === "ERROR") return false;
  if (raw.message && /inválido|invalid|erro/i.test(String(raw.message))) return false;
  return Boolean(String(raw.nome ?? raw.fantasia ?? "").trim());
}

export async function validarCnpjNasApisPublicas(
  cnpjDigits: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!isValidCnpjDigits(cnpjDigits)) {
    return { ok: false, reason: "CNPJ inválido. Confira os 14 dígitos e os verificadores." };
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12_000);

  try {
    let brasilApiRes = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjDigits}`, {
      method: "GET",
      cache: "no-store",
      signal: ctrl.signal,
      headers: { Accept: "application/json", "User-Agent": UA },
    });

    if (brasilApiRes.status === 502 || brasilApiRes.status === 503 || brasilApiRes.status === 504) {
      await new Promise((r) => setTimeout(r, 400));
      brasilApiRes = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjDigits}`, {
        method: "GET",
        cache: "no-store",
        signal: ctrl.signal,
        headers: { Accept: "application/json", "User-Agent": UA },
      });
    }

    if (brasilApiRes.status === 404) {
      return { ok: false, reason: "CNPJ não encontrado na base oficial." };
    }
    if (brasilApiRes.status === 429) {
      return {
        ok: false,
        reason: "Limite de validação de CNPJ atingido. Tente novamente em instantes.",
      };
    }
    if (brasilApiRes.ok) {
      return { ok: true };
    }

    const receitaRes = await fetch(`https://www.receitaws.com.br/v1/cnpj/${cnpjDigits}`, {
      method: "GET",
      cache: "no-store",
      signal: ctrl.signal,
      headers: { Accept: "application/json", "User-Agent": UA },
    });

    if (receitaRes.ok) {
      const raw = (await receitaRes.json()) as ReceitaWsJson;
      if (receitaIndicaCnpjValido(raw)) {
        return { ok: true };
      }
    }

    return {
      ok: false,
      reason:
        "Não foi possível validar o CNPJ agora. Tente de novo em alguns minutos ou confira a conexão.",
    };
  } catch (e: unknown) {
    if (e instanceof Error && e.name === "AbortError") {
      return { ok: false, reason: "A validação demorou demais. Verifique a conexão e tente novamente." };
    }
    return {
      ok: false,
      reason: "Não foi possível validar o CNPJ agora. Tente novamente em instantes.",
    };
  } finally {
    clearTimeout(timer);
  }
}
