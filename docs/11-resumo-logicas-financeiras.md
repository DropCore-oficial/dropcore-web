# DropCore — Resumo das lógicas financeiras

Documento para entender o fluxo do dinheiro e as regras que implementamos.  
*(Complementa o 10-logicas-em-pratica.md.)*

---

## Visão geral do fluxo

```
Seller deposita (PIX) → Crédito no ledger → Saldo sobe
       ↓
Seller "vende" (Enviar pedido / bloqueio) → Débito no ledger (BLOQUEADO) → Saldo desce
       ↓
Marcar entregue (Adiantar) → Status ENTREGUE → Continua bloqueado (saldo não muda)
       ↓
Fechar repasse (segunda-feira) → Ledger vira PAGO → Valor NÃO volta ao seller
       ↓
Valores vão para: fornecedor (financial_repasse_fornecedor) + DropCore (financial_ciclos_repasse)
```

---

## 1. Crédito do seller (entrada de dinheiro)

| O quê | Como |
|-------|------|
| Seller paga via PIX | Depósito registrado como **pendente** em `seller_depositos_pix`. |
| Admin aprova | Status vira **aprovado** e é criado um registro no **ledger** com `tipo = CREDITO`, `valor_total = valor do depósito`. |
| Efeito no saldo | A função de saldo soma todos os CREDITO → **aumenta** o saldo disponível do seller. |

**Regra:** Crédito = dinheiro que o seller colocou na plataforma (passivo da DropCore).

---

## 2. Bloqueio na venda (saída do saldo do seller)

| O quê | Como |
|-------|------|
| Momento | Quando o pedido é "enviado" ao fornecedor (hoje: tela **Enviar pedido** para teste). |
| Cálculo | `valor_total = valor_fornecedor + valor_dropcore` (ex.: custo R$ 30 + taxa 15% R$ 4,50 = R$ 34,50). |
| Validação | Se `saldo_disponivel < valor_total` → erro **SALDO_INSUFICIENTE** (402). |
| Se OK | Cria registro no ledger: `tipo = BLOQUEIO`, `status = BLOQUEADO`, `ciclo_repasse = próxima segunda-feira`. |

**Efeito no saldo:** BLOQUEADO entra na soma de "bloqueios ativos" → **reduz** o saldo disponível do seller (o dinheiro fica "reservado" para aquele pedido).

---

## 3. Fórmula do saldo do seller (a lógica central)

O saldo **não** é guardado à mão: é **sempre calculado** a partir do ledger pela função `fn_seller_saldo_from_ledger`:

```
saldo_disponivel = CRÉDITOS - BLOQUEIOS_ATIVOS - JÁ_PAGOS + DEVOLUÇÕES
saldo_bloqueado  = BLOQUEIOS_ATIVOS
saldo_total      = saldo_disponivel + saldo_bloqueado
```

| Termo | O que entra |
|-------|-------------|
| **CRÉDITOS** | Soma de `valor_total` onde `tipo = CREDITO`. |
| **BLOQUEIOS_ATIVOS** | Soma de `valor_total` onde `tipo` em (BLOQUEIO, VENDA) e `status` em (BLOQUEADO, ENTREGUE, AGUARDANDO_REPASSE, EM_DEVOLUCAO). |
| **JÁ_PAGOS** | Soma de `valor_total` onde `tipo` em (BLOQUEIO, VENDA) e `status = PAGO`. *(Correção: PAGO = dinheiro que já saiu para fornecedor + DropCore, não volta ao seller.)* |
| **DEVOLUÇÕES** | Soma de `valor_total` onde `tipo = DEVOLUCAO` (créditos de ajuste/devolução, se houver). |

**Por que PAGO não volta ao seller:** Quando você fecha o repasse, o valor já "saiu" do seller (foi para fornecedor e DropCore). Por isso PAGO entra como **débito** na fórmula; sem isso, o saldo do seller subia de novo (bug que corrigimos com `fix-saldo-quando-pago.sql`).

---

## 4. Ciclo e repasse (quando o dinheiro "sai" de fato)

| Conceito | Explicação |
|----------|------------|
| **Ciclo** | Uma **segunda-feira**. Tudo que foi enviado/entregue na semana anterior é pago nessa segunda. |
| **ciclo_repasse** | No ledger, cada bloqueio tem uma segunda-feira; é a segunda em que aquele valor será repassado (calculada na hora do bloqueio: "próxima segunda"). |

**Fluxo ao fechar o repasse (tela Repasse ao fornecedor):**

