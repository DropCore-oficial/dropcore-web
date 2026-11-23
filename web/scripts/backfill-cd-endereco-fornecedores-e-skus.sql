-- Backfill 2026-11-21: corrige endereço de despacho desatualizado/inconsistente em
-- fornecedores já com opera_no_cd=true (LARAUNA estava com Sala 08 / CEP 408 errados,
-- herdados de antes do CD existir) e nos overrides por SKU (expedicao_override_linha +
-- detalhes_produto_json.logistica), que tinham prioridade sobre o endereço do fornecedor
-- na geração real da etiqueta e estavam inconsistentes entre si (Sala 07 vs 08, CEP 423 vs
-- 408, número "1095" inventado vs S/N real).
--
-- Endereço oficial: o mesmo já usado e correto na DJULIOS (validado operacionalmente antes
-- desta sessão) — RUA MANDAGUARI, S/N, QUADRA 36 LOTE 10 SALA 07, SETOR JARDIM MARISTA,
-- CEP 75383-423, TRINDADE/GO.
--
-- Estratégia: fornecedor-level vira a fonte única (expedicao_*); override por SKU é
-- limpo (NULL) para sempre cair no fallback do fornecedor — elimina duplicação que causa
-- divergência futura. O bloco `logistica` em detalhes_produto_json é só espelho pro painel
-- "Qualidade dos dados do produto" (não é consultado pela geração real de etiqueta).

UPDATE public.fornecedores
SET
  expedicao_logradouro = 'RUA MANDAGUARI',
  expedicao_numero = 'S/N',
  expedicao_complemento = 'QUADRA 36 LOTE 10 SALA 07',
  expedicao_bairro = 'SETOR JARDIM MARISTA',
  expedicao_cidade = 'TRINDADE',
  expedicao_uf = 'GO',
  expedicao_cep = '75383423',
  expedicao_padrao_linha = 'RUA MANDAGUARI, S/N · QUADRA 36 LOTE 10 SALA 07 · SETOR JARDIM MARISTA · CEP 75383-423 · TRINDADE/GO'
WHERE opera_no_cd = true;

UPDATE public.skus s
SET
  expedicao_override_linha = NULL,
  detalhes_produto_json = jsonb_set(
    coalesce(s.detalhes_produto_json, '{}'::jsonb),
    '{logistica}',
    coalesce(s.detalhes_produto_json->'logistica', '{}'::jsonb) || jsonb_build_object(
      'cdUsarDespachoCadastro', true,
      'cdSaida', 'RUA MANDAGUARI, S/N · QUADRA 36 LOTE 10 SALA 07 · SETOR JARDIM MARISTA · CEP 75383-423 · TRINDADE/GO',
      'cdSaidaCep', '75383423',
      'cdSaidaLogradouro', 'RUA MANDAGUARI',
      'cdSaidaNumero', 'S/N',
      'cdSaidaComplemento', 'QUADRA 36 LOTE 10 SALA 07',
      'cdSaidaBairro', 'SETOR JARDIM MARISTA',
      'cdSaidaCidade', 'TRINDADE',
      'cdSaidaUf', 'GO'
    ),
    true
  )
FROM public.fornecedores f
WHERE s.fornecedor_id = f.id AND f.opera_no_cd = true;
