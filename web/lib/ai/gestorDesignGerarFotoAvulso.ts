/**
 * Geração de foto nova do Design (Laura V2) pro assinante avulso — diferente do diagnóstico
 * (`gestorDesignFotoAvulso.ts`, Anthropic, grátis), isso usa Gemini (`gemini-3-pro-image-preview`,
 * "Nano Banana Pro") e exige BYOK do próprio assinante — sem fallback da casa, decisão
 * 2026-10-26 (geração de imagem custa muito mais por chamada que diagnóstico de texto, não
 * cabe no mesmo teto de R$4/dia).
 *
 * Edição com referência (manda a foto ruim real + o motivo do diagnóstico como instrução),
 * nunca geração do zero — mantém fidelidade ao produto real do seller.
 */
import { GoogleGenAI } from "@google/genai";
import { baixarFotoComoBase64 } from "./gestorDesignFotoAvulso";

export type ResultadoGeracaoFotoAvulso = {
  mimeType: string;
  data: string;
};

/** `null` quando a chamada falha (chave inválida, foto original não baixa, resposta sem
 * imagem) — quem chama decide a mensagem de erro pro seller. */
export async function gerarFotoProdutoAvulso(
  fotoOriginalUrl: string,
  motivoDiagnostico: string,
  apiKey: string
): Promise<ResultadoGeracaoFotoAvulso | null> {
  const fotoOriginal = await baixarFotoComoBase64(fotoOriginalUrl);
  if (!fotoOriginal) return null;

  const client = new GoogleGenAI({ apiKey });
  try {
    const interaction = await client.interactions.create({
      model: "gemini-3-pro-image-preview",
      input: [
        { type: "image", data: fotoOriginal.data, mime_type: fotoOriginal.mediaType },
        {
          type: "text",
          text:
            "Essa é a foto de capa real de um produto de e-commerce. Um especialista em fotografia de produto " +
            `encontrou o seguinte problema nela: "${motivoDiagnostico}". Gere uma versão corrigida dessa MESMA ` +
            "foto, resolvendo especificamente esse problema — mantenha o produto real (cor, formato, material, " +
            "detalhes) idêntico ao da foto original, sem inventar um produto diferente. Não adicione texto, " +
            "marca d'água ou logotipo na imagem.",
        },
      ],
      response_modalities: ["image"],
    });

    const imagem = interaction.output_image;
    if (!imagem?.data || !imagem.mime_type) return null;

    return { mimeType: imagem.mime_type, data: imagem.data };
  } catch (e) {
    console.error("[gestorDesignGerarFotoAvulso] geração de foto falhou", e);
    return null;
  }
}
