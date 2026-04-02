# SKU Padrão — DropCore

## Objetivo do Padrão

O padrão oficial de SKU do DropCore (V1) foi criado para garantir **padronização absoluta, escalabilidade operacional** e **eliminar a necessidade de mapeamentos manuais** entre sellers, fornecedores e sistemas ERP, facilitando toda a cadeia de integração e automação.

## Estrutura do SKU Padrão

### 1. Prefixo por Fornecedor

Cada fornecedor é identificado por um prefixo único de três letras (por exemplo: `DJU`, `LAR`). Esse prefixo assegura que não haja conflito entre SKUs da base DropCore, mesmo quando fornecedores diferentes comercializem produtos semelhantes.

- Exemplo:  
  - Fornecedor “Lar Doce Lar” → Prefixo: `LAR`
  - Fornecedor “Distribuidora Juá” → Prefixo: `DJU`

### 2. Organização por Blocos de Produto

Os produtos são organizados em **blocos numéricos de 100 em 100**. Cada bloco representa uma família ou categoria de produtos dentro daquele fornecedor.

- Exemplo:  
  - `LAR100` — Bloco dedicado à linha de travesseiros  
  - `LAR200` — Bloco exclusivo para kits de cama  
  - `DJU100` — Bloco para brinquedos educativos

### 3. SKU Pai e Variações

- **SKU Pai:** Sempre termina com `000`, reservado para representar o produto base (modelo ou família).  
  - Exemplo: `LAR100000` — SKU pai do travesseiro Soft Touch.

- **Variações:** Cada variação do produto utiliza uma sequência de `001` a `999`, numerada em ordem crescente. Assim, cada variação de cor, tamanho ou modelo recebe seu próprio SKU, sempre atrelado ao bloco do produto.

  - Exemplos:
    - `LAR100001` — Travesseiro Soft Touch, tamanho “P”.
    - `LAR100002` — Travesseiro Soft Touch, tamanho “M”.
    - `LAR100003` — Travesseiro Soft Touch, tamanho “G”.

### 4. Uso Idêntico pelo Seller

**O seller deve obrigatoriamente utilizar o exato SKU definido pelo fornecedor.**  
Ou seja, o campo `supplier_sku` (SKU do fornecedor cadastrado na plataforma) deve ser rigorosamente o mesmo no sistema do seller/ERP (por exemplo: campo `seller_tiny_sku` no Tiny ERP).

- **Proibido:** Criar ou cadastrar SKUs próprios, alternativos ou mapeamentos personalizados fora do padrão DropCore.

### 5. Benefícios Operacionais e Sistêmicos

- **Integridade dos Dados:** Reduzindo riscos de erros na operação, especialmente ao integrar múltiplos players.
- **Escalabilidade:** Permite onboarding rápido de novos sellers e fornecedores sem etapas de conciliação manual.
- **Automação:** Facilita automação de integrações e elimina divergências de estoque, pedido, entrega e faturamento.
- **Transparência:** Todos os participantes enxergam os mesmos SKUs, simplificando o suporte e auditoria.
- **Compliance:** Garante rastreabilidade de produto e atendimento às exigências do DropCore.

---

## Resumo Visual (Exemplo Prático)

| Fornecedor | Bloco | SKU Pai      | Variação        | Exemplo SKU   |
|------------|-------|--------------|-----------------|--------------|
| LAR        | 100   | LAR100000    | Tamanho P       | LAR100001    |
| LAR        | 100   | LAR100000    | Tamanho M       | LAR100002    |
| LAR        | 200   | LAR200000    | Cor Azul        | LAR200001    |
| DJU        | 100   | DJU100000    | Kit 3 Peças     | DJU100001    |

**Atenção:** Qualquer descumprimento ao padrão poderá bloquear integrações e operações do seller ou fornecedor na plataforma.

---

Para dúvidas adicionais, consulte a equipe DropCore para orientações sobre alocação de blocos e registro de SKUs.