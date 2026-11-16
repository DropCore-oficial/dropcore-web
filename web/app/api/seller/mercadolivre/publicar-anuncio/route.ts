/**
 * POST /api/seller/mercadolivre/publicar-anuncio — publica no Mercado Livre, com 1 clique,
 * o produto do catálogo de um fornecedor conectado: "pai com filhos" — um anúncio por
 * combinação de cor/tamanho que tiver estoque+foto+custo, todos com o mesmo `family_name`
 * (é assim que o ML agrupa variações visualmente — ver `mlCriarAnuncio` em
 * `mercadoLivreApiClient.ts`; a tentativa anterior com `variations[]` num item só foi
 * confirmada errada ao vivo 2026-11-15, o ML rejeita `variations`+`family_name` juntos).
 * Categoria + atributos do produto (Marca/Modelo/Material/Gênero etc.) vêm de
 * `skus.detalhes_produto_json.mercadoLivre`, preenchidos pelo fornecedor no cadastro — ver
 * `components/fornecedor/ProdutoMercadoLivreCategoriaForm.tsx`. Cor/Tamanho são por
 * variante, resolvidos aqui a partir de cada SKU filho real.
 */
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getSellerFromToken } from "@/lib/sellerSessionAuth";
import {
  getValidMercadoLivreAccessToken,
  mlCriarAnuncio,
  mlBuscarAtributosCategoria,
  mlCriarGuiaMedidas,
  mlBuscarIdValorAtributo,
} from "@/lib/mercadoLivreApiClient";
import { sellerCustoTotalPagoUnitario } from "@/lib/sellerCustoTotalPago";
import { calcularPrecoAncora } from "@/lib/margemCalculo";
import { resolverDetalhesProdutoJson, grupoKeyFromSku } from "@/lib/detalhesProdutoJson";
import { melhorValorPermitidoMl, papelAtributoMl } from "@/lib/mercadoLivreAtributoMatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type SkuRow = {
  sku: string;
  nome_produto: string | null;
  cor: string | null;
  tamanho: string | null;
  estoque_atual: number | null;
  custo_base: number | null;
  custo_dropcore: number | null;
  imagem_url: string | null;
  descricao: string | null;
  fornecedor_id: string;
  detalhes_produto_json: unknown;
};

