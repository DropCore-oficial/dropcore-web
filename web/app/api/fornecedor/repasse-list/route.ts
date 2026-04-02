/**
 * GET /api/fornecedor/repasse-list
 * Lista repasses do fornecedor autenticado (financial_repasse_fornecedor).
 * Requer token de fornecedor via /api/fornecedor/me.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
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
    const statusParam = searchParams.get("status")?.trim() || "";
    const includePreview = searchParams.get("include_preview") === "1";
    const statuses = statusParam ? statusParam.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean) : ["pendente", "liberado", "pago"];

    const { data: rows, error } = await supabaseAdmin
      .from("financial_repasse_fornecedor")
      .select("id, fornecedor_id, ciclo_repasse, valor_total, status, pago_em, atualizado_em")
      .eq("org_id", ctx.org_id)
      .eq("fornecedor_id", ctx.fornecedor_id)
      .in("status", statuses.length ? statuses : ["pendente", "liberado", "pago"])
      .order("ciclo_repasse", { ascending: false })
      .limit(100);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const items = (rows ?? []).map((r) => ({
      id: r.id,
      ciclo_repasse: r.ciclo_repasse,
      valor_total: Number(r.valor_total),
      status: r.status,
      pago_em: r.pago_em,
      atualizado_em: r.atualizado_em,
    }));

    const totalPendente = items.filter((i) => i.status === "pendente" || i.status === "liberado").reduce((s, i) => s + i.valor_total, 0);

    let futuros: Array<{ ciclo_repasse: string; valor_previsto: number; pedidos: number }> = [];
    if (includePreview) {
      const hoje = new Date();
      const y = hoje.getFullYear();
      const m = String(hoje.getMonth() + 1).padStart(2, "0");
      const d = String(hoje.getDate()).padStart(2, "0");
      const hojeStr = `${y}-${m}-${d}`;

      const { data: prevRows, error: prevErr } = await supabaseAdmin
        .from("financial_ledger")
        .select("ciclo_repasse, valor_fornecedor")
        .eq("org_id", ctx.org_id)
        .eq("fornecedor_id", ctx.fornecedor_id)
        .in("tipo", ["BLOQUEIO", "VENDA"])
        .in("status", ["ENTREGUE", "AGUARDANDO_REPASSE"])
        .gte("ciclo_repasse", hojeStr)
        .order("ciclo_repasse", { ascending: true })
        .limit(500);

      if (prevErr) {
        return NextResponse.json({ error: prevErr.message }, { status: 500 });
      }

      const byCycle: Record<string, { valor: number; pedidos: number }> = {};
      for (const r of prevRows ?? []) {
        const ciclo = (r as any).ciclo_repasse as string | null;
        if (!ciclo) continue;
        if (!byCycle[ciclo]) byCycle[ciclo] = { valor: 0, pedidos: 0 };
        byCycle[ciclo].valor += Number((r as any).valor_fornecedor ?? 0);
        byCycle[ciclo].pedidos += 1;
      }

      futuros = Object.keys(byCycle)
        .sort((a, b) => (a < b ? -1 : 1))
        .map((ciclo) => ({
          ciclo_repasse: ciclo,
          valor_previsto: Math.max(0, byCycle[ciclo].valor),
          pedidos: byCycle[ciclo].pedidos,
        }))
        .filter((x) => x.valor_previsto > 0)
        .slice(0, 8);
    }

    return NextResponse.json({ items, total_a_receber: totalPendente, futuros });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
