import { getValidMercadoLivreAccessToken, mlBuscarPrevisaoLiberacaoEtiqueta } from "@/lib/mercadoLivreApiClient";

export type PedidoAlvoEtiquetaMl = {
  id: string;
  seller_id: string;
  status: string;
  canal_venda: string | null;
  referencia_externa: string | null;
  marketplace_numero: string | null;
  tem_etiqueta: boolean;
};

/** Evita estourar a página de pedidos com muitas chamadas à API do ML de uma vez —
 * hoje só o seller de teste (Djulios) tem integração direta, então o volume real é baixo;
 * o teto é só uma proteção pra quando isso escalar. */
const MAX_CONSULTAS_POR_REQUEST = 10;

function ehCandidatoBufferMl(p: PedidoAlvoEtiquetaMl): boolean {
  return (
    p.status === "enviado" &&
    !p.tem_etiqueta &&
    p.canal_venda === "mercado_livre" &&
    !!p.referencia_externa?.startsWith("ml:") &&
    !!p.marketplace_numero
  );
}

/**
 * Pra pedidos "enviado" sem etiqueta que vieram direto do ML (`referencia_externa`
 * prefixado `ml:`), busca a data que o próprio Mercado Livre prevê liberar a etiqueta
 * (buffer de transportadora, ver `mlBuscarPrevisaoLiberacaoEtiqueta`). Devolve um Map
 * pedido_id → data ISO (ou null se não achou previsão) — só contém entradas pros pedidos
 * candidatos, nunca todos os pedidos da lista.
 */
export async function buscarPrevisaoEtiquetaMlPendentes(
  pedidos: PedidoAlvoEtiquetaMl[]
): Promise<Map<string, string | null>> {
  const resultado = new Map<string, string | null>();
  const alvo = pedidos.filter(ehCandidatoBufferMl).slice(0, MAX_CONSULTAS_POR_REQUEST);
  if (alvo.length === 0) return resultado;

  const porSeller = new Map<string, PedidoAlvoEtiquetaMl[]>();
  for (const p of alvo) {
    const lista = porSeller.get(p.seller_id) ?? [];
    lista.push(p);
    porSeller.set(p.seller_id, lista);
  }

  await Promise.all(
    Array.from(porSeller.entries()).map(async ([sellerId, lista]) => {
      const ctx = await getValidMercadoLivreAccessToken(sellerId);
      if (!ctx) return;
      await Promise.all(
        lista.map(async (p) => {
          const previsao = await mlBuscarPrevisaoLiberacaoEtiqueta(ctx, p.marketplace_numero as string);
          resultado.set(p.id, previsao);
        })
      );
    })
  );

  return resultado;
}
