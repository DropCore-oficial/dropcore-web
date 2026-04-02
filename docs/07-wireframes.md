# Wireframes Textuais — DropCore MVP (V1)

---

## Padrão Geral

### Menu Lateral (presente em todas as telas)
- Dashboard
- Sellers
- Fornecedores
- Catálogo/SKUs
- Pedidos
- Relatórios (future)
- Configurações
- Sair

### Busca Global (topo fixo)
- Campo “Buscar...”
  - Permite pesquisar por Seller, Fornecedor, SKU, Pedido (ID), com autocomplete

### Tags de Status (usadas em Listas/Detalhes)
- Pedido:
  - Recebido (azul), Postado (laranja), Entregue (verde-claro), Validado (verde), Repasse Liberado (roxo), Pago (verde-escuro), Cancelado (cinza), Erro (vermelho)
- Repasse:
  - Pendente, Liberado, Pago, Bloqueado
- Penalidade:
  - Aplicada, Em análise, Resolvida, Cancelada

---

## 1. Dashboard (Admin)

**Layout:**
- [Topo] Indicadores rápidos (cards): Total Sellers ativos, Total Fornecedores ativos, Pedidos hoje, Pedidos pendentes, Volume em saldo vendedor, Volume de repasses pendentes
- [Gráfico] Pedidos por status (últimos 30 dias) — barras ou pizza
- [Tabela] Pedidos recentes (com campos: ID, Seller, Fornecedor, Valor, Status, Ações rápidas)
- [Alertas/Notificações] Penalidades, SLAs descumpridos, estoques críticos

**Ações:**
- Ver detalhe de pedido (click na linha)
- Ir para área de sellers/fornecedores (links)

**Estados importantes:**
- Vazio: Mensagem “nenhum dado ainda, cadastre um vendedor/fornecedor”
- Carregando: Skeleton ou spinner com texto “Carregando dados...”
- Erro: Alert vermelho “Erro ao carregar. Tente novamente.”

---

## 2. Sellers (Lista + Detalhe)

**(A) Lista de Sellers**
- Campos: Nome, CNPJ, Saldo operacional, Status (Ativo/Inativo), Data cadastro
- Filtros: Por status, por saldo (<mínimo), por data de cadastro
- Busca própria (nome, CNPJ)
- Botão: + Novo Seller

**Ações:**
- Ver detalhes (click linha)
- Editar seller
- Bloquear/desbloquear
- Registrar crédito inicial (+ Crédito)
- Exportar lista (CSV)

**Estados:**
- Vazio: “Nenhum seller cadastrado. Clique em + Novo Seller.”
- Erro/carregando conforme padrão

**(B) Detalhe do Seller**
- Blocos: Dados cadastrais, Extrato de saldo (créditos/débitos), Pedidos do seller, Penalidades
- Botões: Editar dados, + Crédito, Bloquear, Ver pedidos

---

## 3. Fornecedores (Lista + Detalhe)

**(A) Lista de Fornecedores**
- Campos: Nome, CNPJ, SKUs ativos, Status, Estoque atualizado até, Data cadastro
- Filtros: Por status, estoque baixo
- Busca (nome, CNPJ)
- Botão: + Novo Fornecedor

**Ações:**
- Ver detalhes
- Editar fornecedor
- Importar catálogo (botão Importar)
- Bloquear/desbloquear

**Estados:**
- Vazio: “Nenhum fornecedor cadastrado. Clique em + Novo Fornecedor.”
- Erro/carregando conforme padrão

**(B) Detalhe do Fornecedor**
- Blocos: Dados cadastrais, Catálogo de SKUs, Histórico de estoques, Pedidos atendidos
- Botões: Editar, Importar catálogo, Bloquear

---

## 4. Catálogo / SKUs

- Tabela: SKU, Nome do produto, Fornecedor, Estoque atual, Custo base, Custo com % DropCore, Status (ativo/inativo)
- Filtros: Por fornecedor, por status, por estoque (<mínimo)
- Busca (SKU, nome produto)
- Botões: + Novo SKU, Importar catálogo, Editar SKU, Ativar/Inativar
- Ações em lote: Ativar/Desativar selecionados, Exportar SKUs

**Estados:**
- Vazio: “Nenhum SKU cadastrado. Importe catálogo de fornecedor ou cadastre novo SKU.”
- Carregando/erro padrão

---

## 5. Pedidos (Lista + Detalhe)

**(A) Lista de Pedidos**
- Campos: ID, Data, Seller, Fornecedor, Valor total, Status (tag), Repasse (tag), Penalidade (tag), Ações
- Filtros: Por status, seller, fornecedor, data (de/até)
- Busca (ID, seller, fornecedor)

**Ações:**
- Ver detalhe do pedido
- Exportar CSV

**Estados:**
- Vazio: “Nenhum pedido registrado.”
- Carregando/erro padrão

**(B) Detalhe do Pedido**
- Blocos:
  - Informações gerais (ID, data, valores, seller, fornecedor)
  - Itens do pedido (SKU, produto, quant.)
  - Timeline visual: Recebido → Postado → Entregue → Validado → Débito saldo → Repasse liberado/pago; cada passo com data/hora e responsável
  - Histórico financeiro (débitos/créditos no saldo, status do repasse)
  - Penalidades aplicadas (se houver)
- Ações:
  - Atualizar status manualmente (admin)
  - Bloquear repasse (quando aplicável)
  - Cancelar pedido

---

## Navegação entre Telas

- Menu lateral sempre visível; clique troca imediatamente a tela principal.
- Links internos em tabelas (exemplo: clicar nome do seller abre detalhe).
- Breadcrumbs (navegação secundária) no topo das telas de detalhe.

---

## Fluxos Principais

### a) Cadastrar seller e registrar crédito inicial
1. Menu lateral → “Sellers” → + Novo Seller
2. Preencher dados (nome, CNPJ, contato etc.)
3. Salvar → Detalhe seller aberto
4. Clique em “+ Crédito”, inserir valor, confirmar
5. Parcela de crédito fica visível no extrato de saldo

### b) Importar catálogo do fornecedor e ativar SKUs
1. Menu lateral → “Fornecedores”
2. Seleciona fornecedor → “Importar catálogo”
3. Upload arquivo (modelo padrão) ou integração Bring/Tiny
4. Sistema lista SKUs para conferência → botão “Ativar selecionados”
5. SKUs ativos aparecem no catálogo geral e na lista do fornecedor

### c) Pedido: recebido → postado → entregue → validado → debitar saldo → liberar repasse
1. Pedido integrado via Bring/Tiny (aparece em “Pedidos” com status “Recebido”)
2. Fornecedor atualiza status para “Postado”
3. Após confirmação da entrega, status “Entregue”
4. Admin (ou sistema) valida pedido (status “Validado”)
5. Sistema então debita valor do saldo do seller
6. Após janela de validação, botão ou trigger libera repasse ao fornecedor (“Repasse Liberado”)

---

**Obs.:** Todos os estados importantes (sem dados, erro, carregando) apresentam mensagem clara e ação recomendada (ex: “Cadastrar novo”, “Tentar novamente”).
