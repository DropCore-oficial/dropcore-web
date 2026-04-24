/**
 * PATCH /api/fornecedor/cadastro
 * Atualiza dados da empresa e/ou dados bancários do fornecedor autenticado.
 */
import { NextResponse } from "next/server";
import { getFornecedorIdFromBearer } from "@/lib/fornecedorAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { validarCnpjNasApisPublicas } from "@/lib/cnpjValidacaoExterna";
import { isValidCnpjDigits, normalizeCnpjInput } from "@/lib/fornecedorCadastro";
import { validarRepasseTitularEmpresa } from "@/lib/repasseTitularCnpj";
import { buildExpedicaoPadraoLinha, type ExpedicaoEnderecoParts } from "@/lib/expedicaoFornecedorFormat";

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

const EXPEDICAO_FIELDS = [
  "expedicao_cep",
  "expedicao_logradouro",
  "expedicao_numero",
  "expedicao_complemento",
  "expedicao_bairro",
  "expedicao_cidade",
  "expedicao_uf",
] as const;

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
        const validacaoExterna = await validarCnpjNasApisPublicas(digits);
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

    if ("expedicao_padrao_linha" in body) {
      const v = body.expedicao_padrao_linha;
      const s =
        v === null || v === undefined || String(v).trim() === ""
          ? null
          : String(v).trim().slice(0, 4000);
      update.expedicao_padrao_linha = s;
    }

    for (const f of EXPEDICAO_FIELDS) {
      if (f in body) {
        const v = body[f];
        const s = v === null || v === undefined || String(v).trim() === "" ? null : String(v).trim();
        if (f === "expedicao_cep" && s) {
          const d = s.replace(/\D/g, "");
          if (d.length > 0 && d.length !== 8) {
            return NextResponse.json({ error: "CEP de despacho inválido." }, { status: 400 });
          }
          update[f] = d.length === 8 ? d : null;
        } else if (f === "expedicao_uf" && s && !/^[A-Za-z]{2}$/.test(s)) {
          return NextResponse.json({ error: "UF de despacho inválida. Use 2 letras (ex.: SP)." }, { status: 400 });
        } else {
          update[f] = f === "expedicao_uf" && s ? s.toUpperCase() : s;
        }
      }
    }

    const expedicaoTouched = EXPEDICAO_FIELDS.some((f) => f in body);
    if (expedicaoTouched) {
      const { data: curExp, error: curExpErr } = await supabaseAdmin
        .from("fornecedores")
        .select(EXPEDICAO_FIELDS.join(", "))
        .eq("id", fornecedor_id)
        .maybeSingle();
      if (curExpErr) {
        const colMissing =
          String(curExpErr.message ?? "").toLowerCase().includes("column") || curExpErr.code === "42703";
        if (colMissing) {
          return NextResponse.json(
            {
              error:
                "Colunas de endereço de despacho em falta na base. Executa o script web/scripts/add-expedicao-endereco-estruturado-fornecedor.sql no Supabase.",
              code: "EXPEDICAO_COLUNAS_SQL",
            },
            { status: 503 },
          );
        }
        return NextResponse.json({ error: curExpErr.message }, { status: 500 });
      }
      const merged = {} as ExpedicaoEnderecoParts;
      for (const f of EXPEDICAO_FIELDS) {
        const key = f as keyof ExpedicaoEnderecoParts;
        merged[key] =
          f in update
            ? ((update as Record<string, string | null>)[f] ?? null)
            : ((curExp as Record<string, string | null> | null)?.[f] ?? null);
      }
      update.expedicao_padrao_linha = buildExpedicaoPadraoLinha(merged);
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ ok: true, message: "Nenhum dado alterado." });
    }

    const { data: rowAtual, error: errRow } = await supabaseAdmin
      .from("fornecedores")
      .select("nome, cnpj, chave_pix, nome_banco, nome_no_banco, agencia, conta, tipo_conta")
      .eq("id", fornecedor_id)
      .maybeSingle();

    if (errRow || !rowAtual) {
      return NextResponse.json({ error: "Fornecedor não encontrado." }, { status: 404 });
    }

    const repasseCheck = validarRepasseTitularEmpresa({
      razaoSocial: String(("nome" in update ? update.nome : rowAtual.nome) ?? "").trim(),
      cnpjEmpresa: normalizeCnpjInput(String(("cnpj" in update ? update.cnpj : rowAtual.cnpj) ?? "")),
      chave_pix: ("chave_pix" in update ? update.chave_pix : rowAtual.chave_pix) ?? null,
      nome_banco: ("nome_banco" in update ? update.nome_banco : rowAtual.nome_banco) ?? null,
      nome_no_banco: ("nome_no_banco" in update ? update.nome_no_banco : rowAtual.nome_no_banco) ?? null,
      agencia: ("agencia" in update ? update.agencia : rowAtual.agencia) ?? null,
      conta: ("conta" in update ? update.conta : rowAtual.conta) ?? null,
      tipo_conta: ("tipo_conta" in update ? update.tipo_conta : rowAtual.tipo_conta) ?? null,
    });
    if (!repasseCheck.ok) {
      return NextResponse.json({ error: repasseCheck.error }, { status: 400 });
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
