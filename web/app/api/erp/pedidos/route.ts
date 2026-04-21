/**
 * POST /api/erp/pedidos — Recebe pedidos do ERP (Modelo B: chave por seller)
 * Autenticação: header X-API-Key (chave do SELLER gerada em /seller/integracoes-erp)
 * Body: {
 *   referencia_externa?: string (ex: ID do pedido no ML/ERP),
 *   items: [{ sku: string, quantidade: number }]
 * }
 * O seller é identificado pela API key — não precisa seller_id no body.
 *
 * Fluxo: valida → debita estoque → cria pedido → bloqueia saldo
 */
import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { executeBlockSale } from "@/lib/blockSale";
import { isInadimplente } from "@/lib/inadimplencia";
import { notifyEstoqueBaixo } from "@/lib/notifyEstoqueBaixo";
import { resolveLedgerIdForPedido } from "@/lib/resolveLedgerForPedido";
import { fireErpEstoqueWebhook } from "@/lib/erpEstoqueOutbound";
import { assertSellerPodeVenderSkus } from "@/lib/sellerSkuHabilitado";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const RATE_LIMIT_IP_PER_MIN = 10;
const RATE_LIMIT_APIKEY_PER_MIN = 30;

function toNum(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  return parseFloat(String(v ?? "0").replace(",", "."));
}

function hashApiKey(key: string): string {
  return createHash("sha256").update(key.trim()).digest("hex");
}

type ItemInput = { sku: string; quantidade: number };

type SellerForPedido = {
  id: string;
  org_id: string;
  fornecedor_id: string | null;
  plano?: string | null;
  erp_estoque_webhook_url?: string | null;
  erp_estoque_webhook_secret?: string | null;
};

function getClientIp(req: Request): string {
  const hdr =
    req.headers.get("x-forwarded-for") ||
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    "";
  const first = hdr.split(",")[0]?.trim();
  return first || "unknown";
}

function minuteBucketIso(now: Date): string {
  const d = new Date(now);
  d.setSeconds(0, 0);
  return d.toISOString();
}

async function consumeRateLimit(params: {
  route: string;
  key_type: "ip" | "api_key";
  key_value: string;
  limit_per_minute: number;
}) {
  const now = new Date();
  const bucket_start = minuteBucketIso(now);

  const { data: row, error: readErr } = await supabaseAdmin
    .from("api_rate_limits")
    .select("id, count")
    .eq("route", params.route)
    .eq("key_type", params.key_type)
    .eq("key_value", params.key_value)
    .eq("bucket_start", bucket_start)
    .maybeSingle();

  if (readErr) {
    const msg = String(readErr.message ?? "").toLowerCase();
    if (msg.includes("does not exist")) {
      return { allowed: true, table_missing: true as const };
    }
    throw new Error("Erro ao consultar rate limit: " + readErr.message);
  }

  if (!row) {
    const { error: insErr } = await supabaseAdmin.from("api_rate_limits").insert({
      route: params.route,
      key_type: params.key_type,
      key_value: params.key_value,
      bucket_start,
      count: 1,
      updated_at: now.toISOString(),
    });
    if (insErr) {
      const msg = String(insErr.message ?? "").toLowerCase();
      if (msg.includes("duplicate")) {
        // corrida rara: tratar como bloqueado conservadoramente
        return { allowed: false, retry_after_seconds: 60 - now.getSeconds() };
      }
      if (msg.includes("does not exist")) return { allowed: true, table_missing: true as const };
      throw new Error("Erro ao gravar rate limit: " + insErr.message);
    }
    return { allowed: true };
  }

  const current = Number(row.count ?? 0);
  if (current >= params.limit_per_minute) {
    return { allowed: false, retry_after_seconds: 60 - now.getSeconds() };
  }

  const { error: upErr } = await supabaseAdmin
    .from("api_rate_limits")
    .update({ count: current + 1, updated_at: now.toISOString() })
    .eq("id", row.id);
  if (upErr) {
    if (String(upErr.message ?? "").toLowerCase().includes("does not exist")) {
      return { allowed: true, table_missing: true as const };
    }
    throw new Error("Erro ao atualizar rate limit: " + upErr.message);
  }

  return { allowed: true };
}

