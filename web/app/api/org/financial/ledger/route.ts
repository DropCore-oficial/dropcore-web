/**
 * GET /api/org/financial/ledger
 * Lista registros do ledger da org (para bloqueios/devoluções).
 * Query: statuses=BLOQUEADO,ENTREGUE,AGUARDANDO_REPASSE,EM_DEVOLUCAO (opcional; default = esses 4)
 * Apenas admin/owner.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_STATUSES = ["BLOQUEADO", "ENTREGUE", "AGUARDANDO_REPASSE", "EM_DEVOLUCAO"];
const CONTESTACAO_BUCKET = "disputas-evidencias";
const SIGNED_URL_EXPIRA_SEGUNDOS = 60 * 10;

async function loadLedgerItems(orgId: string, statuses: string[]) {
  const { data: rows, error } = await supabaseAdmin
    .from("financial_ledger")
    .select(
      "id, seller_id, fornecedor_id, tipo, valor_total, status, data_evento, ciclo_repasse, pedido_id, em_devolucao_desde, fornecedor_contestou_em, fornecedor_contestacao_texto, fornecedor_contestacao_evidencias_paths"
    )
    .eq("org_id", orgId)
    .in("tipo", ["BLOQUEIO", "VENDA"])
    .in("status", statuses.length ? statuses : DEFAULT_STATUSES)
    .order("data_evento", { ascending: false })
    .limit(100);

  if (error) throw new Error(error.message);

  const list = Array.isArray(rows) ? rows : [];
  const sellerIds = [...new Set(list.map((r) => r.seller_id).filter(Boolean))] as string[];
  const fornecedorIds = [...new Set(list.map((r) => r.fornecedor_id).filter(Boolean))] as string[];
  const ledgerIds = list.map((r) => r.id);
  const pedidoIds = [...new Set(list.map((r) => r.pedido_id).filter(Boolean))] as string[];

  const [sellersRes, fornRes, debitosRes, pedidosRes] = await Promise.all([
    sellerIds.length
      ? supabaseAdmin.from("sellers").select("id, nome").in("id", sellerIds)
      : Promise.resolve({ data: [] }),
    fornecedorIds.length
      ? supabaseAdmin.from("fornecedores").select("id, nome").in("id", fornecedorIds)
      : Promise.resolve({ data: [] }),
    ledgerIds.length
      ? supabaseAdmin.from("financial_debito_descontar").select("ledger_id").in("ledger_id", ledgerIds)
      : Promise.resolve({ data: [] }),
    // Admin não tinha como saber QUAL pedido gerou cada linha de devolução/débito na tela —
    // só o id interno, nunca o número do pedido (achado 2026-11-02, mesma lacuna que já
    // tinha sido fechada pro fornecedor em fn_fornecedor_repasse_detalhe).
    pedidoIds.length
      ? supabaseAdmin.from("pedidos").select("id, marketplace_numero").in("id", pedidoIds)
      : Promise.resolve({ data: [] }),
  ]);

  const sellerMap = new Map((sellersRes.data || []).map((s) => [s.id, s.nome]));
  const fornMap = new Map((fornRes.data || []).map((f) => [f.id, f.nome]));
  const debitosSet = new Set((debitosRes.data || []).map((d) => d.ledger_id));
  const pedidoMap = new Map((pedidosRes.data || []).map((p) => [p.id, p.marketplace_numero]));

  const evidenciaUrls = new Map<string, string[]>();
  await Promise.all(
    list
      .filter((r) => Array.isArray(r.fornecedor_contestacao_evidencias_paths) && r.fornecedor_contestacao_evidencias_paths.length)
      .map(async (r) => {
        const paths = r.fornecedor_contestacao_evidencias_paths as string[];
        const urls = await Promise.all(
          paths.map(async (path) => {
            const { data } = await supabaseAdmin.storage.from(CONTESTACAO_BUCKET).createSignedUrl(path, SIGNED_URL_EXPIRA_SEGUNDOS);
            return data?.signedUrl ?? null;
          })
        );
        evidenciaUrls.set(
          r.id,
          urls.filter((u): u is string => Boolean(u))
        );
      })
  );

  return list.map((r) => ({
    id: r.id,
    seller_id: r.seller_id,
    seller_nome: sellerMap.get(r.seller_id) ?? "—",
    fornecedor_id: r.fornecedor_id,
    fornecedor_nome: r.fornecedor_id ? (fornMap.get(r.fornecedor_id) ?? "—") : "—",
    tipo: r.tipo,
    valor_total: Number(r.valor_total),
    status: r.status,
    data_evento: r.data_evento,
    ciclo_repasse: r.ciclo_repasse,
    pedido_id: r.pedido_id ?? null,
    marketplace_numero: r.pedido_id ? (pedidoMap.get(r.pedido_id) ?? null) : null,
    debito_ja_registrado: debitosSet.has(r.id),
    em_devolucao_desde: r.em_devolucao_desde ?? null,
    fornecedor_contestou_em: r.fornecedor_contestou_em ?? null,
    fornecedor_contestacao_texto: r.fornecedor_contestacao_texto ?? null,
    fornecedor_contestacao_evidencias_urls: evidenciaUrls.get(r.id) ?? [],
  }));
}

export async function GET(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);
    const { searchParams } = new URL(req.url);
    const statusesParam = searchParams.get("statuses");
    const statuses = statusesParam
      ? statusesParam.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean)
      : DEFAULT_STATUSES;
    const includePago = searchParams.get("include_pago") === "1";

    if (includePago) {
      const [items, items_pago] = await Promise.all([
        loadLedgerItems(org_id, statuses),
        loadLedgerItems(org_id, ["PAGO"]),
      ]);
      return NextResponse.json({ items, items_pago });
    }

    const items = await loadLedgerItems(org_id, statuses);
    return NextResponse.json(items);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status =
      msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
