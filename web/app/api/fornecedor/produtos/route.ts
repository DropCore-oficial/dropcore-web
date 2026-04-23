/**
 * GET /api/fornecedor/produtos — lista SKUs do fornecedor autenticado
 * POST /api/fornecedor/produtos — adiciona novo produto (respeita limite do plano)
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { toTitleCase } from "@/lib/formatText";
import { assertPodeAtivarMaisSkus } from "@/lib/planos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Obtém iniciais do fornecedor a partir do nome (ex: "Djulios" -> "DJU") */
function iniciaisFromNome(nome: string | null | undefined): string {
  const n = (nome ?? "").trim();
  if (!n) return "FD";
  const firstWord = (n.split(/\s+/)[0] || "").slice(0, 3).toUpperCase();
  return firstWord || "FD";
}

const SKU_FIELDS = `
  id, sku, nome_produto, cor, tamanho, status, fornecedor_id, fornecedor_org_id, org_id,
  estoque_atual, estoque_minimo, custo_base, custo_dropcore, peso_kg, categoria,
  dimensoes_pacote, comprimento_cm, largura_cm, altura_cm, link_fotos, imagem_url, descricao,
  ncm, origem, cest, cfop, peso_liquido_kg, peso_bruto_kg, criado_em,
  expedicao_override_linha
`;

/** Campos de `skus` que podem vir em `dados_propostos` (alteração pendente) — exibe o valor enviado na lista. */
const CAMPOS_PROPOSTOS_SKU = new Set([
  "nome_produto",
  "cor",
  "tamanho",
  "descricao",
  "imagem_url",
  "peso_kg",
  "estoque_atual",
  "estoque_minimo",
  "custo_base",
  "custo_dropcore",
  "categoria",
  "dimensoes_pacote",
  "comprimento_cm",
  "largura_cm",
  "altura_cm",
  "link_fotos",
  "ncm",
  "origem",
  "cest",
  "cfop",
  "peso_liquido_kg",
  "peso_bruto_kg",
  "expedicao_override_linha",
]);

