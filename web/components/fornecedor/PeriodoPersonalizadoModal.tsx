"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const DIAS_SEMANA = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const MESES = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatBr(dateStr: string): string {
  const [y, m, d] = dateStr.split("-");
  return `${d}/${m}/${y}`;
}

function gerarDiasDoMes(ano: number, mes: number): (Date | null)[] {
  const primeiroDia = new Date(ano, mes, 1);
  const offset = primeiroDia.getDay();
  const totalDias = new Date(ano, mes + 1, 0).getDate();
  const dias: (Date | null)[] = [];
  for (let i = 0; i < offset; i++) dias.push(null);
  for (let d = 1; d <= totalDias; d++) dias.push(new Date(ano, mes, d));
  return dias;
}

/** Popover de calendário (ancorado no botão que abre, não modal central) pra escolher
 * período (De/Até) na tela de Pedidos do fornecedor — clica no primeiro dia, depois no
 * último; clicar de novo começa uma seleção nova. */
export function PeriodoPersonalizadoModal({
  deInicial,
  ateInicial,
  onFechar,
  onAplicar,
}: {
  deInicial: string;
  ateInicial: string;
  onFechar: () => void;
  onAplicar: (de: string, ate: string) => void;
}) {
  const hoje = new Date();
  const base = deInicial ? new Date(`${deInicial}T00:00:00`) : hoje;
  const [mesVisivel, setMesVisivel] = useState({ ano: base.getFullYear(), mes: base.getMonth() });
  const [de, setDe] = useState(deInicial);
  const [ate, setAte] = useState(ateInicial);
  const painelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (painelRef.current && !painelRef.current.contains(e.target as Node)) {
        onFechar();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function mudarMes(delta: number) {
    const d = new Date(mesVisivel.ano, mesVisivel.mes + delta, 1);
    setMesVisivel({ ano: d.getFullYear(), mes: d.getMonth() });
  }

  function clicarDia(d: Date) {
    const str = toDateStr(d);
    if (!de || (de && ate)) {
      setDe(str);
      setAte("");
      return;
    }
    if (str < de) {
      setAte(de);
      setDe(str);
    } else {
      setAte(str);
    }
  }

  const dias = gerarDiasDoMes(mesVisivel.ano, mesVisivel.mes);

  return (
    <div
      ref={painelRef}
      className="absolute right-0 top-full z-30 mt-2 w-72 rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-3 shadow-lg"
    >
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => mudarMes(-1)}
          aria-label="Mês anterior"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--card-border)] text-[var(--foreground)] hover:bg-[var(--muted)]/10"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        </button>
        <p className="text-sm font-semibold text-[var(--foreground)]">{MESES[mesVisivel.mes]} {mesVisivel.ano}</p>
        <button
          type="button"
          onClick={() => mudarMes(1)}
          aria-label="Próximo mês"
          className="flex h-7 w-7 items-center justify-center rounded-md border border-[var(--card-border)] text-[var(--foreground)] hover:bg-[var(--muted)]/10"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-y-1 text-center text-[10px] font-semibold tracking-wide text-[var(--muted)]">
        {DIAS_SEMANA.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-y-1">
        {dias.map((d, i) => {
          if (!d) return <div key={`vazio-${i}`} />;
          const str = toDateStr(d);
          const isDe = str === de;
          const isAte = str === ate;
          const noIntervalo = Boolean(de && ate && str > de && str < ate);
          return (
            <div key={str} className="flex items-center justify-center py-0.5">
              <button
                type="button"
                onClick={() => clicarDia(d)}
                className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium transition-colors",
                  isDe || isAte
                    ? "bg-emerald-600 text-white"
                    : noIntervalo
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                      : "text-[var(--foreground)] hover:bg-[var(--muted)]/10"
                )}
              >
                {d.getDate()}
              </button>
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-[11px] text-[var(--muted)]">
        {de ? `De ${formatBr(de)}` : "Escolha a data inicial"}
        {ate ? ` até ${formatBr(ate)}` : de ? " — escolha a final (ou só essa)" : ""}
      </p>

      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => { setDe(""); setAte(""); }}
          className="rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
        >
          Limpar
        </button>
        <button
          type="button"
          disabled={!de}
          onClick={() => onAplicar(de, ate || de)}
          className="rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Aplicar
        </button>
      </div>
    </div>
  );
}
