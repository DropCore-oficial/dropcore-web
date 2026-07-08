/**
 * GET /api/seller/pedidos — Lista pedidos do seller autenticado.
 */
import { NextResponse } from "next/server";
import { motivoBloqueioParaPortal } from "@/lib/pedidoBloqueioResponsavel";
import { getSellerFromToken } from "@/lib/sellerSessionAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_FILTER = [
  "pendente_estoque",
  "bloqueado",
  "enviado",
  "aguardando_repasse",
  "entregue",
  "devolvido",
  "cancelado",
  "erro_saldo",
] as const;

export async function GET(req: Request) {
  try {
    const seller = await getSellerFromToken(req);
    if (!seller) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status")?.trim();
    const limit = Math.min(100, parseInt(searchParams.get("limit") || "50", 10) || 50);

    let query = supabaseAdmin
      .from("pedidos")
      .select(
        "id, nome_produto, valor_total, status, motivo_bloqueio, motivo_bloqueio_responsavel, criado_em, referencia_externa, tracking_codigo, metodo_envio, marketplace_numero, comprador_nome, comprador_cidade, comprador_uf, comprador_fone, etiqueta_pdf_url"
      )
      .eq("org_id", seller.org_id)
      .eq("seller_id", seller.id)
      .order("criado_em", { ascending: false })
      .limit(limit);

    if (status && (STATUS_FILTER as readonly string[]).includes(status)) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) {
      const msg = String(error.message ?? "").toLowerCase();
      if (
        msg.includes("marketplace_numero") ||
        msg.includes("comprador_") ||
        msg.includes("motivo_bloqueio") ||
        error.code === "42703"
      ) {
        const fallback = await supabaseAdmin
          .from("pedidos")
          .select(
            "id, nome_produto, valor_total, status, criado_em, referencia_externa, tracking_codigo, metodo_envio, etiqueta_pdf_url"
          )
          .eq("org_id", seller.org_id)
          .eq("seller_id", seller.id)
          .order("criado_em", { ascending: false })
          .limit(limit);
        if (fallback.error) {
          console.error("[seller/pedidos GET]", fallback.error.message);
          return NextResponse.json({ error: "Erro ao buscar pedidos." }, { status: 500 });
        }
        return NextResponse.json({ items: fallback.data ?? [] });
      }
      console.error("[seller/pedidos GET]", error.message);
      return NextResponse.json({ error: "Erro ao buscar pedidos." }, { status: 500 });
    }

    const pedidoIds = (data ?? []).map((p) => p.id);
    const itensPorPedido = new Map<string, Array<{ sku: string; quantidade: number; nome_produto: string | null }>>();

    if (pedidoIds.length > 0) {
      const { data: itens, error: itensErr } = await supabaseAdmin
        .from("pedido_itens")
        .select("pedido_id, quantidade, skus(sku, nome_produto)")
        .in("pedido_id", pedidoIds);

      if (itensErr) {
        console.error("[seller/pedidos GET] itens:", itensErr.message);
      }

      for (const row of itens ?? []) {
        const pid = row.pedido_id as string;
        const skuInfo = row.skus as { sku?: string; nome_produto?: string | null } | null;
        const list = itensPorPedido.get(pid) ?? [];
        list.push({
          sku: skuInfo?.sku ?? "—",
          quantidade: Number(row.quantidade ?? 1),
          nome_produto: skuInfo?.nome_produto ?? null,
        });
        itensPorPedido.set(pid, list);
      }
    }

    const items = (data ?? []).map((p) => {
      const row = p as typeof p & { motivo_bloqueio_responsavel?: "seller" | "fornecedor" | null };
      return {
        ...p,
        motivo_bloqueio: motivoBloqueioParaPortal({
          portal: "seller",
          responsavel: row.motivo_bloqueio_responsavel,
          motivoCompleto: row.motivo_bloqueio,
        }),
        itens: itensPorPedido.get(p.id) ?? [],
        tem_etiqueta: Boolean((p as { etiqueta_pdf_url?: string | null }).etiqueta_pdf_url?.trim()),
      };
    });

    return NextResponse.json({ items });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
