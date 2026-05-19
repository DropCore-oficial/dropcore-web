#!/usr/bin/env bash
# Exemplos para disparar pedido de teste no DropCore (produção ou local).
# Uso: copie, preencha as variáveis e rode: bash web/scripts/exemplo-pedido-teste.sh olist
#      ou: bash web/scripts/exemplo-pedido-teste.sh erp
set -euo pipefail

BASE="${BASE:-https://www.dropcore.com.br}"

cmd_olist() {
  : "${W:?Defina W (valor do parâmetro ?w= da tela Integração ERP, sem codificar)}"
  : "${CNPJ:?Defina CNPJ só dígitos (mesmo da conta gravada no DropCore)}"
  : "${PEDIDO:?Defina PEDIDO = id numérico do pedido na Olist/Tiny (ex.: 123456)}"
  echo "POST ${BASE}/api/webhooks/olist?w=…"
  curl -sS -w "\nHTTP %{http_code}\n" -X POST "${BASE}/api/webhooks/olist?w=${W}" \
    -H "Content-Type: application/json" \
    -d "{\"cnpj\":\"${CNPJ}\",\"tipo\":\"atualizacao_pedido\",\"dados\":{\"id\":${PEDIDO}}}"
}

cmd_erp() {
  : "${API_KEY:?Defina API_KEY (chave dc_… gerada em POST /api/seller/erp-api-key logado como seller)}"
  : "${SKU:?Defina SKU (string exata de um SKU ativo do fornecedor do seller)}"
  REF="${REF:-teste-cli-$(date +%s)}"
  echo "POST ${BASE}/api/erp/pedidos (referencia_externa=${REF})"
  curl -sS -w "\nHTTP %{http_code}\n" -X POST "${BASE}/api/erp/pedidos" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: ${API_KEY}" \
    -d "{\"referencia_externa\":\"${REF}\",\"items\":[{\"sku\":\"${SKU}\",\"quantidade\":1}]}"
}

case "${1:-}" in
  olist) cmd_olist ;;
  erp) cmd_erp ;;
  *)
    echo "Uso:"
    echo "  W=... CNPJ=... PEDIDO=... bash web/scripts/exemplo-pedido-teste.sh olist"
    echo "  API_KEY=... SKU=... bash web/scripts/exemplo-pedido-teste.sh erp"
    echo "Opcional: BASE=https://www.dropcore.com.br (padrão)"
    exit 1
    ;;
esac
