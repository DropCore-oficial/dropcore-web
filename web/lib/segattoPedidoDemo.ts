/**
 * Gera 1 pedido fictício novo periodicamente pra Segatto (conta demo mostrada a possíveis
 * sellers, 2026-10-01) contra o fornecedor real Djulios, pra parecer "viva" sem depender de
 * venda real nenhuma. Sempre `e_teste = true` — nunca entra em soma real (repasse,
 * dashboard), ver `web/lib/pedidoTesteFilter.ts` e docs/SCHEMA.md.
 *
 * De propósito NÃO reusa `submitSellerErpPedido`: aquele fluxo debita estoque real do
 * catálogo da Djulios, dispara webhook pro ERP do fornecedor e notificação real — nenhum
 * dos dois pode acontecer aqui (Djulios é fornecedor de verdade, só o pedido é fake). Não
 * grava em `financial_ledger` de propósito também — não precisa mexer no saldo fictício da
 * Segatto pra esse pedido aparecer certo na tela do fornecedor.
 */
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveTaxaDropcoreUnit } from "@/lib/order/resolveTaxaDropcore";

const SEGATTO_SELLER_ID = "2406e67b-09d7-42ab-90ae-ce42b95314c8";
const SEGATTO_ORG_ID = "68a53d8e-8542-480d-b07f-4be371367362";
const DJULIOS_FORNECEDOR_ID = "c0504495-7d9d-40fa-a0d3-b08480ba2abd";

const NOMES_COMPRADOR = [
  "Ana Paula Ferreira",
  "Carlos Eduardo Lima",
  "Juliana Alves Souza",
  "Marcos Vinícius Rocha",
  "Fernanda Costa Pereira",
  "Rafael Santos Oliveira",
  "Camila Rodrigues Dias",
  "Bruno Henrique Martins",
  "Larissa Gomes Barbosa",
  "Thiago Almeida Nunes",
];

const CIDADES: Array<[string, string]> = [
  ["São Paulo", "SP"],
  ["Rio de Janeiro", "RJ"],
  ["Belo Horizonte", "MG"],
  ["Curitiba", "PR"],
  ["Porto Alegre", "RS"],
  ["Salvador", "BA"],
  ["Fortaleza", "CE"],
  ["Brasília", "DF"],
  ["Recife", "PE"],
  ["Goiânia", "GO"],
];

function sortear<T>(lista: T[]): T {
  return lista[Math.floor(Math.random() * lista.length)];
}

export type GerarPedidoDemoSegattoResult = { ok: true; pedido_id: string } | { ok: false; motivo: string };

export async function gerarPedidoDemoSegatto(): Promise<GerarPedidoDemoSegattoResult> {
  const { data: skus, error: skuErr } = await supabaseAdmin
    .from("skus")
    .select("id, sku, nome_produto, custo_base, custo_dropcore")
    .eq("fornecedor_id", DJULIOS_FORNECEDOR_ID)
    .eq("status", "ativo")
    .limit(200);
  if (skuErr) return { ok: false, motivo: skuErr.message };
  if (!skus?.length) return { ok: false, motivo: "Fornecedor Djulios sem SKU ativo." };

  const sku = sortear(skus);
  const quantidade = Math.random() < 0.8 ? 1 : 2;
  const custoBase = Number(sku.custo_base ?? 0);
  const custoDropcore = resolveTaxaDropcoreUnit(custoBase, sku.custo_dropcore);
  const valor_fornecedor = Number((custoBase * quantidade).toFixed(2));
  const valor_dropcore = Number((custoDropcore * quantidade).toFixed(2));
  const valor_total = Number((valor_fornecedor + valor_dropcore).toFixed(2));
  const [cidade, uf] = sortear(CIDADES);

  const { data: pedido, error: insertErr } = await supabaseAdmin
    .from("pedidos")
    .insert({
      org_id: SEGATTO_ORG_ID,
      seller_id: SEGATTO_SELLER_ID,
      fornecedor_id: DJULIOS_FORNECEDOR_ID,
      valor_fornecedor,
      valor_dropcore,
      valor_total,
      status: "enviado",
      sku_id: sku.id,
      nome_produto: sku.nome_produto,
      marketplace_numero: String(2_000_000_000_000 + Math.floor(Math.random() * 900_000_000_000)),
      comprador_nome: sortear(NOMES_COMPRADOR),
      comprador_cidade: cidade,
      comprador_uf: uf,
      canal_venda: "mercado_livre",
      e_teste: true,
    })
    .select("id")
    .single();
  if (insertErr || !pedido) return { ok: false, motivo: insertErr?.message ?? "Falha ao criar pedido." };

  await supabaseAdmin.from("pedido_itens").insert({
    pedido_id: pedido.id,
    sku_id: sku.id,
    quantidade,
    preco_unitario: custoBase + custoDropcore,
    valor_total,
  });

  await supabaseAdmin.from("pedido_eventos").insert({
    org_id: SEGATTO_ORG_ID,
    pedido_id: pedido.id,
    tipo: "pedido_criado",
    origem: "sistema",
    actor_tipo: "sistema",
    descricao: "Pedido de demonstração gerado automaticamente (conta Segatto).",
  });

  return { ok: true, pedido_id: pedido.id };
}
