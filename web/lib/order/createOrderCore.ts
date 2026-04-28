import { isInadimplente } from "@/lib/inadimplencia";
import { assertSellerPodeVenderSkus } from "@/lib/sellerSkuHabilitado";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type OrderCoreOrigem = "erp" | "org";

export type CreateOrderCoreItemInput = {
  sku?: string;
  sku_id?: string;
  quantidade: number;
};

export type CreateOrderCoreInput = {
  org_id: string;
  seller_id: string;
  fornecedor_id?: string | null;
  origem: OrderCoreOrigem;
  external_order_id?: string | null;
  itens: CreateOrderCoreItemInput[];
  pedido_meta?: {
    referencia_externa?: string | null;
    etiqueta_pdf_url?: string | null;
    etiqueta_pdf_base64?: string | null;
    tracking_codigo?: string | null;
    metodo_envio?: string | null;
    preco_venda?: number | null;
    nome_produto?: string | null;
  };
  opcoes?: {
    validar_estoque?: boolean;
    baixar_estoque?: boolean;
    permitir_multiplos_itens?: boolean;
    enforce_fornecedor_premium_rule?: boolean;
    validar_valores_por_sku?: boolean;
  };
};

export type CreateOrderCoreResult = {
  ok: boolean;
  pedido_id?: string;
  ledger_id?: string | null;
  status?: string;
  external_order_id?: string | null;
  valor_fornecedor?: number;
  valor_dropcore?: number;
  valor_total?: number;
  estoque_debitado?: Array<{
    sku_id: string;
    sku: string | null;
    antes: number;
    depois: number;
  }>;
  movimentos_financeiros?: {
    ledger_id?: string | null;
    block_sale_status?: string | null;
  };
  error_code?: string;
  error_message?: string;
  http_status_sugerido?: number;
  detalhes?: {
    validacoes_passadas?: string[];
    warnings?: string[];
    pedido_existente?: {
      pedido_id: string;
      status: string;
      referencia_externa: string | null;
    };
    contexto_resolvido?: {
      org_id?: string;
      seller_id?: string;
      fornecedor_id?: string | null;
      origem?: "erp" | "org";
      total_itens?: number;
      skus_resolvidos?: Array<{
        sku_id: string;
        sku: string | null;
        status: string | null;
        quantidade: number;
        estoque_disponivel?: number;
        custo_base?: number;
        taxa_dropcore?: number;
        preco_final_unitario?: number;
        valor_fornecedor_item?: number;
        valor_dropcore_item?: number;
        valor_total_item?: number;
      }>;
    };
    [key: string]: unknown;
  };
};

