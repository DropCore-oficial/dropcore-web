"use client";

import { useState } from "react";

/** Botão "copiar" genérico dos gestores de IA — usado sempre que a sugestão não pode (ou
 * ainda não pode) ser aplicada de verdade via API, e o seller cola manual em outro lugar
 * (app do Mercado Livre hoje; qualquer gestor futuro pode reaproveitar). */
export function CopiarSugestaoBotao({
  texto,
  rotulo = "Copiar sugestão",
  mensagemCopiado = "Copiado — cole no app do Mercado Livre.",
}: {
  texto: string;
  rotulo?: string;
  mensagemCopiado?: string;
}) {
  const [copiado, setCopiado] = useState(false);

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void copiar()}
        className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
      >
        {rotulo}
      </button>
      {copiado ? <p className="text-xs text-[var(--muted)]">{mensagemCopiado}</p> : null}
    </div>
  );
}
