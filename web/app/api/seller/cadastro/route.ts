/**
 * GET  /api/seller/cadastro — dados do seller logado para o formulário de cadastro.
 * PATCH /api/seller/cadastro — atualiza campos comerciais (whitelist) do seller logado.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createClient } from "@supabase/supabase-js";
import {
  documentoSellerValido,
  normalizeSellerDocDigits,
  sellerCadastroPendente,
} from "@/lib/sellerDocumento";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function sellerFromBearer(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return { error: "Sem token de autenticação." as const, user_id: null, seller: null };

  const sbAnon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
  if (userErr || !userData?.user) {
    return { error: "Token inválido ou expirado." as const, user_id: null, seller: null };
  }

  const user_id = userData.user.id;
  const { data: seller, error: sellerErr } = await supabaseAdmin
    .from("sellers")
    .select(
      "id, org_id, nome, documento, plano, email, telefone, cep, endereco, nome_responsavel, cpf_responsavel, data_nascimento, nome_banco, nome_no_banco, agencia, conta, tipo_conta, status"
    )
    .eq("user_id", user_id)
    .maybeSingle();

  if (sellerErr || !seller) {
    return { error: "Seller não encontrado para este usuário." as const, user_id: null, seller: null };
  }
  if (seller.status === "bloqueado") {
    return { error: "Conta bloqueada. Entre em contato com o suporte." as const, user_id: null, seller: null };
  }

  return { error: null, user_id, seller };
}

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

    const cadastro_pendente = sellerCadastroPendente(seller.documento, (seller as { plano?: string | null }).plano);
    const tipo_documento = inferTipoDocumento(seller.documento);
    const planoRow = (seller as { plano?: string | null }).plano ?? null;

    return NextResponse.json({
      cadastro_pendente,
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
      nome_banco: seller.nome_banco ?? "",
      nome_no_banco: seller.nome_no_banco ?? "",
      agencia: seller.agencia ?? "",
      conta: seller.conta ?? "",
      tipo_conta: seller.tipo_conta ?? "",
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
    const nome_banco = body?.nome_banco != null ? String(body.nome_banco).trim() : "";
    const nome_no_banco = body?.nome_no_banco != null ? String(body.nome_no_banco).trim() : "";
    const agencia = body?.agencia != null ? String(body.agencia).trim() : "";
    const conta = body?.conta != null ? String(body.conta).trim() : "";
    const tipo_conta = body?.tipo_conta != null ? String(body.tipo_conta).trim() : "";
    const planoRaw = String(body?.plano ?? "").trim().toLowerCase();
    const planoNorm = planoRaw === "pro" ? "Pro" : planoRaw === "starter" ? "Starter" : null;
    if (!planoNorm) {
      return NextResponse.json({ error: "Escolha o plano Starter ou Pro." }, { status: 400 });
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
      plano: planoNorm,
      documento: documentoSalvar,
      email: email || null,
      telefone: telefone || null,
      cep: cep ? cep.replace(/(\d{5})(\d{3})/, "$1-$2") : null,
      endereco: endereco || null,
      nome_responsavel: nome_responsavel || null,
      cpf_responsavel: cpf_responsavel || null,
      data_nascimento: data_nascimento || null,
      nome_banco: nome_banco || null,
      nome_no_banco: nome_no_banco || null,
      agencia: agencia || null,
      conta: conta || null,
      tipo_conta: tipo_conta || null,
    };

    const { data: updated, error: upErr } = await supabaseAdmin
      .from("sellers")
      .update(updateRow)
      .eq("id", seller.id)
      .select(
        "id, nome, documento, plano, email, telefone, cep, endereco, nome_responsavel, cpf_responsavel, data_nascimento, nome_banco, nome_no_banco, agencia, conta, tipo_conta"
      )
      .single();

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      cadastro_pendente: sellerCadastroPendente(
        updated?.documento ?? null,
        (updated as { plano?: string | null } | null)?.plano ?? null
      ),
      seller: updated,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
