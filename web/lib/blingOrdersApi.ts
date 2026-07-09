/**
 * Cliente mínimo pra ler um pedido de venda da API v3 do Bling.
 *
 * ATENÇÃO — schema não verificado contra payload real: a documentação da API
 * (developer.bling.com.br) é renderizada em JS e não foi possível extrair o
 * schema JSON exato durante a implementação. O shape abaixo segue o formato
 * conhecido/documentado publicamente da API v3 do Bling para
 * `GET /Api/v3/pedidos/vendas/{id}`, mas os campos marcados "VERIFICAR" abaixo
 * precisam ser conferidos contra um pedido real antes de confiar no fluxo em
 * produção (ver web/lib/sellerBlingPedidoImport.ts, que consome este arquivo).
 */

const BLING_API_ORIGIN = "https://api.bling.com.br";

export type BlingPedidoVendaItem = {
  codigo?: string | null; // VERIFICAR: código/SKU do produto no item do pedido
  descricao?: string | null;
  quantidade?: number | null;
};

export type BlingPedidoVendaDetalhe = {
  id: number;
  numero?: string | number | null;
  situacao?: { id?: number | null; valor?: number | null } | null; // VERIFICAR: situação é configurável por conta Bling, não um enum fixo
  itens: BlingPedidoVendaItem[];
  contato?: {
    nome?: string | null;
    telefone?: string | null;
    celular?: string | null;
  } | null;
  transporte?: {
    contato?: {
      municipio?: string | null; // VERIFICAR: cidade do destinatário
      uf?: string | null;
    } | null;
    volumes?: Array<{ codigoRastreamento?: string | null; servico?: string | null }> | null; // VERIFICAR: código de rastreio
  } | null;
};

export class BlingApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "BlingApiError";
  }
}

export async function obterPedidoVendaBling(
  accessToken: string,
  pedidoId: number,
): Promise<BlingPedidoVendaDetalhe> {
  const res = await fetch(`${BLING_API_ORIGIN}/Api/v3/pedidos/vendas/${pedidoId}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken.trim()}`,
      Accept: "application/json",
      "enable-jwt": "1",
    },
    cache: "no-store",
  });

  const json = (await res.json().catch(() => ({}))) as { data?: BlingPedidoVendaDetalhe } & Record<string, unknown>;
  if (!res.ok) {
    throw new BlingApiError(`Falha ao buscar pedido ${pedidoId} no Bling (HTTP ${res.status}).`, res.status);
  }
  if (!json.data || typeof json.data.id !== "number") {
    throw new BlingApiError(`Resposta do Bling sem dados de pedido válidos para ${pedidoId}.`, res.status);
  }
  return json.data;
}
