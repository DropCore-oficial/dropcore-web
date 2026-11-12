/**
 * GET/POST /api/cron/pedidos-contadores-consistencia — rede de segurança genérica pros
 * contadores de aba de pedidos (seller/fornecedor). Achado real 2026-11-11: a aba
 * "Devolução" podia mostrar um número menor que o real quando um pacote (mesmo
 * marketplace_pack_id) tinha itens em status diferentes — corrigido em
 * `fix-seller-pedidos-contadores-pacote-status-divergente.sql`, mas essa rotina continua
 * rodando pra pegar qualquer divergência futura (nessa ou em outra causa), não só esse bug
 * específico. Só leitura interna (sem API externa) — roda de hora em hora.
 * Agendamento: Supabase pg_cron (add-pedidos-contadores-consistencia-cron.sql).
 */
import { NextResponse } from "next/server";
import { verificarConsistenciaContadoresPedidos } from "@/lib/pedidosContadoresConsistencia";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;

  const auth = req.headers.get("authorization")?.trim() ?? "";
  if (auth === `Bearer ${secret}`) return true;

  const manual = req.headers.get("x-cron-secret")?.trim();
  return manual === secret;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const { data: gotLock, error: lockErr } = await supabaseAdmin.rpc(
    "dropcore_try_pedidos_contadores_consistencia_lock"
  );
  if (lockErr) {
    console.error("[cron/pedidos-contadores-consistencia] lock:", lockErr.message);
  } else if (gotLock === false) {
    return NextResponse.json({ ok: true, skipped: true, reason: "checagem_anterior_ainda_em_andamento" });
  }

  try {
    const resultado = await verificarConsistenciaContadoresPedidos();
    return NextResponse.json({ ok: true, ...resultado });
  } catch (e: unknown) {
    console.error("[cron/pedidos-contadores-consistencia]", e);
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Erro inesperado na checagem de consistência." },
      { status: 500 }
    );
  } finally {
    try {
      await supabaseAdmin.rpc("dropcore_release_pedidos_contadores_consistencia_lock");
    } catch {
      /* ignore */
    }
  }
}

export async function POST(req: Request) {
  return GET(req);
}
