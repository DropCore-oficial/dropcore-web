/**
 * GET — lista sku_ids habilitados + meta (plano, contagem).
 * POST — body { sku_id } — adiciona habilitação (Starter até 15; Pro sem limite prático).
 * DELETE — ?sku_id= — remove habilitação.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createClient } from "@supabase/supabase-js";
import {
  assertPodeRegistrarHabilitacao,
  countHabilitadosQueContamNoLimite,
  isSellerPlanoPro,
} from "@/lib/sellerSkuHabilitado";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_STARTER = 15;

async function getSellerFromBearer(req: Request) {
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return { error: NextResponse.json({ error: "Sem token." }, { status: 401 }) };

  const sbAnon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false } }
  );
  const { data: userData, error: userErr } = await sbAnon.auth.getUser(token);
  if (userErr || !userData?.user) {
    return { error: NextResponse.json({ error: "Token inválido." }, { status: 401 }) };
  }

  const { data: seller, error: sellerErr } = await supabaseAdmin
    .from("sellers")
    .select("id, org_id, fornecedor_id, plano")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (sellerErr || !seller) {
    return { error: NextResponse.json({ error: "Seller não encontrado." }, { status: 404 }) };
  }

  return { seller: seller as { id: string; org_id: string; fornecedor_id: string | null; plano: string | null } };
}

export async function GET(req: Request) {
  try {
    const ctx = await getSellerFromBearer(req);
    if ("error" in ctx) return ctx.error;
    const { seller } = ctx;

    const { data: rows, error } = await supabaseAdmin
      .from("seller_skus_habilitados")
      .select("sku_id")
      .eq("seller_id", seller.id);

    if (error) {
      const msg = String(error.message ?? "");
      if (msg.includes("does not exist") || error.code === "42P01") {
        return NextResponse.json({
          ok: true,
          sku_ids: [] as string[],
          habilitados_count: 0,
          habilitados_max: isSellerPlanoPro(seller.plano) ? null : MAX_STARTER,
          plano: seller.plano,
          tabela_ok: false,
        });
      }
      throw error;
    }

    const sku_ids = [...new Set((rows ?? []).map((r: { sku_id: string }) => r.sku_id))];
    const { count } = await countHabilitadosQueContamNoLimite(supabaseAdmin, seller.id);

    return NextResponse.json({
      ok: true,
      sku_ids,
      habilitados_count: count,
      habilitados_max: isSellerPlanoPro(seller.plano) ? null : MAX_STARTER,
      plano: seller.plano,
      tabela_ok: true,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro inesperado" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getSellerFromBearer(req);
    if ("error" in ctx) return ctx.error;
    const { seller } = ctx;

    const body = await req.json().catch(() => ({}));
    const sku_id = body?.sku_id ? String(body.sku_id) : "";
    if (!sku_id) {
      return NextResponse.json({ error: "sku_id é obrigatório." }, { status: 400 });
    }

    const { data: existing } = await supabaseAdmin
      .from("seller_skus_habilitados")
      .select("id")
      .eq("seller_id", seller.id)
      .eq("sku_id", sku_id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ ok: true, already: true });
    }

    const gate = await assertPodeRegistrarHabilitacao(supabaseAdmin, {
      sellerId: seller.id,
      sellerPlano: seller.plano,
      orgId: seller.org_id,
      fornecedorId: seller.fornecedor_id,
      skuId: sku_id,
    });
    if (!gate.ok) {
      return NextResponse.json(
        { error: gate.error },
        { status: gate.status ?? 400 }
      );
    }

    const { error: insErr } = await supabaseAdmin.from("seller_skus_habilitados").insert({
      seller_id: seller.id,
      sku_id,
    });

    if (insErr) {
      const msg = String(insErr.message ?? "");
      if (msg.includes("does not exist") || insErr.code === "42P01") {
        return NextResponse.json(
          { error: "Tabela seller_skus_habilitados inexistente. Execute o script create-seller-skus-habilitados.sql no Supabase." },
          { status: 503 }
        );
      }
      if (msg.toLowerCase().includes("duplicate") || insErr.code === "23505") {
        return NextResponse.json({ ok: true, already: true });
      }
      console.error("[habilitados POST]", insErr.message);
      return NextResponse.json({ error: "Erro ao gravar habilitação." }, { status: 500 });
    }

    const { count } = await countHabilitadosQueContamNoLimite(supabaseAdmin, seller.id);
    return NextResponse.json({ ok: true, habilitados_count: count });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro inesperado" }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const ctx = await getSellerFromBearer(req);
    if ("error" in ctx) return ctx.error;
    const { seller } = ctx;

    const { searchParams } = new URL(req.url);
    const sku_id = searchParams.get("sku_id")?.trim() ?? "";
    if (!sku_id) {
      return NextResponse.json({ error: "sku_id é obrigatório (query)." }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from("seller_skus_habilitados")
      .delete()
      .eq("seller_id", seller.id)
      .eq("sku_id", sku_id);

    if (error) {
      if (String(error.message ?? "").includes("does not exist") || error.code === "42P01") {
        return NextResponse.json(
          { error: "Tabela seller_skus_habilitados inexistente. Execute o script create-seller-skus-habilitados.sql no Supabase." },
          { status: 503 }
        );
      }
      throw error;
    }

    const { count } = await countHabilitadosQueContamNoLimite(supabaseAdmin, seller.id);
    return NextResponse.json({ ok: true, habilitados_count: count });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro inesperado" }, { status: 500 });
  }
}
