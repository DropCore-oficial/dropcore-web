/**
 * POST /api/fornecedor/produtos/grupo-adicionar-variantes
 * Adiciona ao grupo SKUs filhos que ainda não existem (mesma lógica de combinações do multivariante).
 * Body: { grupoKey: "DJU001000", cores: string[], tamanhos: string[] }
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { toTitleCase } from "@/lib/formatText";
import { assertPodeAtivarMaisSkus } from "@/lib/planos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SKU_FIELDS = `
  id, sku, nome_produto, cor, tamanho, status, fornecedor_id, fornecedor_org_id, org_id,
  estoque_atual, estoque_minimo, custo_base, custo_dropcore, peso_kg, categoria,
  dimensoes_pacote, comprimento_cm, largura_cm, altura_cm, link_fotos, descricao, criado_em
`;

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

function parseList(v: unknown): string[] {
  if (Array.isArray(v)) {
    return v.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean);
  }
  if (typeof v === "string") {
    return v.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

function pairKey(cor: string | null, tam: string | null): string {
  return `${(cor ?? "").trim().toLowerCase()}|${(tam ?? "").trim().toUpperCase()}`;
}

export async function POST(req: Request) {
  try {
    const ctx = await getFornecedorFromToken(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const grupoKey = typeof body?.grupoKey === "string" ? body.grupoKey.trim().toUpperCase() : "";
    const cores = parseList(body?.cores ?? []);
    const tamanhos = parseList(body?.tamanhos ?? []);

    const m = grupoKey.match(/^([A-Z]+)(\d{3})000$/);
    if (!m) {
      return NextResponse.json({ error: "grupoKey inválido (esperado SKU pai, ex.: DJU001000)." }, { status: 400 });
    }
    const prefix = m[1];
    const bloco = m[2];

    if (cores.length === 0 && tamanhos.length === 0) {
      return NextResponse.json({ error: "Informe pelo menos uma cor ou um tamanho." }, { status: 400 });
    }

    const combinacoes: { cor: string | null; tamanho: string | null }[] = [];
    if (cores.length > 0 && tamanhos.length > 0) {
      for (const cor of cores) {
        for (const tam of tamanhos) {
          combinacoes.push({ cor: toTitleCase(cor), tamanho: tam.trim().toUpperCase() });
        }
      }
    } else if (cores.length > 0) {
      for (const cor of cores) {
        combinacoes.push({ cor: toTitleCase(cor), tamanho: null });
      }
    } else {
      for (const tam of tamanhos) {
        combinacoes.push({ cor: null, tamanho: tam.trim().toUpperCase() });
      }
    }

    const { data: skus, error: listErr } = await supabaseAdmin
      .from("skus")
      .select("id, sku, cor, tamanho, nome_produto, descricao, link_fotos, comprimento_cm, largura_cm, altura_cm, estoque_atual, estoque_minimo, custo_base, peso_kg, custo_dropcore")
      .eq("org_id", ctx.org_id)
      .eq("fornecedor_id", ctx.fornecedor_id)
      .like("sku", `${prefix}${bloco}%`);

    if (listErr) return NextResponse.json({ error: listErr.message }, { status: 500 });

    const pai = (skus ?? []).find((s) => s.sku === grupoKey);
    if (!pai) {
      return NextResponse.json({ error: "Grupo não encontrado ou SKU pai inexistente." }, { status: 404 });
    }

    const existing = new Set<string>();
    for (const r of skus ?? []) {
      if (r.sku === grupoKey) continue;
      existing.add(pairKey(r.cor ?? null, r.tamanho ?? null));
    }

    const missing = combinacoes.filter((c) => !existing.has(pairKey(c.cor, c.tamanho)));
    if (missing.length === 0) {
      return NextResponse.json({ ok: true, adicionados: 0, message: "Todas as combinações já existem no grupo." });
    }

    const { data: org } = await supabaseAdmin.from("orgs").select("plano").eq("id", ctx.org_id).maybeSingle();
    const plano = org?.plano ?? "starter";
    const newItems = missing.map((c) => ({
      nome_produto: pai.nome_produto ?? "",
      cor: c.cor,
    }));
    const check = await assertPodeAtivarMaisSkus(supabaseAdmin, ctx.org_id, plano ?? null, newItems);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 403 });
    }

    let maxSuffix = 0;
    for (const r of skus ?? []) {
      if (r.sku === grupoKey) continue;
      const suf = parseInt(String(r.sku).slice(-3), 10);
      if (!Number.isNaN(suf)) maxSuffix = Math.max(maxSuffix, suf);
    }

    const rows: Record<string, unknown>[] = [];
    for (const c of missing) {
      maxSuffix += 1;
      if (maxSuffix > 999) {
        return NextResponse.json({ error: "Limite de variantes no bloco (999) atingido." }, { status: 400 });
      }
      const sku = `${prefix}${bloco}${String(maxSuffix).padStart(3, "0")}`;
      rows.push({
        org_id: ctx.org_id,
        fornecedor_id: ctx.fornecedor_id,
        fornecedor_org_id: ctx.org_id,
        sku,
        nome_produto: pai.nome_produto,
        cor: c.cor,
        tamanho: c.tamanho,
        status: "ativo",
        link_fotos: null,
        descricao: pai.descricao ?? null,
        comprimento_cm: pai.comprimento_cm,
        largura_cm: pai.largura_cm,
        altura_cm: pai.altura_cm,
        estoque_atual: pai.estoque_atual,
        estoque_minimo: pai.estoque_minimo,
        custo_base: pai.custo_base,
        custo_dropcore: pai.custo_dropcore,
        peso_kg: pai.peso_kg,
      });
    }

    const { data: inserted, error: insErr } = await supabaseAdmin.from("skus").insert(rows).select(SKU_FIELDS);
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      adicionados: inserted?.length ?? 0,
      itens: inserted ?? [],
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
