"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import {
  buildFornecedorEstoqueExportCsv,
  buildFornecedorEstoqueTemplateCsv,
  fornecedorEstoqueRowsFromPlanilhaMatrix,
  parseFornecedorEstoqueCsv,
  type FornecedorEstoqueExportItem,
} from "@/lib/fornecedorEstoqueImport";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type ImportResult = {
  updated: number;
  unchanged: number;
  skipped_unknown: number;
  unknown_skus?: string[];
  total: number;
  mensagem?: string;
};

export type FornecedorImportEstoquePanelHandle = {
  baixarModelo: () => void;
  exportarParaEditar: () => void;
  pickFile: () => void;
};

type Props = {
  produtos: FornecedorEstoqueExportItem[];
  onImported: () => void | Promise<void>;
};

function downloadCsv(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Sem UI própria de botões — os gatilhos ficam no menu ⋮ da página (mesmo padrão de
 * `FotoVariacaoCellHandle`: menu externo + ref). Só renderiza o input de arquivo (oculto)
 * e o painel de preview/resultado da importação.
 */
export const FornecedorImportEstoquePanel = forwardRef<FornecedorImportEstoquePanelHandle, Props>(
  function FornecedorImportEstoquePanel({ produtos, onImported }, ref) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [importRows, setImportRows] = useState<Record<string, unknown>[] | null>(null);
    const [importLoading, setImportLoading] = useState(false);
    const [importError, setImportError] = useState<string | null>(null);
    const [importResult, setImportResult] = useState<ImportResult | null>(null);

    useImperativeHandle(ref, () => ({
      baixarModelo: () => {
        downloadCsv(
          `modelo-estoque-${new Date().toISOString().slice(0, 10)}.csv`,
          buildFornecedorEstoqueTemplateCsv()
        );
      },
      exportarParaEditar: () => {
        if (produtos.length === 0) return;
        downloadCsv(
          `estoque-atual-${new Date().toISOString().slice(0, 10)}.csv`,
          buildFornecedorEstoqueExportCsv(produtos)
        );
      },
      pickFile: () => {
        setImportError(null);
        setImportResult(null);
        fileInputRef.current?.click();
      },
    }));

    async function confirmImport() {
      if (!importRows?.length) return;
      setImportLoading(true);
      setImportError(null);
      try {
        const {
          data: { session },
        } = await supabaseBrowser.auth.getSession();
        if (!session?.access_token) {
          setImportError("Sessão expirada. Atualize a página e faça login novamente.");
          return;
        }
        const res = await fetch("/api/fornecedor/produtos/import-estoque", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ rows: importRows }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Erro na importação.");
        setImportResult({
          updated: json.updated ?? 0,
          unchanged: json.unchanged ?? 0,
          skipped_unknown: json.skipped_unknown ?? 0,
          unknown_skus: json.unknown_skus,
          total: json.total ?? importRows.length,
          mensagem: json.mensagem,
        });
        if ((json.updated ?? 0) > 0) await onImported();
      } catch (e: unknown) {
        setImportError(e instanceof Error ? e.message : "Erro na importação.");
      } finally {
        setImportLoading(false);
      }
    }

    return (
      <>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (!file) return;
            setImportResult(null);
            setImportError(null);

            const isXlsx =
              file.name.trim().toLowerCase().endsWith(".xlsx") ||
              file.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

            if (isXlsx) {
              void (async () => {
                try {
                  const { readFirstSheetMatrix } = await import("@/lib/xlsxLite");
                  const matrix = await readFirstSheetMatrix(file);
                  const rows = fornecedorEstoqueRowsFromPlanilhaMatrix(matrix);
                  if (rows.length === 0) {
                    setImportError("Arquivo vazio ou sem linhas válidas (verifique a coluna SKU).");
                    setImportRows(null);
                    return;
                  }
                  setImportRows(rows);
                } catch {
                  setImportError("Não foi possível ler essa planilha .xlsx. Confira se o arquivo não está corrompido.");
                  setImportRows(null);
                }
              })();
              return;
            }

            const reader = new FileReader();
            reader.onload = () => {
              const text = String(reader.result ?? "");
              const rows = parseFornecedorEstoqueCsv(text);
              if (rows.length === 0) {
                setImportError("Arquivo vazio ou sem linhas válidas (verifique cabeçalho SKU).");
                setImportRows(null);
                return;
              }
              setImportRows(rows);
            };
            reader.readAsText(file, "utf-8");
          }}
        />

        {importRows != null && (
          <div className="mx-3 mb-3 mt-3 rounded-lg border border-[var(--card-border)] bg-[var(--background)]/60 p-3 space-y-2 sm:mx-4">
            {importResult ? (
              <>
                <p className="text-sm text-[var(--foreground)]">
                  {importResult.mensagem ?? "Importação concluída."}{" "}
                  <span className="text-[var(--muted)]">
                    ({importResult.updated} atualizados
                    {importResult.unchanged > 0 ? `, ${importResult.unchanged} já iguais` : ""}
                    {importResult.skipped_unknown > 0 ? `, ${importResult.skipped_unknown} SKU(s) desconhecido(s)` : ""})
                  </span>
                </p>
                {importResult.unknown_skus && importResult.unknown_skus.length > 0 && (
                  <p className="text-xs text-[var(--muted)] break-all">
                    SKUs não encontrados (amostra): {importResult.unknown_skus.join(", ")}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setImportRows(null);
                    setImportResult(null);
                  }}
                  className="text-xs font-semibold text-emerald-600 hover:underline dark:text-emerald-400"
                >
                  Fechar
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-[var(--foreground)]">
                  <strong>{importRows.length}</strong> linha(s) prontas para importar.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={importLoading}
                    onClick={() => void confirmImport()}
                    className="rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {importLoading ? "Importando…" : "Confirmar importação"}
                  </button>
                  <button
                    type="button"
                    disabled={importLoading}
                    onClick={() => setImportRows(null)}
                    className="rounded-md border border-[var(--card-border)] px-3 py-1.5 text-xs font-semibold text-[var(--muted)] hover:bg-[var(--muted)]/10"
                  >
                    Cancelar
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {importError && (
          <p className="w-full text-xs text-red-600 dark:text-red-400">{importError}</p>
        )}
      </>
    );
  }
);
