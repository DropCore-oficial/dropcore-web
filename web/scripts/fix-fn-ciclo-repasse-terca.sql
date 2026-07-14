-- Corrige a regra de pagamento do ciclo de repasse: passa de "próxima
-- segunda-feira" para "próxima terça-feira" (tudo vendido/postado de
-- segunda a sábado é pago na terça-feira da semana seguinte).
-- CREATE OR REPLACE preserva os GRANT/REVOKE existentes, mas NÃO preserva o
-- search_path aplicado via ALTER FUNCTION separado (fix-security-function-
-- hardening.sql) — por isso o ALTER abaixo reaplica explicitamente.

CREATE OR REPLACE FUNCTION public.fn_ciclo_repasse(data_evento timestamptz)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  d date := data_evento::date;
  dia_semana int;
  segunda_desta_semana date;
BEGIN
  dia_semana := extract(isodow from d); -- 1=segunda, 7=domingo
  segunda_desta_semana := d - (dia_semana - 1);
  RETURN segunda_desta_semana + 8; -- terça-feira da semana seguinte
END;
$$;

ALTER FUNCTION public.fn_ciclo_repasse(timestamptz) SET search_path = public;
