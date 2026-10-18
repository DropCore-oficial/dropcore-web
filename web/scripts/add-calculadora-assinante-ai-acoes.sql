-- Loop de aprendizado + métrica de valor do Gestor (avulso) — 2026-10-17. O avulso nunca
-- teve auditoria de "ação aplicada" (hub tem `seller_ai_acoes`; avulso só tinha o botão de
-- aplicar, sem gravar nada — ver comentário em gestorAnunciosSeoDadosAvulso.ts: "sem
-- comparação com ações aplicadas... avulso já tem botão de aplicar... só não tem tabela de
-- auditoria ainda"). Essa tabela é a base: o Gestor passa a consultar quantas sugestões
-- cada gestor teve aplicada de verdade (clique explícito, não estimativa), e os campos
-- valor_antes/valor_depois guardam o dado real de preço pra métrica de valor do ADS.

create table public.calculadora_assinante_ai_acoes (
  id uuid primary key default gen_random_uuid(),
  assinante_id uuid not null references public.calculadora_assinantes(id) on delete cascade,
  gestor text not null check (gestor in ('anuncios_seo', 'reputacao_atendimento', 'ads', 'estoque')),
  tipo_acao text not null,
  chave text,
  item_id text,
  valor_antes numeric,
  valor_depois numeric,
  criado_em timestamptz not null default now()
);
alter table public.calculadora_assinante_ai_acoes enable row level security;
revoke all on public.calculadora_assinante_ai_acoes from public, anon, authenticated;

create index idx_calculadora_assinante_ai_acoes_assinante_gestor
  on public.calculadora_assinante_ai_acoes (assinante_id, gestor, criado_em desc);

-- RPC de escrita — chamada pelas 6 rotas "aplicar-*" do avulso logo após a ação real no ML
-- dar certo (nunca antes, pra não contar ação que falhou).
create or replace function public.fn_calculadora_assinante_ai_acao_registrar(
  p_assinante_id uuid,
  p_gestor text,
  p_tipo_acao text,
  p_chave text default null,
  p_item_id text default null,
  p_valor_antes numeric default null,
  p_valor_depois numeric default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.calculadora_assinante_ai_acoes
    (assinante_id, gestor, tipo_acao, chave, item_id, valor_antes, valor_depois)
  values
    (p_assinante_id, p_gestor, p_tipo_acao, p_chave, p_item_id, p_valor_antes, p_valor_depois)
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.fn_calculadora_assinante_ai_acao_registrar from public;
revoke all on function public.fn_calculadora_assinante_ai_acao_registrar from anon;
revoke all on function public.fn_calculadora_assinante_ai_acao_registrar from authenticated;
grant execute on function public.fn_calculadora_assinante_ai_acao_registrar to service_role;

-- RPC de leitura — contagem real de ações aplicadas por gestor nos últimos N dias (padrão
-- 30). É o dado que alimenta o Gestor (B4, "quem aplica mais/menos sugestão") e a métrica
-- de valor calculável (B5).
create or replace function public.fn_calculadora_assinante_ai_acoes_resumo(
  p_assinante_id uuid,
  p_dias int default 30
) returns table (gestor text, qtd_acoes bigint)
language sql
security definer
set search_path = public
stable
as $$
  select gestor, count(*)::bigint as qtd_acoes
  from public.calculadora_assinante_ai_acoes
  where assinante_id = p_assinante_id
    and criado_em >= now() - (p_dias || ' days')::interval
  group by gestor;
$$;

revoke all on function public.fn_calculadora_assinante_ai_acoes_resumo from public;
revoke all on function public.fn_calculadora_assinante_ai_acoes_resumo from anon;
revoke all on function public.fn_calculadora_assinante_ai_acoes_resumo from authenticated;
grant execute on function public.fn_calculadora_assinante_ai_acoes_resumo to service_role;
