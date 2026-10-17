/**
 * POST /api/org/gestores-ia-avulso/assinantes/[id]/desconto — admin define (ou remove) o
 * desconto da parcela mensal de um assinante do pacote avulso. `tipo: null` remove o
 * desconto (volta pro preço cheio). Único caminho que chama
 * `fn_calculadora_assinante_gestores_ia_desconto_set` (service_role only).
 */
import { NextResponse } from "next/server";
import { orgErrorHttpStatus, requireAdmin } from "@/lib/apiOrgAuth";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { VALOR_GESTORES_IA_AVULSO_MENSAL, isGestoresIaAvulsoDescontoTipo } from "@/lib/gestoresIaAvulsoPlanos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin(req);
    const { id } = await params;

    const body = await req.json().catch(() => ({}));
    const tipoRaw = body?.tipo;

    if (tipoRaw === null || tipoRaw === undefined) {
      const { error } = await supabaseAdmin.rpc("fn_calculadora_assinante_gestores_ia_desconto_set", {
        p_assinante_id: id,
        p_tipo: null,
        p_valor: null,
      });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (!isGestoresIaAvulsoDescontoTipo(tipoRaw)) {
      return NextResponse.json({ error: "Tipo de desconto inválido." }, { status: 400 });
    }

    const valor = Number(body?.valor);
    if (!Number.isFinite(valor) || valor <= 0) {
      return NextResponse.json({ error: "Informe um valor de desconto maior que zero." }, { status: 400 });
    }
    if (tipoRaw === "percentual" && valor > 100) {
      return NextResponse.json({ error: "Percentual não pode passar de 100." }, { status: 400 });
    }
    if (tipoRaw === "valor" && valor >= VALOR_GESTORES_IA_AVULSO_MENSAL) {
      return NextResponse.json({ error: "Desconto em R$ não pode ser maior ou igual ao preço cheio." }, { status: 400 });
    }

    const { error } = await supabaseAdmin.rpc("fn_calculadora_assinante_gestores_ia_desconto_set", {
      p_assinante_id: id,
      p_tipo: tipoRaw,
      p_valor: valor,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: orgErrorHttpStatus(e) });
  }
}
