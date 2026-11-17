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
  mlAtualizarDescricao,
  mlBuscarAtributosCategoria,
  mlCriarGuiaMedidas,
  mlBuscarIdValorAtributo,
} from "@/lib/mercadoLivreApiClient";
import { sellerCustoTotalPagoUnitario } from "@/lib/sellerCustoTotalPago";
import { calcularPrecoAncora } from "@/lib/margemCalculo";
import { resolverDetalhesProdutoJson, grupoKeyFromSku } from "@/lib/detalhesProdutoJson";
import {
  melhorValorPermitidoMl,
  melhorValorPermitidoMlPorConteudo,
  melhorValorPermitidoMlPorRadical,
  papelAtributoMl,
} from "@/lib/mercadoLivreAtributoMatch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** 3x o custo (multiplicador anterior) ficava caro demais frente à concorrência real do
 * Mercado Livre (confirmado comparando com anúncio real do próprio fornecedor que vende bem) —
 * 2,5x deixa o preço perto da faixa psicológica R$99,xx, com margem pra promoção depois. */
const MULTIPLICADOR_PRECO_ANCORA_ML = 150;

/** Abaixo de 10g em kg é lixo de cadastro (ver `PESO_KG_MIN_PLAUSIVEL` em
 * `sellerCatalogOlistExport.ts`) — não manda pro Mercado Livre mesmo que já esteja salvo assim
 * num SKU antigo (a validação no cadastro bloqueia daqui pra frente, mas não corrige retroativo). */
const PESO_KG_MIN_PLAUSIVEL = 0.01;

