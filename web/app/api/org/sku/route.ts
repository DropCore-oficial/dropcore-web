import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getMe, requireAdmin } from "@/lib/apiOrgAuth";
import { toTitleCase } from "@/lib/formatText";
import { assertPodeAtivarMaisSkus } from "@/lib/planos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/org/sku
 * Retorna SKUs da org do usuário autenticado.
 */
export async function GET(req: Request) {
  try {
    const { org_id } = await getMe(req);

    const { data, error } = await supabaseAdmin
      .from("skus")
      .select(
        `
        id,
        fornecedor_id,
        sku,
        nome_produto,
        estoque_atual,
        estoque_minimo,
        custo_base,
        custo_dropcore,
        status,
        criado_em,
        fornecedor_org_id,
        org_id,
        cor,
        tamanho,
        peso_kg
      `
      )
      .eq("org_id", org_id)
      .order("criado_em", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro no GET /api/org/sku";
    const status = msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

/**
 * POST /api/org/sku
 * body: { items: [...] } — apenas owner/admin; todos os items devem ter org_id = org do usuário.
 */
export async function POST(req: Request) {
  try {
    const { org_id, plano } = await requireAdmin(req);
    const body = await req.json();
    const items = body?.items;

    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: "Envie { items: [...] }" },
        { status: 400 }
      );
    }

    const novosAtivos = items.filter(
      (it: Record<string, unknown>) => String(it?.status ?? "ativo").toLowerCase() !== "inativo"
    );
    if (novosAtivos.length > 0) {
      const newItems = novosAtivos.map((it: Record<string, unknown>) => ({
        nome_produto: typeof it?.nome_produto === "string" ? it.nome_produto : null,
        cor: typeof it?.cor === "string" ? it.cor : null,
      }));
      const check = await assertPodeAtivarMaisSkus(supabaseAdmin, org_id, plano ?? null, newItems);
      if (!check.ok) {
        return NextResponse.json({ error: check.error }, { status: 403 });
      }
    }

    // validação mínima + forçar org_id + capitalização automática em textos
    const textKeys = ["nome_produto", "categoria", "cor", "tamanho", "dimensoes_pacote"] as const;
    const dimKeys = ["comprimento_cm", "largura_cm", "altura_cm"] as const;
    const safeItems = items.map((it: Record<string, unknown>) => {
      if (!it?.sku || typeof it.sku !== "string") {
        throw new Error("Cada item precisa ter sku (string)");
      }
      if (!it?.fornecedor_id || !it?.fornecedor_org_id) {
        throw new Error("Cada item precisa ter fornecedor_id e fornecedor_org_id (UUIDs)");
      }
      const out: Record<string, unknown> = { ...it, org_id };
      for (const key of textKeys) {
        if (out[key] != null && typeof out[key] === "string" && (out[key] as string).trim()) {
          out[key] = toTitleCase(out[key]);
        }
      }
      for (const key of dimKeys) {
        if (out[key] != null) {
          const n = typeof out[key] === "number" ? out[key] : parseFloat(String(out[key]).replace(",", "."));
          out[key] = Number.isFinite(n) ? n : null;
        }
      }
      return out;
    });

    const { data, error } = await supabaseAdmin
      .from("skus")
      .insert(safeItems)
      .select(
        `
        id,
        fornecedor_id,
        sku,
        nome_produto,
        estoque_atual,
        estoque_minimo,
        custo_base,
        custo_dropcore,
        status,
        criado_em,
        fornecedor_org_id,
        org_id,
        cor,
        tamanho,
        peso_kg
      `
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data || []);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro no POST /api/org/sku";
    const status = msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}

/**
 * DELETE /api/org/sku
 * body: { sku } ou { skus: [] } ou { skuPai } — apenas owner/admin; só apaga SKUs da própria org.
 */
export async function DELETE(req: Request) {
  try {
    const { org_id } = await requireAdmin(req);
    const body = await req.json().catch(() => ({}));

    const sku: string | undefined = body?.sku;
    const skus: string[] | undefined = body?.skus;
    const skuPai: string | undefined = body?.skuPai;

    const hasSku = sku && typeof sku === "string";
    const hasSkus = Array.isArray(skus) && skus.length > 0;
    const hasSkuPai = skuPai && typeof skuPai === "string";

    if (!hasSku && !hasSkus && !hasSkuPai) {
      return NextResponse.json(
        { error: "Envie { sku } ou { skus: [] } ou { skuPai }" },
        { status: 400 }
      );
    }

    if (hasSkuPai) {
      const head = skuPai!.slice(0, -3);
      if (!head || head.length < 4) {
        return NextResponse.json(
          { error: "skuPai inválido. Ex: DJU100000" },
          { status: 400 }
        );
      }
      const like = `${head}%`;
      const { error } = await supabaseAdmin.from("skus").delete().like("sku", like).eq("org_id", org_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, deleted: "skuPai", like });
    }

    if (hasSku) {
      const { error } = await supabaseAdmin.from("skus").delete().eq("sku", sku!).eq("org_id", org_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, deleted: "sku", sku });
    }

    const clean = (skus || []).filter((x) => typeof x === "string" && x.trim());
    if (!clean.length) {
      return NextResponse.json({ error: "Lista skus vazia" }, { status: 400 });
    }
    const { error } = await supabaseAdmin.from("skus").delete().in("sku", clean).eq("org_id", org_id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, deleted: "skus", count: clean.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro no DELETE /api/org/sku";
    const status = msg === "Unauthorized" || msg === "Usuário sem organização." ? 401 : msg === "Sem permissão." ? 403 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
