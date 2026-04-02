# MVP do Sistema DropCore — Especificação Completa V1

## 1. Objetivo do MVP

- Rodar a operação real de sellers e fornecedores sob governança, utilizando Bring/Tiny ERP como fonte de pedidos, catálogo e integrações principais.
- O sistema deve:
  - Gerenciar o saldo operacional do seller (crédito mínimo de R$500).
  - Manter catálogo de produtos/SKU padrão por fornecedor.
  - Registrar pedidos e acompanhar seu ciclo de vida (recebido, postado, entregue, validado, cancelado, devolvido).
  - Gerenciar e controlar repasses financeiros para fornecedores conforme regras do negócio.

---

## 2. Personas e Permissões (RBAC)

### a) Admin DropCore
- **Pode ver/editar:** Todos os cadastros, pedidos, SKUs, negociações, repasses, penalidades, relatórios e configurações do sistema.

### b) Seller
- **Pode ver:** Seus próprios dados cadastrais, saldo, pedidos, catálogo de SKUs dos fornecedores aos quais está habilitado, situação dos pedidos, movimentações financeiras, penalidades recebidas.
- **Pode editar:** Seus dados (limitado), aceitar termos, solicitar crédito, visualizar e aceitar penalidades.

### c) Fornecedor
- **Pode ver:** Seus dados cadastrais, catálogo de SKUs (produtos e variações), estoque, pedidos destinados a si, SLA de postagem, repasses, penalidades.
- **Pode editar:** Estoque dos SKUs, dados bancários, aceitar termos, visualizar e responder penalidades.

---

## 3. Entidades (Tabelas e Campos)

### Seller
- id, nome, CNPJ/CPF, plano, status, saldo_atual, saldo_bloqueado, data_entrada, termo_aceite

### Fornecedor
- id, nome, CNPJ, status, plano, SLA_postagem_dias, janela_validacao_dias, dados_bancarios (placeholder), termo_aceite

### Produto (SKU Pai)
- sku_pai, fornecedor_id, nome, categoria, ativo, bloco_sku

### Variação (SKU)
- sku, sku_pai, atributos (cor/tamanho), custo_base_fornecedor, custo_item_dropcore (com 15% embutido), estoque_atual, peso, dimensoes (C/L/A), ativo

### Pedido
- id, marketplace, seller_id, fornecedor_id, data, status (recebido/postado/entregue/validado/cancelado/devolvido), itens[], tracking, origem (Bring/Tiny), observacoes

### ItemPedido
- pedido_id, sku, qtd, preco_venda (se disponível), custo_item_dropcore, status_item

### LançamentoFinanceiro
- id, tipo (credito/debito/ajuste), parte (seller/fornecedor/dropcore), valor, motivo, referencia (pedido_id), data, status

### RepasseFornecedor
- id, fornecedor_id, pedido_id, valor, status (travado/liberado/pago), data_entrega, data_liberacao, data_pagamento

### Penalidade
- id, parte (seller/fornecedor), motivo, impacto (multa/bloqueio/suspensão), inicio, fim, referencia

---

## 4. Regras de Negócio

- O seller só opera após aporte de crédito mínimo (R$500), registrado como passivo (não receita/faturamento DropCore).
- O fluxo do pedido:  
  1. Recebido (via integração)  
  2. Postado pelo fornecedor (prazo definido pelo SLA)  
  3. Entregue ao cliente final  
  4. Fica “em validação” por período (ex: 7 dias)  
  5. Após validação, debita o **saldo do seller** pelo **custo_item_dropcore** somente (incluindo monetização DropCore)
  6. Libera repasse ao fornecedor.

- Nunca debitar do saldo do seller: comissão/corretagem do marketplace (p. ex.: SHEIN), pois já são descontadas antes de chegar ao seller.
- Estoque mínimo obrigatório por SKU do fornecedor (>=50 para ativação, alerta se <=40).
- SLAs configuráveis de postagem por fornecedor; controle de cumprimento e aplicação de penalidades.
- Governança:
  - Respeitar MAP/preço mínimo de anúncio.
  - Anúncio deve cumprir padrão mínimo de atributos e qualidade.
  - Ticket mínimo obrigatório em pedidos.
  - Penalidades para descumprimento: de advertência a bloqueio e/ou multa.
- Seller **deve** usar SKU padrão do fornecedor (`supplier_sku = seller_tiny_sku`).  
  - **Proibido** inclusão/usos de SKUs diferentes, alternativos ou personalizados fora do padrão.

---

## 5. Telas do MVP

### 1. Dashboard (Admin)
- Visão geral: KPIs principais (número de pedidos, status, saldo total, repasses pendentes, alertas de SLA, penalidades recentes).
- Alertas de estoque baixo e SLAs não cumpridos.

### 2. Sellers
- Lista de sellers: nome, plano, saldo, status, data entrada.
- Detalhe do seller: saldo atual/bloqueado, movimentações financeiras, pedidos do seller, penalidades, aceite de termos.

### 3. Fornecedores
- Lista de fornecedores: nome, plano, status, SLA de postagem configurado.
- Detalhe: repasses pendentes (por status), SLAs, estoque por SKU, penalidades.

### 4. Catálogo/SKUs
- Lista de SKUs Pai (produto base) e suas variações.
- Exibe por fornecedor: SKU, nome, atributos, estoque atual, custo base, custo com % DropCore.
- Permite editar estoque (fornecedor) e visualizar histórico de alterações.

### 5. Pedidos
- Lista: pedidos por status; filtros por seller, fornecedor, período, status.
- Timeline detalhada de status: recebido > postado > entregue > validado > repasse.
- Detalhe financeiro: valor do pedido, custos, impostos (se houver), movimentação prevista e realizada.

---

## 6. Integração Operacional (Bring/Tiny)

- **Entrada de Pedidos:**  
  - Via webhook (preferencial) ou polling periódico na API Bring/Tiny.
  - Ao receber pedido, o sistema:
    1. Valida se todos SKUs existem e estão ativos com estoque suficiente.
    2. Registra o pedido vinculando seller, fornecedor e SKUs.
    3. Atualiza estoques e percurso do pedido.
  - Atualizações de status (p. ex., postado, entregue) também sincronizadas via Bring/Tiny.

- **Tratamento de Erro:**
  - SKU não encontrado: rejeita/invalida pedido e alerta admin.
  - Estoque insuficiente: bloqueia o pedido, alerta fornecedor.
  - Status divergente entre Bring/Tiny e plataforma: sinaliza para análise manual/admin.

---

## 7. Relatórios Mínimos

- Volume de pedidos (com filtros por seller/fornecedor, período, status).
- Controle do SLA de postagem (tempo médio, SLAs descumpridos).
- Extrato de saldo dos sellers (créditos, débitos, bloqueios).
- Status dos repasses aos fornecedores (travado, liberado, pago).
- Relatório de penalidades aplicadas (tipo, motivo, parte, impacto, status).

---

## 8. MVP em Fases

- **Fase 1:**  
  - Cadastros básicos (sellers, fornecedores), catálogo/SKUs, pedidos, gestão de saldo.

- **Fase 2:**  
  - Fluxo de repasse ao fornecedor, cálculo automático, lançamento de penalidades.

- **Fase 3:**  
  - Relatórios gerenciais, alertas automáticos (estoque, SLA, penalidades), melhorias de integração.

---