type SkuRow = {
  sku: string;
  nome_produto: string | null;
  cor: string | null;
  tamanho: string | null;
  estoque_atual: number | null;
  custo_base: number | null;
  custo_dropcore: number | null;
  imagem_url: string | null;
  imagens_extra: string[] | null;
  descricao: string | null;
  fornecedor_id: string;
  peso_kg: number | null;
  comprimento_cm: number | null;
  largura_cm: number | null;
  altura_cm: number | null;
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
    .select(
      "sku, nome_produto, cor, tamanho, estoque_atual, custo_base, custo_dropcore, imagem_url, imagens_extra, descricao, fornecedor_id, peso_kg, comprimento_cm, largura_cm, altura_cm, detalhes_produto_json"
    )
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
  const caracteristicas = detalhes?.caracteristicas as { caimento?: string; ocasioes?: string[] } | undefined;
  const guiado = detalhes?.guiado as { diferencial?: string; indicacao?: string } | undefined;
  const qualidade = detalhes?.qualidade as { observacoes?: string } | undefined;
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

  // Categoria de roupa (ex. "Camisas") exige guia de medidas pra aceitar o anúncio. Primeiro
  // tenta REAPROVEITAR uma guia já criada antes pra esse seller+grupo (o Mercado Livre rejeita
  // criar uma guia duplicada — mesmo domain/marca/gênero/medidas — confirmado ao vivo
  // 2026-11-16: um 2º lote de publicação do mesmo produto falhou em "SIZE_GRID_ID is missing"
  // em todas as variantes porque a criação da 2ª guia foi recusada). Só cria uma nova se
  // nenhuma reaproveitável for encontrada.
  let guiaMedidas: { chartId: string; rowIdPorTamanho: Record<string, string> } | null = null;
  const exigeGuiaMedidas = categoriaAtributos.some((a) => a.id === "SIZE_GRID_ID");
  if (exigeGuiaMedidas && mercadoLivre.domainId) {
    const { data: guiaExistenteRows } = await supabaseAdmin.rpc("fn_seller_produto_ml_guia_medidas_grupo_get", {
      p_seller_id: seller.id,
      p_grupo_key: grupoKey,
    });
    const linhasGuiaExistente = Array.isArray(guiaExistenteRows) ? guiaExistenteRows : [];
    if (linhasGuiaExistente.length > 0) {
      const rowIdPorTamanho: Record<string, string> = {};
      let chartIdExistente: string | null = null;
      for (const row of linhasGuiaExistente as { sku: string; ml_chart_id: string | null; ml_chart_row_id: string | null }[]) {
        const skuRow = linhasGrupo.find((s) => s.sku === row.sku);
        const tam = skuRow?.tamanho?.trim().toUpperCase();
        if (tam && row.ml_chart_row_id) rowIdPorTamanho[tam] = row.ml_chart_row_id;
        if (row.ml_chart_id) chartIdExistente = row.ml_chart_id;
      }
      if (chartIdExistente && Object.keys(rowIdPorTamanho).length > 0) {
        guiaMedidas = { chartId: chartIdExistente, rowIdPorTamanho };
      }
    }

    if (!guiaMedidas) {
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
          } else {
            // Sempre loga (não só em dev) — essa falha nunca aparece pro seller (ele só vê o
            // "SIZE_GRID_ID is missing" downstream em cada item), e sem isso não dava pra saber
            // o motivo real sem reproduzir manualmente (achado 2026-11-16: precisei investigar
            // às cegas quando isso aconteceu em produção).
            console.error("[publicar-anuncio] mlCriarGuiaMedidas falhou:", grupoKey, resultadoGuia.erro);
          }
        } else {
          console.error("[publicar-anuncio] mlBuscarIdValorAtributo não achou id do gênero:", grupoKey, generoAtributo);
        }
      } else {
        console.error(
          "[publicar-anuncio] guia de medidas pulada por falta de dado:",
          grupoKey,
          JSON.stringify({ temMedida: linhasComMedida.length > 0, marcaAtributo, generoAtributo })
        );
      }
    }
  }

  // Peso/dimensão real da embalagem (já cadastrados pelo fornecedor) — o Mercado Livre usa
  // isso pra calcular o frete de verdade; sem isso o anúncio cai em "entrega a combinar com o
  // vendedor" (achado ao vivo 2026-11-16). Unidade exigida: gramas pro peso, cm pra dimensão —
  // confirmado via schema da categoria (`SELLER_PACKAGE_WEIGHT`/`_WIDTH`/`_LENGTH`/`_HEIGHT`).
  const atributosEmbalagem: { id: string; valueName: string }[] = [];
  if (base.peso_kg != null && base.peso_kg >= PESO_KG_MIN_PLAUSIVEL) {
    atributosEmbalagem.push({ id: "SELLER_PACKAGE_WEIGHT", valueName: `${Math.round(base.peso_kg * 1000)} g` });
  }
  if (base.comprimento_cm != null && base.comprimento_cm > 0) {
    atributosEmbalagem.push({ id: "SELLER_PACKAGE_LENGTH", valueName: `${base.comprimento_cm} cm` });
  }
  if (base.largura_cm != null && base.largura_cm > 0) {
    atributosEmbalagem.push({ id: "SELLER_PACKAGE_WIDTH", valueName: `${base.largura_cm} cm` });
  }
  if (base.altura_cm != null && base.altura_cm > 0) {
    atributosEmbalagem.push({ id: "SELLER_PACKAGE_HEIGHT", valueName: `${base.altura_cm} cm` });
  }

  // Tipo de manga / Gola / Caimento / Ocasiões — nunca pedidos de novo no cadastro, resolvidos
  // aqui a partir do que já existe (nome do produto + características) com correspondência
  // SEGURA: sem match confiável, o atributo simplesmente não é enviado (nunca força um valor
  // incerto). Produto inteiro, não por variante — exceto Cor principal, que é por SKU.
  const textoReferenciaProduto = [titulo, mercadoLivre.atributos?.find((a) => a.id === "MODEL")?.valueName]
    .filter(Boolean)
    .join(" ");
  const atributosProdutoExtras: { id: string; valueName: string }[] = [];
  const atributoSleeve = categoriaAtributos.find((a) => a.id === "SLEEVE_TYPE");
  const valorManga = atributoSleeve?.valoresPermitidos.length
    ? melhorValorPermitidoMlPorConteudo(textoReferenciaProduto, atributoSleeve.valoresPermitidos)
    : null;
  if (valorManga) atributosProdutoExtras.push({ id: "SLEEVE_TYPE", valueName: valorManga });

  const atributoGola = categoriaAtributos.find((a) => a.id === "SHIRT_COLLAR");
  const valorGola = atributoGola?.valoresPermitidos.length
    ? melhorValorPermitidoMlPorRadical(textoReferenciaProduto, atributoGola.valoresPermitidos)
    : null;
  if (valorGola) atributosProdutoExtras.push({ id: "SHIRT_COLLAR", valueName: valorGola });

  const atributoCaimento = categoriaAtributos.find((a) => a.id === "WEDGE_SHAPE");
  const valorCaimento =
    atributoCaimento?.valoresPermitidos.length && caracteristicas?.caimento
      ? melhorValorPermitidoMl(caracteristicas.caimento, atributoCaimento.valoresPermitidos)
      : null;
  if (valorCaimento) atributosProdutoExtras.push({ id: "WEDGE_SHAPE", valueName: valorCaimento });

  const atributoOcasioes = categoriaAtributos.find((a) => a.id === "OCCASIONS");
  if (atributoOcasioes?.valoresPermitidos.length && caracteristicas?.ocasioes?.length) {
    const valoresOcasioes = Array.from(
      new Set(
        caracteristicas.ocasioes
          .map((o) => melhorValorPermitidoMl(o, atributoOcasioes.valoresPermitidos))
          .filter((v): v is string => Boolean(v))
      )
    );
    for (const v of valoresOcasioes) atributosProdutoExtras.push({ id: "OCCASIONS", valueName: v });
  }

  const atributoCorPrincipal = categoriaAtributos.find((a) => a.id === "MAIN_COLOR");

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

    const valorCorPrincipal =
      atributoCorPrincipal?.valoresPermitidos.length && r.cor
        ? melhorValorPermitidoMlPorConteudo(r.cor, atributoCorPrincipal.valoresPermitidos)
        : null;
    if (valorCorPrincipal) atributosVariante.push({ id: "MAIN_COLOR", valueName: valorCorPrincipal });

    const custoTotal = sellerCustoTotalPagoUnitario(r.custo_base, r.custo_dropcore)!;
    const tituloVariante = [titulo, r.cor, r.tamanho].filter((p) => p && p.trim()).join(" ").trim();
    const descricaoVariante = [r.descricao?.trim() || base.descricao?.trim(), guiado?.diferencial, guiado?.indicacao, qualidade?.observacoes]
      .map((p) => p?.trim())
      .filter(Boolean)
      .join(" — ") || tituloVariante || r.sku;
    const fotosVariante = [r.imagem_url!.trim(), ...((r.imagens_extra ?? []).filter((u) => Boolean(u?.trim())))];

    const resultado = await mlCriarAnuncio(
      {
        titulo: tituloVariante || r.sku,
        categoryId: mercadoLivre.categoryId,
        preco: calcularPrecoAncora(custoTotal, MULTIPLICADOR_PRECO_ANCORA_ML),
        quantidadeDisponivel: Math.floor(Number(r.estoque_atual ?? 0)),
        skuVendedor: r.sku,
        fotosUrl: fotosVariante,
        descricao: descricaoVariante,
        atributos: [...(mercadoLivre.atributos ?? []), ...atributosProdutoExtras, ...atributosEmbalagem, ...atributosVariante],
        familyName: titulo,
      },
      ctx
    );

    if (!resultado.ok) {
      ignoradas.push({ sku: r.sku, motivo: `Mercado Livre recusou: ${resultado.erro}` });
      continue;
    }

    // `description` inline no POST /items não é confiável pra essa categoria (confirmado ao
    // vivo 2026-11-16: anúncio criado com descrição no corpo, painel do vendedor mostrava
    // "você ainda não inseriu a descrição") — garante com um PUT explícito depois.
    const descResultado = await mlAtualizarDescricao(resultado.itemId, descricaoVariante, ctx);
    if (!descResultado.ok && process.env.NODE_ENV === "development") {
      console.error("[publicar-anuncio] mlAtualizarDescricao falhou:", r.sku, descResultado.erro);
    }

    const { error: registrarError } = await supabaseAdmin.rpc("fn_seller_produto_ml_publicar_registrar", {
      p_org_id: seller.org_id,
      p_seller_id: seller.id,
      p_fornecedor_id: r.fornecedor_id,
      p_sku: r.sku,
      p_grupo_key: grupoKey,
      p_ml_item_id: resultado.itemId,
      p_ml_permalink: resultado.permalink,
      p_preco: calcularPrecoAncora(custoTotal, MULTIPLICADOR_PRECO_ANCORA_ML),
      p_ml_chart_id: guiaMedidas?.chartId ?? null,
      p_ml_chart_row_id: rowIdDaVariante ?? null,
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