export const CREATE_ORDER_CORE_ERROR = {
  SELLER_NOT_FOUND: "SELLER_NOT_FOUND",
  FORNECEDOR_NOT_FOUND: "FORNECEDOR_NOT_FOUND",
  FORNECEDOR_NOT_LINKED: "FORNECEDOR_NOT_LINKED",
  FORNECEDOR_MISMATCH: "FORNECEDOR_MISMATCH",
  SELLER_INADIMPLENTE: "SELLER_INADIMPLENTE",
  FORNECEDOR_INADIMPLENTE: "FORNECEDOR_INADIMPLENTE",
  SKU_NOT_FOUND: "SKU_NOT_FOUND",
  SKU_INACTIVE: "SKU_INACTIVE",
  SKU_NOT_ENABLED_STARTER: "SKU_NOT_ENABLED_STARTER",
  ESTOQUE_INSUFICIENTE: "ESTOQUE_INSUFICIENTE",
  CUSTO_INVALIDO: "CUSTO_INVALIDO",
  LIMITE_PLANO_EXCEDIDO: "LIMITE_PLANO_EXCEDIDO",
  SALDO_INSUFICIENTE: "SALDO_INSUFICIENTE",
  PEDIDO_DUPLICADO: "PEDIDO_DUPLICADO",
  BLOCK_SALE_FAILED: "BLOCK_SALE_FAILED",
  VALIDATION_ERROR: "VALIDATION_ERROR",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type CreateOrderCoreErrorCode =
  (typeof CREATE_ORDER_CORE_ERROR)[keyof typeof CREATE_ORDER_CORE_ERROR];

type SellerLookupRow = {
  id: string;
  org_id: string;
  fornecedor_id: string | null;
  plano?: string | null;
};

type FornecedorLookupRow = {
  id: string;
  org_id: string;
};

/** Campos mínimos usados hoje no ERP (`/api/erp/pedidos`). */
const SKU_SELECT_MINIMAL =
  "id, sku, status, org_id, fornecedor_id, estoque_atual, estoque_minimo, custo_base, custo_dropcore";

/** Campos extras opcionais (se existirem no schema). */
const SKU_SELECT_EXTENDED = `${SKU_SELECT_MINIMAL}, estoque`;

/** Limite de pedidos no mês para org Starter (mesma regra que `org/pedidos` e `erp/pedidos`). */
const STARTER_VENDAS_LIMITE_MES = 200;

type SkuLookupRow = {
  id: string;
  sku: string;
  status: string | null;
  org_id: string;
  fornecedor_id: string | null;
  estoque_atual?: number | null;
  estoque_minimo?: number | null;
  estoque?: number | null;
  custo_base?: number | null;
  custo_dropcore?: number | null;
};

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export function normalizeQuantidade(value: unknown): number {
  const n =
    typeof value === "number" && Number.isFinite(value)
      ? value
      : Number.parseFloat(String(value ?? "0").replace(",", "."));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.floor(n));
}

export function normalizeOrigem(value: unknown): OrderCoreOrigem | null {
  if (value === "erp" || value === "org") return value;
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (v === "erp" || v === "org") return v;
  return null;
}

export function failCore(
  code: CreateOrderCoreErrorCode,
  message: string,
  status: number,
  detalhes?: CreateOrderCoreResult["detalhes"]
): CreateOrderCoreResult {
  return {
    ok: false,
    error_code: code,
    error_message: message,
    http_status_sugerido: status,
    detalhes,
  };
}

export function successCore(data: Omit<CreateOrderCoreResult, "ok">): CreateOrderCoreResult {
  return {
    ok: true,
    ...data,
  };
}

export function validateBasicInput(input: CreateOrderCoreInput): CreateOrderCoreResult | null {
  if (!isNonEmptyString(input.org_id)) {
    return failCore(
      CREATE_ORDER_CORE_ERROR.VALIDATION_ERROR,
      "org_id é obrigatório.",
      400
    );
  }

  if (!isNonEmptyString(input.seller_id)) {
    return failCore(
      CREATE_ORDER_CORE_ERROR.VALIDATION_ERROR,
      "seller_id é obrigatório.",
      400
    );
  }

  const origemNorm = normalizeOrigem(input.origem);
  if (!origemNorm) {
    return failCore(
      CREATE_ORDER_CORE_ERROR.VALIDATION_ERROR,
      "origem inválida. Use: erp | org.",
      400
    );
  }

  if (!Array.isArray(input.itens) || input.itens.length === 0) {
    return failCore(
      CREATE_ORDER_CORE_ERROR.VALIDATION_ERROR,
      "itens deve conter pelo menos 1 item.",
      400
    );
  }

  for (let i = 0; i < input.itens.length; i++) {
    const item = input.itens[i];
    const q = normalizeQuantidade(item?.quantidade);
    if (q <= 0) {
      return failCore(
        CREATE_ORDER_CORE_ERROR.VALIDATION_ERROR,
        `quantidade inválida no item ${i + 1}.`,
        400,
        { index: i, quantidade_recebida: item?.quantidade ?? null }
      );
    }
  }

  return null;
}

function normalizeMaybeString(v: unknown): string | null {
  return isNonEmptyString(v) ? v.trim() : null;
}

