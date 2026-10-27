/**
 * GET  /api/gestores-ia-avulso/cadastro — dados comerciais do assinante avulso logado.
 * PATCH /api/gestores-ia-avulso/cadastro — atualiza campos comerciais (opcional, não
 * bloqueia nada — diferente do onboarding obrigatório do hub em /api/seller/cadastro).
 *
 * Leitura/escrita via RPC (`fn_gestores_ia_avulso_cadastro_get/upsert`, ver
 * web/scripts/add-calculadora-assinante-cadastro-comercial.sql) — regra 9 do CLAUDE.md.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getAssinanteFromToken } from "@/lib/calculadoraAssinanteSessionAuth";
import { normalizeSellerDocDigits, documentoSellerValido } from "@/lib/sellerDocumento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type CadastroRow = {
  nome: string | null;
  tipo_documento: string | null;
  documento: string | null;
  email_comercial: string | null;
  telefone: string | null;
  cep: string | null;
  endereco: string | null;
  nome_responsavel: string | null;
  cpf_responsavel: string | null;
  data_nascimento: string | null;
};

export async function GET(req: Request) {
  try {
    const assinante = await getAssinanteFromToken(req);
    if (!assinante) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin.rpc("fn_gestores_ia_avulso_cadastro_get", {
      p_assinante_id: assinante.id,
    });
    if (error) {
      const missing = String(error.message ?? "").toLowerCase().includes("does not exist") || error.code === "42883";
      if (missing) {
        return NextResponse.json(
          {
            error:
              "RPC/colunas de cadastro ausentes. Execute web/scripts/add-calculadora-assinante-cadastro-comercial.sql no Supabase.",
            code: "CADASTRO_COLUNA_SQL",
          },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const row = (data ?? null) as CadastroRow | null;

    return NextResponse.json({
      nome: row?.nome ?? "",
      tipo_documento: row?.tipo_documento === "CPF" ? "CPF" : "CNPJ",
      documento: row?.documento ?? "",
      email: row?.email_comercial ?? "",
      telefone: row?.telefone ?? "",
      cep: row?.cep ?? "",
      endereco: row?.endereco ?? "",
      nome_responsavel: row?.nome_responsavel ?? "",
      cpf_responsavel: row?.cpf_responsavel ?? "",
      data_nascimento: row?.data_nascimento ?? "",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const assinante = await getAssinanteFromToken(req);
    if (!assinante) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = await req.json();
    const nome = String(body?.nome ?? "").trim();
    const tipo_documento = String(body?.tipo_documento ?? "").toUpperCase() === "CPF" ? "CPF" : "CNPJ";
    const documentoDigits = normalizeSellerDocDigits(String(body?.documento ?? ""));
    const email = String(body?.email ?? "").trim().toLowerCase();
    const telefone = String(body?.telefone ?? "").trim();
    const cep = String(body?.cep ?? "").replace(/\D/g, "").slice(0, 8);
    const endereco = String(body?.endereco ?? "").trim();
    const nome_responsavel = body?.nome_responsavel != null ? String(body.nome_responsavel).trim() : "";
    const cpf_responsavel = body?.cpf_responsavel != null ? String(body.cpf_responsavel).trim() : "";
    const data_nascimento = body?.data_nascimento != null ? String(body.data_nascimento).trim() : "";

    if (nome.length < 2) {
      return NextResponse.json({ error: "Informe a razão social ou nome fantasia (mínimo 2 caracteres)." }, { status: 400 });
    }

    const esperadoLen = tipo_documento === "CPF" ? 11 : 14;
    if (documentoDigits.length !== esperadoLen) {
      return NextResponse.json(
        { error: tipo_documento === "CPF" ? "CPF deve ter 11 dígitos." : "CNPJ deve ter 14 dígitos." },
        { status: 400 }
      );
    }
    if (!documentoSellerValido(documentoDigits)) {
      return NextResponse.json(
        { error: `${tipo_documento === "CPF" ? "CPF" : "CNPJ"} inválido (dígitos verificadores).` },
        { status: 400 }
      );
    }

    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailOk) {
      return NextResponse.json({ error: "Informe um e-mail comercial válido." }, { status: 400 });
    }

    const telDigits = telefone.replace(/\D/g, "");
    if (telDigits.length < 10) {
      return NextResponse.json({ error: "Informe um telefone com DDD (mínimo 10 dígitos)." }, { status: 400 });
    }

    if (cep.length !== 8) {
      return NextResponse.json({ error: "CEP deve ter 8 dígitos." }, { status: 400 });
    }

    if (endereco.length < 5) {
      return NextResponse.json({ error: "Endereço completo é obrigatório." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc("fn_gestores_ia_avulso_cadastro_upsert", {
      p_assinante_id: assinante.id,
      p_nome: nome,
      p_tipo_documento: tipo_documento,
      p_documento: documentoDigits,
      p_email_comercial: email || null,
      p_telefone: telefone || null,
      p_cep: cep ? cep.replace(/(\d{5})(\d{3})/, "$1-$2") : null,
      p_endereco: endereco || null,
      p_nome_responsavel: nome_responsavel || null,
      p_cpf_responsavel: cpf_responsavel || null,
      p_data_nascimento: data_nascimento || null,
    });
    if (error) {
      const missing = String(error.message ?? "").toLowerCase().includes("does not exist") || error.code === "42883";
      if (missing) {
        return NextResponse.json(
          {
            error:
              "RPC/colunas de cadastro ausentes. Execute web/scripts/add-calculadora-assinante-cadastro-comercial.sql no Supabase.",
            code: "CADASTRO_COLUNA_SQL",
          },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const row = (data ?? null) as CadastroRow | null;

    return NextResponse.json({
      ok: true,
      nome: row?.nome ?? "",
      tipo_documento: row?.tipo_documento === "CPF" ? "CPF" : "CNPJ",
      documento: row?.documento ?? "",
      email: row?.email_comercial ?? "",
      telefone: row?.telefone ?? "",
      cep: row?.cep ?? "",
      endereco: row?.endereco ?? "",
      nome_responsavel: row?.nome_responsavel ?? "",
      cpf_responsavel: row?.cpf_responsavel ?? "",
      data_nascimento: row?.data_nascimento ?? "",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
