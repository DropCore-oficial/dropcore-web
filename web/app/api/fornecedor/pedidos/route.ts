/**
 * GET /api/fornecedor/pedidos
 * Lista pedidos que o fornecedor autenticado deve atender.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { motivoBloqueioParaPortal } from "@/lib/pedidoBloqueioResponsavel";
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
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status")?.trim();
    const limit = Math.min(100, parseInt(searchParams.get("limit") || "50", 10) || 50);

    let query = supabaseAdmin
      .from("pedidos")
      .select(
        "id, seller_id, fornecedor_id, sku_id, nome_produto, preco_venda, valor_fornecedor, status, motivo_bloqueio, motivo_bloqueio_responsavel, criado_em, etiqueta_pdf_url, etiqueta_pdf_base64, marketplace_numero, comprador_nome, comprador_cidade, comprador_uf, comprador_fone, referencia_externa"
      )
      .eq("org_id", ctx.org_id)
      .eq("fornecedor_id", ctx.fornecedor_id)
      .order("criado_em", { ascending: false })
      .limit(limit);

    if (status && ["enviado", "aguardando_repasse", "entregue", "devolvido", "cancelado", "erro_saldo", "pendente_estoque", "bloqueado"].includes(status)) {
      query = query.eq("status", status);
    }

    let { data, error } = await query;
    if (error) {
      const msg = String(error.message ?? "").toLowerCase();
      const colunaAusente =
        msg.includes("marketplace_numero") || msg.includes("comprador_") || msg.includes("motivo_bloqueio") || error.code === "42703";
      if (colunaAusente) {
        let fallbackQuery = supabaseAdmin
          .from("pedidos")
          .select(
            "id, seller_id, fornecedor_id, sku_id, nome_produto, preco_venda, valor_fornecedor, status, criado_em, etiqueta_pdf_url, etiqueta_pdf_base64, referencia_externa"
          )
          .eq("org_id", ctx.org_id)
          .eq("fornecedor_id", ctx.fornecedor_id)
          .order("criado_em", { ascending: false })
          .limit(limit);
        if (status && ["enviado", "aguardando_repasse", "entregue", "devolvido", "cancelado", "erro_saldo", "pendente_estoque", "bloqueado"].includes(status)) {
          fallbackQuery = fallbackQuery.eq("status", status);
        }
        ({ data, error } = await fallbackQuery);
      }
      if (error) {
        console.error("[fornecedor/pedidos GET]", error.message);
        return NextResponse.json({ error: "Erro ao buscar pedidos." }, { status: 500 });
      }
    }

    const sellerIds = [...new Set((data ?? []).map((p) => p.seller_id))];
    const sellersMap = new Map<string, string>();
    if (sellerIds.length > 0) {
      const { data: sellers } = await supabaseAdmin.from("sellers").select("id, nome").in("id", sellerIds);
      for (const s of sellers ?? []) sellersMap.set(s.id, s.nome ?? "—");
    }

    const skuIds = [...new Set((data ?? []).map((p) => p.sku_id).filter(Boolean))] as string[];
    const skusMap = new Map<string, { cor: string | null; tamanho: string | null; categoria: string | null }>();
    if (skuIds.length > 0) {
      const { data: skus } = await supabaseAdmin
        .from("skus")
        .select("id, cor, tamanho, categoria")
        .in("id", skuIds);

      for (const s of skus ?? []) {
        skusMap.set(s.id, { cor: (s.cor as string | null) ?? null, tamanho: (s.tamanho as string | null) ?? null, categoria: (s.categoria as string | null) ?? null });
      }
    }

    const items = (data ?? []).map((p) => {
      const sku = p.sku_id ? skusMap.get(p.sku_id) : null;
      const url = (p as { etiqueta_pdf_url?: string | null }).etiqueta_pdf_url?.trim() ?? "";
      const b64 = (p as { etiqueta_pdf_base64?: string | null }).etiqueta_pdf_base64;
      const tem_etiqueta_oficial = Boolean(url) || Boolean(b64 && String(b64).trim().length > 0);
      const {
        etiqueta_pdf_url: _u,
        etiqueta_pdf_base64: _b,
        motivo_bloqueio: _mb,
        motivo_bloqueio_responsavel: responsavel,
        ...rest
      } = p as Record<string, unknown>;
      return {
        ...rest,
        motivo_bloqueio: motivoBloqueioParaPortal({
          portal: "fornecedor",
          responsavel: responsavel as "seller" | "fornecedor" | null,
          motivoCompleto: (p as { motivo_bloqueio?: string | null }).motivo_bloqueio,
        }),
        seller_nome: sellersMap.get(p.seller_id) ?? "—",
        cor: sku?.cor ?? null,
        tamanho: sku?.tamanho ?? null,
        categoria: sku?.categoria ?? null,
        tem_etiqueta_oficial,
      };
    });

    return NextResponse.json({ items });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
