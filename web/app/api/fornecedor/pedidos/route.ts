/**
 * GET /api/fornecedor/pedidos
 * Lista pedidos que o fornecedor autenticado deve atender.
 */
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { motivoBloqueioParaPortal } from "@/lib/pedidoBloqueioResponsavel";
import { buscarPrevisaoEtiquetaMlPendentes } from "@/lib/pedidoEtiquetaMercadoLivreBuffer";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type PedidoRow = {
  id: string;
  seller_id: string;
  fornecedor_id: string;
  sku_id: string | null;
  nome_produto: string | null;
  preco_venda: number | null;
  valor_fornecedor: number;
  status: string;
  criado_em: string;
  etiqueta_pdf_url: string | null;
  etiqueta_pdf_base64: string | null;
  etiqueta_impressa_em?: string | null;
  etiqueta_liberada_em?: string | null;
  referencia_externa: string | null;
  motivo_bloqueio?: string | null;
  motivo_bloqueio_responsavel?: "seller" | "fornecedor" | null;
  cancelado_motivo?: string | null;
  marketplace_numero?: string | null;
  marketplace_pack_id?: string | null;
  comprador_nome?: string | null;
  comprador_cidade?: string | null;
  comprador_uf?: string | null;
  comprador_fone?: string | null;
  metodo_envio?: string | null;
  tracking_codigo?: string | null;
  canal_venda?: string | null;
  e_teste?: boolean;
  ledger_id?: string | null;
  pedido_origem_troca_id?: string | null;
  pedido_reposicao_id?: string | null;
};

const STATUS_VALIDOS = [
  "enviado", "aguardando_repasse", "entregue", "em_devolucao", "devolvido",
  "devolucao_sem_fornecedor", "devolucao_nao_procede", "troca_em_andamento", "troca_concluida", "cancelado", "erro_saldo", "pendente_estoque", "bloqueado",
];

