/**
 * POST /api/fornecedor/produtos/multivariante
 * Cria produto multivariante: 1 SKU pai (000) com link_fotos + N filhos (cor/tamanho)
 * body: { nome_produto, cores?: string[], tamanhos?: string[], link_fotos?: string }
 * Pelo menos cores ou tamanhos deve ter pelo menos um valor.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { toTitleCase } from "@/lib/formatText";
import { assertPodeAtivarMaisSkus } from "@/lib/planos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PREFIXO_FALLBACK = "FD";

/** Obtém iniciais do fornecedor a partir do nome (ex: "Djulios" -> "DJU") */
function iniciaisFromNome(nome: string | null | undefined): string {
  const n = (nome ?? "").trim();
  if (!n) return PREFIXO_FALLBACK;
  const firstWord = (n.split(/\s+/)[0] || "").slice(0, 3).toUpperCase();
  return firstWord || PREFIXO_FALLBACK;
}

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
    return v
      .map((x) => (typeof x === "string" ? x.trim() : ""))
      .filter(Boolean);
  }
  if (typeof v === "string") {
    return v
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export async function POST(req: Request) {
  try {
    const ctx = await getFornecedorFromToken(req);
    if (!ctx) {
      return NextResponse.json({ error: "Não autenticado como fornecedor." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const nome_produto = typeof body?.nome_produto === "string" ? body.nome_produto.trim() : "";
    const cores = parseList(body?.cores ?? []);
    const tamanhos = parseList(body?.tamanhos ?? []);
    const link_fotos = typeof body?.link_fotos === "string" ? body.link_fotos.trim() || null : null;
    const descricao = typeof body?.descricao === "string" ? (body.descricao.trim() ? toTitleCase(body.descricao.trim()) : null) : null;
    const marca = typeof body?.marca === "string" ? (body.marca.trim() ? toTitleCase(body.marca.trim()) : null) : null;
    const comprimento_cm = body?.comprimento_cm != null ? parseFloat(String(body.comprimento_cm).replace(",", ".")) : null;
    const largura_cm = body?.largura_cm != null ? parseFloat(String(body.largura_cm).replace(",", ".")) : null;
    const altura_cm = body?.altura_cm != null ? parseFloat(String(body.altura_cm).replace(",", ".")) : null;
    const estoque_atual = body?.estoque_atual != null ? (typeof body.estoque_atual === "number" ? body.estoque_atual : parseFloat(String(body.estoque_atual).replace(",", "."))) : null;
    const estoque_minimo = body?.estoque_minimo != null ? (typeof body.estoque_minimo === "number" ? body.estoque_minimo : parseFloat(String(body.estoque_minimo).replace(",", "."))) : null;
    const custo_base = body?.custo_base != null ? (typeof body.custo_base === "number" ? body.custo_base : parseFloat(String(body.custo_base).replace(",", "."))) : null;
    const peso_g = body?.peso_kg != null ? (typeof body.peso_kg === "number" ? body.peso_kg : parseFloat(String(body.peso_kg).replace(",", "."))) : null;
    const peso_kg = Number.isFinite(peso_g) ? peso_g / 1000 : null;
    const data_lancamento = typeof body?.data_lancamento === "string" && body.data_lancamento.trim() ? body.data_lancamento.trim() : null;

    if (!nome_produto) {
      return NextResponse.json({ error: "Nome do produto é obrigatório." }, { status: 400 });
    }

    if (cores.length === 0 && tamanhos.length === 0) {
      return NextResponse.json({
        error: "Informe pelo menos uma cor ou um tamanho. Ex: cores: [\"Verde\", \"Azul\"], tamanhos: [\"P\", \"M\", \"G\"]",
      }, { status: 400 });
    }

    const nomeBase = toTitleCase(nome_produto);

    // Combinações: se só cores, 1 por cor. Se só tamanhos, 1 por tamanho. Se ambos, cartesiano.
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

    const { data: org } = await supabaseAdmin.from("orgs").select("plano").eq("id", ctx.org_id).maybeSingle();
    const plano = org?.plano ?? "starter";
    const newItems = combinacoes.map((c) => ({
      nome_produto: nomeBase,
      cor: c.cor,
    }));
    const check = await assertPodeAtivarMaisSkus(supabaseAdmin, ctx.org_id, plano ?? null, newItems);
    if (!check.ok) {
      return NextResponse.json({ error: check.error }, { status: 403 });
    }

    const { data: forn } = await supabaseAdmin
      .from("fornecedores")
      .select("nome")
      .eq("id", ctx.fornecedor_id)
      .maybeSingle();

    const prefixo = iniciaisFromNome(forn?.nome);

    // Multivariante usa blocos 001+ (bloco 000 reservado para produto único)
    const { data: maxRow } = await supabaseAdmin
      .from("skus")
      .select("sku")
      .eq("org_id", ctx.org_id)
      .like("sku", `${prefixo}%`)
      .order("sku", { ascending: false })
      .limit(1)
      .maybeSingle();

    let bloco = 1;
    if (maxRow?.sku) {
      const m = String(maxRow.sku).match(new RegExp(`^${prefixo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\d{3})`));
      if (m) bloco = Math.min(999, parseInt(m[1], 10) + 1);
    }

    const skuPai = `${prefixo}${String(bloco).padStart(3, "0")}000`;

    const dims = {
      comprimento_cm: Number.isFinite(comprimento_cm) ? comprimento_cm : null,
      largura_cm: Number.isFinite(largura_cm) ? largura_cm : null,
      altura_cm: Number.isFinite(altura_cm) ? altura_cm : null,
    };

    const estoque = {
      estoque_atual: Number.isFinite(estoque_atual) ? Math.max(0, Math.round(estoque_atual)) : null,
      estoque_minimo: Number.isFinite(estoque_minimo) ? Math.max(0, Math.round(estoque_minimo)) : null,
    };

    const extras: Record<string, unknown> = {
      custo_base: Number.isFinite(custo_base) ? custo_base : null,
      peso_kg: Number.isFinite(peso_kg) ? peso_kg : null,
    };
    if (marca) extras.marca = marca;
    if (data_lancamento) extras.data_lancamento = data_lancamento;

    const paiRow = {
      org_id: ctx.org_id,
      fornecedor_id: ctx.fornecedor_id,
      fornecedor_org_id: ctx.org_id,
      sku: skuPai,
      nome_produto: nomeBase,
      cor: null,
      tamanho: null,
      status: "ativo",
      link_fotos,
      descricao,
      ...dims,
      ...estoque,
      ...extras,
    };

    const filhosRows = combinacoes.map((c, i) => ({
      org_id: ctx.org_id,
      fornecedor_id: ctx.fornecedor_id,
      fornecedor_org_id: ctx.org_id,
      sku: `${prefixo}${String(bloco).padStart(3, "0")}${String(i + 1).padStart(3, "0")}`,
      nome_produto: nomeBase,
      cor: c.cor,
      tamanho: c.tamanho,
      status: "ativo",
      link_fotos: null,
      descricao,
      ...dims,
      ...estoque,
      ...extras,
    }));

    const toInsert = [paiRow, ...filhosRows];

    const { data: inserted, error } = await supabaseAdmin
      .from("skus")
      .insert(toInsert)
      .select(SKU_FIELDS);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      sku_pai: skuPai,
      criados: inserted?.length ?? 0,
      itens: inserted ?? [],
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
