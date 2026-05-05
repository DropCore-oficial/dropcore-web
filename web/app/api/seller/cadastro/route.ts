/**
 * GET  /api/seller/cadastro — dados do seller logado para o formulário de cadastro.
 * PATCH /api/seller/cadastro — atualiza campos comerciais (whitelist) do seller logado (plano opcional).
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  cadastroSellerDocumentoPendente,
  documentoSellerValido,
  normalizeSellerDocDigits,
  planoSellerDefinido,
  sellerCadastroPendente,
} from "@/lib/sellerDocumento";
import { sellerFromBearer } from "@/lib/sellerFromBearer";
import { SELLER_PLANO_OPCOES_LEGIVEL } from "@/lib/sellerPlanoLabels";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function inferTipoDocumento(documento: string | null): "CNPJ" | "CPF" {
  const d = normalizeSellerDocDigits(documento);
  if (d.length === 11) return "CPF";
  if (d.length === 14) return "CNPJ";
  return "CNPJ";
}

export async function GET(req: Request) {
  try {
    const { error, seller } = await sellerFromBearer(req);
    if (error || !seller) {
      return NextResponse.json({ error }, { status: error === "Sem token de autenticação." ? 401 : 404 });
    }

    const planoRow = seller.plano ?? null;
    const cadastro_dados_pendente = cadastroSellerDocumentoPendente(seller.documento);
    const plano_pendente = !planoSellerDefinido(planoRow);
    const cadastro_pendente = sellerCadastroPendente(seller.documento, planoRow);

    const tipo_documento = inferTipoDocumento(seller.documento);

    let logo_url: string | null = null;
    const lr = await supabaseAdmin.from("sellers").select("logo_url").eq("id", seller.id).maybeSingle();
    if (lr.error) {
      const missing =
        String(lr.error.code ?? "") === "42703" ||
        String(lr.error.message ?? "").toLowerCase().includes("logo_url") ||
        String(lr.error.message ?? "").toLowerCase().includes("does not exist");
      if (!missing) {
        return NextResponse.json({ error: lr.error.message }, { status: 500 });
      }
    } else {
      logo_url = (lr.data as { logo_url?: string | null } | null)?.logo_url ?? null;
    }

    return NextResponse.json({
      cadastro_pendente,
      cadastro_dados_pendente,
      plano_pendente,
      tipo_documento,
      plano: planoRow ?? "",
      nome: seller.nome ?? "",
      documento: seller.documento ?? "",
      email: seller.email ?? "",
      telefone: seller.telefone ?? "",
      cep: seller.cep ?? "",
      endereco: seller.endereco ?? "",
      nome_responsavel: seller.nome_responsavel ?? "",
      cpf_responsavel: seller.cpf_responsavel ?? "",
      data_nascimento: seller.data_nascimento ?? "",
      logo_url,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const { error, seller } = await sellerFromBearer(req);
    if (error || !seller) {
      return NextResponse.json({ error }, { status: error === "Sem token de autenticação." ? 401 : 404 });
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

    let planoNorm: "Pro" | "Starter" | undefined;
    if (body?.plano != null && String(body.plano).trim() !== "") {
      const planoRaw = String(body.plano).trim().toLowerCase();
      const n = planoRaw === "pro" ? "Pro" : planoRaw === "starter" ? "Starter" : null;
      if (!n) {
        return NextResponse.json(
          { error: `Plano inválido. Indique ${SELLER_PLANO_OPCOES_LEGIVEL} no corpo (campos starter ou pro).` },
          { status: 400 }
        );
      }
      planoNorm = n;
    }

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

    const documentoSalvar = documentoDigits;

    const updateRow: Record<string, unknown> = {
      nome,
      documento: documentoSalvar,
      email: email || null,
      telefone: telefone || null,
      cep: cep ? cep.replace(/(\d{5})(\d{3})/, "$1-$2") : null,
      endereco: endereco || null,
      nome_responsavel: nome_responsavel || null,
      cpf_responsavel: cpf_responsavel || null,
      data_nascimento: data_nascimento || null,
    };
    if (planoNorm) updateRow.plano = planoNorm;

    const { data: updated, error: upErr } = await supabaseAdmin
      .from("sellers")
      .update(updateRow)
      .eq("id", seller.id)
      .select("id, nome, documento, plano, email, telefone, cep, endereco, nome_responsavel, cpf_responsavel, data_nascimento")
      .single();

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    const doc = updated?.documento ?? null;
    const plan = (updated as { plano?: string | null } | null)?.plano ?? null;
    const cadastro_dados_pendente = cadastroSellerDocumentoPendente(doc);
    const plano_pendente = !planoSellerDefinido(plan);

    return NextResponse.json({
      ok: true,
      cadastro_pendente: sellerCadastroPendente(doc, plan),
      cadastro_dados_pendente,
      plano_pendente,
      seller: updated,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
