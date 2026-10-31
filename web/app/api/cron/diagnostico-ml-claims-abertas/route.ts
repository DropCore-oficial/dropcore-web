/**
 * GET /api/cron/diagnostico-ml-claims-abertas?seller_id=... — diagnóstico manual, só
 * leitura: lista as reclamações abertas desse seller direto na API do ML e como cada uma
 * seria classificada, SEM gravar nada no banco, SEM travar saldo, SEM notificar ninguém.
 * Protegido pelo mesmo CRON_SECRET dos crons — não é rota pública.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  getValidMercadoLivreAccessToken,
  mlBuscarReclamacoesAbertas,
  mlBuscarMotivoReclamacao,
  mlBuscarEvidenciasReclamacao,
} from "@/lib/mercadoLivreApiClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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

  const { searchParams } = new URL(req.url);
  const sellerId = searchParams.get("seller_id");
  if (!sellerId) {
    return NextResponse.json({ error: "seller_id é obrigatório." }, { status: 400 });
  }

  const { data: seller } = await supabaseAdmin.from("sellers").select("nome").eq("id", sellerId).maybeSingle();

  const ctx = await getValidMercadoLivreAccessToken(sellerId);
  if (!ctx) {
    return NextResponse.json({ error: "Seller sem token ML válido." }, { status: 400 });
  }

  const reclamacoes = await mlBuscarReclamacoesAbertas(ctx);

  const resultado = await Promise.all(
    reclamacoes.map(async (r) => {
      const [motivo, evidencias] = await Promise.all([
        mlBuscarMotivoReclamacao(r.reasonId, ctx).catch(() => null),
        mlBuscarEvidenciasReclamacao(r.id, ctx).catch(() => []),
      ]);
      const rulesEngineTriage = motivo?.rulesEngineTriage ?? [];
      const pareceDevolucao = rulesEngineTriage.includes("repentant") || evidencias.length === 0;
      return {
        claim_id: r.id,
        resource: r.resource,
        resource_id: r.resourceId,
        status: r.status,
        type: r.type,
        reason_id: r.reasonId,
        date_created: r.dateCreated,
        rules_engine_triage: rulesEngineTriage,
        qtd_evidencias: evidencias.length,
        parece_devolucao: pareceDevolucao,
      };
    })
  );

  return NextResponse.json({ ok: true, seller_id: sellerId, seller_nome: seller?.nome ?? null, total: reclamacoes.length, reclamacoes: resultado });
}

export async function POST(req: Request) {
  return GET(req);
}