/** Mesmo limite do ERP (`referencia_externa` até 100 caracteres). */
const REFERENCIA_EXTERNA_MAX_LEN = 100;

/**
 * Chave externa para idempotência: `external_order_id` tem prioridade sobre
 * `pedido_meta.referencia_externa`. Retorna `null` se ambos ausentes/vazios.
 */
export function resolveExternalOrderRefForIdempotency(input: CreateOrderCoreInput): string | null {
  const a = normalizeMaybeString(input.external_order_id);
  const b = normalizeMaybeString(input.pedido_meta?.referencia_externa);
  const ref = a ?? b;
  if (!ref) return null;
  return ref.length > REFERENCIA_EXTERNA_MAX_LEN ? ref.slice(0, REFERENCIA_EXTERNA_MAX_LEN) : ref;
}

type PedidoIdempotenciaRow = {
  id: string;
  status: string | null;
  referencia_externa?: string | null;
  origem?: string | null;
  origem_pedido?: string | null;
};

async function fetchPedidoDuplicadoPorReferencia(params: {
  org_id: string;
  seller_id: string;
  referencia: string;
  origemCore: OrderCoreOrigem;
}): Promise<
  | { ok: true; row: { id: string; status: string; referencia_externa: string | null } | null }
  | { ok: false; error: { message?: string } }
> {
  const run = (select: string) =>
    supabaseAdmin
      .from("pedidos")
      .select(select)
      .eq("org_id", params.org_id)
      .eq("seller_id", params.seller_id)
      .eq("referencia_externa", params.referencia)
      .limit(1);

  const selects = [
    "id, status, referencia_externa, origem",
    "id, status, referencia_externa, origem_pedido",
    "id, status, referencia_externa",
  ];

  let res = await run(selects[0]);
  if (res.error && columnMissingFromSupabase(res.error)) {
    res = await run(selects[1]);
  }
  if (res.error && columnMissingFromSupabase(res.error)) {
    res = await run(selects[2]);
  }
  if (res.error) {
    return { ok: false, error: res.error };
  }

  const list = (Array.isArray(res.data) ? res.data : []) as unknown as PedidoIdempotenciaRow[];
  const row = list[0];
  if (!row) {
    return { ok: true, row: null };
  }

  const origemRow = row.origem ?? row.origem_pedido;
  if (origemRow != null && String(origemRow).trim() !== "") {
    const o = String(origemRow).trim().toLowerCase();
    if (o !== params.origemCore) {
      return { ok: true, row: null };
    }
  }

  return {
    ok: true,
    row: {
      id: row.id,
      status: String(row.status ?? ""),
      referencia_externa: row.referencia_externa ?? null,
    },
  };
}

function resolveItemLookupKey(
  origem: OrderCoreOrigem,
  item: CreateOrderCoreItemInput
): { by: "sku_id" | "sku"; value: string } | null {
  const skuId = normalizeMaybeString(item?.sku_id);
  const sku = normalizeMaybeString(item?.sku);
  if (origem === "org") {
    if (skuId) return { by: "sku_id", value: skuId };
    if (sku) return { by: "sku", value: sku };
    return null;
  }
  if (sku) return { by: "sku", value: sku };
  if (skuId) return { by: "sku_id", value: skuId };
  return null;
}

function columnMissingFromSupabase(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  const m = String(err.message ?? "").toLowerCase();
  return (
    err.code === "42703" ||
    err.code === "PGRST204" ||
    (m.includes("column") && m.includes("does not exist")) ||
    m.includes("could not find") ||
    m.includes("schema cache")
  );
}

function toMoneyNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" && Number.isFinite(v) ? v : Number.parseFloat(String(v).replace(",", "."));
  if (!Number.isFinite(n)) return null;
  return n;
}

function resolveEstoqueDisponivel(row: SkuLookupRow): number {
  const a = toMoneyNumber(row.estoque_atual);
  if (a != null && Number.isFinite(a)) return Math.max(0, Math.floor(a));
  const e = toMoneyNumber(row.estoque);
  if (e != null && Number.isFinite(e)) return Math.max(0, Math.floor(e));
  return 0;
}

