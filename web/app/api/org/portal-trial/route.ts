import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { orgErrorHttpStatus, requireAdmin } from "@/lib/apiOrgAuth";
import { trialValidoAteSomarDias } from "@/lib/portalTrial";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);
    const [sellersRes, fornRes] = await Promise.all([
      supabaseAdmin
        .from("sellers")
        .select("id, nome, trial_valido_ate")
        .eq("org_id", org_id)
        .ilike("status", "ativo")
        .order("nome", { ascending: true }),
      supabaseAdmin
        .from("fornecedores")
        .select("id, nome, trial_valido_ate")
        .eq("org_id", org_id)
        .ilike("status", "ativo")
        .order("nome", { ascending: true }),
    ]);
    if (sellersRes.error) return NextResponse.json({ error: sellersRes.error.message }, { status: 500 });
    if (fornRes.error) return NextResponse.json({ error: fornRes.error.message }, { status: 500 });
    return NextResponse.json({
      sellers: (sellersRes.data ?? []).map((s) => ({
        id: s.id,
        nome: s.nome,
        trial_valido_ate: (s as { trial_valido_ate?: string | null }).trial_valido_ate ?? null,
      })),
      fornecedores: (fornRes.data ?? []).map((f) => ({
        id: f.id,
        nome: f.nome,
        trial_valido_ate: (f as { trial_valido_ate?: string | null }).trial_valido_ate ?? null,
      })),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: orgErrorHttpStatus(e) });
  }
}

export async function POST(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);
    const body = await req.json();
    const tipo = String(body?.tipo ?? "").toLowerCase();
    const entidade_id = String(body?.entidade_id ?? "").trim();
    const dias = Number(body?.dias);
    if (!["seller", "fornecedor"].includes(tipo)) {
      return NextResponse.json({ error: "tipo deve ser seller ou fornecedor." }, { status: 400 });
    }
    if (!entidade_id) {
      return NextResponse.json({ error: "entidade_id é obrigatório." }, { status: 400 });
    }
    if (!Number.isFinite(dias) || dias < 1 || dias > 365) {
      return NextResponse.json({ error: "dias deve ser entre 1 e 365." }, { status: 400 });
    }
    const table = tipo === "seller" ? "sellers" : "fornecedores";
    const { data: row, error: fetchErr } = await supabaseAdmin
      .from(table)
      .select("id, trial_valido_ate, status")
      .eq("id", entidade_id)
      .eq("org_id", org_id)
      .maybeSingle();
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!row) {
      return NextResponse.json({ error: "Entidade não encontrada ou sem permissão." }, { status: 404 });
    }
    const st = String((row as { status?: string }).status ?? "").toLowerCase();
    if (st !== "ativo") {
      return NextResponse.json({ error: "Apenas sellers e fornecedores ativos." }, { status: 400 });
    }
    const current = (row as { trial_valido_ate?: string | null }).trial_valido_ate ?? null;
    const trial_valido_ate = trialValidoAteSomarDias(current, Math.floor(dias));
    const { error: upErr } = await supabaseAdmin
      .from(table)
      .update({ trial_valido_ate })
      .eq("id", entidade_id)
      .eq("org_id", org_id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, trial_valido_ate });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: orgErrorHttpStatus(e) });
  }
}

/** Remove o teste grátis do portal (trial_valido_ate = null). */
export async function DELETE(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));
    const tipo = String(body?.tipo ?? "").toLowerCase();
    const entidade_id = String(body?.entidade_id ?? "").trim();
    if (!["seller", "fornecedor"].includes(tipo)) {
      return NextResponse.json({ error: "tipo deve ser seller ou fornecedor." }, { status: 400 });
    }
    if (!entidade_id) {
      return NextResponse.json({ error: "entidade_id é obrigatório." }, { status: 400 });
    }
    const table = tipo === "seller" ? "sellers" : "fornecedores";
    const { data: row, error: fetchErr } = await supabaseAdmin
      .from(table)
      .select("id, status")
      .eq("id", entidade_id)
      .eq("org_id", org_id)
      .maybeSingle();
    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!row) {
      return NextResponse.json({ error: "Entidade não encontrada ou sem permissão." }, { status: 404 });
    }
    const st = String((row as { status?: string }).status ?? "").toLowerCase();
    if (st !== "ativo") {
      return NextResponse.json({ error: "Apenas sellers e fornecedores ativos." }, { status: 400 });
    }
    const { error: upErr } = await supabaseAdmin
      .from(table)
      .update({ trial_valido_ate: null })
      .eq("id", entidade_id)
      .eq("org_id", org_id);
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, trial_valido_ate: null });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro";
    return NextResponse.json({ error: msg }, { status: orgErrorHttpStatus(e) });
  }
}
