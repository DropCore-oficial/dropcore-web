import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/apiOrgAuth";
import { toTitleCase } from "@/lib/formatText";
import { assertPodeAtivarMaisSkus } from "@/lib/planos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TABLE = "skus";

export async function PATCH(req: Request) {
  try {
    const { org_id, plano } = await requireAdmin(req);
    const body = await req.json();
    const sku = String(body?.sku || "").trim().toUpperCase();
    const patch = body?.patch || null;

    if (!sku) return NextResponse.json({ error: "sku obrigatório" }, { status: 400 });
    if (!patch || typeof patch !== "object") return NextResponse.json({ error: "patch inválido" }, { status: 400 });

    const allowed = new Set([
      "nome_produto",
      "cor",
      "tamanho",
      "categoria",
      "dimensoes_pacote",
      "comprimento_cm",
      "largura_cm",
      "altura_cm",
      "estoque_atual",
      "custo_base",
      "custo_dropcore",
      "peso_kg",
      "status",
      "estoque_minimo",
    ]);

    const textFields = new Set(["nome_produto", "cor", "tamanho", "categoria", "dimensoes_pacote"]);
    const dimFields = new Set(["comprimento_cm", "largura_cm", "altura_cm"]);
    const safePatch: Record<string, any> = {};
    for (const k of Object.keys(patch)) {
      if (!allowed.has(k)) continue;
      const v = patch[k];
      if (textFields.has(k) && (typeof v === "string" || v == null)) {
        safePatch[k] = v == null || v === "" ? v : toTitleCase(v);
      } else if (dimFields.has(k)) {
        if (v == null || v === "") safePatch[k] = null;
        else if (typeof v === "number" && Number.isFinite(v)) safePatch[k] = v;
        else if (typeof v === "string") { const n = parseFloat(v.replace(",", ".")); safePatch[k] = Number.isFinite(n) ? n : null; }
        else safePatch[k] = null;
      } else {
        safePatch[k] = v;
      }
    }

    if (!Object.keys(safePatch).length) {
      return NextResponse.json({ error: "Nenhum campo permitido no patch" }, { status: 400 });
    }

    if (safePatch.status === "ativo") {
      const { data: current } = await supabaseAdmin
        .from(TABLE)
        .select("status, nome_produto, cor")
        .eq("sku", sku)
        .eq("org_id", org_id)
        .maybeSingle();
      const jaAtivo = String(current?.status ?? "").toLowerCase() === "ativo";
      if (!jaAtivo && current) {
        const check = await assertPodeAtivarMaisSkus(supabaseAdmin, org_id, plano ?? null, [
          { nome_produto: current.nome_produto ?? null, cor: current.cor ?? null },
        ]);
        if (!check.ok) {
          return NextResponse.json({ error: check.error }, { status: 403 });
        }
      }
    }

    const { data, error } = await supabaseAdmin
      .from(TABLE)
      .update(safePatch)
      .eq("sku", sku)
      .eq("org_id", org_id)
      .select("sku")
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        {
          error: error.message,
          hint: error.hint,
          details: error.details,
          code: error.code,
          table: TABLE,
          sku,
          patch: safePatch,
        },
        { status: 500 }
      );
    }

    if (!data) {
      return NextResponse.json(
        { error: "SKU não encontrado para update (verifique se existe e se a coluna é sku)", table: TABLE, sku },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, sku });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro no update";
    const status = msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
