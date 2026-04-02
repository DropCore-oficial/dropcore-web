# Plano DropCore — Construir o sistema completo (com Jarvis)

Você não precisa saber programação. Este documento é o **mapa** do que vamos fazer, em ordem. Cada fase entrega algo que já funciona.

---

## O que já está pronto

- Login e perfis (admin, operacional)
- Lista de empresas (fornecedores)
- Catálogo por fornecedor: ver, editar, criar, inativar, apagar SKUs
- Editar grupo (aplicar dados em todos os itens do grupo)
- Avisos de estoque baixo (dashboard + filtro no catálogo)
- Exportar e importar catálogo em CSV
- Catálogo só leitura (para quem não é admin)
- Segurança básica (rotas protegidas, sem expor dados sensíveis)

---

## Fase 1 — Admin completo (o “centro de comando”)

Objetivo: quem administra o DropCore tem uma tela de controle e consegue gerenciar sellers e fornecedores de verdade.

| # | O que fazer | O que você terá |
|---|-------------|-----------------|
| 1.1 | **Dashboard Admin** | Uma tela com números: quantos sellers ativos, quantos fornecedores, pedidos de hoje, saldo total em crédito dos sellers, repasses pendentes. Alertas (estoque baixo, SLA atrasado). |
| 1.2 | **Módulo Sellers** | Lista de sellers (nome, CNPJ, saldo, status). Cadastrar novo seller, editar, bloquear. Na ficha do seller: ver extrato de saldo (créditos e débitos) e pedidos dele. Botão “Adicionar crédito” (valor que entra no saldo dele). |
| 1.3 | **Ajustar Fornecedores** | Além do que já existe (empresas + catálogo): dados bancários do fornecedor (para repasse), SLA de postagem em dias, janela de validação. Ficha do fornecedor com repasses pendentes e pedidos atendidos. |
| 1.4 | **Módulo Pedidos** | Lista de pedidos (quem vendeu, qual fornecedor, valor, status). Detalhe do pedido com timeline (recebido → postado → entregue → validado → repasse). Por enquanto: cadastro manual ou importação; integração com Bring/Tiny pode vir depois. |

**Resultado da Fase 1:** Um admin consegue controlar sellers, fornecedores, catálogo e pedidos por uma interface única, com números e alertas no dashboard.

---

## Fase 2 — Como as pessoas pagam e recebem

Objetivo: definir e implementar o fluxo de dinheiro (sem precisar entender código).

| # | O que fazer | O que você terá |
|---|-------------|-----------------|
| 2.1 | **Recarga de crédito (Seller)** | Seller (ou admin em nome dele) consegue “adicionar crédito” ao saldo. Opções: (A) Admin registra manualmente (“entrou R$ 500 por PIX”), ou (B) integração com gateway (PIX/boleto) para o seller pagar e o saldo subir automático. Começamos pelo (A) para o sistema ficar completo; (B) é evolução. |
| 2.2 | **Repasse ao fornecedor** | Quando o pedido está “validado”, o sistema mostra o valor a repassar ao fornecedor. Admin marca como “Liberado” e depois “Pago”. Opções: (A) só registro manual (admin confirma que transferiu), ou (B) integração com API bancária/pagamento. Começamos pelo (A). |
| 2.3 | **Regras de débito no seller** | Ao marcar pedido como “Entregue” ou “Validado”, o sistema debita do saldo do seller o valor do pedido (custo DropCore). Se o saldo não der, bloquear ou alertar. |

**Resultado da Fase 2:** O dinheiro “flui” no sistema: seller tem saldo, pedido debita, fornecedor tem repasse liberado/pago. Tudo rastreável.

---

## Fase 3 — Portal do Seller

Objetivo: o seller entra com login e vê só o que é dele.

| # | O que fazer | O que você terá |
|---|-------------|-----------------|
| 3.1 | **Login e perfil Seller** | Tipo de usuário “seller” (já existe a ideia de org/perfil). Seller loga e cai no dashboard dele. |
| 3.2 | **Dashboard do Seller** | Saldo atual, saldo bloqueado, últimos pedidos, link para pedir crédito (ou instruções de pagamento). Avisos (saldo baixo, pedido atrasado). |
| 3.3 | **Catálogo que o seller pode usar** | Ver catálogo dos fornecedores aos quais ele está habilitado (só leitura), com preço/custo que ele paga (custo DropCore), para anunciar no marketplace. |
| 3.4 | **Seus pedidos** | Lista e detalhe dos pedidos do seller, com status (recebido, postado, entregue, etc.). |

**Resultado da Fase 3:** O seller não depende 100% do admin: ele vê saldo, pedidos e catálogo.

---

## Fase 4 — Portal do Fornecedor

Objetivo: o fornecedor entra com login e vê só o que é dele.

| # | O que fazer | O que você terá |
|---|-------------|-----------------|
| 4.1 | **Login e perfil Fornecedor** | Tipo de usuário “fornecedor”. Fornecedor loga e cai no dashboard dele. |
| 4.2 | **Dashboard do Fornecedor** | Resumo: pedidos recebidos (a atender), repasses pendentes, alertas de estoque baixo. |
| 4.3 | **Seu catálogo** | Ver e editar os próprios SKUs (estoque, preço base, etc.), como hoje no admin mas restrito ao fornecedor. |
| 4.4 | **Pedidos para ele** | Lista de pedidos que esse fornecedor deve atender, com status. Marcar como “Postado” (e colocar tracking se tiver). |
| 4.5 | **Repasses** | Ver repasses: travado, liberado, pago. Dados bancários para receber. |

**Resultado da Fase 4:** O fornecedor gerencia catálogo, vê pedidos e repasses sem precisar do admin para tudo.

---

## Fase 5 — Polish e produção

| # | O que fazer | O que você terá |
|---|-------------|-----------------|
| 5.1 | **Tratamento de erros** | Mensagens claras quando algo falha (sessão expirada, sem permissão, dados inválidos). |
| 5.2 | **Deploy** | Sistema rodando na internet (ex.: Vercel + Supabase), com domínio e HTTPS. |
| 5.3 | **Documentação** | Um guia simples: como fazer login, o que cada perfil vê, como cadastrar seller/fornecedor, como registrar pedido e repasse. |
| 5.4 | **Relatórios básicos** | Exportar lista de pedidos, extrato de seller, repasses por período (CSV/Excel). |

**Resultado da Fase 5:** Sistema estável, no ar e com instruções para uso.

---

## Ordem sugerida (resumo)

1. **Fase 1** — Admin completo (dashboard + sellers + fornecedores ajustado + pedidos)  
2. **Fase 2** — Pagamentos e repasses (regras de saldo, crédito, repasse)  
3. **Fase 3** — Portal do Seller  
4. **Fase 4** — Portal do Fornecedor  
5. **Fase 5** — Polish e produção  

Assim o sistema fica **completo** no sentido: admin controla tudo, dinheiro flui certo, seller e fornecedor têm seu espaço.

---

## Como a gente trabalha daqui pra frente

- Você não precisa programar. Pode dizer, por exemplo: “bora fazer a Fase 1” ou “quero primeiro o dashboard admin”.
- Eu implemento em partes. A cada parte eu digo o que foi feito e o que você pode testar.
- Se algo não ficar claro ou você quiser mudar a ordem (ex.: “quero portal do fornecedor antes do seller”), a gente ajusta o plano.

Quando quiser começar, diga por onde prefere: **Fase 1 inteira** ou **só o item 1.1 (Dashboard Admin)** para eu já ir implementando.