type PedidoItemRow = {
  sku: string;
  quantidade: number;
  nome_produto: string | null;
  cor: string | null;
  tamanho: string | null;
  categoria: string | null;
  linha_despacho: string | null;
};

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

    const { searchParams } = new URL(req.url);
    // Aceita vários status de uma vez, separados por vírgula (ex: "em_devolucao,devolvido"
    // pra aba "Devolução") — grupo de abas da tela, não 1 status exato só.
    const statusParam = searchParams.get("status")?.trim();
    const statusArray = statusParam
      ? statusParam.split(",").map((s) => s.trim()).filter((s) => STATUS_VALIDOS.includes(s))
      : null;
    const limit = Math.min(300, Math.max(1, parseInt(searchParams.get("limit") || "10", 10) || 10));
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10) || 1);
    const from = (page - 1) * limit;

    // Busca por nome do seller + período (presets ou De/Até customizado) — opcionais,
    // combinam com a aba de status ativa.
    const sellerNomeParam = searchParams.get("seller_nome")?.trim() || null;
    const desdeParam = searchParams.get("desde")?.trim() || null;
    const desdeValido = desdeParam && !Number.isNaN(new Date(desdeParam).getTime()) ? desdeParam : null;
    const ateParam = searchParams.get("ate")?.trim() || null;
    const ateValido = ateParam && !Number.isNaN(new Date(ateParam).getTime()) ? ateParam : null;

    // 'somente' = só os em buffer do ML (sem etiqueta ainda); 'excluir' = pra_enviar sem
    // misturar buffer; null = sem filtro (ex: aba Todos).
    const bufferMlParam = searchParams.get("buffer_ml")?.trim();
    const bufferMl = bufferMlParam === "somente" || bufferMlParam === "excluir" ? bufferMlParam : null;

    // 'somente' = só etiqueta já impressa pelo fornecedor (aba "Para retirar" — não basta
    // existir, tem que ter sido realmente impressa, achado ao vivo 2026-11-03: pedido com
    // PDF disponível mas nunca impresso caía errado em "Para retirar"); 'excluir' =
    // pra_enviar sem misturar quem já imprimiu; null = sem filtro.
    const etiquetaImpressaParam = searchParams.get("etiqueta_impressa")?.trim();
    const etiquetaImpressa = etiquetaImpressaParam === "somente" || etiquetaImpressaParam === "excluir" ? etiquetaImpressaParam : null;

    // RPC (regra 9): além de ler, ordena priorizando pedido com etiqueta recém-liberada e
    // ainda não impressa — expressão de ordenação (CASE) que o PostgREST não faz direto.
    // Ver fn_fornecedor_pedidos_lista em web/scripts/add-fornecedor-pedidos-aba-retirada.sql.
    const { data: rpcRows, error: rpcErr } = await supabaseAdmin.rpc("fn_fornecedor_pedidos_lista", {
      p_org_id: ctx.org_id,
      p_fornecedor_id: ctx.fornecedor_id,
      p_status: statusArray && statusArray.length > 0 ? statusArray : null,
      p_limit: limit,
      p_offset: from,
      p_seller_nome: sellerNomeParam,
      p_desde: desdeValido,
      p_ate: ateValido,
      p_buffer_ml: bufferMl,
      p_etiqueta_impressa: etiquetaImpressa,
    });

    if (rpcErr) {
      console.error("[fornecedor/pedidos GET]", rpcErr.message);
      return NextResponse.json({ error: "Erro ao buscar pedidos." }, { status: 500 });
    }

    type Contadores = {
      total_count: number;
      total_count_geral: number;
      total_count_pra_enviar: number;
      total_count_sem_estoque: number;
      total_count_buffer: number;
      total_count_retirada: number;
      total_count_erro: number;
      total_count_enviados: number;
      total_count_devolucao: number;
      total_count_entregue: number;
      total_count_cancelado: number;
      total_count_bloqueado: number;
    };
    const rows = (rpcRows ?? []) as (PedidoRow & Contadores)[];
    // RPC agora separa contador de listagem (fix-fornecedor-pedidos-contadores-pacote-e-aba-
    // vazia.sql): a 1ª linha sempre traz os contadores, mesmo quando a aba ativa não tem
    // nenhum pedido — nesse caso ela vem com id=null e precisa ser descartada da listagem.
    const contadores = rows[0] as (Partial<PedidoRow> & Contadores) | undefined;
    const pedidoRows = rows.filter((r) => r.id != null);
    const data: PedidoRow[] = pedidoRows.map(
      ({
        total_count: _tc,
        total_count_geral: _tcg,
        total_count_pra_enviar: _tcp,
        total_count_sem_estoque: _tcse,
        total_count_buffer: _tcb,
        total_count_retirada: _tcr,
        total_count_erro: _tcer,
        total_count_enviados: _tce,
        total_count_devolucao: _tcd,
        total_count_entregue: _tcen,
        total_count_cancelado: _tcc,
        total_count_bloqueado: _tcbl,
        ...p
      }) => p
    );
    const total = contadores?.total_count ?? 0;
    const abas = {
      todos: contadores?.total_count_geral ?? 0,
      pra_enviar: contadores?.total_count_pra_enviar ?? 0,
      bloqueado: contadores?.total_count_bloqueado ?? 0,
      sem_estoque: contadores?.total_count_sem_estoque ?? 0,
      buffer: contadores?.total_count_buffer ?? 0,
      retirada: contadores?.total_count_retirada ?? 0,
      erro: contadores?.total_count_erro ?? 0,
      enviados: contadores?.total_count_enviados ?? 0,
      devolucao: contadores?.total_count_devolucao ?? 0,
      concluidos: contadores?.total_count_entregue ?? 0,
      cancelados: contadores?.total_count_cancelado ?? 0,
    };

    const sellerIds = [...new Set((data ?? []).map((p) => p.seller_id))];
    const sellersMap = new Map<string, string>();
    if (sellerIds.length > 0) {
      const { data: sellers } = await supabaseAdmin.from("sellers").select("id, nome").in("id", sellerIds);
      for (const s of sellers ?? []) sellersMap.set(s.id, s.nome ?? "—");
    }

    // Linha de despacho padrão do fornecedor (usada quando o SKU não tem override próprio).
    const { data: fornecedorRow } = await supabaseAdmin
      .from("fornecedores")
      .select("expedicao_padrao_linha")
      .eq("id", ctx.fornecedor_id)
      .maybeSingle();
    const expedicaoPadrao = String((fornecedorRow as { expedicao_padrao_linha?: string | null } | null)?.expedicao_padrao_linha ?? "").trim() || null;

    // Itens reais do pedido vêm de pedido_itens (multi-item) — pedidos.sku_id é legado
    // (só populado no fluxo manual do admin) e fica nulo pros pedidos vindos do ERP/Olist.
    const pedidoIds = (data ?? []).map((p) => p.id);
    const itensPorPedido = new Map<string, PedidoItemRow[]>();
    if (pedidoIds.length > 0) {
      const { data: itens, error: itensErr } = await supabaseAdmin
        .from("pedido_itens")
        .select("pedido_id, quantidade, skus(sku, nome_produto, cor, tamanho, categoria, expedicao_override_linha)")
        .in("pedido_id", pedidoIds);
      if (itensErr) {
        console.error("[fornecedor/pedidos GET] itens:", itensErr.message);
      }
      for (const row of itens ?? []) {
        const pid = row.pedido_id as string;
        const skusJoined = row.skus as unknown;
        const sku = (Array.isArray(skusJoined) ? skusJoined[0] : skusJoined) as
          | { sku?: string; nome_produto?: string | null; cor?: string | null; tamanho?: string | null; categoria?: string | null; expedicao_override_linha?: string | null }
          | null;
        const list = itensPorPedido.get(pid) ?? [];
        list.push({
          sku: sku?.sku ?? "—",
          quantidade: Number(row.quantidade ?? 1),
          nome_produto: sku?.nome_produto ?? null,
          cor: sku?.cor ?? null,
          tamanho: sku?.tamanho ?? null,
          categoria: sku?.categoria ?? null,
          linha_despacho: (sku?.expedicao_override_linha?.trim() || expedicaoPadrao) ?? null,
        });
        itensPorPedido.set(pid, list);
      }
    }

    // Fallback legado: pedidos manuais do admin ainda populam pedidos.sku_id direto.
    const skuIdsLegado = [...new Set((data ?? []).map((p) => p.sku_id).filter(Boolean))] as string[];
    const skusMapLegado = new Map<string, { cor: string | null; tamanho: string | null; categoria: string | null }>();
    if (skuIdsLegado.length > 0) {
      const { data: skus } = await supabaseAdmin
        .from("skus")
        .select("id, cor, tamanho, categoria")
        .in("id", skuIdsLegado);
      for (const s of skus ?? []) {
        skusMapLegado.set(s.id, { cor: (s.cor as string | null) ?? null, tamanho: (s.tamanho as string | null) ?? null, categoria: (s.categoria as string | null) ?? null });
      }
    }

    const alvoParaMl: {
      id: string;
      seller_id: string;
      status: string;
      canal_venda: string | null;
      referencia_externa: string | null;
      marketplace_numero: string | null;
      tem_etiqueta: boolean;
    }[] = [];

    const items = (data ?? []).map((p) => {
      const itens = itensPorPedido.get(p.id) ?? [];
      const primeiro = itens[0] ?? null;
      const skuLegado = !primeiro && p.sku_id ? skusMapLegado.get(p.sku_id) : null;
      const url = (p as { etiqueta_pdf_url?: string | null }).etiqueta_pdf_url?.trim() ?? "";
      const b64 = (p as { etiqueta_pdf_base64?: string | null }).etiqueta_pdf_base64;
      const tem_etiqueta_oficial = Boolean(url) || Boolean(b64 && String(b64).trim().length > 0);
      alvoParaMl.push({
        id: p.id,
        seller_id: p.seller_id,
        status: p.status,
        canal_venda: p.canal_venda ?? null,
        referencia_externa: p.referencia_externa,
        marketplace_numero: p.marketplace_numero ?? null,
        tem_etiqueta: tem_etiqueta_oficial,
      });
      const {
        etiqueta_pdf_url: _u,
        etiqueta_pdf_base64: _b,
        motivo_bloqueio: _mb,
        motivo_bloqueio_responsavel: responsavel,
        ...rest
      } = p as Record<string, unknown>;
      return {
        ...rest,
        id: p.id,
        valor_fornecedor: p.valor_fornecedor,
        motivo_bloqueio: motivoBloqueioParaPortal({
          portal: "fornecedor",
          responsavel: responsavel as "seller" | "fornecedor" | null,
          motivoCompleto: (p as { motivo_bloqueio?: string | null }).motivo_bloqueio,
        }),
        seller_nome: sellersMap.get(p.seller_id) ?? "—",
        cor: primeiro?.cor ?? skuLegado?.cor ?? null,
        tamanho: primeiro?.tamanho ?? skuLegado?.tamanho ?? null,
        categoria: primeiro?.categoria ?? skuLegado?.categoria ?? null,
        linha_despacho: primeiro?.linha_despacho ?? expedicaoPadrao,
        itens,
        tem_etiqueta_oficial,
        etiqueta_ml_previsao: null as string | null,
        pack_pedido_ids: [p.id] as string[],
        // Exposto explícito (não só via `...rest`) pro front agrupar visualmente cards de
        // pacotes com status divergente (ver "Chave de agrupamento" abaixo) sem precisar
        // confiar em leitura não tipada do spread.
        marketplace_pack_id: (p as { marketplace_pack_id?: string | null }).marketplace_pack_id ?? null,
        pedido_origem_troca_id: (p as { pedido_origem_troca_id?: string | null }).pedido_origem_troca_id ?? null,
        pedido_reposicao_id: (p as { pedido_reposicao_id?: string | null }).pedido_reposicao_id ?? null,
      };
    });

    // Comprador que leva >1 unidade num único checkout do ML às vezes gera vários
    // order_id/pedidos separados que são, na prática, 1 pacote/1 etiqueta só (confirmado
    // ao vivo 2026-09-23 — ver docs/SCHEMA.md). Agrupa nessa página antes da previsão de
    // etiqueta, pra não repetir a mesma chamada por irmão.
    // Chave de agrupamento é pack + status (não só pack): itens do mesmo pacote com
    // desfechos diferentes (ex.: 1 "devolucao_nao_procede" + 1 "devolvido") não podem virar
    // 1 card só com 1 badge só — isso escondia o status de um dos dois atrás do outro
    // (achado real 2026-11-14, mesmo depois do fix de prioridade: o card sempre mostra só UM
    // status, então a solução é não fundir quando os status divergem, não só escolher qual
    // "vence"). Itens com o mesmo pack E mesmo status continuam fundindo normal (ex.: 2 itens
    // "enviado" do mesmo pacote = 1 etiqueta só).
    const idsPrincipais = new Set<string>();
    const porPackEStatus = new Map<string, typeof items>();
    const itemsAgrupados: typeof items = [];
    for (const p of items) {
      const packId = (p as { marketplace_pack_id?: string | null }).marketplace_pack_id;
      if (!packId) {
        itemsAgrupados.push(p);
        idsPrincipais.add(p.id);
        continue;
      }
      const chave = `${packId}::${(p as { status?: string }).status ?? ""}`;
      const grupo = porPackEStatus.get(chave);
      if (!grupo) {
        porPackEStatus.set(chave, [p]);
        itemsAgrupados.push(p);
        idsPrincipais.add(p.id);
        continue;
      }
      grupo.push(p);
      const principal = itemsAgrupados.find((it) => it.pack_pedido_ids[0] === grupo[0].id);
      if (principal) {
        principal.valor_fornecedor = Number(principal.valor_fornecedor ?? 0) + Number(p.valor_fornecedor ?? 0);
        principal.itens = [...principal.itens, ...p.itens];
        principal.pack_pedido_ids = [...principal.pack_pedido_ids, p.id];
        (principal as { marketplace_numero?: string | null }).marketplace_numero = packId;
        if (!principal.tem_etiqueta_oficial && p.tem_etiqueta_oficial) {
          principal.tem_etiqueta_oficial = true;
        }
      }
    }
    const alvoParaMlAgrupado = alvoParaMl.filter((a) => idsPrincipais.has(a.id));

    // Mesma lógica do `/api/seller/pedidos`: pedido "enviado" sem etiqueta que veio direto
    // do ML mostra a data real de liberação em vez do alerta "Sem etiqueta" (que é
    // especificamente pro caso Olist, onde o seller precisa colar o link manualmente).
    const previsaoMlPorPedido = await buscarPrevisaoEtiquetaMlPendentes(alvoParaMlAgrupado);
    for (let i = 0; i < itemsAgrupados.length; i++) {
      const previsao = previsaoMlPorPedido.get(itemsAgrupados[i].id);
      if (previsao !== undefined) {
        (itemsAgrupados[i] as { etiqueta_ml_previsao: string | null }).etiqueta_ml_previsao = previsao;
      }
    }

    // Pedido de reposição de troca referenciado pelo original — busca só o marketplace_numero
    // pra mostrar o link direto no card de "Troca concluída", sem precisar procurar em
    // Concluídos (achado real 2026-11-15: pedido ficava "perdido" no meio de 150 concluídos).
    const reposicaoIds = [...new Set(
      itemsAgrupados.map((it) => (it as { pedido_reposicao_id?: string | null }).pedido_reposicao_id).filter(Boolean)
    )] as string[];
    const { data: reposicaoRows } = reposicaoIds.length
      ? await supabaseAdmin.from("pedidos").select("id, marketplace_numero").in("id", reposicaoIds)
      : { data: [] as Array<{ id: string; marketplace_numero: string | null }> };
    const reposicaoMap = new Map((reposicaoRows ?? []).map((r) => [r.id, r.marketplace_numero]));
    const itemsComReposicao = itemsAgrupados.map((it) => {
      const reposicaoId = (it as { pedido_reposicao_id?: string | null }).pedido_reposicao_id;
      return {
        ...it,
        pedido_reposicao_marketplace_numero: reposicaoId ? reposicaoMap.get(reposicaoId) ?? null : null,
      };
    });

    return NextResponse.json({
      items: itemsComReposicao,
      total: total ?? itemsAgrupados.length,
      page,
      limit,
      expedicao_padrao: expedicaoPadrao,
      abas,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Erro inesperado";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