function proximaSegunda(): string {
  const d = new Date();
  const dia = d.getDay();
  const diff = dia === 1 ? 7 : (8 - dia) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

async function updatePedidoPostado(org_id: string, pedido_id: string, explicit_ledger_id: string | null) {
  const now = new Date().toISOString();
  const { error: upPedido } = await supabaseAdmin
    .from("pedidos")
    .update({ status: "aguardando_repasse", atualizado_em: now })
    .eq("id", pedido_id)
    .eq("org_id", org_id);
  if (upPedido) throw new Error("Erro ao atualizar pedido: " + upPedido.message);

  const ledgerId = await resolveLedgerIdForPedido(org_id, pedido_id, explicit_ledger_id);
  if (ledgerId && !explicit_ledger_id) {
    await supabaseAdmin.from("pedidos").update({ ledger_id: ledgerId, atualizado_em: now }).eq("id", pedido_id);
  }

  let ciclo_repasse: string | null = null;
  if (ledgerId) {
    const { data: ledger } = await supabaseAdmin
      .from("financial_ledger")
      .select("id, ciclo_repasse")
      .eq("id", ledgerId)
      .maybeSingle();

    ciclo_repasse = ledger?.ciclo_repasse ?? null;
    if (!ciclo_repasse) ciclo_repasse = proximaSegunda();

    const { error: upLedgerErr } = await supabaseAdmin
      .from("financial_ledger")
      .update({ status: "AGUARDANDO_REPASSE", ciclo_repasse, atualizado_em: now })
      .eq("id", ledgerId);
    if (upLedgerErr) throw new Error("Erro ao atualizar extrato do seller: " + upLedgerErr.message);
  }

  return { ciclo_repasse };
}

async function addPedidoEvento(params: {
  org_id: string;
  pedido_id: string;
  tipo: string;
  origem: "erp" | "manual" | "sistema";
  actor_id?: string | null;
  actor_tipo?: "seller" | "fornecedor" | "admin" | "sistema" | null;
  descricao?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  await supabaseAdmin.from("pedido_eventos").insert({
    org_id: params.org_id,
    pedido_id: params.pedido_id,
    tipo: params.tipo,
    origem: params.origem,
    actor_id: params.actor_id ?? null,
    actor_tipo: params.actor_tipo ?? null,
    descricao: params.descricao ?? null,
    metadata: params.metadata ?? null,
  });
}

async function registerErpEvent(params: {
  org_id: string;
  seller_id: string;
  event_id: string;
  tipo_evento: string;
  payload: unknown;
}) {
  const { data, error } = await supabaseAdmin
    .from("erp_event_logs")
    .insert({
      org_id: params.org_id,
      seller_id: params.seller_id,
      event_id: params.event_id,
      tipo_evento: params.tipo_evento,
      payload: params.payload ?? null,
      status_processamento: "recebido",
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (String(error.message ?? "").toLowerCase().includes("duplicate")) {
      return { duplicate: true as const, rowId: null };
    }
    throw new Error("Erro ao registrar evento ERP: " + error.message);
  }
  return { duplicate: false as const, rowId: data?.id ?? null };
}

export async function POST(req: Request) {
  try {
    const ipKey = `ip:${getClientIp(req)}`;
    const ipLimit = await consumeRateLimit({
      route: "erp_pedidos_post",
      key_type: "ip",
      key_value: ipKey,
      limit_per_minute: RATE_LIMIT_IP_PER_MIN,
    });
    if (!ipLimit.allowed) {
      const retry = ipLimit.retry_after_seconds ?? 30;
      return NextResponse.json(
        { error: "Rate limit por IP excedido. Tente novamente em alguns segundos.", retry_after_seconds: retry },
        {
          status: 429,
          headers: { "Retry-After": String(retry) },
        }
      );
    }

    const apiKey = req.headers.get("x-api-key")?.trim() ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
    if (!apiKey) {
      return NextResponse.json({ error: "Header X-API-Key ou Authorization é obrigatório." }, { status: 401 });
    }

    const keyHash = hashApiKey(apiKey);
    const keyLimit = await consumeRateLimit({
      route: "erp_pedidos_post",
      key_type: "api_key",
      key_value: keyHash,
      limit_per_minute: RATE_LIMIT_APIKEY_PER_MIN,
    });
    if (!keyLimit.allowed) {
      const retry = keyLimit.retry_after_seconds ?? 30;
      return NextResponse.json(
        { error: "Rate limit da API key excedido. Tente novamente em alguns segundos.", retry_after_seconds: retry },
        {
          status: 429,
          headers: { "Retry-After": String(retry) },
        }
      );
    }

    // Buscar seller pela API key (Modelo B: cada seller tem sua chave)
    let sellerRow: SellerForPedido | null = null;
    {
      const r = await supabaseAdmin
        .from("sellers")
        .select("id, org_id, fornecedor_id, plano, erp_estoque_webhook_url, erp_estoque_webhook_secret")
        .eq("erp_api_key_hash", keyHash)
        .maybeSingle();
      if (
        r.error &&
        (r.error.code === "42703" ||
          String(r.error.message ?? "").toLowerCase().includes("erp_estoque_webhook"))
      ) {
        const r2 = await supabaseAdmin
          .from("sellers")
          .select("id, org_id, fornecedor_id, plano")
          .eq("erp_api_key_hash", keyHash)
          .maybeSingle();
        if (r2.error) {
          console.error("[erp/pedidos] seller lookup:", r2.error.message);
          return NextResponse.json({ error: "Erro ao verificar credenciais." }, { status: 500 });
        }
        sellerRow = r2.data as SellerForPedido;
      } else if (r.error) {
        console.error("[erp/pedidos] seller lookup:", r.error.message);
        return NextResponse.json({ error: "Erro ao verificar credenciais." }, { status: 500 });
      } else {
        sellerRow = r.data as SellerForPedido;
      }
    }

    if (!sellerRow) {
      return NextResponse.json({ error: "API Key inválida." }, { status: 401 });
    }

    const seller = { id: sellerRow.id, fornecedor_id: sellerRow.fornecedor_id };
    const org_id = sellerRow.org_id;

    const body = await req.json();
    const referencia_externa = body?.referencia_externa ? String(body.referencia_externa).trim().slice(0, 100) : null;
    const itemsRaw = Array.isArray(body?.items) ? body.items : [];

    // Etiqueta oficial (marketplace/transportadora) - opcional
    const etiqueta_pdf_url = body?.etiqueta_pdf_url ? String(body.etiqueta_pdf_url).trim().slice(0, 2000) : null;
    const etiqueta_pdf_base64 = body?.etiqueta_pdf_base64 ? String(body.etiqueta_pdf_base64).trim().slice(0, 2_000_000) : null;
    const tracking_codigo = body?.tracking_codigo ? String(body.tracking_codigo).trim().slice(0, 100) : null;
    const metodo_envio = body?.metodo_envio ? String(body.metodo_envio).trim().slice(0, 100) : null;

    const items: ItemInput[] = itemsRaw.flatMap((raw: unknown) => {
      if (!raw || typeof raw !== "object") return [];
      const i = raw as { sku?: unknown; quantidade?: unknown };
      const sku = typeof i.sku === "string" ? i.sku.trim() : "";
      if (!sku) return [];
      return [{ sku, quantidade: Math.max(1, Math.floor(toNum(i.quantidade))) }];
    });

    if (items.length === 0) {
      return NextResponse.json({ error: "items deve conter ao menos um item com sku." }, { status: 400 });
    }

    const fornecedor_id = seller.fornecedor_id;
    if (!fornecedor_id) {
      return NextResponse.json({ error: "Seller não está vinculado a um fornecedor." }, { status: 400 });
    }

    // Verificar inadimplência
    const [sellerInad, fornInad] = await Promise.all([
      isInadimplente(supabaseAdmin, org_id, "seller", seller.id),
      isInadimplente(supabaseAdmin, org_id, "fornecedor", fornecedor_id),
    ]);
    if (sellerInad) {
      return NextResponse.json({ error: "Seller inadimplente." }, { status: 403 });
    }
    if (fornInad) {
      return NextResponse.json({ error: "Fornecedor inadimplente." }, { status: 403 });
    }

    // Buscar SKUs e validar estoque
    let valor_fornecedor = 0;
    let valor_dropcore = 0;
    const skuRows: { id: string; sku: string; estoque_atual: number; estoque_minimo: number | null; nome_produto: string | null; custo_base: number; custo_dropcore: number }[] = [];

    for (const item of items) {
      const { data: sku, error: skuErr } = await supabaseAdmin
        .from("skus")
        .select("id, sku, nome_produto, estoque_atual, estoque_minimo, custo_base, custo_dropcore")
        .eq("org_id", org_id)
        .eq("fornecedor_id", fornecedor_id)
        .ilike("sku", item.sku)
        .eq("status", "ativo")
        .maybeSingle();

      if (skuErr || !sku) {
        return NextResponse.json({ error: `SKU não encontrado ou inativo: ${item.sku}` }, { status: 404 });
      }

      const estoque = Number(sku.estoque_atual ?? 0);
      if (estoque < item.quantidade) {
        return NextResponse.json(
          { error: `Estoque insuficiente para SKU ${item.sku}. Disponível: ${estoque}, solicitado: ${item.quantidade}` },
          { status: 422 }
        );
      }

      const custoBase = toNum(sku.custo_base);
      const custoDropcore = toNum(sku.custo_dropcore);
      valor_fornecedor += custoBase * item.quantidade;
      valor_dropcore += custoDropcore * item.quantidade;
      skuRows.push({
        id: sku.id,
        sku: sku.sku,
        estoque_atual: estoque,
        estoque_minimo: sku.estoque_minimo != null ? Number(sku.estoque_minimo) : null,
        nome_produto: sku.nome_produto ?? null,
        custo_base: custoBase,
        custo_dropcore: custoDropcore,
      });
    }

    const valor_total = valor_fornecedor + valor_dropcore;
    if (valor_total <= 0) {
      return NextResponse.json({ error: "Valor total do pedido deve ser positivo." }, { status: 400 });
    }

    const vendaSkuCheck = await assertSellerPodeVenderSkus(supabaseAdmin, {
      sellerId: seller.id,
      sellerPlano: sellerRow.plano,
      skus: skuRows.map((r) => ({ id: r.id, sku: r.sku })),
    });
    if (!vendaSkuCheck.ok) {
      return NextResponse.json(
        { error: vendaSkuCheck.error, code: "SKU_NAO_HABILITADO_PLANO" },
        { status: 403 }
      );
    }

    // Limite plano Starter
    const { data: orgRow } = await supabaseAdmin.from("orgs").select("plano").eq("id", org_id).maybeSingle();
    const orgPlano = String(orgRow?.plano ?? "starter").toLowerCase();
    if (orgPlano === "starter") {
      const inicioMes = new Date();
      inicioMes.setDate(1);
      inicioMes.setHours(0, 0, 0, 0);
      const { count } = await supabaseAdmin
        .from("pedidos")
        .select("id", { count: "exact", head: true })
        .eq("org_id", org_id)
        .gte("criado_em", inicioMes.toISOString())
        .or("status.eq.enviado,status.eq.aguardando_repasse,status.eq.entregue,status.eq.devolvido");
      if (typeof count === "number" && count >= 200) {
        return NextResponse.json({ error: "Limite de vendas do plano Starter atingido." }, { status: 403 });
      }
    }

    // 1) Debitar estoque
    const produtosAbaixoDoMin: { sku: string; nome?: string }[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const sku = skuRows[i];
      const novoEstoque = sku.estoque_atual - item.quantidade;
      const { error: updErr } = await supabaseAdmin
        .from("skus")
        .update({ estoque_atual: novoEstoque })
        .eq("id", sku.id);
      if (updErr) {
        console.error("[erp/pedidos] estoque debit:", updErr.message);
        return NextResponse.json({ error: "Erro ao atualizar estoque." }, { status: 500 });
      }
      if (sku.estoque_minimo != null && novoEstoque < sku.estoque_minimo) {
        produtosAbaixoDoMin.push({ sku: sku.sku, nome: sku.nome_produto ?? undefined });
      }
    }
    if (produtosAbaixoDoMin.length > 0) {
      await notifyEstoqueBaixo({ org_id, fornecedor_id, produtos: produtosAbaixoDoMin });
    }

    // 2) Criar pedido
    const pedidoInsert: Record<string, unknown> = {
      org_id,
      seller_id: seller.id,
      fornecedor_id,
      valor_fornecedor,
      valor_dropcore,
      valor_total,
      status: "enviado",
      referencia_externa: referencia_externa || null,
      etiqueta_pdf_url,
      etiqueta_pdf_base64,
      tracking_codigo,
      metodo_envio,
    };

    const { data: pedido, error: insertErr } = await supabaseAdmin
      .from("pedidos")
      .insert(pedidoInsert)
      .select("id, valor_total, criado_em")
      .single();

    if (insertErr) {
      // Rollback estoque
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const sku = skuRows[i];
        await supabaseAdmin
          .from("skus")
          .update({ estoque_atual: sku.estoque_atual })
          .eq("id", sku.id);
      }
      console.error("[erp/pedidos] insert:", insertErr.message);
      return NextResponse.json({ error: "Erro ao criar pedido." }, { status: 500 });
    }

    // 3) Criar pedido_itens
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const sku = skuRows[i];
      const precoUnit = sku.custo_base + sku.custo_dropcore;
      const valorItem = precoUnit * item.quantidade;
      await supabaseAdmin.from("pedido_itens").insert({
        pedido_id: pedido.id,
        sku_id: sku.id,
        quantidade: item.quantidade,
        preco_unitario: precoUnit,
        valor_total: valorItem,
      });
    }

    // 4) Bloquear saldo
    const blockResult = await executeBlockSale({
      org_id,
      seller_id: seller.id,
      fornecedor_id,
      pedido_id: pedido.id,
      valor_fornecedor,
      valor_dropcore,
    });

    if (!blockResult.ok) {
      if (blockResult.code === "SALDO_INSUFICIENTE") {
        await supabaseAdmin.from("pedidos").update({ status: "erro_saldo" }).eq("id", pedido.id);
        // Rollback estoque
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const sku = skuRows[i];
          await supabaseAdmin
            .from("skus")
            .update({ estoque_atual: sku.estoque_atual })
            .eq("id", sku.id);
        }
        return NextResponse.json(
          {
            error: "Saldo insuficiente para este pedido.",
            code: "SALDO_INSUFICIENTE",
            saldo_disponivel: blockResult.saldo_disponivel,
            valor_total: blockResult.valor_total,
            pedido_id: pedido.id,
          },
          { status: 402 }
        );
      }
      // Outro erro — rollback estoque e marcar cancelado
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const sku = skuRows[i];
        await supabaseAdmin
          .from("skus")
          .update({ estoque_atual: sku.estoque_atual })
          .eq("id", sku.id);
      }
      await supabaseAdmin.from("pedidos").update({ status: "cancelado" }).eq("id", pedido.id);
      const errorMsg =
        blockResult.code === "SELLER_NAO_ENCONTRADO"
          ? "Seller não encontrado."
          : blockResult.code === "ERRO_LEDGER"
            ? blockResult.message
            : "Erro ao processar pedido.";
      return NextResponse.json(
        { error: errorMsg, pedido_id: pedido.id },
        { status: 500 }
      );
    }

    await supabaseAdmin
      .from("pedidos")
      .update({ ledger_id: blockResult.ledger_id, atualizado_em: new Date().toISOString() })
      .eq("id", pedido.id);

    fireErpEstoqueWebhook({
      webhookUrl: sellerRow.erp_estoque_webhook_url,
      webhookSecret: sellerRow.erp_estoque_webhook_secret,
      payload: {
        event: "dropcore.estoque_atualizado",
        pedido_id: pedido.id,
        referencia_externa: referencia_externa ?? null,
        seller_id: seller.id,
        org_id,
        items: items.map((it, i) => ({
          sku: skuRows[i].sku,
          quantidade_vendida: it.quantidade,
          estoque_atual_dropcore: skuRows[i].estoque_atual - it.quantidade,
        })),
      },
    });

    await addPedidoEvento({
      org_id,
      pedido_id: pedido.id,
      tipo: "pedido_criado",
      origem: "erp",
      actor_id: seller.id,
      actor_tipo: "seller",
      descricao: "Pedido criado via integração ERP.",
      metadata: { referencia_externa: referencia_externa ?? null },
    });

    // Notificação para fornecedor: novo pedido para postar
    let memberUserId: string | null = null;
    const { data: member } = await supabaseAdmin
      .from("org_members")
      .select("user_id")
      .eq("org_id", org_id)
      .eq("fornecedor_id", fornecedor_id)
      .limit(1)
      .maybeSingle();
    memberUserId = member?.user_id ?? null;
    if (!memberUserId) {
      const { data: fallback } = await supabaseAdmin
        .from("org_members")
        .select("user_id")
        .eq("fornecedor_id", fornecedor_id)
        .limit(1)
        .maybeSingle();
      memberUserId = fallback?.user_id ?? null;
    }
    if (memberUserId) {
      const valorBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(valor_fornecedor);
      await supabaseAdmin.from("notifications").insert({
        user_id: memberUserId,
        tipo: "pedido_para_postar",
        titulo: "Novo pedido para postar",
        mensagem: `Você tem um novo pedido de ${valorBRL} aguardando envio.`,
        metadata: { pedido_id: pedido.id },
      });
    }

    return NextResponse.json({
      ok: true,
      pedido_id: pedido.id,
      referencia_externa: referencia_externa ?? null,
      valor_total: blockResult.valor_total,
      status: blockResult.status,
      criado_em: pedido.criado_em,
    });
  } catch (e: unknown) {
    console.error("[erp/pedidos]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro inesperado" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/erp/pedidos — Atualiza status do pedido vindo do ERP/marketplace.
 * Autenticação: header X-API-Key (seller).
 * Body: {
 *   pedido_id?: string,
 *   referencia_externa?: string,
 *   status: "postado" | "enviado" | "shipped",
 *   tracking_codigo?: string,
 *   metodo_envio?: string,
 *   etiqueta_pdf_url?: string,
 *   etiqueta_pdf_base64?: string
 * }
 */
export async function PATCH(req: Request) {
  try {
    const ipKey = `ip:${getClientIp(req)}`;
    const ipLimit = await consumeRateLimit({
      route: "erp_pedidos_patch",
      key_type: "ip",
      key_value: ipKey,
      limit_per_minute: RATE_LIMIT_IP_PER_MIN,
    });
    if (!ipLimit.allowed) {
      const retry = ipLimit.retry_after_seconds ?? 30;
      return NextResponse.json(
        { error: "Rate limit por IP excedido. Tente novamente em alguns segundos.", retry_after_seconds: retry },
        {
          status: 429,
          headers: { "Retry-After": String(retry) },
        }
      );
    }

    const apiKey =
      req.headers.get("x-api-key")?.trim() ??
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
    if (!apiKey) {
      return NextResponse.json({ error: "Header X-API-Key ou Authorization é obrigatório." }, { status: 401 });
    }

    const keyHash = hashApiKey(apiKey);
    const keyLimit = await consumeRateLimit({
      route: "erp_pedidos_patch",
      key_type: "api_key",
      key_value: keyHash,
      limit_per_minute: RATE_LIMIT_APIKEY_PER_MIN,
    });
    if (!keyLimit.allowed) {
      const retry = keyLimit.retry_after_seconds ?? 30;
      return NextResponse.json(
        { error: "Rate limit da API key excedido. Tente novamente em alguns segundos.", retry_after_seconds: retry },
        {
          status: 429,
          headers: { "Retry-After": String(retry) },
        }
      );
    }

    const { data: sellerRow, error: sellerErr } = await supabaseAdmin
      .from("sellers")
      .select("id, org_id")
      .eq("erp_api_key_hash", keyHash)
      .maybeSingle();
    if (sellerErr) {
      return NextResponse.json({ error: "Erro ao verificar credenciais." }, { status: 500 });
    }
    if (!sellerRow) {
      return NextResponse.json({ error: "API Key inválida." }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const event_id =
      req.headers.get("x-event-id")?.trim() ||
      (body?.event_id ? String(body.event_id).trim() : "");
    if (!event_id) {
      return NextResponse.json(
        { error: "event_id é obrigatório (header X-Event-Id ou body.event_id)." },
        { status: 400 }
      );
    }
    const reg = await registerErpEvent({
      org_id: sellerRow.org_id,
      seller_id: sellerRow.id,
      event_id,
      tipo_evento: "pedido_postado",
      payload: body,
    });
    if (reg.duplicate) {
      return NextResponse.json({
        ok: true,
        duplicate: true,
        event_id,
      });
    }
    const pedido_id = body?.pedido_id ? String(body.pedido_id).trim() : null;
    const referencia_externa = body?.referencia_externa ? String(body.referencia_externa).trim() : null;
    const statusRaw = body?.status ? String(body.status).trim().toLowerCase() : "";

    const statusPostado = new Set(["postado", "enviado", "shipped", "posted"]);
    if (!statusPostado.has(statusRaw)) {
      return NextResponse.json(
        { error: "status inválido. Use: postado | enviado | shipped." },
        { status: 400 }
      );
    }
    if (!pedido_id && !referencia_externa) {
      return NextResponse.json(
        { error: "Informe pedido_id ou referencia_externa para localizar o pedido." },
        { status: 400 }
      );
    }

    const tracking_codigo = body?.tracking_codigo ? String(body.tracking_codigo).trim().slice(0, 100) : null;
    const metodo_envio = body?.metodo_envio ? String(body.metodo_envio).trim().slice(0, 100) : null;
    const etiqueta_pdf_url = body?.etiqueta_pdf_url ? String(body.etiqueta_pdf_url).trim().slice(0, 2000) : null;
    const etiqueta_pdf_base64 = body?.etiqueta_pdf_base64
      ? String(body.etiqueta_pdf_base64).trim().slice(0, 2_000_000)
      : null;

    let query = supabaseAdmin
      .from("pedidos")
      .select("id, org_id, seller_id, status, ledger_id, referencia_externa")
      .eq("org_id", sellerRow.org_id)
      .eq("seller_id", sellerRow.id)
      .order("criado_em", { ascending: false })
      .limit(1);

    if (pedido_id) {
      query = query.eq("id", pedido_id);
    } else {
      query = query.eq("referencia_externa", referencia_externa!);
    }

    const { data: pedido, error: pedidoErr } = await query.maybeSingle();
    if (pedidoErr) {
      return NextResponse.json({ error: "Erro ao localizar pedido." }, { status: 500 });
    }
    if (!pedido) {
      if (reg.rowId) {
        await supabaseAdmin
          .from("erp_event_logs")
          .update({
            status_processamento: "erro",
            erro: "Pedido não encontrado para este seller.",
            referencia_externa: referencia_externa ?? null,
            processado_em: new Date().toISOString(),
          })
          .eq("id", reg.rowId);
      }
      return NextResponse.json({ error: "Pedido não encontrado para este seller." }, { status: 404 });
    }

    const patch: Record<string, unknown> = { atualizado_em: new Date().toISOString() };
    if (tracking_codigo) patch.tracking_codigo = tracking_codigo;
    if (metodo_envio) patch.metodo_envio = metodo_envio;
    if (etiqueta_pdf_url) patch.etiqueta_pdf_url = etiqueta_pdf_url;
    if (etiqueta_pdf_base64) patch.etiqueta_pdf_base64 = etiqueta_pdf_base64;

    if (Object.keys(patch).length > 1) {
      const { error: upMetaErr } = await supabaseAdmin
        .from("pedidos")
        .update(patch)
        .eq("id", pedido.id)
        .eq("org_id", sellerRow.org_id);
      if (upMetaErr) {
        if (reg.rowId) {
          await supabaseAdmin
            .from("erp_event_logs")
            .update({
              status_processamento: "erro",
              erro: "Erro ao atualizar dados de envio.",
              pedido_id: pedido.id,
              referencia_externa: pedido.referencia_externa ?? referencia_externa ?? null,
              processado_em: new Date().toISOString(),
            })
            .eq("id", reg.rowId);
        }
        return NextResponse.json({ error: "Erro ao atualizar dados de envio." }, { status: 500 });
      }
    }

    if (pedido.status === "aguardando_repasse") {
      await addPedidoEvento({
        org_id: sellerRow.org_id,
        pedido_id: pedido.id,
        tipo: "pedido_postado_via_erp",
        origem: "erp",
        actor_id: sellerRow.id,
        actor_tipo: "seller",
        descricao: "Marketplace/ERP confirmou postagem (idempotente).",
        metadata: { event_id, ja_estava_postado: true },
      });
      if (reg.rowId) {
        await supabaseAdmin
          .from("erp_event_logs")
          .update({
            status_processamento: "processado",
            pedido_id: pedido.id,
            referencia_externa: pedido.referencia_externa ?? referencia_externa ?? null,
            processado_em: new Date().toISOString(),
          })
          .eq("id", reg.rowId);
      }
      return NextResponse.json({
        ok: true,
        pedido_id: pedido.id,
        status: "aguardando_repasse",
        ja_estava_postado: true,
      });
    }
    if (pedido.status !== "enviado") {
      if (reg.rowId) {
        await supabaseAdmin
          .from("erp_event_logs")
          .update({
            status_processamento: "erro",
            erro: `Regressão de status bloqueada: ${pedido.status}`,
            pedido_id: pedido.id,
            referencia_externa: pedido.referencia_externa ?? referencia_externa ?? null,
            processado_em: new Date().toISOString(),
          })
          .eq("id", reg.rowId);
      }
      return NextResponse.json(
        { error: `Pedido em status "${pedido.status}" não pode ser marcado como postado.` },
        { status: 422 }
      );
    }

    const result = await updatePedidoPostado(sellerRow.org_id, pedido.id, pedido.ledger_id ?? null);
    await addPedidoEvento({
      org_id: sellerRow.org_id,
      pedido_id: pedido.id,
      tipo: "pedido_postado_via_erp",
      origem: "erp",
      actor_id: sellerRow.id,
      actor_tipo: "seller",
      descricao: "Marketplace/ERP confirmou postagem automaticamente.",
      metadata: { event_id },
    });
    if (reg.rowId) {
      await supabaseAdmin
        .from("erp_event_logs")
        .update({
          status_processamento: "processado",
          pedido_id: pedido.id,
          referencia_externa: pedido.referencia_externa ?? referencia_externa ?? null,
          processado_em: new Date().toISOString(),
        })
        .eq("id", reg.rowId);
    }
    return NextResponse.json({
      ok: true,
      pedido_id: pedido.id,
      status: "aguardando_repasse",
      ciclo_repasse: result.ciclo_repasse,
      atualizado_via_erp: true,
    });
  } catch (e: unknown) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro inesperado" },
      { status: 500 }
    );
  }
}
