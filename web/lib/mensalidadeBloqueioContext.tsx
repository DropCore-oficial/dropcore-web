"use client";

import { createContext, useContext } from "react";

export type MensalidadeBloqueioContextValue = {
  /** Painel bloqueado por mensalidade (trial inativo + vencida/inadimplente). */
  portalBloqueado: boolean;
  /** Primeira verificação de mensalidade ainda em andamento. */
  verificando: boolean;
};

export const MensalidadeBloqueioContext = createContext<MensalidadeBloqueioContextValue>({
  portalBloqueado: false,
  /** true por padrão: páginas não disparam APIs pesadas antes do gate concluir. */
  verificando: true,
});

export function useMensalidadeBloqueio() {
  return useContext(MensalidadeBloqueioContext);
}
