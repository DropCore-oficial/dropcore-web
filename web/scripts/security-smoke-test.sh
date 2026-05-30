#!/usr/bin/env bash
# Smoke test de segurança DropCore (produção ou local).
# Uso:
#   ./scripts/security-smoke-test.sh
#   BASE=http://localhost:3000 ./scripts/security-smoke-test.sh
set -euo pipefail

BASE="${BASE:-https://www.dropcore.com.br}"
PASS=0
FAIL=0

check() {
  local name="$1"
  local ok="$2"
  if [[ "$ok" == "1" ]]; then
    echo "  ✓ $name"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name"
    FAIL=$((FAIL + 1))
  fi
}

echo "DropCore security smoke — BASE=$BASE"
echo ""

echo "1) Páginas privadas redirecionam sem sessão"
for path in "/seller/produtos:/seller/login" "/fornecedor/produtos:/fornecedor/login" "/dashboard:/login"; do
  p="${path%%:*}"
  expect="${path##*:}"
  out=$(curl -s -o /dev/null -w "%{http_code} %{redirect_url}" "$BASE$p")
  code="${out%% *}"
  redir="${out#* }"
  ok=0
  [[ "$code" == "307" || "$code" == "308" ]] && [[ "$redir" == *"$expect"* ]] && ok=1
  check "$p → login ($code)" "$ok"
done

echo ""
echo "2) APIs seller/fornecedor sem token → 401"
for path in "/api/seller/me" "/api/fornecedor/me"; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE$path")
  ok=0
  [[ "$code" == "401" ]] && ok=1
  check "$path HTTP $code" "$ok"
done

echo ""
echo "3) Cron sem CRON_SECRET → 401"
code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE/api/cron/creditos-expiracao")
ok=0
[[ "$code" == "401" ]] && ok=1
check "/api/cron/creditos-expiracao HTTP $code" "$ok"

echo ""
echo "4) ERP sem API key → 401"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/erp/pedidos" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"sku":"TEST","quantidade":1}]}')
ok=0
[[ "$code" == "401" ]] && ok=1
check "/api/erp/pedidos HTTP $code" "$ok"

echo ""
echo "5) Webhook Olist sem token → 401"
code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE/api/webhooks/olist" \
  -H "Content-Type: application/json" \
  -d '{"tipo":"pedido","cnpj":"00000000000000"}')
ok=0
[[ "$code" == "401" || "$code" == "403" ]] && ok=1
check "/api/webhooks/olist HTTP $code" "$ok"

echo ""
echo "—"
echo "Passou: $PASS | Falhou: $FAIL"
if [[ "$FAIL" -gt 0 ]]; then
  exit 1
fi
