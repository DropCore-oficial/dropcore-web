/**
 * GET /api/seller/catalogo/tabela-medidas?grupoKey=DJU100000
 * Retorna a tabela de medidas aprovada do grupo para o seller (catálogo).
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  mergeTabelaMedidasPayload,
  padTabelaMedidasComTamanhos,
  tabelaMedidasFromDetalhesJson,
} from "@/lib/fornecedorTabelaMedidas";
import { getProdutoTabelaMedidas, orgPossuiGrupoSku } from "@/lib/produtoTabelaMedidasDb";
import { resolverDetalhesProdutoJson } from "@/lib/detalhesProdutoJson";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const auth = req.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return NextResponse.json({ error: "Sem token." }, { status: 401 });

    const sbAnon = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false } }
    );
    const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
    if (userErr || !userData?.user) return NextResponse.json({ error: "Token inválido." }, { status: 401 });

    const { data: seller, error: sellerErr } = await supabaseAdmin
      .from("sellers")
      .select("org_id, fornecedor_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (sellerErr || !seller) return NextResponse.json({ error: "Seller não encontrado." }, { status: 404 });

    const { searchParams } = new URL(req.url);
    const grupoKey = (searchParams.get("grupoKey") ?? "").trim().toUpperCase();
    if (!grupoKey) return NextResponse.json({ error: "grupoKey é obrigatório." }, { status: 400 });

    const acesso = await orgPossuiGrupoSku(supabaseAdmin, seller.org_id, grupoKey);
    if (!acesso.ok) {
      return NextResponse.json({ error: "Grupo não encontrado no catálogo." }, { status: 404 });
    }

    const fornecedorParam = (searchParams.get("fornecedor_id") ?? "").trim();
    const sellerForn = (seller as { fornecedor_id?: string | null }).fornecedor_id ?? null;
    const fornecedorGrupo = acesso.fornecedor_id;
    if (sellerForn && fornecedorGrupo && sellerForn !== fornecedorGrupo) {
      return NextResponse.json({ aprovada: null });
    }
    if (fornecedorParam && fornecedorGrupo && fornecedorParam !== fornecedorGrupo) {
      return NextResponse.json({ aprovada: null });
    }

    const row = await getProdutoTabelaMedidas(supabaseAdmin, grupoKey);

    const prefix = grupoKey.length >= 6 ? grupoKey.slice(0, -3) : grupoKey;
    const { data: skusGrupo } = await supabaseAdmin
      .from("skus")
      .select("sku, tamanho, nome_produto, categoria, detalhes_produto_json, status")
      .eq("org_id", seller.org_id)
      .ilike("sku", `${prefix}%`)
      .limit(200);

    const tamanhosVariante = [
      ...new Set(
        (skusGrupo ?? [])
          .map((s) => String(s.tamanho ?? "").trim().toUpperCase())
          .filter(Boolean)
      ),
    ];

    const detalhes = resolverDetalhesProdutoJson(
      ...(skusGrupo ?? []).map((s) => s.detalhes_produto_json)
    );
    const nomeRef =
      String(
        (skusGrupo ?? []).find((s) => String(s.sku ?? "").trim().toUpperCase() === grupoKey)?.nome_produto ??
          (skusGrupo ?? []).find((s) => String(s.nome_produto ?? "").trim())?.nome_produto ??
          ""
      ).trim();
    const categoriaRef =
      String(
        (skusGrupo ?? []).find((s) => String(s.sku ?? "").trim().toUpperCase() === grupoKey)?.categoria ??
          (skusGrupo ?? []).find((s) => String(s.categoria ?? "").trim())?.categoria ??
          ""
      ).trim() || null;

    const fromJson = tabelaMedidasFromDetalhesJson(detalhes, nomeRef, categoriaRef);
    const merged = mergeTabelaMedidasPayload(row, fromJson);
    const medidasPad =
      merged && tamanhosVariante.length > 0
        ? padTabelaMedidasComTamanhos(merged.medidas, tamanhosVariante)
        : merged?.medidas ?? null;

    return NextResponse.json({
      aprovada:
        merged && medidasPad
          ? { tipo_produto: merged.tipo_produto, medidas: medidasPad }
          : null,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro inesperado" }, { status: 500 });
  }
}
