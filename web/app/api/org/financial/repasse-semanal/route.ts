/**
 * POST /api/org/financial/repasse-semanal
 * Fechamento semanal: ledger ENTREGUE/AGUARDANDO_REPASSE do ciclo → PAGO;
 * gera financial_repasse_fornecedor e financial_ciclos_repasse.
 * Desconta automaticamente valores de financial_debito_descontar (devolução pós-repasse).
 * Body: { ciclo_repasse: "YYYY-MM-DD" } (segunda-feira do ciclo).
 * Apenas admin/owner.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const READY_STATUSES = ["ENTREGUE", "AGUARDANDO_REPASSE"] as const;

/** GET: preview do repasse para um ciclo (sem alterar nada). Query: ciclo_repasse=YYYY-MM-DD */
export async function GET(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);
    const { searchParams } = new URL(req.url);
    const cicloStr = searchParams.get("ciclo_repasse");
    if (!cicloStr || typeof cicloStr !== "string") {
      return NextResponse.json({ error: "ciclo_repasse (YYYY-MM-DD) é obrigatório na query." }, { status: 400 });
    }
    const ciclo_repasse = cicloStr.trim().slice(0, 10);
    const d = new Date(ciclo_repasse);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: "ciclo_repasse deve ser uma data válida." }, { status: 400 });
    }

    const [ledgerRes, ledgerAllRes] = await Promise.all([
      supabaseAdmin
        .from("financial_ledger")
        .select("id, fornecedor_id, valor_fornecedor, valor_dropcore, valor_total")
        .eq("org_id", org_id)
        .eq("ciclo_repasse", ciclo_repasse)
        .in("tipo", ["BLOQUEIO", "VENDA"])
        .in("status", [...READY_STATUSES]),
      supabaseAdmin
        .from("financial_ledger")
        .select("status")
        .eq("org_id", org_id)
        .eq("ciclo_repasse", ciclo_repasse)
        .in("tipo", ["BLOQUEIO", "VENDA"])
        .limit(5000),
    ]);

    const { data: ledgerRows, error: ledgerErr } = ledgerRes;
    const { data: ledgerAllRows, error: ledgerAllErr } = ledgerAllRes;

    if (ledgerErr) {
      return NextResponse.json({ error: ledgerErr.message }, { status: 500 });
    }
    if (ledgerAllErr) {
      return NextResponse.json({ error: ledgerAllErr.message }, { status: 500 });
    }

    const entries = ledgerRows ?? [];
    const status_counts: Record<string, number> = {};
    for (const r of ledgerAllRows ?? []) {
      const s = (r as any)?.status ?? "DESCONHECIDO";
      status_counts[s] = (status_counts[s] ?? 0) + 1;
    }

    const { data: debitos, error: debErr } = await supabaseAdmin
      .from("financial_debito_descontar")
      .select("id, fornecedor_id, valor_fornecedor, valor_dropcore, valor_total")
      .eq("org_id", org_id)
      .eq("ciclo_a_descontar", ciclo_repasse)
      .eq("descontado", false);

    if (debErr) {
      return NextResponse.json({ error: debErr.message }, { status: 500 });
    }

    const debitosList = debitos ?? [];
    const porFornecedor: Record<string, { valor_fornecedor: number; valor_dropcore: number }> = {};

    for (const e of entries) {
      const fid = e.fornecedor_id ?? "sem_fornecedor";
      if (!porFornecedor[fid]) {
        porFornecedor[fid] = { valor_fornecedor: 0, valor_dropcore: 0 };
      }
      porFornecedor[fid].valor_fornecedor += Number(e.valor_fornecedor);
      porFornecedor[fid].valor_dropcore += Number(e.valor_dropcore);
    }
    for (const deb of debitosList) {
      const fid = deb.fornecedor_id;
      if (!porFornecedor[fid]) {
        porFornecedor[fid] = { valor_fornecedor: 0, valor_dropcore: 0 };
      }
      porFornecedor[fid].valor_fornecedor -= Number(deb.valor_fornecedor);
      porFornecedor[fid].valor_dropcore -= Number(deb.valor_dropcore);
    }

    let total_fornecedores = 0;
    let total_dropcore = 0;
    const fornecedorIds: string[] = [];
    for (const fid of Object.keys(porFornecedor)) {
      if (!uuidRegex.test(fid)) continue;
      const v = porFornecedor[fid];
      const vF = Math.max(0, v.valor_fornecedor);
      const vD = Math.max(0, v.valor_dropcore);
      if (vF > 0 || vD > 0) {
        total_fornecedores += vF;
        total_dropcore += vD;
        fornecedorIds.push(fid);
      }
    }

    const { data: cicloRow } = await supabaseAdmin
      .from("financial_ciclos_repasse")
      .select("status, fechado_em")
      .eq("org_id", org_id)
      .eq("ciclo_repasse", ciclo_repasse)
      .maybeSingle();

    const ja_fechado = cicloRow?.status === "fechado";

    let fornecedorNomes: Record<string, string> = {};
    if (fornecedorIds.length > 0) {
      const { data: fornRows } = await supabaseAdmin
        .from("fornecedores")
        .select("id, nome")
        .in("id", fornecedorIds);
      for (const f of fornRows ?? []) {
        fornecedorNomes[f.id] = f.nome ?? "—";
      }
    }

    const por_fornecedor = fornecedorIds.map((fid) => {
      const v = porFornecedor[fid];
      return {
        fornecedor_id: fid,
        fornecedor_nome: fornecedorNomes[fid] ?? "—",
        valor_fornecedor: Math.max(0, v.valor_fornecedor),
        valor_dropcore: Math.max(0, v.valor_dropcore),
      };
    });

    return NextResponse.json({
      ciclo_repasse,
      ready_statuses: READY_STATUSES,
      ja_fechado: !!ja_fechado,
      fechado_em: cicloRow?.fechado_em ?? null,
      entries_count: entries.length,
      total_count: (ledgerAllRows ?? []).length,
      status_counts,
      debitos_count: debitosList.length,
      por_fornecedor,
      total_fornecedores,
      total_dropcore,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status =
      msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

export async function POST(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);
    const body = await req.json();
    const cicloStr = body?.ciclo_repasse;
    if (!cicloStr || typeof cicloStr !== "string") {
      return NextResponse.json({ error: "ciclo_repasse (YYYY-MM-DD) é obrigatório." }, { status: 400 });
    }
    const ciclo_repasse = cicloStr.trim().slice(0, 10);
    const d = new Date(ciclo_repasse);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json({ error: "ciclo_repasse deve ser uma data válida (segunda-feira)." }, { status: 400 });
    }

    // 1) Ledger do ciclo com status ENTREGUE ou AGUARDANDO_REPASSE
    const { data: ledgerRows, error: ledgerErr } = await supabaseAdmin
      .from("financial_ledger")
      .select("id, fornecedor_id, valor_fornecedor, valor_dropcore, valor_total")
      .eq("org_id", org_id)
      .eq("ciclo_repasse", ciclo_repasse)
      .in("tipo", ["BLOQUEIO", "VENDA"])
      .in("status", ["ENTREGUE", "AGUARDANDO_REPASSE"]);

    if (ledgerErr) {
      return NextResponse.json({ error: ledgerErr.message }, { status: 500 });
    }

    const entries = ledgerRows ?? [];

    // 2) Débitos a descontar neste ciclo
    const { data: debitos, error: debErr } = await supabaseAdmin
      .from("financial_debito_descontar")
      .select("id, fornecedor_id, valor_fornecedor, valor_dropcore, valor_total")
      .eq("org_id", org_id)
      .eq("ciclo_a_descontar", ciclo_repasse)
      .eq("descontado", false);

    if (debErr) {
      return NextResponse.json({ error: debErr.message }, { status: 500 });
    }

    const debitosList = debitos ?? [];
    const porFornecedor: Record<
      string,
      { valor_fornecedor: number; valor_dropcore: number; debito_ids: string[] }
    > = {};

    for (const e of entries) {
      const fid = e.fornecedor_id ?? "sem_fornecedor";
      if (!porFornecedor[fid]) {
        porFornecedor[fid] = { valor_fornecedor: 0, valor_dropcore: 0, debito_ids: [] };
      }
      porFornecedor[fid].valor_fornecedor += Number(e.valor_fornecedor);
      porFornecedor[fid].valor_dropcore += Number(e.valor_dropcore);
    }
    for (const d of debitosList) {
      const fid = d.fornecedor_id;
      if (!porFornecedor[fid]) {
        porFornecedor[fid] = { valor_fornecedor: 0, valor_dropcore: 0, debito_ids: [] };
      }
      porFornecedor[fid].valor_fornecedor -= Number(d.valor_fornecedor);
      porFornecedor[fid].valor_dropcore -= Number(d.valor_dropcore);
      porFornecedor[fid].debito_ids.push(d.id);
    }

    let total_fornecedores = 0;
    let total_dropcore = 0;
    for (const fid of Object.keys(porFornecedor)) {
      const v = porFornecedor[fid];
      total_fornecedores += Math.max(0, v.valor_fornecedor);
      total_dropcore += Math.max(0, v.valor_dropcore);
    }

    // 3) Atualizar ledger: status → PAGO
    const ledgerIds = entries.map((e) => e.id);
    if (ledgerIds.length > 0) {
      const { error: upLedger } = await supabaseAdmin
        .from("financial_ledger")
        .update({ status: "PAGO" })
        .in("id", ledgerIds)
        .eq("org_id", org_id);

      if (upLedger) {
        return NextResponse.json({ error: "Erro ao atualizar ledger: " + upLedger.message }, { status: 500 });
      }
    }

    // 4) Marcar débitos como descontados
    for (const d of debitosList) {
      await supabaseAdmin
        .from("financial_debito_descontar")
        .update({ descontado: true, descontado_em: new Date().toISOString() })
        .eq("id", d.id);
    }

    // 5) Recalcular totais
    const now = new Date().toISOString();

    // 6) Recalcular totais do ciclo a partir de TODOS os PAGO (não só os deste batch)
    const { data: allPago } = await supabaseAdmin
      .from("financial_ledger")
      .select("fornecedor_id, valor_fornecedor, valor_dropcore")
      .eq("org_id", org_id)
      .eq("ciclo_repasse", ciclo_repasse)
      .in("tipo", ["BLOQUEIO", "VENDA"])
      .eq("status", "PAGO");

    const { data: allDebitos } = await supabaseAdmin
      .from("financial_debito_descontar")
      .select("fornecedor_id, valor_fornecedor, valor_dropcore")
      .eq("org_id", org_id)
      .eq("ciclo_a_descontar", ciclo_repasse);

    const cicloTotais: Record<string, { vf: number; vd: number }> = {};
    for (const row of allPago ?? []) {
      const fid = row.fornecedor_id ?? "sem";
      if (!cicloTotais[fid]) cicloTotais[fid] = { vf: 0, vd: 0 };
      cicloTotais[fid].vf += Number(row.valor_fornecedor);
      cicloTotais[fid].vd += Number(row.valor_dropcore);
    }
    for (const row of allDebitos ?? []) {
      const fid = row.fornecedor_id ?? "sem";
      if (!cicloTotais[fid]) cicloTotais[fid] = { vf: 0, vd: 0 };
      cicloTotais[fid].vf -= Number(row.valor_fornecedor);
      cicloTotais[fid].vd -= Number(row.valor_dropcore);
    }

    let ciclo_total_fornecedores = 0;
    let ciclo_total_dropcore = 0;
    for (const v of Object.values(cicloTotais)) {
      ciclo_total_fornecedores += Math.max(0, v.vf);
      ciclo_total_dropcore += Math.max(0, v.vd);
    }

    await supabaseAdmin.from("financial_ciclos_repasse").upsert(
      {
        org_id,
        ciclo_repasse,
        status: "fechado",
        total_fornecedores: ciclo_total_fornecedores,
        total_dropcore: ciclo_total_dropcore,
        fechado_em: now,
      },
      { onConflict: "org_id,ciclo_repasse" }
    );

    // Recalcular repasse por fornecedor com totais completos
    for (const fid of Object.keys(cicloTotais)) {
      if (!uuidRegex.test(fid)) continue;
      const v = cicloTotais[fid];
      const vf = Math.max(0, v.vf);
      if (vf <= 0) continue;
      await supabaseAdmin.from("financial_repasse_fornecedor").upsert(
        {
          org_id,
          fornecedor_id: fid,
          ciclo_repasse,
          valor_total: vf,
          status: "pendente",
          atualizado_em: now,
        },
        { onConflict: "fornecedor_id,ciclo_repasse" }
      );
    }

    return NextResponse.json({
      ok: true,
      ciclo_repasse,
      ledger_atualizados: ledgerIds.length,
      debitos_descontados: debitosList.length,
      total_fornecedores: ciclo_total_fornecedores,
      total_dropcore: ciclo_total_dropcore,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    const status =
      msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
