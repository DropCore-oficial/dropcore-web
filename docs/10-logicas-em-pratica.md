# DropCore — Lógicas em prática

Documento para alinhar as regras do sistema e decidir o próximo passo.  
*(Atualizado a partir do que já está no código e do que combinamos.)*

---

## 1. Seller (pré-pago)

| Regra | Status |
|-------|--------|
| Seller adiciona crédito (mínimo R$ 500). | ✅ |
| Crédito = saldo operacional (passivo DropCore). | ✅ |
| Pagamento só via **PIX**. | ✅ |
| Depósito PIX: registra como **pendente** → admin aprova quando o valor entra na conta. | ✅ |
| Saldo em conta **debita** quando o seller vende (bloqueio na venda). | ✅ Integrado em Pedidos. |

---

## 2. Pedido e venda

| Regra | Status |
|-------|--------|
| Pedido vem do **ERP do seller** (obrigatório) → puxado para o marketplace → mostrado ao seller e ao fornecedor. | 📌 Definido; fluxo de pedido ainda não implementado na aplicação. |
| **ERP do fornecedor** é opcional (ex.: subir estoque em massa). | 📌 Definido. |
| Na hora de **enviar** o pedido ao fornecedor: checar saldo (bloqueio). Se `saldo_disponivel >= valor_total` → debita e bloqueia no ledger; senão → erro SALDO_INSUFICIENTE. | ✅ Tela Pedidos cria pedido e chama block-sale; falta chamar no ponto onde o pedido é “enviado”. |

**Valor da venda (exemplo):**  
`custo_fornecedor + taxa_dropcore (ex: 15%) = valor_total` → esse valor_total é o que bloqueia/debita do seller.

---

## 3. Repasse (semanal)

| Regra | Status |
|-------|--------|
| Tudo enviado de **segunda a sábado** → pago na **segunda seguinte**. | ✅ (ciclo no ledger). |
| Pedido **entregue**, sem devolução, no ciclo → na segunda: fornecedor recebe `custo_fornecedor`, DropCore recebe `taxa_dropcore`, saldo bloqueado do seller é liberado (status PAGO). | ✅ API repasse-semanal; marca ledger ENTREGUE/AGUARDANDO_REPASSE → PAGO. |
| DropCore e fornecedor no **mesmo ciclo**. | ✅ |

---

## 4. Devolução

| Caso | Regra | Status |
|------|--------|--------|
| **Antes do repasse** | Duas etapas: (1) Registrar devolução → status **EM_DEVOLUCAO** (valor continua bloqueado até fornecedor conferir). (2) Fornecedor confirma recebimento → status **DEVOLVIDO** (valor volta ao seller). | ✅ PATCH /api/org/financial/ledger/[id]: `EM_DEVOLUCAO` a partir de BLOQUEADO/ENTREGUE/AGUARDANDO_REPASSE; `DEVOLVIDO` só a partir de EM_DEVOLUCAO. |
| **Após o repasse** | Gera débito a descontar; **desconta no próximo repasse** (fornecedor + DropCore). | ✅ Estrutura `financial_debito_descontar`; repasse-semanal já desconta. ✅ POST `/api/org/financial/devolucao-pos-repasse` (body: `ledger_id`); admin em Bloqueios e devoluções → tabela PAGO. |
| **Responsabilidade** | Erro fornecedor vs seller vs arrependimento (quem assume o quê). | 📌 Definir política e refletir nos endpoints. |

---

## 5. Dashboard e números

| Conceito | O que é | Uso |
|----------|---------|-----|
| **Saldo em conta** | Soma do saldo atual de todos os sellers (o que está na conta **agora**). | Debita com as vendas. Visão operação / passivo. |
| **Entrada no mês** | Soma dos depósitos PIX **aprovados** no mês. | Quanto “entrou” de crédito no período. |
| **Relatório entrada/saída** | Entrada: depósitos aprovados (+ outros ingressos, se houver). Saída: repasses pagos, taxa DropCore, saques, etc. | Planejado; implementar quando fecharmos o desenho. |

---

## 6. Mensalidades e receita DropCore

| Item | Status |
|------|--------|
| Receita DropCore = **mensalidades** (sellers e fornecedores) + **serviços**. | 📌 Doc 02-fluxo-financeiro. |
| Dashboard: cards “Mensalidades sellers” e “Mensalidades fornecedores” em breve. | ✅ Placeholder no dashboard. |
| Cobrança e registro de mensalidade (valor, ciclo, inadimplência). | 📌 A definir e implementar depois. |

---

## 7. Segurança e visibilidade

| Regra | Status |
|-------|--------|
| Só owner/admin vê financeiro completo. | ✅ (APIs com `requireAdmin`). |
| Fornecedor vê só seus valores; seller vê só seus valores. | ✅ RLS implementado: `web/scripts/rls-financeiro.sql` (owner/admin vê org; seller/fornecedor via org_members.seller_id/fornecedor_id). |
| Nenhuma operação financeira crítica pelo client-side; tudo server-side. | ✅ |

---

## Próximos passos (para escolher)

1. **Integrar bloqueio ao pedido**  
   Onde o pedido é “enviado” (quando existir fluxo de pedido na aplicação), chamar a API de bloqueio e tratar SALDO_INSUFICIENTE.

2. **Dashboard: “Entrada no mês”**  
   Segundo card combinado (além do “Saldo em conta”) + API que some depósitos PIX aprovados no mês.

3. **Devolução antes do repasse**  
   Endpoint para marcar venda como devolvida e devolver valor ao saldo do seller.

4. **Devolução após o repasse**  
   ~~Endpoint para registrar devolução pós-repasse (inserir em `financial_debito_descontar`).~~ ✅ Feito: POST `/api/org/financial/devolucao-pos-repasse`; admin em Bloqueios e devoluções.

5. **Relatório entrada/saída**  
   ~~Definir período, linhas (entrada: depósitos; saída: repasses, taxas, etc.) e depois implementar tela/export.~~ ✅ Feito: /admin/relatorio-entrada-saida com período, entrada (PIX), saída (repasses), receita DropCore.

6. **Mensalidades**  
   Definir modelo (valor por plano, ciclo, forma de cobrança) e então tabelas + fluxo.

Quando quiser, a gente escolhe um desses e vira o “próximo passo” concreto (telas/APIs/scripts).
