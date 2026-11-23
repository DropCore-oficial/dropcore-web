export const CD_BAIXA_MOTIVOS = [
  { value: "saida_cd_fornecedor_desligado", label: "Saída do CD — fornecedor desligado" },
  { value: "avaria_perda_dropcore", label: "Avaria/perda — responsabilidade DropCore" },
  { value: "defeito_fabrica_fornecedor", label: "Defeito de fábrica — responsabilidade fornecedor" },
] as const;

export function cdBaixaMotivoLabel(motivo: string | null | undefined): string {
  return CD_BAIXA_MOTIVOS.find((m) => m.value === motivo)?.label ?? motivo ?? "—";
}
