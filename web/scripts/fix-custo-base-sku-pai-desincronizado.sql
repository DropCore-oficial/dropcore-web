-- Corrige custo_base de 3 SKUs "pai" (sufixo 000) que ficaram desatualizados em relação
-- aos filhos (variantes) do mesmo prefixo — achado em 2026-11-11 ao investigar por que a
-- calculadora do seller listava o mesmo produto várias vezes.
--
-- A partir de agora o fluxo de edição de variantes (app/fornecedor/produtos/criar-variantes)
-- sincroniza o custo do pai automaticamente a cada salvamento; este script é só o ajuste
-- pontual dos 4 registros já identificados como divergentes antes dessa correção existir.
--
-- DJU004000 e CON001000 e DIE001000: custo do pai != custo uniforme dos filhos -> corrige.
-- DIS001000: custo já batia com os filhos (só o nome diverge, que é dado do fornecedor e
-- não deve ser alterado aqui) -> não precisa de UPDATE.

update public.skus
set custo_base = 30
where sku = 'DJU004000' and custo_base is distinct from 30;

update public.skus
set custo_base = 35
where sku = 'CON001000' and custo_base is distinct from 35;

update public.skus
set custo_base = 28.98
where sku = 'DIE001000' and custo_base is distinct from 28.98;
