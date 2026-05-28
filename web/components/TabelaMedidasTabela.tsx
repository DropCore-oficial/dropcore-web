"use client";

import {
  chavesColunasTabelaMedidas,
  tamanhosOrdenadosTabelaMedidas,
  type TabelaMedidasPayload,
} from "@/lib/fornecedorTabelaMedidas";
import { getColunasTabelaMedidas, type TipoProduto } from "@/lib/tipoProduto";

type Props = {
  data: TabelaMedidasPayload;
  className?: string;
  tableClassName?: string;
};

export function TabelaMedidasTabela({ data, className, tableClassName }: Props) {
  const tipo = (data.tipo_produto ?? "generico") as TipoProduto;
  const colunas = getColunasTabelaMedidas(tipo);
  const medidas = data.medidas ?? {};
  const colKeys = chavesColunasTabelaMedidas(tipo, medidas);
  const tamanhos = tamanhosOrdenadosTabelaMedidas(medidas);

  return (
    <div className={className ?? "dropcore-scroll-x rounded-lg border border-card-border"}>
      <table className={tableClassName ?? "w-full min-w-[280px] border-collapse text-xs"}>
        <thead>
          <tr className="border-b border-card-border bg-background">
            <th className="px-3 py-2 text-left font-medium text-muted">Tamanho</th>
            {colKeys.map((col) => {
              const label = colunas.find((c) => c.key === col)?.label ?? `${col.replace(/_/g, " ")} (cm)`;
              return (
                <th key={col} className="px-3 py-2 text-left font-medium text-muted">
                  {label}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {tamanhos.map((tam) => {
            const row = medidas[tam] ?? {};
            return (
              <tr key={tam} className="border-b border-card-border">
                <td className="px-3 py-2 font-medium text-foreground">{tam}</td>
                {colKeys.map((col) => (
                  <td key={col} className="px-3 py-2 text-muted">
                    {Number.isFinite(row[col]) ? row[col] : "—"}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
