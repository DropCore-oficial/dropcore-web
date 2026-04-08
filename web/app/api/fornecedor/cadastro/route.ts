/**
 * PATCH /api/fornecedor/cadastro
 * Atualiza dados da empresa e/ou dados bancários do fornecedor autenticado.
 */
import { NextResponse } from "next/server";
import { getFornecedorIdFromBearer } from "@/lib/fornecedorAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isValidCnpjDigits, normalizeCnpjInput } from "@/lib/fornecedorCadastro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BANK_FIELDS = ["chave_pix", "nome_banco", "nome_no_banco", "agencia", "conta", "tipo_conta"] as const;
const ENDERECO_FIELDS = [
  "endereco_cep",
  "endereco_logradouro",
  "endereco_numero",
  "endereco_complemento",
  "endereco_bairro",
  "endereco_cidade",
  "endereco_uf",
] as const;

async function validarCnpjExterno(cnpjDigits: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  try {
    const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjDigits}`, {
      method: "GET",
      cache: "no-store",
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });

    if (res.ok) return { ok: true };

    if (res.status === 404) {
      return { ok: false, reason: "CNPJ não encontrado na base oficial." };
    }

    if (res.status === 429) {
      return { ok: false, reason: "Validação de CNPJ indisponível no momento (limite da API). Tente novamente." };
    }

    return { ok: false, reason: "Não foi possível validar o CNPJ agora. Tente novamente em instantes." };
  } catch {
    return { ok: false, reason: "Não foi possível validar o CNPJ agora. Tente novamente em instantes." };
  } finally {
    clearTimeout(timer);
  }
}

export async function PATCH(req: Request) {
  try {
    const fornecedor_id = await getFornecedorIdFromBearer(req);
    if (!fornecedor_id) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const update: Record<string, string | null> = {};

    if ("nome" in body) {
      const v = body.nome;
      if (v === null || v === undefined) {
        return NextResponse.json({ error: "Nome inválido." }, { status: 400 });
      }
      const t = String(v).trim();
      if (t.length > 0 && t.length < 2) {
        return NextResponse.json({ error: "Nome deve ter pelo menos 2 caracteres." }, { status: 400 });
      }
      if (t.length >= 2) update.nome = t;
    }

    if ("cnpj" in body) {
      const raw = body.cnpj;
      if (raw === null || raw === undefined || String(raw).trim() === "") {
        update.cnpj = null;
      } else {
        const digits = normalizeCnpjInput(String(raw));
        if (!isValidCnpjDigits(digits)) {
          return NextResponse.json(
            { error: "CNPJ inválido. Confira os 14 dígitos e os verificadores." },
            { status: 400 }
          );
        }
        const validacaoExterna = await validarCnpjExterno(digits);
        if (!validacaoExterna.ok) {
          return NextResponse.json({ error: validacaoExterna.reason }, { status: 400 });
        }
        update.cnpj = digits;
      }
    }

    if ("telefone" in body) {
      const v = body.telefone;
      update.telefone =
        v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim();
    }

    if ("email_comercial" in body) {
      const v = body.email_comercial;
      if (v === null || v === undefined || String(v).trim() === "") {
        update.email_comercial = null;
      } else {
        const t = String(v).trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) {
          return NextResponse.json({ error: "E-mail comercial inválido." }, { status: 400 });
        }
        update.email_comercial = t;
      }
    }

    for (const f of BANK_FIELDS) {
      if (f in body) {
        const v = body[f];
        let s = v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim();
        if (f === "tipo_conta" && s && s !== "corrente" && s !== "poupanca") {
          return NextResponse.json({ error: "Tipo de conta inválido." }, { status: 400 });
        }
        update[f] = s;
      }
    }

    for (const f of ENDERECO_FIELDS) {
      if (f in body) {
        const v = body[f];
        const s = v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim();
        if (f === "endereco_cep" && s && s.replace(/\D/g, "").length !== 8) {
          return NextResponse.json({ error: "CEP inválido." }, { status: 400 });
        }
        if (f === "endereco_uf" && s && !/^[A-Za-z]{2}$/.test(s)) {
          return NextResponse.json({ error: "UF inválida. Use 2 letras (ex.: SP)." }, { status: 400 });
        }
        update[f] = f === "endereco_uf" && s ? s.toUpperCase() : s;
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ ok: true, message: "Nenhum dado alterado." });
    }

    const { error } = await supabaseAdmin.from("fornecedores").update(update).eq("id", fornecedor_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