/** `custo_base` = custo fornecedor (oficial). */
function resolveCustoBaseUnit(row: SkuLookupRow): number | null {
  const cb = toMoneyNumber(row.custo_base);
  if (cb != null && cb > 0) return cb;
  return null;
}

/**
 * Taxa DropCore por unidade: coluna `custo_dropcore` quando > 0;
 * senão 15% sobre `custo_base` (não tratar `custo_dropcore` como preço final).
 */
function resolveTaxaDropcoreUnit(custoBaseUnit: number, row: SkuLookupRow): number {
  const cd = toMoneyNumber(row.custo_dropcore);
  if (cd != null && cd > 0) return cd;
  return custoBaseUnit * 0.15;
}

async function fetchSkuForOrderCore(params: {
  org_id: string;
  fornecedor_id: string;
  lookup: { by: "sku_id" | "sku"; value: string };
}): Promise<{ data: SkuLookupRow | null; error: { message?: string; code?: string } | null }> {
  const run = async (select: string) => {
    const q = supabaseAdmin
      .from("skus")
      .select(select)
      .eq("org_id", params.org_id)
      .eq("fornecedor_id", params.fornecedor_id)
      .limit(1);
    return params.lookup.by === "sku_id"
      ? await q.eq("id", params.lookup.value).maybeSingle<SkuLookupRow>()
      : await q.ilike("sku", params.lookup.value).maybeSingle<SkuLookupRow>();
  };

  let res = await run(SKU_SELECT_EXTENDED);
  if (res.error && columnMissingFromSupabase(res.error)) {
    res = await run(SKU_SELECT_MINIMAL);
  }
  return { data: res.data, error: res.error };
}

