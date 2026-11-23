/**
 * /api/seller/fornecedor-vinculo — vínculo seller↔fornecedor unificado (avulso 1:1 OU
 * múltiplo do Centro de Distribuição, mesma regra de admissão em
 * fn_seller_fornecedor_vincular: sem vínculo aceita qualquer fornecedor; com vínculo fora
 * do CD bloqueia qualquer vínculo novo; com vínculo do CD só aceita outro do CD).
 * GET: vínculos ativos do seller + fornecedores disponíveis pra adicionar.
 * POST body: { fornecedor_id, aceite_uso_operacional: true } — vincula. Se o seller já tem
 * um vínculo ativo fora do CD com OUTRO fornecedor, troca (desvincula o atual, respeitando
 * a trava de 3 meses, e vincula o novo) — mesma semântica de "trocar" que o avulso sempre
 * teve. Vínculo do CD nunca troca sozinho aqui (é aditivo, vários ao mesmo tempo).
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { notifySellerVinculoFornecedorProprio } from "@/lib/notifySellerVinculoFornecedorCd";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function resolveSeller(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return null;
  const sbAnon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
  if (userErr || !userData?.user) return null;
  const { data: seller } = await supabaseAdmin
    .from("sellers")
    .select("id, org_id, status")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  return seller ?? null;
}

export async function GET(req: Request) {
  try {
    const seller = await resolveSeller(req);
    if (!seller) return NextResponse.json({ error: "Seller não encontrado." }, { status: 404 });

    const { data: vinculos, error: vinErr } = await supabaseAdmin.rpc("fn_seller_fornecedor_vinculos_lista", {
      p_seller_id: seller.id,
      p_org_id: seller.org_id,
    });
    if (vinErr) return NextResponse.json({ error: vinErr.message }, { status: 500 });

    const lista = (vinculos ?? []) as { fornecedor_id: string; fornecedor_opera_no_cd: boolean }[];
    const vinculadosIds = new Set(lista.map((v) => v.fornecedor_id));

    // Sem vínculo nenhum: qualquer fornecedor ativo é candidato. Com vínculo fora do CD:
    // nenhum outro disponível (já tem o único que pode ter). Com vínculo(s) do CD: só os
    // outros fornecedores do CD ainda não vinculados.
    let disponiveis: { id: string; nome: string }[] = [];
    if (lista.length === 0) {
      const { data: fornecedores } = await supabaseAdmin
        .from("fornecedores")
        .select("id, nome")
        .eq("org_id", seller.org_id)
        .eq("status", "ativo");
      disponiveis = fornecedores ?? [];
    } else if (lista.every((v) => v.fornecedor_opera_no_cd)) {
      const { data: fornecedores } = await supabaseAdmin
        .from("fornecedores")
        .select("id, nome")
        .eq("org_id", seller.org_id)
        .eq("opera_no_cd", true)
        .eq("status", "ativo");
      disponiveis = (fornecedores ?? []).filter((f) => !vinculadosIds.has(f.id));
    }

    return NextResponse.json({ ok: true, vinculos: vinculos ?? [], fornecedores_disponiveis: disponiveis });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const seller = await resolveSeller(req);
    if (!seller) return NextResponse.json({ error: "Seller não encontrado." }, { status: 404 });
    if (String(seller.status ?? "").toLowerCase() === "bloqueado") {
      return NextResponse.json({ error: "Conta bloqueada." }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const fornecedorId = typeof body?.fornecedor_id === "string" ? body.fornecedor_id.trim() : "";
    const aceiteUso = body?.aceite_uso_operacional === true;
    if (!fornecedorId) return NextResponse.json({ error: "fornecedor_id é obrigatório." }, { status: 400 });
    if (!aceiteUso) {
      return NextResponse.json(
        {
          error:
            "Confirme que aceita usar os dados cadastrais exclusivamente para operação na DropCore (pedidos, logística e suporte).",
          code: "aceite_required",
        },
        { status: 400 }
      );
    }

    const { data: forn, error: fornErr } = await supabaseAdmin
      .from("fornecedores")
      .select("id, status, opera_no_cd")
      .eq("id", fornecedorId)
      .eq("org_id", seller.org_id)
      .maybeSingle();
    if (fornErr) return NextResponse.json({ error: fornErr.message }, { status: 500 });
    if (!forn) return NextResponse.json({ error: "Fornecedor não encontrado nesta organização." }, { status: 404 });
    if (String(forn.status ?? "").toLowerCase() !== "ativo") {
      return NextResponse.json({ error: "Só é possível vincular um fornecedor com status ativo." }, { status: 400 });
    }

    const { data: deposito } = await supabaseAdmin
      .from("seller_depositos_pix")
      .select("id")
      .eq("seller_id", seller.id)
      .eq("status", "aprovado")
      .limit(1)
      .maybeSingle();
    if (!deposito) {
      return NextResponse.json(
        { error: "Faça sua primeira recarga PIX antes de vincular um fornecedor.", code: "deposito_required" },
        { status: 400 }
      );
    }

    // Trocar: só faz sentido no caso avulso clássico (exatamente 1 vínculo ativo, e esse
    // vínculo é de um fornecedor fora do CD) — desvincula o atual primeiro (checa a trava
    // de 3 meses) antes de vincular o novo. Nunca mexe em vínculo nenhum quando o seller
    // tem vínculo(s) do CD (1 ou vários): nesse caso o pedido só pode mesmo ser rejeitado
    // por fn_seller_fornecedor_vincular (FORNECEDOR_NAO_OPERA_NO_CD) — achado real
    // 2026-11-23: sem essa checagem, pegava só o 1º vínculo da lista (ordem arbitrária) e
    // desvinculava ele à toa antes de falhar, até passar a trava de 3 meses.
    if (!forn.opera_no_cd) {
      const { data: ativos } = await supabaseAdmin
        .from("seller_fornecedor_vinculos")
        .select("id, fornecedor_id, fornecedores(opera_no_cd)")
        .eq("seller_id", seller.id)
        .is("desvinculado_em", null);
      const lista = (ativos ?? []) as unknown as {
        id: string;
        fornecedor_id: string;
        fornecedores: { opera_no_cd: boolean } | null;
      }[];
      const atual = lista.length === 1 && lista[0].fornecedores?.opera_no_cd === false ? lista[0] : undefined;
      if (atual && atual.fornecedor_id !== fornecedorId) {
        const { data: desv, error: desvErr } = await supabaseAdmin.rpc("fn_seller_fornecedor_desvincular", {
          p_vinculo_id: atual.id,
          p_org_id: seller.org_id,
          p_confirmar_antes_prazo_admin: false,
        });
        if (desvErr) return NextResponse.json({ error: desvErr.message }, { status: 500 });
        const desvResult = desv as { ok: boolean; error_code?: string; pode_trocar_fornecedor_a_partir_de?: string };
        if (!desvResult.ok) {
          return NextResponse.json(
            {
              error:
                desvResult.error_code === "COMPROMISSO_FORNECEDOR_ATIVO"
                  ? "Você está no período mínimo de 3 meses com o armazém atual. Só pode trocar ou excluir o vínculo após essa data, salvo liberação antecipada feita pela organização no painel admin."
                  : "Vínculo não encontrado.",
              code: desvResult.error_code,
              pode_trocar_fornecedor_a_partir_de: desvResult.pode_trocar_fornecedor_a_partir_de ?? null,
            },
            { status: 403 }
          );
        }
      }
    }

    const { data, error } = await supabaseAdmin.rpc("fn_seller_fornecedor_vincular", {
      p_seller_id: seller.id,
      p_fornecedor_id: fornecedorId,
      p_org_id: seller.org_id,
      p_criado_por_tipo: "seller",
      p_criado_por_user_id: null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const result = data as { ok: boolean; error_code?: string; vinculo?: { id: string; fornecedor_id: string } };
    if (!result.ok) {
      const mensagens: Record<string, string> = {
        FORNECEDOR_NAO_ENCONTRADO: "Fornecedor não encontrado.",
        FORNECEDOR_NAO_OPERA_NO_CD: "Esse fornecedor não faz parte do Centro de Distribuição DropCore.",
        JA_TEM_FORNECEDOR_VINCULADO: "Você já tem um fornecedor vinculado — desvincule antes de trocar.",
        JA_VINCULADO: "Você já está vinculado a este fornecedor.",
      };
      return NextResponse.json(
        { error: mensagens[result.error_code ?? ""] ?? "Erro ao vincular.", code: result.error_code },
        { status: 400 }
      );
    }

    const fid = result.vinculo?.fornecedor_id ?? fornecedorId;
    const { data: fn } = await supabaseAdmin.from("fornecedores").select("nome").eq("id", fid).maybeSingle();

    await notifySellerVinculoFornecedorProprio({ org_id: seller.org_id, seller_id: seller.id, fornecedor_id: fid });

    return NextResponse.json({
      ok: true,
      vinculo_id: result.vinculo?.id ?? null,
      fornecedor_id: fid,
      fornecedor_nome: fn?.nome ?? null,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