export async function POST(req: Request) {
  const seller = await getSellerFromToken(req);
  if (!seller) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as { sku?: string };
  const skuClicado = body.sku?.trim().toUpperCase();
  if (!skuClicado) {
    return NextResponse.json({ error: "sku é obrigatório." }, { status: 400 });
  }

  const grupoKey = grupoKeyFromSku(skuClicado);
  const grupoPrefixo = grupoKey.slice(0, -3);

  const { data: linhasGrupo } = await supabaseAdmin
    .from("skus")
    .select("sku, nome_produto, cor, tamanho, estoque_atual, custo_base, custo_dropcore, imagem_url, descricao, fornecedor_id, detalhes_produto_json")
    .eq("org_id", seller.org_id)
    .ilike("sku", `${grupoPrefixo}%`)
    .ilike("status", "ativo")
    .returns<SkuRow[]>();
  if (!linhasGrupo || linhasGrupo.length === 0) {
    return NextResponse.json({ error: "Produto não encontrado no seu catálogo." }, { status: 404 });
  }

  const pai = linhasGrupo.find((r) => r.sku === grupoKey) ?? null;
  const filhos = linhasGrupo.filter((r) => r.sku !== grupoKey);
  const base = pai ?? linhasGrupo[0];

  const detalhes = resolverDetalhesProdutoJson(pai?.detalhes_produto_json, base.detalhes_produto_json);
  const mercadoLivre = detalhes?.mercadoLivre as
    | { categoryId?: string; categoryName?: string; domainId?: string; atributos?: { id: string; valueName: string }[] }
    | undefined;
  const medidas = detalhes?.medidas as { linhas?: { tamanho?: string; busto?: number }[] } | undefined;
  const bustoPorTamanho = new Map<string, number>();
  for (const linha of medidas?.linhas ?? []) {
    if (linha.tamanho && typeof linha.busto === "number") bustoPorTamanho.set(linha.tamanho.trim().toUpperCase(), linha.busto);
  }
  if (!mercadoLivre?.categoryId) {
    return NextResponse.json(
      { error: "Esse produto ainda não tem categoria do Mercado Livre cadastrada. Peça ao fornecedor para preencher a aba «Mercado Livre» no cadastro do produto." },
      { status: 422 }
    );
  }

  const ctx = await getValidMercadoLivreAccessToken(seller.id);
  if (!ctx) {
    return NextResponse.json({ error: "Conecte sua conta do Mercado Livre antes de publicar." }, { status: 422 });
  }

  // Candidatas: variantes de verdade (tem cor/tamanho), com estoque, foto e custo — "exceto o
  // que não tem" essas 3 coisas, não bloqueia a publicação do resto do grupo por causa delas.
  const candidatas = (filhos.length > 0 ? filhos : [base]).filter((r) => {
    const estoque = Number(r.estoque_atual ?? 0);
    const custo = sellerCustoTotalPagoUnitario(r.custo_base, r.custo_dropcore);
    return estoque > 0 && Boolean(r.imagem_url?.trim()) && Boolean(custo && custo > 0);
  });
  if (candidatas.length === 0) {
    return NextResponse.json(
      { error: "Nenhuma variante deste produto tem estoque + foto + custo ao mesmo tempo — não há o que publicar." },
      { status: 422 }
    );
  }

  // Já publicada antes? Não tenta de novo (unique por seller+sku).
  const jaPublicadas = new Set<string>();
  for (const r of candidatas) {
    const { data } = await supabaseAdmin.rpc("fn_seller_produto_ml_publicado_get", {
      p_seller_id: seller.id,
      p_sku: r.sku,
    });
    const existente = Array.isArray(data) ? data[0] : data;
    if (existente?.ml_item_id) jaPublicadas.add(r.sku);
  }
  const pendentes = candidatas.filter((r) => !jaPublicadas.has(r.sku));
  if (pendentes.length === 0) {
    return NextResponse.json(
      { error: "Todas as variantes publicáveis deste produto já foram publicadas por você no Mercado Livre." },
      { status: 409 }
    );
  }

  const categoriaAtributos = await mlBuscarAtributosCategoria(mercadoLivre.categoryId);
  const titulo = (pai?.nome_produto ?? base.nome_produto ?? skuClicado).trim() || skuClicado;

  // Categoria de roupa (ex. "Camisas") exige guia de medidas pra aceitar o anúncio — cria
  // uma só pra cobrir todos os tamanhos do grupo, a partir da tabela de medidas que o
  // fornecedor já preencheu. Se faltar domainId/medida/atributo pra isso, não bloqueia o
  // resto — os itens que precisarem de SIZE_GRID_ID e não tiverem simplesmente falham
  // adiante com o erro real do ML, capturado por item (não trava os outros).
  let guiaMedidas: { chartId: string; rowIdPorTamanho: Record<string, string> } | null = null;
  const exigeGuiaMedidas = categoriaAtributos.some((a) => a.id === "SIZE_GRID_ID");
  if (exigeGuiaMedidas && mercadoLivre.domainId) {
    const tamanhosNoGrupo = Array.from(new Set(pendentes.map((r) => r.tamanho?.trim().toUpperCase()).filter(Boolean))) as string[];
    const linhasComMedida = tamanhosNoGrupo
      .filter((t) => bustoPorTamanho.has(t))
      .map((t) => ({ tamanho: t, bustoCm: bustoPorTamanho.get(t)! }));
    const marcaAtributo = mercadoLivre.atributos?.find((a) => a.id === "BRAND")?.valueName;
    const generoAtributo = mercadoLivre.atributos?.find((a) => a.id === "GENDER")?.valueName;
    if (linhasComMedida.length > 0 && marcaAtributo && generoAtributo) {
      const generoId = await mlBuscarIdValorAtributo(mercadoLivre.categoryId, "GENDER", generoAtributo);
      if (generoId) {
        const resultadoGuia = await mlCriarGuiaMedidas(
          {
            nome: `Guia de medidas - ${titulo}`,
            domainId: mercadoLivre.domainId,
            marca: marcaAtributo,
            generoId,
            generoNome: generoAtributo,
            linhas: linhasComMedida,
          },
          ctx
        );
        if (resultadoGuia.ok) {
          guiaMedidas = { chartId: resultadoGuia.chartId, rowIdPorTamanho: resultadoGuia.rowIdPorTamanho };
        } else if (process.env.NODE_ENV === "development") {
          console.error("[publicar-anuncio] mlCriarGuiaMedidas falhou:", resultadoGuia.erro);
        }
      }
    }
  }

  const publicadas: { sku: string; ml_item_id: string; ml_permalink: string }[] = [];
  const ignoradas: { sku: string; motivo: string }[] = [];

  for (const r of pendentes) {
    const atributosVariante: { id: string; valueName: string }[] = [];
    let falhaObrigatorio: string | null = null;

    for (const a of categoriaAtributos) {
      const papel = papelAtributoMl(a);
      if (papel !== "cor" && papel !== "tamanho") continue;
      const textoSku = (papel === "cor" ? r.cor : r.tamanho)?.trim();
      if (!textoSku) {
        if (a.required) falhaObrigatorio = `sem ${papel} cadastrado`;
        continue;
      }
      if (a.valueType === "list" && a.valoresPermitidos.length > 0) {
        const match = melhorValorPermitidoMl(textoSku, a.valoresPermitidos);
        if (match) {
          atributosVariante.push({ id: a.id, valueName: match });
        } else if (a.required) {
          falhaObrigatorio = `"${textoSku}" não é um valor de ${papel} aceito pelo Mercado Livre nessa categoria`;
        }
      } else {
        atributosVariante.push({ id: a.id, valueName: textoSku });
      }
    }

    if (falhaObrigatorio) {
      ignoradas.push({ sku: r.sku, motivo: falhaObrigatorio });
      continue;
    }

    const rowIdDaVariante = r.tamanho ? guiaMedidas?.rowIdPorTamanho[r.tamanho.trim().toUpperCase()] : undefined;
    if (guiaMedidas && rowIdDaVariante) {
      atributosVariante.push({ id: "SIZE_GRID_ID", valueName: guiaMedidas.chartId });
      atributosVariante.push({ id: "SIZE_GRID_ROW_ID", valueName: rowIdDaVariante });
    }

    const custoTotal = sellerCustoTotalPagoUnitario(r.custo_base, r.custo_dropcore)!;
    const tituloVariante = [titulo, r.cor, r.tamanho].filter((p) => p && p.trim()).join(" ").trim();

    const resultado = await mlCriarAnuncio(
      {
        titulo: tituloVariante || r.sku,
        categoryId: mercadoLivre.categoryId,
        preco: calcularPrecoAncora(custoTotal),
        quantidadeDisponivel: Math.floor(Number(r.estoque_atual ?? 0)),
        skuVendedor: r.sku,
        fotosUrl: [r.imagem_url!.trim()],
        descricao: r.descricao?.trim() || tituloVariante || r.sku,
        atributos: [...(mercadoLivre.atributos ?? []), ...atributosVariante],
        familyName: titulo,
      },
      ctx
    );

    if (!resultado.ok) {
      ignoradas.push({ sku: r.sku, motivo: `Mercado Livre recusou: ${resultado.erro}` });
      continue;
    }

    const { error: registrarError } = await supabaseAdmin.rpc("fn_seller_produto_ml_publicar_registrar", {
      p_org_id: seller.org_id,
      p_seller_id: seller.id,
      p_fornecedor_id: r.fornecedor_id,
      p_sku: r.sku,
      p_grupo_key: grupoKey,
      p_ml_item_id: resultado.itemId,
      p_ml_permalink: resultado.permalink,
      p_preco: calcularPrecoAncora(custoTotal),
    });
    if (registrarError && process.env.NODE_ENV === "development") {
      console.error("[publicar-anuncio] fn_seller_produto_ml_publicar_registrar:", r.sku, registrarError.message);
    }

    publicadas.push({ sku: r.sku, ml_item_id: resultado.itemId, ml_permalink: resultado.permalink });
  }

  if (publicadas.length === 0) {
    return NextResponse.json({ error: "Nenhuma variante foi publicada.", ignoradas }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    ml_item_id: publicadas[0].ml_item_id,
    ml_permalink: publicadas[0].ml_permalink,
    publicadas,
    ignoradas,
  });
}
