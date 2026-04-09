/**
 * GET /api/fornecedor/me
 * Retorna dados do fornecedor autenticado (via org_members.fornecedor_id).
 * Requer Bearer token do Supabase Auth.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { cadastroMinimoCompleto } from "@/lib/fornecedorCadastro";
import { isPortalTrialAtivo } from "@/lib/portalTrial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) {
      return NextResponse.json({ error: "Sem token de autenticação." }, { status: 401 });
    }

    const sbAnon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );
    const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "Token inválido ou expirado." }, { status: 401 });
    }

    const user_id = userData.user.id;

    // Busca org_members onde fornecedor_id está preenchido (usuário é fornecedor)
    const { data: member, error: memErr } = await supabaseAdmin
      .from("org_members")
      .select("org_id, fornecedor_id")
      .eq("user_id", user_id)
      .not("fornecedor_id", "is", null)
      .limit(1)
      .maybeSingle();

    if (memErr || !member?.fornecedor_id) {
      return NextResponse.json({ error: "Fornecedor não encontrado para este usuário." }, { status: 404 });
    }

    const { data: forn, error: fornErr } = await supabaseAdmin
      .from("fornecedores")
      .select(
        "id, nome, org_id, status, trial_valido_ate, cnpj, telefone, email_comercial, endereco_cep, endereco_logradouro, endereco_numero, endereco_complemento, endereco_bairro, endereco_cidade, endereco_uf, chave_pix, nome_banco, nome_no_banco, agencia, conta, tipo_conta"
      )
      .eq("id", member.fornecedor_id)
      .maybeSingle();

    if (fornErr || !forn) {
      return NextResponse.json({ error: "Fornecedor não encontrado." }, { status: 404 });
    }

    const frow = forn as typeof forn & {
      trial_valido_ate?: string | null;
      cnpj?: string | null;
      telefone?: string | null;
      email_comercial?: string | null;
      endereco_cep?: string | null;
      endereco_logradouro?: string | null;
      endereco_numero?: string | null;
      endereco_complemento?: string | null;
      endereco_bairro?: string | null;
      endereco_cidade?: string | null;
      endereco_uf?: string | null;
    };

    if (frow.status === "inativo") {
      return NextResponse.json({ error: "Conta inativa. Entre em contato com o suporte." }, { status: 403 });
    }

    const cadastro = {
      cnpj: frow.cnpj ?? null,
      telefone: frow.telefone ?? null,
      email_comercial: frow.email_comercial ?? null,
      endereco_cep: frow.endereco_cep ?? null,
      endereco_logradouro: frow.endereco_logradouro ?? null,
      endereco_numero: frow.endereco_numero ?? null,
      endereco_complemento: frow.endereco_complemento ?? null,
      endereco_bairro: frow.endereco_bairro ?? null,
      endereco_cidade: frow.endereco_cidade ?? null,
      endereco_uf: frow.endereco_uf ?? null,
      chave_pix: frow.chave_pix ?? null,
      nome_banco: frow.nome_banco ?? null,
      nome_no_banco: frow.nome_no_banco ?? null,
      agencia: frow.agencia ?? null,
      conta: frow.conta ?? null,
      tipo_conta: frow.tipo_conta ?? null,
    };

    return NextResponse.json({
      ok: true,
      fornecedor: {
        id: frow.id,
        nome: frow.nome,
        org_id: frow.org_id,
        status: frow.status,
        cnpj: cadastro.cnpj,
        telefone: cadastro.telefone,
        email_comercial: cadastro.email_comercial,
        endereco_cep: cadastro.endereco_cep,
        endereco_logradouro: cadastro.endereco_logradouro,
        endereco_numero: cadastro.endereco_numero,
        endereco_complemento: cadastro.endereco_complemento,
        endereco_bairro: cadastro.endereco_bairro,
        endereco_cidade: cadastro.endereco_cidade,
        endereco_uf: cadastro.endereco_uf,
        chave_pix: cadastro.chave_pix,
        nome_banco: cadastro.nome_banco,
        nome_no_banco: cadastro.nome_no_banco,
        agencia: cadastro.agencia,
        conta: cadastro.conta,
        tipo_conta: cadastro.tipo_conta,
        cadastro_minimo_completo: cadastroMinimoCompleto(cadastro),
        trial_valido_ate: frow.trial_valido_ate ?? null,
        trial_ativo: isPortalTrialAtivo(frow.trial_valido_ate),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
