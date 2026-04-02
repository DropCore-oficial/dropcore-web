# Plano No-Code — Implementação do MVP DropCore com Supabase e Retool

---

## 1. Estrutura de Dados — Supabase (DB + Auth)

### Tabelas Principais e Campos

#### a) sellers
- `id` (uuid, PK)
- `nome` (string)
- `cnpj` (string, único)
- `email` (string)
- `saldo_operacional` (decimal)
- `status` (enum: ativo, inativo, bloqueado)
- `data_cadastro` (timestamp)
- `created_at`, `updated_at` (timestamps)

#### b) fornecedores
- `id` (uuid, PK)
- `nome` (string)
- `cnpj` (string, único)
- `email` (string)
- `prefixo_sku` (string, 3 letras, único)
- `status` (enum: ativo, inativo, bloqueado)
- `data_cadastro` (timestamp)
- `created_at`, `updated_at` (timestamps)

#### c) skus
- `id` (uuid, PK)
- `sku` (string, único — padrão DropCore, ex: LAR100001)
- `nome_produto` (string)
- `fornecedor_id` (fk → fornecedores.id)
- `estoque_atual` (integer)
- `custo_base` (decimal)
- `custo_com_percentual` (decimal)
- `status` (enum: ativo, inativo)
- `created_at`, `updated_at` (timestamps)

#### d) pedidos
- `id` (uuid, PK)
- `seller_id` (fk → sellers.id)
- `fornecedor_id` (fk → fornecedores.id)
- `valor_total` (decimal)
- `status` (enum: recebido, postado, entregue, validado, repasse_liberado, pago, cancelado, erro)
- `data` (timestamp)
- `created_at`, `updated_at` (timestamps)

#### e) pedido_itens
- `id` (uuid, PK)
- `pedido_id` (fk → pedidos.id)
- `sku_id` (fk → skus.id)
- `quantidade` (integer)
- `preco_unitario` (decimal)
- `total` (decimal)

#### f) extrato_saldo
- `id` (uuid, PK)
- `seller_id` (fk → sellers.id)
- `tipo` (enum: credito, debito, bloqueio)
- `valor` (decimal)
- `descricao` (string)
- `data` (timestamp)

#### g) penalidades (opcional nesta fase)
- `id` (uuid, PK)
- `tipo` (string)
- `parte` (enum: seller, fornecedor)
- `relacionado_id` (uuid)
- `motivo` (string)
- `valor` (decimal, opcional)
- `status` (enum: aplicada, em_analise, resolvida, cancelada)
- `data` (timestamp)

#### h) users (Supabase Auth)
- Para login/administração no Retool.

---

### Relacionamentos

- **sellers & pedidos**: 1:N (um seller pode ter vários pedidos)
- **fornecedores & skus**: 1:N (um fornecedor pode ter vários SKUs)
- **fornecedores & pedidos**: 1:N (um fornecedor pode ter vários pedidos)
- **pedidos & pedido_itens**: 1:N (um pedido pode conter múltiplos SKUs)
- **skus & pedido_itens**: 1:N (um SKU pode estar em vários itens de pedidos)
- **sellers & extrato_saldo**: 1:N (controle financeiro individual)

---

### Regras para Validar/Automatizar

- Não permitir saldo operacional de seller < 500 para novos pedidos (regra mínima)
- SKU deve ser único e seguir o padrão do fornecedor (prefixo/sufixo correto)
- Não permitir inserção de SKU duplicado
- Estoque do SKU não pode ficar negativo após pedido
- Seller só pode inserir crédito positivo
- Relacionamento entre seller/fornecedor/SKU obrigatoriamente válido em qualquer pedido

Validações podem ser feitas via policies do Supabase, triggers, automações no Retool ou lógica do workflow.

---

## 2. Estrutura das Telas no Retool

### 1. Dashboard

- Indicadores: Totais de sellers, fornecedores, pedidos do dia, pedidos pendentes, saldo total dos sellers, repasses pendentes
- Gráfico: Pedidos por status (barras/pizza)
- Tabela: Pedidos recentes (ID, Seller, Fornecedor, Valor, Status, Ações rápidas)
- Alertas: Penalidades, SLAs descumpridos, estoques críticos

### 2. Sellers (Lista + Detalhe)

- Lista: Nome, CNPJ, Saldo, Status, Data
- Filtros: Status, saldo, data
- Busca: Nome, CNPJ
- Ações: Adicionar, editar, bloquear/desbloquear, crédito inicial, exportar
- Detalhe: Dados cadastrais, extrato de saldo, pedidos do seller, penalidades

### 3. Fornecedores (Lista + Detalhe)

- Lista: Nome, CNPJ, SKUs ativos, Status, Estoque atualizado até, Data
- Filtros/busca: Nome, CNPJ, status, estoque baixo
- Ações: Adicionar, editar, bloquear/desbloquear, importar catálogo
- Detalhe: Dados cadastrais, catálogo de SKUs, histórico de estoques, pedidos atendidos

### 4. Catálogo / SKUs

- Lista: SKU, Nome, Fornecedor, Estoque, Custo base, Custo com %, Status
- Filtros: Fornecedor, status, estoque
- Busca: SKU, nome
- Ações: Adicionar, importar catálogo, editar, ativar/inativar, exportar
- Edição rápida de estoque (fornecedor) e histórico de alterações

### 5. Pedidos (Lista + Detalhe)

- Lista: ID, Data, Seller, Fornecedor, Valor total, Status, Repasse, Penalidade, Ações
- Filtros: Status, seller, fornecedor, data
- Busca: ID, seller, fornecedor
- Detalhe: Infos gerais, itens, timeline do status, histórico financeiro, penalidades, ações administrativas

---

## 3. Importação por CSV

### Templates Necessários

- **Sellers:** nome, cnpj, email, saldo_operacional, status
- **Fornecedores:** nome, cnpj, email, prefixo_sku, status
- **SKUs:** sku, nome_produto, fornecedor_id/prefixo, estoque_atual, custo_base, custo_com_percentual, status
- **Pedidos:** ID, seller_id, fornecedor_id, valor_total, status, data
- **Pedido Itens:** pedido_id, sku_id, quantidade, preco_unitario, total

Os templates devem ser padronizados, validados no upload (checar campos obrigatórios e unicidade).

---

## 4. Observações Finais

- Autenticação de administradores feita pelo Supabase Auth integrado ao Retool.
- Pode-se usar tabelas de controle auxiliar para parametrizações (ex: faixas de SLA, motivos de penalidades).
- Relacionamentos e validações podem ser aplicados tanto no Supabase (via policies) quanto por regras no Retool (workflows de formulário).

---

