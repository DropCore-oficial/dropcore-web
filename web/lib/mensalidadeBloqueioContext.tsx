"use client";

import { createContext, useContext } from "react";

export type MensalidadePortalItem = {
  id: string;
  ciclo: string;
  valor: number;
  status: string;
  vencimento_em: string | null;
  vencido: boolean;
};

export type MensalidadeBloqueioContextValue = {
  /** Painel bloqueado por mensalidade (trial inativo + vencida/inadimplente). */
  portalBloqueado: boolean;
  /** Primeira verificação de mensalidade ainda em andamento. */
  verificando: boolean;
  mensalidades: MensalidadePortalItem[];
  trialAtivo: boolean;
  trialValidoAte: string | null;
};

export const MensalidadeBloqueioContext = createContext<MensalidadeBloqueioContextValue>({
  portalBloqueado: false,
  /** true por padrão: páginas não disparam APIs pesadas antes do gate concluir. */
  verificando: true,
  mensalidades: [],
  trialAtivo: false,
  trialValidoAte: null,
});

export function useMensalidadeBloqueio() {
  return useContext(MensalidadeBloqueioContext);
}