export async function createOrderCore(
  input: CreateOrderCoreInput
): Promise<CreateOrderCoreResult> {
  try {
    const validacoesPassadas: string[] = [];
    const contextoResolvido: NonNullable<CreateOrderCoreResult["detalhes"]>["contexto_resolvido"] = {
      org_id: isNonEmptyString(input.org_id) ? input.org_id.trim() : undefined,
      seller_id: isNonEmptyString(input.seller_id) ? input.seller_id.trim() : undefined,
      origem: normalizeOrigem(input.origem) ?? undefined,
      total_itens: Array.isArray(input.itens) ? input.itens.length : 0,
      skus_resolvidos: [],
    };
    const failWithObs = (
      code: CreateOrderCoreErrorCode,
      message: string,
      status: number,
      extraDetalhes?: Record<string, unknown>
    ): CreateOrderCoreResult =>
      failCore(code, message, status, {
        ...(extraDetalhes ?? {}),
        validacoes_passadas: [...validacoesPassadas],
        contexto_resolvido: contextoResolvido,
      });

    const basicValidation = validateBasicInput(input);
    if (basicValidation) return basicValidation;
    validacoesPassadas.push("input_basico");

    const origem = normalizeOrigem(input.origem);
    if (!origem) {
      return failWithObs(
        CREATE_ORDER_CORE_ERROR.VALIDATION_ERROR,
        "origem inválida.",
        400
      );
    }
    contextoResolvido.origem = origem;

    const refIdempotencia = resolveExternalOrderRefForIdempotency(input);
    const idempotenciaWarnings: string[] = [];
    if (refIdempotencia) {
      const dup = await fetchPedidoDuplicadoPorReferencia({
        org_id: input.org_id.trim(),
        seller_id: input.seller_id.trim(),
        referencia: refIdempotencia,
        origemCore: origem,
      });
      if (!dup.ok) {
        return failWithObs(
          CREATE_ORDER_CORE_ERROR.INTERNAL_ERROR,
          "Erro ao verificar idempotência do pedido.",
          500,
          { cause: dup.error.message }
        );
      }
      if (dup.row) {
        return failWithObs(
          CREATE_ORDER_CORE_ERROR.PEDIDO_DUPLICADO,
          "Já existe pedido com esta referência externa para este seller.",
          409,
          {
            pedido_existente: {
              pedido_id: dup.row.id,
              status: dup.row.status,
              referencia_externa: dup.row.referencia_externa,
            },
          }
        );
      }
    } else {
      idempotenciaWarnings.push("external_order_id_ausente_sem_idempotencia");
    }
    validacoesPassadas.push("idempotencia_ok");

    const { data: seller, error: sellerErr } = await supabaseAdmin
      .from("sellers")
      .select("id, org_id, fornecedor_id, plano")
      .eq("id", input.seller_id)
      .eq("org_id", input.org_id)
      .maybeSingle<SellerLookupRow>();

    if (sellerErr) {
      return failWithObs(
        CREATE_ORDER_CORE_ERROR.INTERNAL_ERROR,
        "Erro ao consultar seller.",
        500,
        { cause: sellerErr.message }
      );
    }
    if (!seller) {
      return failWithObs(
        CREATE_ORDER_CORE_ERROR.SELLER_NOT_FOUND,
        "Seller não encontrado.",
        404
      );
    }
    validacoesPassadas.push("seller_encontrado");

    const sellerFornecedorId = normalizeMaybeString(seller.fornecedor_id);
    const fornecedorInput = normalizeMaybeString(input.fornecedor_id);
    const fornecedorId = fornecedorInput ?? sellerFornecedorId;
    contextoResolvido.fornecedor_id = fornecedorId ?? null;

    if (!fornecedorId) {
      return failWithObs(
        CREATE_ORDER_CORE_ERROR.FORNECEDOR_NOT_LINKED,
        "Seller não está vinculado a um fornecedor.",
        400
      );
    }
    validacoesPassadas.push("fornecedor_resolvido");
    if (!sellerFornecedorId) {
      return failWithObs(
        CREATE_ORDER_CORE_ERROR.FORNECEDOR_NOT_LINKED,
        "Seller não possui fornecedor vinculado.",
        400
      );
    }
    if (sellerFornecedorId !== fornecedorId) {
      return failWithObs(
        CREATE_ORDER_CORE_ERROR.FORNECEDOR_MISMATCH,
        "Fornecedor informado difere do fornecedor vinculado ao seller.",
        400,
        { fornecedor_input: fornecedorId, fornecedor_vinculado: sellerFornecedorId }
      );
    }

    const { data: fornecedor, error: fornecedorErr } = await supabaseAdmin
      .from("fornecedores")
      .select("id, org_id")
      .eq("id", fornecedorId)
      .eq("org_id", input.org_id)
      .maybeSingle<FornecedorLookupRow>();

    if (fornecedorErr) {
      return failWithObs(
        CREATE_ORDER_CORE_ERROR.INTERNAL_ERROR,
        "Erro ao consultar fornecedor.",
        500,
        { cause: fornecedorErr.message }
      );
    }
    if (!fornecedor) {
      return failWithObs(
        CREATE_ORDER_CORE_ERROR.FORNECEDOR_NOT_FOUND,
        "Fornecedor não encontrado.",
        404
      );
    }
    validacoesPassadas.push("fornecedor_encontrado");
    validacoesPassadas.push("vinculo_seller_fornecedor_ok");

    const [sellerInad, fornecedorInad] = await Promise.all([
      isInadimplente(supabaseAdmin, input.org_id, "seller", seller.id),
      isInadimplente(supabaseAdmin, input.org_id, "fornecedor", fornecedor.id),
    ]);
    if (sellerInad) {
      return failWithObs(
        CREATE_ORDER_CORE_ERROR.SELLER_INADIMPLENTE,
        "Seller inadimplente.",
        403
      );
    }
    validacoesPassadas.push("seller_adimplente");
    if (fornecedorInad) {
      return failWithObs(
        CREATE_ORDER_CORE_ERROR.FORNECEDOR_INADIMPLENTE,
        "Fornecedor inadimplente.",
        403
      );
    }
    validacoesPassadas.push("fornecedor_adimplente");

    const validarEstoque = input.opcoes?.validar_estoque !== false;

    let accValorFornecedor = 0;
    let accValorDropcore = 0;
    let accValorTotal = 0;

    for (let i = 0; i < input.itens.length; i++) {
      const item = input.itens[i];
      const q = normalizeQuantidade(item.quantidade);
      if (q <= 0) {
        return failWithObs(
          CREATE_ORDER_CORE_ERROR.VALIDATION_ERROR,
          `quantidade inválida no item ${i + 1}.`,
          400,
          { index: i, quantidade_recebida: item.quantidade ?? null }
        );
      }

      const lookup = resolveItemLookupKey(origem, item);
      if (!lookup) {
        return failWithObs(
          CREATE_ORDER_CORE_ERROR.VALIDATION_ERROR,
          `Item ${i + 1} sem sku/sku_id válido para origem ${origem}.`,
          400,
          { index: i }
        );
      }

      const { data: sku, error: skuErr } = await fetchSkuForOrderCore({
        org_id: input.org_id,
        fornecedor_id: fornecedorId,
        lookup,
      });

      if (skuErr) {
        return failWithObs(
          CREATE_ORDER_CORE_ERROR.INTERNAL_ERROR,
          "Erro ao consultar SKU.",
          500,
          { cause: skuErr.message, index: i, by: lookup.by, value: lookup.value }
        );
      }
      if (!sku) {
        return failWithObs(
          CREATE_ORDER_CORE_ERROR.SKU_NOT_FOUND,
          `SKU não encontrado no item ${i + 1}.`,
          404,
          { index: i, by: lookup.by, value: lookup.value }
        );
      }
      if (String(sku.status ?? "").toLowerCase() !== "ativo") {
        return failWithObs(
          CREATE_ORDER_CORE_ERROR.SKU_INACTIVE,
          `SKU inativo no item ${i + 1}.`,
          400,
          { index: i, sku_id: sku.id, sku: sku.sku }
        );
      }

      const estoqueDisponivel = resolveEstoqueDisponivel(sku);
      if (validarEstoque && estoqueDisponivel < q) {
        return failWithObs(
          CREATE_ORDER_CORE_ERROR.ESTOQUE_INSUFICIENTE,
          `Estoque insuficiente para SKU ${sku.sku} (item ${i + 1}).`,
          409,
          {
            index: i,
            sku_id: sku.id,
            sku: sku.sku,
            estoque_disponivel: estoqueDisponivel,
            quantidade_solicitada: q,
          }
        );
      }

      const custoBaseUnit = resolveCustoBaseUnit(sku);
      if (custoBaseUnit == null || custoBaseUnit <= 0) {
        return failWithObs(
          CREATE_ORDER_CORE_ERROR.CUSTO_INVALIDO,
          `custo_base inválido para SKU ${sku.sku} (item ${i + 1}).`,
          422,
          { index: i, sku_id: sku.id, sku: sku.sku }
        );
      }

      const taxaDropcoreUnit = resolveTaxaDropcoreUnit(custoBaseUnit, sku);
      const precoFinalUnitario = custoBaseUnit + taxaDropcoreUnit;
      const valorFornecedorItem = custoBaseUnit * q;
      const valorDropcoreItem = taxaDropcoreUnit * q;
      const valorTotalItem = valorFornecedorItem + valorDropcoreItem;

      accValorFornecedor += valorFornecedorItem;
      accValorDropcore += valorDropcoreItem;
      accValorTotal += valorTotalItem;

      contextoResolvido.skus_resolvidos?.push({
        sku_id: sku.id,
        sku: sku.sku ?? null,
        status: sku.status ?? null,
        quantidade: q,
        estoque_disponivel: estoqueDisponivel,
        custo_base: custoBaseUnit,
        taxa_dropcore: taxaDropcoreUnit,
        preco_final_unitario: precoFinalUnitario,
        valor_fornecedor_item: valorFornecedorItem,
        valor_dropcore_item: valorDropcoreItem,
        valor_total_item: valorTotalItem,
      });
    }
    validacoesPassadas.push("itens_basicos_ok");
    validacoesPassadas.push("skus_encontrados");
    validacoesPassadas.push("skus_ativos");
    validacoesPassadas.push("estoque_ok");
    validacoesPassadas.push("custos_ok");
    validacoesPassadas.push("valores_calculados");
    validacoesPassadas.push("regra_custo_dropcore_ok");

    const skusParaVenda =
      contextoResolvido.skus_resolvidos?.map((r) => ({
        id: r.sku_id,
        sku: String(r.sku ?? ""),
      })) ?? [];
    const vendaSkuCheck = await assertSellerPodeVenderSkus(supabaseAdmin, {
      sellerId: seller.id,
      sellerPlano: seller.plano,
      skus: skusParaVenda,
    });
    if (!vendaSkuCheck.ok) {
      const msg = vendaSkuCheck.error;
      const infra =
        msg.includes("incompleta") ||
        msg.includes("inexistente") ||
        msg.includes("Tabela seller_skus_habilitados");
      return failWithObs(
        infra ? CREATE_ORDER_CORE_ERROR.INTERNAL_ERROR : CREATE_ORDER_CORE_ERROR.SKU_NOT_ENABLED_STARTER,
        msg,
        infra ? 500 : 403
      );
    }
    validacoesPassadas.push("sku_habilitado_starter_ok");

    const { data: orgRow, error: orgErr } = await supabaseAdmin
      .from("orgs")
      .select("plano")
      .eq("id", input.org_id)
      .maybeSingle();
    if (orgErr) {
      return failWithObs(
        CREATE_ORDER_CORE_ERROR.INTERNAL_ERROR,
        "Erro ao consultar plano da organização.",
        500,
        { cause: orgErr.message }
      );
    }
    const orgPlano = String(orgRow?.plano ?? "starter").toLowerCase();
    if (orgPlano === "starter") {
      const inicioMes = new Date();
      inicioMes.setDate(1);
      inicioMes.setHours(0, 0, 0, 0);
      const { count, error: countErr } = await supabaseAdmin
        .from("pedidos")
        .select("id", { count: "exact", head: true })
        .eq("org_id", input.org_id)
        .gte("criado_em", inicioMes.toISOString())
        .or("status.eq.enviado,status.eq.aguardando_repasse,status.eq.entregue,status.eq.devolvido");
      if (!countErr && typeof count === "number" && count >= STARTER_VENDAS_LIMITE_MES) {
        return failWithObs(
          CREATE_ORDER_CORE_ERROR.LIMITE_PLANO_EXCEDIDO,
          `Limite de ${STARTER_VENDAS_LIMITE_MES} vendas do plano Starter no mês atingido.`,
          403
        );
      }
    }
    validacoesPassadas.push("limite_plano_ok");

    return successCore({
      status: "validated",
      external_order_id:
        normalizeMaybeString(input.external_order_id) ??
        normalizeMaybeString(input.pedido_meta?.referencia_externa),
      valor_fornecedor: Math.round(accValorFornecedor * 100) / 100,
      valor_dropcore: Math.round(accValorDropcore * 100) / 100,
      valor_total: Math.round(accValorTotal * 100) / 100,
      detalhes: {
        validacoes_passadas: [...validacoesPassadas],
        contexto_resolvido: contextoResolvido,
        ...(idempotenciaWarnings.length > 0 ? { warnings: idempotenciaWarnings } : {}),
      },
    });
  } catch (e: unknown) {
    return failCore(
      CREATE_ORDER_CORE_ERROR.INTERNAL_ERROR,
      "Erro inesperado na validação do core de pedido.",
      500,
      {
        cause: e instanceof Error ? e.message : String(e),
      }
    );
  }
}
