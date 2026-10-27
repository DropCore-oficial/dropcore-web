-- Fase C (final) do plano "Desmembrar Calculadora x Gestores de IA avulso x HUB" — dropa de
-- calculadora_assinantes as colunas que já migraram pras tabelas novas
-- (calculadora_assinante_plano_calculadora / calculadora_assinante_plano_gestores_ia) na
-- Fase A/B. Só roda depois do checklist de código (grep) zerado — conferido 2026-10-27.
-- IRREVERSÍVEL: sem staging, sem backup automático dessas colunas depois do drop.

alter table public.calculadora_assinantes
  drop column mp_renovacao_pendente_id,
  drop column mp_renovacao_ultimo_aprovado_id,
  drop column gestores_custo_mes,
  drop column gestores_limite_mes,
  drop column gestores_mes_ref,
  drop column anthropic_api_key_encriptada,
  drop column anthropic_api_key_configurada_em,
  drop column gemini_api_key_encriptada,
  drop column gestores_ia_desconto_tipo,
  drop column gestores_ia_desconto_valor,
  drop column gestores_ia_ciclo,
  drop column mp_gestores_ia_pendente_id,
  drop column mp_gestores_ia_ultimo_aprovado_id,
  drop column gestores_ia_contrato_aceite_em;