function aplicarPropostosPendentes<T extends Record<string, unknown>>(
  sku: T,
  propostos: Record<string, unknown> | null | undefined
): T {
  if (!propostos || typeof propostos !== "object") return sku;
  const out = { ...sku } as Record<string, unknown>;
  for (const key of CAMPOS_PROPOSTOS_SKU) {
    if (key in propostos) out[key] = propostos[key];
  }
  return out as T;
}

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

    const { data, error } = await supabaseAdmin
      .from("skus")
      .select(SKU_FIELDS)
      .eq("org_id", ctx.org_id)
      .eq("fornecedor_id", ctx.fornecedor_id)
      .order("criado_em", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const rows = data ?? [];
    const ids = rows.map((r) => r.id).filter(Boolean);
    if (ids.length === 0) return NextResponse.json(rows);

    const { data: pendentesRows, error: errPend } = await supabaseAdmin
      .from("sku_alteracoes_pendentes")
      .select("sku_id, dados_propostos")
      .eq("org_id", ctx.org_id)
      .eq("fornecedor_id", ctx.fornecedor_id)
      .eq("status", "pendente")
      .in("sku_id", ids);

    if (errPend) return NextResponse.json({ error: errPend.message }, { status: 500 });

    const propostosPorSku = new Map<string, Record<string, unknown>>();
    for (const row of pendentesRows ?? []) {
      const sid = row.sku_id as string | undefined;
      const dp = row.dados_propostos;
      if (sid && dp && typeof dp === "object" && !Array.isArray(dp)) {
        propostosPorSku.set(sid, dp as Record<string, unknown>);
      }
    }

    const merged = rows.map((sku) => {
      const prop = propostosPorSku.get(sku.id);
      return aplicarPropostosPendentes(sku as Record<string, unknown>, prop) as (typeof rows)[number];
    });

    return NextResponse.json(merged);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await getFornecedorFromToken(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const nome_produto = typeof body?.nome_produto === "string" ? body.nome_produto.trim() : "";
    const cor = typeof body?.cor === "string" ? body.cor.trim() : null;
    const tamanho = typeof body?.tamanho === "string" ? body.tamanho.trim() : null;
    const sku = typeof body?.sku === "string" ? body.sku.trim().toUpperCase() : "";
    const link_fotos = typeof body?.link_fotos === "string" ? body.link_fotos.trim() || null : null;
    const descricao = typeof body?.descricao === "string" ? body.descricao.trim() || null : null;
    const comprimento_cm = body?.comprimento_cm != null ? parseFloat(String(body.comprimento_cm).replace(",", ".")) : null;
    const largura_cm = body?.largura_cm != null ? parseFloat(String(body.largura_cm).replace(",", ".")) : null;
    const altura_cm = body?.altura_cm != null ? parseFloat(String(body.altura_cm).replace(",", ".")) : null;
    const peso_kg = body?.peso_kg != null ? parseFloat(String(body.peso_kg).replace(",", ".")) : null;
    const custo_base = body?.custo_base != null ? parseFloat(String(body.custo_base).replace(",", ".")) : null;
    const estoque_atual = body?.estoque_atual != null ? (typeof body.estoque_atual === "number" ? body.estoque_atual : parseFloat(String(body.estoque_atual).replace(",", "."))) : null;

    if (!nome_produto) {
      return NextResponse.json({ error: "Nome do produto é obrigatório." }, { status: 400 });
    }

    let skuFinal = sku;
    if (!skuFinal) {
      const { data: forn } = await supabaseAdmin
        .from("fornecedores")
        .select("nome")
        .eq("id", ctx.fornecedor_id)
        .maybeSingle();
      const prefixo = iniciaisFromNome(forn?.nome);
      // Produto único usa bloco 000 para não colidir com multivariante (blocos 001+)
      const { data: maxRow } = await supabaseAdmin
        .from("skus")
        .select("sku")
        .eq("org_id", ctx.org_id)
        .like("sku", `${prefixo}000%`)
        .order("sku", { ascending: false })
        .limit(1)
        .maybeSingle();
      let seq = 1;
      if (maxRow?.sku) {
        const m = String(maxRow.sku).match(new RegExp(`^${prefixo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}000(\\d{3})$`));
        if (m) seq = parseInt(m[1], 10) + 1;
      }
      skuFinal = `${prefixo}000${String(seq).padStart(3, "0")}`;
    }

    // Verifica limite do plano da org
    const { data: org } = await supabaseAdmin.from("orgs").select("plano").eq("id", ctx.org_id).maybeSingle();
    const plano = org?.plano ?? "starter";
    const check = await assertPodeAtivarMaisSkus(supabaseAdmin, ctx.org_id, plano ?? null, [
      { nome_produto: toTitleCase(nome_produto), cor: cor ? toTitleCase(cor) : null },
    ]);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 403 });
    }

    // SKU único por org
    const { data: existente } = await supabaseAdmin
      .from("skus")
      .select("id")
      .eq("org_id", ctx.org_id)
      .ilike("sku", skuFinal)
      .maybeSingle();
    if (existente) {
      return NextResponse.json({ error: `SKU "${skuFinal}" já existe na organização. Use outro código.` }, { status: 400 });
    }

    const insert: Record<string, unknown> = {
      org_id: ctx.org_id,
      fornecedor_id: ctx.fornecedor_id,
      fornecedor_org_id: ctx.org_id,
      sku: skuFinal,
      nome_produto: toTitleCase(nome_produto),
      cor: cor ? toTitleCase(cor) : null,
      tamanho: tamanho ? tamanho.trim().toUpperCase() : null,
      status: "ativo",
      link_fotos,
      descricao: descricao ? toTitleCase(descricao) : null,
      comprimento_cm: Number.isFinite(comprimento_cm) ? comprimento_cm : null,
      largura_cm: Number.isFinite(largura_cm) ? largura_cm : null,
      altura_cm: Number.isFinite(altura_cm) ? altura_cm : null,
      peso_kg: Number.isFinite(peso_kg) ? peso_kg : null,
      custo_base: Number.isFinite(custo_base) ? custo_base : null,
      estoque_atual: Number.isFinite(estoque_atual) ? Math.max(0, Math.round(estoque_atual)) : null,
    };

    const { data: inserted, error } = await supabaseAdmin
      .from("skus")
      .insert(insert)
      .select(SKU_FIELDS)
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(inserted);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
