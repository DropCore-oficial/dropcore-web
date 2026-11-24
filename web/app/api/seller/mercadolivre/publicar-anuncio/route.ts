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
  mlBuscarStatusItem,
  mlGuiaMedidasCompleta,
} from "@/lib/mercadoLivreApiClient";
import { sellerCustoTotalPagoUnitario } from "@/lib/sellerCustoTotalPago";
import { PESO_KG_MIN_PLAUSIVEL } from "@/lib/skuPesoPlausivel";
import { calcularPrecoAncora } from "@/lib/margemCalculo";
import { resolverDetalhesProdutoJson, grupoKeyFromSku } from "@/lib/detalhesProdutoJson";
import { ordenarTamanhosLista } from "@/lib/fornecedorVariantesUi";
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
  const medidas = detalhes?.medidas as
    | {
        linhas?: {
          tamanho?: string;
          busto?: number;
          comprimento?: number;
          ombro?: number;
          manga?: number;
          cintura?: number;
          quadril?: number;
        }[];
      }
    | undefined;
  const caracteristicas = detalhes?.caracteristicas as { caimento?: string; ocasioes?: string[]; estilos?: string[] } | undefined;
  // Mapa tamanho → linha de medida completa (não só busto) — cada domínio de categoria usa um
  // subconjunto diferente desses campos pra montar a guia de medidas (ver
  // `ATRIBUTO_MEDIDA_POR_DOMINIO` em `mercadoLivreApiClient.ts`).
  type LinhaMedida = { busto?: number; comprimento?: number; ombro?: number; manga?: number; cintura?: number; quadril?: number };
  const medidaPorTamanho = new Map<string, LinhaMedida>();
  for (const linha of medidas?.linhas ?? []) {
    const tam = linha.tamanho?.trim().toUpperCase();
    if (!tam) continue;
    const row: LinhaMedida = {};
    if (typeof linha.busto === "number") row.busto = linha.busto;
    if (typeof linha.comprimento === "number") row.comprimento = linha.comprimento;
    if (typeof linha.ombro === "number") row.ombro = linha.ombro;
    if (typeof linha.manga === "number") row.manga = linha.manga;
    if (typeof linha.cintura === "number") row.cintura = linha.cintura;
    if (typeof linha.quadril === "number") row.quadril = linha.quadril;
    if (Object.keys(row).length > 0) medidaPorTamanho.set(tam, row);
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

  // Já publicada antes? Não tenta de novo (unique por seller+sku) — MAS só se o anúncio
  // continuar de pé de verdade no Mercado Livre. Achado ao vivo 2026-11-17: apagar o anúncio
  // no painel do ML não remove o item_id (vira `paused`/`closed`, `GET /items` continua
  // 200) — sem checar o status real, um produto que o seller apagou manualmente ficava pra
  // sempre travado como "já publicado", sem jeito de publicar de novo.
  const jaPublicadas = new Set<string>();
  for (const r of candidatas) {
    const { data } = await supabaseAdmin.rpc("fn_seller_produto_ml_publicado_get", {
      p_seller_id: seller.id,
      p_sku: r.sku,
    });
    const existente = Array.isArray(data) ? data[0] : data;
    if (!existente?.ml_item_id) continue;
    const status = await mlBuscarStatusItem(existente.ml_item_id, ctx);
    if (status === null || status === "active") jaPublicadas.add(r.sku);
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
  // Motivo real de `guiaMedidas` ter ficado null — aparece na mensagem de cada variante
  // ignorada (não só no log do servidor), porque os logs do CLI do Vercel se mostraram
  // pouco confiáveis pra pegar isso ao vivo (achado 2026-11-16: 3 tentativas de log-tail
  // sem capturar nada durante uma falha real reproduzida na hora).
  let guiaMedidasDiagnostico: string | null = null;
  const exigeGuiaMedidas = categoriaAtributos.some((a) => a.id === "SIZE_GRID_ID");
  if (exigeGuiaMedidas && mercadoLivre.domainId) {
    // Tamanhos necessários NESTE lote (pra decidir se uma guia já existente serve) — mas a
    // guia em SI (quando precisa ser criada) sempre cobre TODOS os tamanhos com medida
    // cadastrada pro produto (`medidaPorTamanho`), não só os pendentes agora. Achado real
    // 2026-11-17: uma guia criada só com os tamanhos pendentes daquele momento (só "M", porque
    // P/G/GG já tinham sido tentados e falhado por outro motivo antes) ficou permanentemente
    // incompleta — reaproveitada em lotes seguintes, sempre faltando SIZE_GRID_ID pros
    // tamanhos que não entraram na primeira leva.
    const tamanhosNecessariosAgora = new Set(
      pendentes.map((r) => r.tamanho?.trim().toUpperCase()).filter(Boolean) as string[]
    );
    const { data: guiaExistenteRows } = await supabaseAdmin.rpc("fn_seller_produto_ml_guia_medidas_grupo_get", {
      p_seller_id: seller.id,
      p_grupo_key: grupoKey,
    });
    const linhasGuiaExistente = Array.isArray(guiaExistenteRows) ? guiaExistenteRows : [];
    if (linhasGuiaExistente.length > 0) {
      // Agrupa por chart_id ANTES de montar o mapa de tamanho — o grupo pode ter registros de
      // guias diferentes misturados (achado real 2026-11-17: 2 SKUs ainda apontavam pra uma
      // guia de teste antiga enquanto as outras 22 já tinham migrado pra guia nova; juntar os
      // row_ids de charts diferentes num mapa só manda SIZE_GRID_ID de uma guia com
      // SIZE_GRID_ROW_ID de outra, e o ML recusa com "Attribute [SIZE_GRID_ROW_ID] is not
      // valid"). Só reaproveita um chart específico se ELE SOZINHO cobrir todos os tamanhos.
      const porChart = new Map<string, Record<string, string>>();
      for (const row of linhasGuiaExistente as { sku: string; ml_chart_id: string | null; ml_chart_row_id: string | null }[]) {
        if (!row.ml_chart_id || !row.ml_chart_row_id) continue;
        const skuRow = linhasGrupo.find((s) => s.sku === row.sku);
        const tam = skuRow?.tamanho?.trim().toUpperCase();
        if (!tam) continue;
        const mapa = porChart.get(row.ml_chart_id) ?? {};
        mapa[tam] = row.ml_chart_row_id;
        porChart.set(row.ml_chart_id, mapa);
      }
      for (const [chartId, rowIdPorTamanho] of porChart) {
        const cobreTudo = [...tamanhosNecessariosAgora].every((t) => Boolean(rowIdPorTamanho[t]));
        // Cobrir tamanho não basta — achado real 2026-11-17: uma guia criada ANTES do
        // suporte a comprimento/ombro/manga (só com busto) continuava "cobrindo todos os
        // tamanhos" pra sempre depois do fix, porque faltava CAMPO, não linha. Confere ao
        // vivo se o chart realmente tem os atributos que a categoria espera hoje.
        const temCampos = cobreTudo && mercadoLivre.domainId
          ? await mlGuiaMedidasCompleta(chartId, mercadoLivre.domainId, ctx)
          : cobreTudo;
        if (temCampos) {
          guiaMedidas = { chartId, rowIdPorTamanho };
          break;
        }
      }
    }

    if (!guiaMedidas) {
      const tamanhosComMedida = Array.from(medidaPorTamanho.keys());
      const linhasComMedida = tamanhosComMedida.map((t) => ({ tamanho: t, ...medidaPorTamanho.get(t)! }));
      const marcaAtributo = mercadoLivre.atributos?.find((a) => a.id === "BRAND")?.valueName;
      const generoAtributo = mercadoLivre.atributos?.find((a) => a.id === "GENDER")?.valueName;
      if (linhasComMedida.length > 0 && marcaAtributo && generoAtributo) {
        const generoId = await mlBuscarIdValorAtributo(mercadoLivre.categoryId, "GENDER", generoAtributo);
        if (generoId) {
          const resultadoGuia = await mlCriarGuiaMedidas(
            {
              // `grupoKey` + pedaço do seller.id sempre primeiro (nunca cortado pelo limite de
              // 60 caracteres do ML) — sem isso, dois SELLERS DIFERENTES publicando o MESMO
              // produto do fornecedor (comum no Centro de Distribuição, vários revendendo o
              // mesmo item) geram o nome idêntico e colidem: o 2º seller a publicar esse
              // produto falha 100% das variantes com "is already in use in another chart",
              // mesmo nunca tendo tentado publicar antes (achado real 2026-11-24 — a causa
              // original achada em 2026-11-16, "mesmo vendedor retentando", era só metade do
              // problema; o grosso dos casos é vendedor DIFERENTE publicando pela 1ª vez).
              // Lista de tamanhos também entra no nome: uma guia criada incompleta antes (só 1
              // tamanho, achado real 2026-11-17) tem o MESMO nome sem a lista — isso garante
              // que a guia completa nova não colide com a quebrada antiga.
              nome: `${grupoKey}-${seller.id.slice(0, 8)} ${ordenarTamanhosLista(tamanhosComMedida).join("")} - ${titulo}`,
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
            guiaMedidasDiagnostico = `Mercado Livre recusou criar a guia de medidas: ${resultadoGuia.erro}`;
            console.error("[publicar-anuncio] mlCriarGuiaMedidas falhou:", grupoKey, resultadoGuia.erro);
          }
        } else {
          guiaMedidasDiagnostico = `Não achei o id do valor "${generoAtributo}" pro atributo Gênero nessa categoria.`;
          console.error("[publicar-anuncio] mlBuscarIdValorAtributo não achou id do gênero:", grupoKey, generoAtributo);
        }
      } else {
        guiaMedidasDiagnostico = `Guia de medidas não foi criada — faltou: ${[
          linhasComMedida.length === 0 && "medida cadastrada pro tamanho (ex. busto/cintura/comprimento)",
          !marcaAtributo && "atributo Marca",
          !generoAtributo && "atributo Gênero",
        ]
          .filter(Boolean)
          .join(", ")}.`;
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

  // Ocasiões — atributo de texto livre no ML (confirmado ao vivo: `value_type: "string"`,
  // mesmo tendo lista "sugerida"). Achado real 2026-11-17: o fornecedor preenchia até 8
  // ocasiões no cadastro e só 1 chegava a ir pro anúncio, porque antes exigia bater exato
  // com a lista sugerida — manda TODAS que o fornecedor preencheu, direto, sem filtrar.
  const atributoOcasioes = categoriaAtributos.find((a) => a.id === "OCCASIONS");
  if (atributoOcasioes && caracteristicas?.ocasioes?.length) {
    const valoresOcasioes = Array.from(new Set(caracteristicas.ocasioes.map((o) => o.trim()).filter(Boolean)));
    for (const v of valoresOcasioes) atributosProdutoExtras.push({ id: "OCCASIONS", valueName: v });
  }

  // Estilos — atributo de texto livre no Mercado Livre (confirmado ao vivo: `value_type:
  // "string"`, mesmo tendo uma lista "sugerida"), não precisa bater exato com nenhuma opção.
  // Campo próprio no cadastro (`caracteristicas.estilos`, múltiplo) — achado real
  // 2026-11-18: o fornecedor preenche vários estilos, mandar só 1 (derivado do Caimento)
  // perdia o resto; manda todos os que o fornecedor preencheu, direto, sem filtrar.
  const atributoEstilos = categoriaAtributos.find((a) => a.id === "STYLES");
  if (atributoEstilos && caracteristicas?.estilos?.length) {
    const valoresEstilos = Array.from(new Set(caracteristicas.estilos.map((e) => e.trim()).filter(Boolean)));
    for (const v of valoresEstilos) atributosProdutoExtras.push({ id: "STYLES", valueName: v });
  }

  // Ano de lançamento — sem campo dedicado no cadastro do fornecedor; ano corrente é seguro
  // pra qualquer produto publicado agora (não é um dado que muda por produto como medida/cor).
  if (categoriaAtributos.some((a) => a.id === "RELEASE_YEAR")) {
    atributosProdutoExtras.push({ id: "RELEASE_YEAR", valueName: String(new Date().getFullYear()) });
  }

  // Materiais reciclados — sem campo no cadastro; "Não" é o padrão seguro (maioria dos
  // produtos não é feita de material reciclado) e bate exato com a lista fechada do ML.
  const atributoReciclado = categoriaAtributos.find((a) => a.id === "WITH_RECYCLED_MATERIALS");
  const valorReciclado = atributoReciclado?.valoresPermitidos.length
    ? melhorValorPermitidoMl("Não", atributoReciclado.valoresPermitidos)
    : null;
  if (valorReciclado) atributosProdutoExtras.push({ id: "WITH_RECYCLED_MATERIALS", valueName: valorReciclado });

  // Temporada de lançamento — sem campo no cadastro (decisão explícita: não pedir isso ao
  // fornecedor). Inferida do tipo de manga já resolvido acima: manga longa → Outono/Inverno,
  // qualquer outra coisa (curta/sem manga/regata) → Primavera/Verão. Só manda quando o nome
  // do produto deu match confiável de manga — sem isso, não força nenhum dos dois.
  const atributoEstacao = categoriaAtributos.find((a) => a.id === "RELEASE_SEASON");
  if (atributoEstacao?.valoresPermitidos.length && valorManga) {
    const mangaNorm = valorManga.toLowerCase();
    const estacaoDesejada = mangaNorm.includes("longa") ? "Outono/Inverno" : "Primavera/Verão";
    const valorEstacao = melhorValorPermitidoMl(estacaoDesejada, atributoEstacao.valoresPermitidos);
    if (valorEstacao) atributosProdutoExtras.push({ id: "RELEASE_SEASON", valueName: valorEstacao });
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

    if (exigeGuiaMedidas && !guiaMedidas) {
      ignoradas.push({ sku: r.sku, motivo: guiaMedidasDiagnostico ?? "Guia de medidas obrigatória não pôde ser criada/reaproveitada." });
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
    // Descrição é texto livre do fornecedor, direto — decisão explícita 2026-11-18: antes o
    // sistema colava fragmentos (diferencial/indicação/observações), o fornecedor não tinha
    // como escrever uma descrição coesa. É um campo ÚNICO por produto (preenchido uma vez,
    // salvo no pai) — a edição do cadastro só atualiza `base.descricao` (pai), nunca
    // `r.descricao` (cópia por SKU filho, só gravada na criação). Priorizar `r.descricao`
    // aqui fazia a publicação sempre usar a cópia velha e esquecida do filho em vez da
    // descrição nova editada (achado real 2026-11-18, reproduzido ao vivo na Smooth: pai com
    // 2653 caracteres novos, filhos ainda com os 91 caracteres concatenados de antes do fix).
    const descricaoBase = (base.descricao?.trim() || r.descricao?.trim() || tituloVariante || r.sku).trim();
    // Garantia do vendedor — sempre 7 dias, fixo, sem campo no cadastro (decisão explícita: o
    // fornecedor não preenche isso). Não existe atributo `WARRANTY` na API do Mercado Livre
    // pra essa categoria (conferido ao vivo) — é texto solto dentro da própria descrição,
    // igual o próprio fornecedor de referência faz.
    const descricaoVariante = `${descricaoBase}\n\nGarantia do vendedor: 7 dias`;
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
    // "você ainda não inseriu a descrição") — garante com um PUT explícito depois. Achado
    // real 2026-11-17: 100% dos itens publicados (conferido ao vivo via API, Coimbra e
    // Smooth) estavam SEM descrição nenhuma — o log de falha daqui só rodava com
    // `NODE_ENV === "development"`, que nunca é verdade no Vercel, então uma falha real
    // (provável timing: PUT logo após o POST que cria o item) ficava 100% invisível. Agora
    // sempre loga, e tenta de novo uma vez antes de desistir (cobre o caso de timing).
    let descResultado = await mlAtualizarDescricao(resultado.itemId, descricaoVariante, ctx);
    if (!descResultado.ok) {
      await new Promise((r2) => setTimeout(r2, 1500));
      descResultado = await mlAtualizarDescricao(resultado.itemId, descricaoVariante, ctx);
    }
    if (!descResultado.ok) {
      console.error("[publicar-anuncio] mlAtualizarDescricao falhou (2 tentativas):", r.sku, descResultado.erro);
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
    if (registrarError) {
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