1. Sistema busca no ledger todos os registros com **esse ciclo** e status **ENTREGUE** ou **AGUARDANDO_REPASSE**.
2. Subtrai os **débitos a descontar** (devolução pós-repasse) desse ciclo.
3. Marca esses registros do ledger como **PAGO**.
4. Grava em **financial_repasse_fornecedor** quanto cada fornecedor deve receber (valor_fornecedor).
5. Grava em **financial_ciclos_repasse** os totais do ciclo: **total_fornecedores** e **total_dropcore** (sua receita).

**Resultado:** O seller já tinha o saldo reduzido no bloqueio; ao virar PAGO, o valor **continua** como débito (não volta). O fornecedor passa a "ter a receber" na lista "A pagar aos fornecedores", e a DropCore soma esse ciclo em "Receita DropCore (sua)".

---

## 5. Devolução antes do repasse

| Etapa | Ação | Status no ledger | Saldo do seller |
|-------|------|-------------------|-----------------|
| 1 | Registrar devolução | **EM_DEVOLUCAO** | Continua bloqueado (não sobe). |
| 2 | Fornecedor conferiu | **DEVOLVIDO** | Valor **volta** ao disponível (sai da soma de bloqueios, não entra em PAGO). |

**Lógica:** EM_DEVOLUCAO ainda conta como "bloqueado". Só em DEVOLVIDO o valor deixa de ser débito e o seller recebe o dinheiro de volta.

---

## 6. Devolução após o repasse

| O quê | Como |
|-------|------|
| Quando | O cliente devolve **depois** que você já fechou o repasse (ledger já está PAGO). |
| Registro | Você registra em **Bloqueios e devoluções** → tabela "Devolução após o repasse" → **Registrar débito (próximo repasse)**. |
| Efeito | Cria registro em **financial_debito_descontar** com o valor (fornecedor + DropCore) e o **ciclo** em que será descontado. |
| No próximo fechamento | Ao fechar aquele ciclo, o repasse-semanal **subtrai** esses débitos dos totais (fornecedor e DropCore recebem menos naquele ciclo). |

**Resumo:** Você "desfaz" um repasse já pago descontando no próximo ciclo, em vez de devolver ao seller (que já tinha sido debitado no bloqueio original).

---

## 7. Onde cada dinheiro aparece

| Quem | Onde ver | O que é |
|-----|----------|---------|
| **Seller** | Admin → Sellers → saldo do seller | Saldo em conta (disponível + bloqueado), derivado do ledger. |
| **Fornecedor** | Dashboard → **Repasses pendentes** (clique) → **A pagar aos fornecedores** | Lista por fornecedor e ciclo: quanto você deve repassar a cada um (gerado ao fechar o repasse). |
| **Você (DropCore)** | Dashboard → card **Receita DropCore (sua)** | Soma dos `total_dropcore` de todos os ciclos fechados (sua taxa nos repasses). |

**Não confundir:**

- **Saldo em conta** = dinheiro dos **sellers** na plataforma (passivo).
- **Entrada no mês** = depósitos PIX **aprovados** no mês (crédito dos sellers).
- **Receita DropCore (sua)** = **sua** receita (taxa dos repasses já fechados).

---

## 8. Resumo em uma frase

O **ledger** é a fonte única: créditos entram, bloqueios saem (e podem virar PAGO ou DEVOLVIDO). O **saldo do seller** é sempre "créditos − bloqueios ativos − já pagos + devoluções". O **repasse** só muda status para PAGO e grava quanto vai para **fornecedor** e quanto para **DropCore**; o dinheiro do seller não volta quando vira PAGO.

---

## 9. RLS (segurança por linha)

O script `web/scripts/rls-financeiro.sql` define políticas de **Row Level Security** nas tabelas financeiras:

| Papel | O que vê |
|-------|----------|
| **owner/admin** | Tudo da org (ledger, ciclos, repasses, débitos, sellers, depósitos PIX). |
| **seller** | Só seus próprios dados (quando `org_members.seller_id` está preenchido). |
| **fornecedor** | Só seus próprios valores (quando `org_members.fornecedor_id` está preenchido). |

**Observação:** As APIs usam **service role**, então o RLS é ignorado no backend. As políticas protegem acesso direto ao Supabase com chave anon/authenticated (ex.: portal seller/fornecedor futuro).

Para vincular um usuário a um seller ou fornecedor:  
`UPDATE org_members SET seller_id = '...' WHERE user_id = '...' AND org_id = '...';`  
`UPDATE org_members SET fornecedor_id = '...' WHERE user_id = '...' AND org_id = '...';`

---

*Se algo não bater com o que você vê na tela ou no banco, podemos ajustar esse doc ou o código.*
