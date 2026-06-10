/**
 * POST /api/fornecedor/produtos/import-estoque
 * Atualiza estoque_atual / estoque_minimo direto no catálogo (sem fila de alterações pendentes).
 */
import { NextResponse } from "next/server";
import { getFornecedorContextFromBearer } from "@/lib/fornecedorAuth";
import {
  FORNECEDOR_ESTOQUE_IMPORT_MAX_ROWS,
  normalizeFornecedorEstoqueImportRow,
  type FornecedorEstoqueImportRow,
} from "@/lib/fornecedorEstoqueImport";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { dispararSyncEstoqueOlistFornecedorSkus } from "@/lib/sellerOlistSyncEstoqueOnChange";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UNKNOWN_SKUS_SAMPLE_MAX = 25;

function patchFromRow(row: FornecedorEstoqueImportRow): Record<string, number | null> {
  const patch: Record<string, number | null> = {};
  if ("estoque_atual" in row) patch.estoque_atual = row.estoque_atual ?? null;
  if ("estoque_minimo" in row) patch.estoque_minimo = row.estoque_minimo ?? null;
  return patch;
}

function patchChanged(
  atual: Record<string, unknown>,
  patch: Record<string, number | null>
): boolean {
  for (const [k, v] of Object.entries(patch)) {
    const cur = atual[k];
    const curNorm = cur == null || cur === "" ? null : Number(cur);
    const nextNorm = v == null ? null : Number(v);
    if (curNorm !== nextNorm) return true;
  }
  return false;
}

async function limparEstoqueDeAlteracaoPendente(params: {
  sku_id: string;
  fornecedor_id: string;
  org_id: string;
}) {
  const { data: pendente } = await supabaseAdmin
    .from("sku_alteracoes_pendentes")
    .select("id, dados_propostos")
    .eq("sku_id", params.sku_id)
    .eq("fornecedor_id", params.fornecedor_id)
    .eq("org_id", params.org_id)
    .eq("status", "pendente")
    .maybeSingle();

  if (!pendente?.id) return;

  const prev = (pendente.dados_propostos as Record<string, unknown> | null) ?? {};
  if (!("estoque_atual" in prev) && !("estoque_minimo" in prev)) return;

  const next = { ...prev };
  delete next.estoque_atual;
  delete next.estoque_minimo;

  if (Object.keys(next).length === 0) {
    await supabaseAdmin.from("sku_alteracoes_pendentes").delete().eq("id", pendente.id);
    return;
  }

  await supabaseAdmin
    .from("sku_alteracoes_pendentes")
    .update({ dados_propostos: next })
    .eq("id", pendente.id)
    .eq("org_id", params.org_id);
}

export async function POST(req: Request) {
  try {
    const ctx = await getFornecedorContextFromBearer(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });
    }

    const body = await req.json();
    const rawRows = Array.isArray(body?.rows) ? body.rows : [];
    if (rawRows.length === 0) {
      return NextResponse.json({ error: "Nenhuma linha para importar." }, { status: 400 });
    }
    if (rawRows.length > FORNECEDOR_ESTOQUE_IMPORT_MAX_ROWS) {
      return NextResponse.json(
        {
          error: `Máximo de ${FORNECEDOR_ESTOQUE_IMPORT_MAX_ROWS} linhas por importação.`,
        },
        { status: 400 }
      );
    }

    const normalized = rawRows
      .map((r: unknown) =>
        typeof r === "object" && r != null ? normalizeFornecedorEstoqueImportRow(r as Record<string, unknown>) : null
      )
      .filter(Boolean) as FornecedorEstoqueImportRow[];

    if (normalized.length === 0) {
      return NextResponse.json(
        {
          error: "Nenhuma linha válida. Use colunas SKU e Estoque atual (ou Est. mínimo).",
        },
        { status: 400 }
      );
    }

    const skus = [...new Set(normalized.map((r) => r.sku))];
    const { data: existingRows, error: fetchErr } = await supabaseAdmin
      .from("skus")
      .select("id, sku, estoque_atual, estoque_minimo")
      .eq("org_id", ctx.org_id)
      .eq("fornecedor_id", ctx.fornecedor_id)
      .in("sku", skus);

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    const bySku = new Map<string, { id: string; estoque_atual: unknown; estoque_minimo: unknown }>();
    for (const r of existingRows ?? []) {
      bySku.set(String(r.sku).toUpperCase(), r);
    }

    let updated = 0;
    let unchanged = 0;
    const unknownSkus: string[] = [];
    const updatedSkus: string[] = [];

    for (const row of normalized) {
      const existing = bySku.get(row.sku);
      if (!existing) {
        if (!unknownSkus.includes(row.sku)) unknownSkus.push(row.sku);
        continue;
      }

      const patch = patchFromRow(row);
      if (Object.keys(patch).length === 0) continue;

      if (!patchChanged(existing as Record<string, unknown>, patch)) {
        unchanged++;
        continue;
      }

      const { error: upErr } = await supabaseAdmin
        .from("skus")
        .update(patch)
        .eq("id", existing.id)
        .eq("org_id", ctx.org_id)
        .eq("fornecedor_id", ctx.fornecedor_id);

      if (!upErr) {
        updated++;
        if ("estoque_atual" in patch) {
          updatedSkus.push(row.sku);
        }
        await limparEstoqueDeAlteracaoPendente({
          sku_id: existing.id,
          fornecedor_id: ctx.fornecedor_id,
          org_id: ctx.org_id,
        });
      }
    }

    if (updatedSkus.length > 0) {
      dispararSyncEstoqueOlistFornecedorSkus({
        orgId: ctx.org_id,
        fornecedorId: ctx.fornecedor_id,
        skuCodes: updatedSkus,
      });
    }

    return NextResponse.json({
      ok: true,
      updated,
      unchanged,
      skipped_unknown: unknownSkus.length,
      unknown_skus: unknownSkus.slice(0, UNKNOWN_SKUS_SAMPLE_MAX),
      total: normalized.length,
      mensagem:
        updated > 0
          ? `${updated} SKU(s) com estoque atualizado.`
          : unknownSkus.length === normalized.length
            ? "Nenhum SKU da planilha foi encontrado no seu catálogo."
            : "Nenhuma alteração de estoque (valores já estavam iguais).",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
