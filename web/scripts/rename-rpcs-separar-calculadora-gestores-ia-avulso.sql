-- Renomeia toda RPC do avulso pro prefixo do produto de verdade (fn_gestores_ia_avulso_* ou
-- fn_calculadora_avulso_*) em vez do genérico fn_calculadora_assinante_* que não dizia qual
-- dos dois produtos era dono da função — pedido explícito do Sr Stark, 2026-10-26: "Calculadora
-- avulso é uma coisa. Gestor avulso é outra. Quero nome separados... não quero nada usando uma
-- coisa pra outra". ALTER FUNCTION RENAME preserva corpo/grants automaticamente — não precisa
-- recriar nada.
--
-- Ficam com o prefixo neutro de propósito (núcleo realmente compartilhado pelos 2 produtos,
-- não renomeado): fn_calculadora_assinante_logo_get/_set (decisão 2 do plano — logo é visível
-- nos dois), fn_calculadora_assinante_planos_rows_ensure (trigger interno, mexe nas 2 tabelas
-- igualmente), fn_calculadora_recebimentos_totais (ledger financeiro dos 2 produtos juntos).

alter function public.fn_calculadora_assinante_ai_acao_registrar(uuid, text, text, text, text, numeric, numeric) rename to fn_gestores_ia_avulso_ai_acao_registrar;
alter function public.fn_calculadora_assinante_ai_acoes_resumo(uuid, integer) rename to fn_gestores_ia_avulso_ai_acoes_resumo;
alter function public.fn_calculadora_assinante_ai_chat_criar_sessao(uuid) rename to fn_gestores_ia_avulso_ai_chat_criar_sessao;
alter function public.fn_calculadora_assinante_ai_chat_gravar_mensagem(uuid, text, text, integer, integer) rename to fn_gestores_ia_avulso_ai_chat_gravar_mensagem;
alter function public.fn_calculadora_assinante_ai_chat_historico(uuid, uuid) rename to fn_gestores_ia_avulso_ai_chat_historico;
alter function public.fn_calculadora_assinante_ai_run_insert(uuid, text, text, jsonb, text) rename to fn_gestores_ia_avulso_ai_run_insert;
alter function public.fn_calculadora_assinante_ai_runs_recentes(uuid, text, integer) rename to fn_gestores_ia_avulso_ai_runs_recentes;
alter function public.fn_calculadora_assinante_byok_configurado(uuid) rename to fn_gestores_ia_avulso_byok_anthropic_configurado;
alter function public.fn_calculadora_assinante_byok_delete(uuid) rename to fn_gestores_ia_avulso_byok_anthropic_delete;
alter function public.fn_calculadora_assinante_byok_upsert(uuid, text) rename to fn_gestores_ia_avulso_byok_anthropic_upsert;
alter function public.fn_calculadora_assinante_byok_gemini_configurado(uuid) rename to fn_gestores_ia_avulso_byok_gemini_configurado;
alter function public.fn_calculadora_assinante_byok_gemini_delete(uuid) rename to fn_gestores_ia_avulso_byok_gemini_delete;
alter function public.fn_calculadora_assinante_byok_gemini_get(uuid) rename to fn_gestores_ia_avulso_byok_gemini_get;
alter function public.fn_calculadora_assinante_byok_gemini_upsert(uuid, text) rename to fn_gestores_ia_avulso_byok_gemini_upsert;
alter function public.fn_calculadora_assinante_cadastro_get(uuid) rename to fn_gestores_ia_avulso_cadastro_get;
alter function public.fn_calculadora_assinante_cadastro_upsert(uuid, text, text, text, text, text, text, text, text, text, date) rename to fn_gestores_ia_avulso_cadastro_upsert;
alter function public.fn_calculadora_assinante_foto_gerada_insert(uuid, text, text) rename to fn_gestores_ia_avulso_foto_gerada_insert;
alter function public.fn_calculadora_assinante_fotos_geradas_list(uuid, text) rename to fn_gestores_ia_avulso_fotos_geradas_list;
alter function public.fn_calculadora_assinante_gestores_ia_contrato_anual_iniciar(uuid) rename to fn_gestores_ia_avulso_contrato_anual_iniciar;
alter function public.fn_calculadora_assinante_gestores_ia_desconto_set(uuid, text, numeric) rename to fn_gestores_ia_avulso_desconto_set;
alter function public.fn_calculadora_assinante_gestores_ia_pix_confirmar(uuid, timestamptz, text, text, numeric, timestamptz) rename to fn_gestores_ia_avulso_pix_confirmar;
alter function public.fn_calculadora_assinante_gestores_ia_pix_get(uuid) rename to fn_gestores_ia_avulso_pix_get;
alter function public.fn_calculadora_assinante_gestores_ia_pix_pendente_set(uuid, text) rename to fn_gestores_ia_avulso_pix_pendente_set;
alter function public.fn_calculadora_assinante_ml_status_get(uuid) rename to fn_gestores_ia_avulso_ml_status_get;
alter function public.fn_calculadora_assinante_plano_gestores_ia_get(uuid) rename to fn_gestores_ia_avulso_plano_get;
alter function public.fn_calculadora_assinante_por_user_id(uuid) rename to fn_gestores_ia_avulso_assinante_por_user_id;
alter function public.fn_calculadora_assinante_ulisses_custo_delete(uuid, text) rename to fn_gestores_ia_avulso_ulisses_custo_delete;
alter function public.fn_calculadora_assinante_ulisses_custo_upsert(uuid, text, numeric) rename to fn_gestores_ia_avulso_ulisses_custo_upsert;
alter function public.fn_calculadora_assinante_ulisses_custos_list(uuid) rename to fn_gestores_ia_avulso_ulisses_custos_list;
alter function public.fn_calculadora_assinante_ulisses_preferencias_get(uuid) rename to fn_gestores_ia_avulso_ulisses_preferencias_get;
alter function public.fn_calculadora_assinante_ulisses_preferencias_upsert(p_assinante_id uuid, p_margem_minima_pct numeric, p_margem_maxima_pct numeric, p_imposto_pct numeric, p_perda_pct numeric, p_ads_ativo boolean, p_ads_tacos_pct numeric, p_ads_teto_valor numeric, p_ads_teto_periodo text, p_afiliado_ativo boolean, p_afiliado_pct numeric, p_cupom_ativo boolean, p_cupom_pct numeric, p_embalagem_brl numeric, p_custo_full_brl numeric, p_devolucao_taxa_pct numeric, p_devolucao_custo_brl numeric, p_acos_alvo_pct numeric) rename to fn_gestores_ia_avulso_ulisses_preferencias_upsert;
alter function public.fn_calculadora_assinantes_gestores_ia_list(integer, integer) rename to fn_gestores_ia_avulso_assinantes_list;

alter function public.fn_calculadora_assinante_plano_calculadora_get(uuid) rename to fn_calculadora_avulso_plano_get;
