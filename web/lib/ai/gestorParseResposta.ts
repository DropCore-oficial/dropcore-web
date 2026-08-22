/**
 * Extrai o JSON estruturado (ou erro) de uma resposta da Anthropic — mesma lógica pro
 * resultado de Batch (gestorBatchResultado.ts) e pra chamada síncrona (botão "rodar agora").
 */
import type Anthropic from "@anthropic-ai/sdk";

export function parseGestorResposta(message: Anthropic.Message): {
  resultado: unknown;
  erroMensagem: string | null;
} {
  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    return {
      resultado: null,
      erroMensagem: `Resposta do modelo sem bloco de texto (stop_reason: ${message.stop_reason ?? "?"}).`,
    };
  }
  try {
    return { resultado: JSON.parse(textBlock.text), erroMensagem: null };
  } catch {
    return { resultado: null, erroMensagem: "Resposta do modelo não veio em JSON válido." };
  }
}
