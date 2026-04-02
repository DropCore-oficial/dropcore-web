# Escopo Fechado do MVP V1 — DropCore

**1. Entram no MVP**
- Gestão de Sellers: cadastro, edição, bloqueio, saldo inicial, exportação de dados.
- Gestão de Fornecedores: cadastro, edição, bloqueio, importação de catálogo.
- Catálogo/SKUs: cadastro, atualização, ativação/inativação, importação/exportação, edição rápida de estoque.
- Pedidos: criação, visualização, atualização de status, histórico financeiro e de penalidades.
- Importação e exportação via CSV (templaes padronizados, validação básica).
- Autenticação de administradores via Supabase Auth no Retool.
- Filtros, buscas e visualização de listas e detalhes (sellers, fornecedores, SKUs, pedidos).
- Regras básicas de relacionamento e validação (campos obrigatórios, unicidade, permissões).

**2. Não entram nesta fase**
- Portal ou automações para Sellers/Fornecedores (self-service), incluindo visualização/autonomia fora do painel.
- Integrações externas (ERPs, plataformas de e-commerce).
- Automatização de conciliações financeiras ou splits complexos.
- Notificações automáticas (email, push, etc).
- SLA configurável dinâmico, parametrizações avançadas.
- Relatórios analíticos avançados.

**3. Premissas Operacionais**
- Equipes adm utilizam o Retool como painel único.
- Dados tratados via Supabase; arquivos CSV tratados localmente e com validação simples.
- Políticas e regras de negócio podem ser ajustadas por meio do Retool ou tabelas auxiliares.

**4. Limitações do MVP**
- Sem automação de fluxos externos.
- Validações limitadas a regras essenciais.
- Experiência restrita a operação e controle manual.
- Performance e escalabilidade adequadas apenas para volume inicial.
- Ausência de integrações nativas com sistemas de terceiros.

**5. Riscos Conhecidos**
- Possível erro humano na importação/exportação de dados.
- Geração de cadastros inconsistentes por falhas no processo manual.
- Limitação de expansão rápida pela falta de automação e integrações.
- Eventuais falhas de permissionamento ou validação insuficiente.

**6. Critérios de Sucesso**
- Execução operacional eficiente dentro do fluxo previsto.
- Todos os dados centrais geridos em ambiente controlado.
- Rapid feedback das equipes de operação, com iteração rápida e correção de gargalos.
- Pronto para validação real com as áreas de negócio e expansão posterior.


