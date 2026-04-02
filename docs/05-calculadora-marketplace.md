# Calculadora Multi-Marketplace — DropCore

## Objetivo

A Calculadora Multi-Marketplace tem como objetivo simular o **lucro líquido** e a **margem (%) por produto** ao vender em diferentes marketplaces, considerando todas as variações de comissionamento, taxas, impostos e custos operacionais.

## Funcionalidades

- **Escolha do Marketplace:**  
  O usuário seleciona o canal desejado dentre as opções disponíveis: SHEIN, Shopee, Mercado Livre, TikTok Shop, entre outros.

- **Campos Editáveis pelo Usuário:**
  - **Preço de venda** do produto ao consumidor final (R$).
  - **Comissão do marketplace (%)** — percentual descontado pela plataforma de venda.
  - **Taxa fixa do marketplace (R$)** — quando aplicável (por venda/pedido).
  - **Imposto (%)** — permite simular diferentes alíquotas conforme regime tributário.
  - **Custos detalhados:**
    - **Custo do produto** (incluindo o valor do fornecedor + monetização DropCore embutida).
    - **Custo de fulfillment/logística** — envio, armazenagem, despacho, etc. (informe 0 se não houver).
    - **Outros custos** — campo livre para inserir qualquer despesa adicional por unidade vendida.

- **Base de Cálculo do Imposto:**
  - Opção para definir se o imposto será calculado:
    - Sobre o **valor total de venda** (preço público).
    - Sobre o **valor líquido recebido** (após descontos do marketplace).

- **Resultados Apresentados:**
  - **Lucro líquido por unidade**: valor absoluto (R$) obtido após todos os descontos e custos.
  - **Margem (%)**: percentual de lucro líquido em relação ao preço de venda.

- **Simulação de Volume:**
  - Cálculo automático para os seguintes lotes:
    - **1 unidade**
    - **100 unidades**
    - **500 unidades**
    - **1000 unidades**
  - Exibe os resultados de lucro total e margem média para cada volume.

## Observações Importantes

- Em marketplaces como **SHEIN**, as taxas de comissão e corretagem de frete já são **descontadas diretamente no repasse da plataforma ao seller**.
- **Esses valores não são debitados do saldo operacional do seller no DropCore** — ou seja, a calculadora deve considerar apenas o valor líquido efetivamente recebido pelo seller após as taxas do marketplace.
- Recomenda-se inserir corretamente o valor de custo do produto (incluindo a monetização DropCore embutida, conforme regra operacional), para obter um cálculo fiel da rentabilidade na plataforma.

---

**Exemplo de uso:**  
Simule diferentes cenários, alterando as taxas e custos conforme o marketplace escolhido, e saiba exatamente quanto irá lucrar (por unidade e por lote) ao operar integrado com o DropCore.