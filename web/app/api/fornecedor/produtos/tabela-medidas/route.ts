/**
 * GET /api/fornecedor/produtos/tabela-medidas?grupoKey=DJU100000
 * Retorna tabela de medidas aprovada do grupo e, se houver, a proposta pendente.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { parseTabelaMedidasRecord, tamanhosFaltantesNaTabelaMedidas } from "@/lib/fornecedorTabelaMedidas";
import { mergeDetalhesProdutoJson } from "@/lib/detalhesProdutoJson";
import { ordenarTamanhosLista } from "@/lib/fornecedorVariantesUi";
import {
  fornecedorPossuiGrupoSku,
  getTabelaMedidasComPendente,
  upsertProdutoTabelaMedidas,
} from "@/lib/produtoTabelaMedidasDb";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getFornecedorFromToken(req: Request): Promise<{ fornecedor_id: string; org_id: string } | null> {
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

  const { data: member } = await supabaseAdmin
    .from("org_members")
    .select("org_id, fornecedor_id")
    .eq("user_id", userData.user.id)
    .not("fornecedor_id", "is", null)
    .limit(1)
    .maybeSingle();

  if (!member?.fornecedor_id) return null;
  return { fornecedor_id: member.fornecedor_id, org_id: member.org_id };
}

export async function GET(req: Request) {
  try {
    const ctx = await getFornecedorFromToken(req);
    if (!ctx) return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const grupoKey = (searchParams.get("grupoKey") ?? "").trim().toUpperCase();
    if (!grupoKey) return NextResponse.json({ error: "grupoKey é obrigatório." }, { status: 400 });

    const possui = await fornecedorPossuiGrupoSku(
      supabaseAdmin,
      ctx.org_id,
      ctx.fornecedor_id,
      grupoKey
    );
    if (!possui) {
      return NextResponse.json({ error: "Grupo não encontrado ou não pertence a você." }, { status: 404 });
    }

    const { aprovada, pendente } = await getTabelaMedidasComPendente(
      supabaseAdmin,
      ctx.org_id,
      ctx.fornecedor_id,
      grupoKey
    );

    return NextResponse.json({
      aprovada: aprovada ? { tipo_produto: aprovada.tipo_produto, medidas: aprovada.medidas } : null,
      pendente,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro inesperado" }, { status: 500 });
  }
}

/** PUT — grava tabela aprovada (uso na criação do produto; edições seguem via PATCH do SKU + aprovação admin). */
export async function PUT(req: Request) {
  try {
    const ctx = await getFornecedorFromToken(req);
    if (!ctx) return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const grupoKey = typeof body?.grupoKey === "string" ? body.grupoKey.trim().toUpperCase() : "";
    const payload = parseTabelaMedidasRecord(body);
    if (!grupoKey) return NextResponse.json({ error: "grupoKey é obrigatório." }, { status: 400 });
    if (!payload) {
      return NextResponse.json({ error: "Informe ao menos uma linha de medida com valores numéricos." }, { status: 400 });
    }

    const possui = await fornecedorPossuiGrupoSku(
      supabaseAdmin,
      ctx.org_id,
      ctx.fornecedor_id,
      grupoKey
    );
    if (!possui) {
      return NextResponse.json({ error: "Grupo não encontrado ou não pertence a você." }, { status: 404 });
    }

    const prefix = grupoKey.length >= 6 ? grupoKey.slice(0, -3) : grupoKey;
    const { data: skusGrupo } = await supabaseAdmin
      .from("skus")
      .select("tamanho")
      .eq("org_id", ctx.org_id)
      .eq("fornecedor_id", ctx.fornecedor_id)
      .ilike("sku", `${prefix}%`);
    const tamanhosEsperados = ordenarTamanhosLista(
      [...new Set((skusGrupo ?? []).map((s) => String(s.tamanho ?? "").trim().toUpperCase()).filter(Boolean))]
    );
    const faltando = tamanhosFaltantesNaTabelaMedidas(payload.medidas, tamanhosEsperados);
    if (faltando.length > 0) {
      return NextResponse.json(
        {
          error: `Preencha medidas para todos os tamanhos do produto. Faltam: ${faltando.join(", ")}.`,
          tamanhos_faltando: faltando,
        },
        { status: 400 }
      );
    }

    await upsertProdutoTabelaMedidas(supabaseAdmin, grupoKey, payload, {
      org_id: ctx.org_id,
      fornecedor_id: ctx.fornecedor_id,
    });

    const linhasMedidas = tamanhosEsperados.map((tam) => ({
      tamanho: tam,
      ...(payload.medidas[tam] ?? {}),
    }));
    const { data: paiSku } = await supabaseAdmin
      .from("skus")
      .select("id, detalhes_produto_json")
      .eq("org_id", ctx.org_id)
      .eq("fornecedor_id", ctx.fornecedor_id)
      .eq("sku", grupoKey)
      .maybeSingle();
    if (paiSku?.id) {
      const detalhesAtual = (paiSku.detalhes_produto_json as Record<string, unknown> | null) ?? {};
      const medidasAtual = (detalhesAtual.medidas as Record<string, unknown> | undefined) ?? {};
      const detalhesNovos = mergeDetalhesProdutoJson(detalhesAtual, {
        medidas: {
          ...medidasAtual,
          linhas: linhasMedidas,
        },
      });
      await supabaseAdmin
        .from("skus")
        .update({ detalhes_produto_json: detalhesNovos })
        .eq("id", paiSku.id)
        .eq("org_id", ctx.org_id);
    }

    return NextResponse.json({ ok: true, grupo_key: grupoKey, tamanhos: tamanhosEsperados });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro inesperado" }, { status: 500 });
  }
}
