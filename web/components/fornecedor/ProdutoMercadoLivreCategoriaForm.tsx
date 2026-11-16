"use client";

/**
 * Aba "Mercado Livre" do cadastro de produto do fornecedor: escolhe a categoria do ML e
 * preenche os atributos obrigatórios daquela categoria — captura na origem (quem conhece o
 * produto de verdade) pra o seller depois publicar o anúncio com 1 clique, sem precisar
 * revisar nada. Pré-preenche atributo de lista fechada (ex. Cor) quando o texto livre do
 * cadastro (marca/cor/tamanho) já bate com uma opção real do ML.
 */
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { HelpBubble } from "@/components/HelpBubble";
import { melhorValorPermitidoMl, papelAtributoMl, papelResolvidoNaPublicacao } from "@/lib/mercadoLivreAtributoMatch";

const inputBase =
  "w-full rounded-lg border px-3 py-2.5 text-sm focus:outline-none focus:border-neutral-400 focus:ring-1 focus:ring-neutral-300 bg-white dark:bg-neutral-800 border-neutral-300 dark:border-neutral-600 text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500";

export type MercadoLivreAtributoValor = { id: string; valueName: string };

export type ProdutoMercadoLivreValue = {
  categoryId: string;
  categoryName: string;
  /** Sem prefixo do site (ex. "SHIRTS") — necessário pra criar guia de medidas na publicação quando a categoria exigir. */
  domainId: string;
  atributos: MercadoLivreAtributoValor[];
};

type CategoriaSugerida = { categoryId: string; categoryName: string; domainId: string; caminho: string };

type AtributoSchema = {
  id: string;
  name: string;
  required: boolean;
  valueType: string;
  valoresPermitidos: string[];
};

/** Associa o atributo do ML ao campo equivalente que o fornecedor já preencheu em outra
 * aba do cadastro — evita pedir de novo Marca/Modelo/Material só porque o nome do campo do
 * ML é diferente do nome usado no DropCore. Cor e Tamanho não entram aqui de propósito —
 * são por variante/SKU, resolvidos na hora da publicação (ver `mercadoLivreAtributoMatch.ts`). */
function campoJaCadastradoCorrespondente(
  attr: AtributoSchema,
  campos: { marca: string; modelo: string; material: string }
): string | null {
  const papel = papelAtributoMl(attr);
  if (papel === "marca" && campos.marca.trim()) return campos.marca.trim();
  if (papel === "modelo" && campos.modelo.trim()) return campos.modelo.trim();
  if (papel === "material" && campos.material.trim()) return campos.material.trim();
  return null;
}

/** Atributos da categoria que o cadastro do fornecedor realmente pede — exclui Cor/Tamanho (resolvidos na publicação, por SKU). */
function atributosPedidosNoCadastro<T extends { id: string; name: string }>(schema: T[]): T[] {
  return schema.filter((a) => !papelResolvidoNaPublicacao(papelAtributoMl(a)));
}

/** Atributos obrigatórios da categoria (excluindo Cor/Tamanho) que ainda não têm valor — usado pra bloquear o submit do cadastro. */
export function atributosMercadoLivreFaltando(
  value: ProdutoMercadoLivreValue | null,
  schema: { id: string; name: string; required: boolean }[]
): string[] {
  if (!value?.categoryId) return [];
  const preenchidos = new Set(value.atributos.filter((a) => a.valueName.trim()).map((a) => a.id));
  return atributosPedidosNoCadastro(schema)
    .filter((a) => a.required && !preenchidos.has(a.id))
    .map((a) => a.name);
}

export function ProdutoMercadoLivreCategoriaForm(props: {
  tituloBusca: string;
  marca: string;
  modelo: string;
  material: string;
  value: ProdutoMercadoLivreValue;
  onChange: (value: ProdutoMercadoLivreValue) => void;
  /** Dispara sempre que o schema de atributos da categoria é (re)carregado — quem usa o
   * componente guarda isso pra validar `atributosMercadoLivreFaltando` no submit do form,
   * já que o schema em si é metadado transitório do ML, não algo que o produto persiste. */
  onSchemaCarregado?: (schema: { id: string; name: string; required: boolean }[]) => void;
}) {
  const { value, onChange } = props;
  const [buscando, setBuscando] = useState(false);
  const [sugestoes, setSugestoes] = useState<CategoriaSugerida[]>([]);
  const [erroBusca, setErroBusca] = useState<string | null>(null);

  const [carregandoAtributos, setCarregandoAtributos] = useState(false);
  const [schema, setSchema] = useState<AtributoSchema[]>([]);
  const [erroAtributos, setErroAtributos] = useState<string | null>(null);
  const [helpAtributosOpen, setHelpAtributosOpen] = useState(false);

  async function authHeader(): Promise<Record<string, string>> {
    const { data: { session } } = await supabaseBrowser.auth.getSession();
    if (!session?.access_token) throw new Error("Sessão expirada.");
    return { Authorization: `Bearer ${session.access_token}` };
  }

  async function buscarCategorias() {
    const titulo = props.tituloBusca.trim();
    if (!titulo) return;
    setBuscando(true);
    setErroBusca(null);
    try {
      const headers = await authHeader();
      const res = await fetch(`/api/fornecedor/mercadolivre/sugerir-categoria?titulo=${encodeURIComponent(titulo)}`, {
        headers,
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as { categorias?: CategoriaSugerida[]; error?: string };
      if (!res.ok) throw new Error(j?.error ?? "Erro ao buscar categoria.");
      setSugestoes(j.categorias ?? []);
    } catch (e: unknown) {
      setErroBusca(e instanceof Error ? e.message : "Erro ao buscar categoria.");
    } finally {
      setBuscando(false);
    }
  }

  async function escolherCategoria(cat: CategoriaSugerida) {
    setErroAtributos(null);
    setCarregandoAtributos(true);
    try {
      const headers = await authHeader();
      const res = await fetch(`/api/fornecedor/mercadolivre/atributos-categoria?categoryId=${encodeURIComponent(cat.categoryId)}`, {
        headers,
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as { atributos?: AtributoSchema[]; error?: string };
      if (!res.ok) throw new Error(j?.error ?? "Erro ao buscar atributos da categoria.");
      const atribs = j.atributos ?? [];
      setSchema(atribs);
      props.onSchemaCarregado?.(atribs);

      const atributosPreenchidos: MercadoLivreAtributoValor[] = [];
      for (const a of atributosPedidosNoCadastro(atribs)) {
        const candidato = campoJaCadastradoCorrespondente(a, {
          marca: props.marca,
          modelo: props.modelo,
          material: props.material,
        });
        if (!candidato) continue;
        if (a.valueType === "list" && a.valoresPermitidos.length > 0) {
          // Lista fechada do ML — só preenche se o texto já cadastrado bater exato com uma
          // opção real; senão fica em aberto pro fornecedor escolher (não dá pra inventar
          // um valor que o ML não aceita).
          const match = melhorValorPermitidoMl(candidato, a.valoresPermitidos);
          if (match) atributosPreenchidos.push({ id: a.id, valueName: match });
        } else {
          // Texto livre (ex. Marca, Modelo, Material) — o ML aceita qualquer valor aqui
          // (confirmado em `mlAtualizarAtributos`), não precisa bater com lista nenhuma.
          atributosPreenchidos.push({ id: a.id, valueName: candidato });
        }
      }

      onChange({ categoryId: cat.categoryId, categoryName: cat.categoryName, domainId: cat.domainId, atributos: atributosPreenchidos });
    } catch (e: unknown) {
      setErroAtributos(e instanceof Error ? e.message : "Erro ao buscar atributos da categoria.");
    } finally {
      setCarregandoAtributos(false);
    }
  }

  function setValorAtributo(id: string, valueName: string) {
    const resto = value.atributos.filter((a) => a.id !== id);
    onChange({ ...value, atributos: valueName ? [...resto, { id, valueName }] : resto });
  }

  function trocarCategoria() {
    onChange({ categoryId: "", categoryName: "", domainId: "", atributos: [] });
    setSchema([]);
    props.onSchemaCarregado?.([]);
  }

  const faltando = atributosMercadoLivreFaltando(value, schema);
  const schemaVisivel = atributosPedidosNoCadastro(schema);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
        <p className="mb-3 text-sm text-[var(--muted)]">
          Escolha a categoria do Mercado Livre e preencha os atributos obrigatórios dela — é isso que deixa o seller
          publicar este produto como anúncio no Mercado Livre com 1 clique, sem precisar completar nada depois.
        </p>

        {!value.categoryId ? (
          <>
            <button
              type="button"
              onClick={buscarCategorias}
              disabled={buscando || !props.tituloBusca.trim()}
              className="w-full rounded-md bg-emerald-600 px-2.5 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-60 sm:w-auto"
            >
              {buscando ? "Buscando..." : "Buscar categoria pelo nome do produto acima"}
            </button>
            {!props.tituloBusca.trim() && (
              <p className="mt-2 text-xs text-[var(--muted)]">Preencha o nome do produto acima pra buscar a categoria.</p>
            )}
            {erroBusca && <p className="mt-2 text-xs text-[var(--danger)]">{erroBusca}</p>}
            {sugestoes.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {sugestoes.map((s) => (
                  <li key={s.categoryId}>
                    <button
                      type="button"
                      onClick={() => escolherCategoria(s)}
                      className="w-full rounded-lg border border-[var(--card-border)] bg-[var(--card)] px-3 py-2 text-left text-sm hover:border-emerald-300 dark:hover:border-emerald-700"
                    >
                      <span className="font-medium text-[var(--foreground)]">{s.categoryName}</span>
                      <span className="block text-xs text-[var(--muted)]">{s.caminho}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <div className="flex items-start justify-between gap-3 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2.5 dark:border-emerald-700 dark:bg-emerald-950/30">
            <div>
              <p className="text-sm font-medium text-[var(--foreground)]">{value.categoryName}</p>
              <p className="text-xs text-[var(--muted)]">Categoria do Mercado Livre escolhida</p>
            </div>
            <button
              type="button"
              onClick={trocarCategoria}
              className="shrink-0 rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10"
            >
              Trocar
            </button>
          </div>
        )}
      </div>

      {value.categoryId && (
        <div className="rounded-xl border border-[var(--card-border)] bg-[var(--card)] p-4">
          <div className="mb-3 flex items-center gap-2">
            <p className="text-sm font-medium text-[var(--foreground)]">Atributos obrigatórios desta categoria</p>
            <HelpBubble
              ariaLabel="Por que esses campos são obrigatórios"
              open={helpAtributosOpen}
              onOpen={() => setHelpAtributosOpen(true)}
              onClose={() => setHelpAtributosOpen(false)}
            >
              <p>
                O Mercado Livre exige esses dados específicos pra essa categoria pra aceitar o anúncio. Sem eles, o
                seller não consegue publicar este produto no Mercado Livre.
              </p>
            </HelpBubble>
          </div>

          {carregandoAtributos ? (
            <p className="text-sm text-[var(--muted)]">Carregando atributos da categoria...</p>
          ) : erroAtributos ? (
            <p className="text-xs text-[var(--danger)]">{erroAtributos}</p>
          ) : schemaVisivel.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">
              Essa categoria não exige mais nenhum atributo além do que já foi preenchido no cadastro.
            </p>
          ) : (
            <div className="space-y-3">
              {schemaVisivel.map((a) => {
                const atual = value.atributos.find((v) => v.id === a.id)?.valueName ?? "";
                return (
                  <div key={a.id}>
                    <label className="mb-1 block text-xs text-neutral-600 dark:text-neutral-400">
                      {a.name} {a.required && <span className="text-[var(--danger)]">*</span>}
                    </label>
                    {a.valueType === "list" && a.valoresPermitidos.length > 0 ? (
                      <select
                        value={atual}
                        onChange={(e) => setValorAtributo(a.id, e.target.value)}
                        className={inputBase}
                      >
                        <option value="">Selecione...</option>
                        {a.valoresPermitidos.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={atual}
                        onChange={(e) => setValorAtributo(a.id, e.target.value)}
                        className={inputBase}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {faltando.length > 0 && (
            <p className="mt-3 text-xs text-[var(--danger)]">
              Faltam preencher: {faltando.join(", ")} — o seller não vai conseguir publicar este produto no Mercado
              Livre até esses campos estarem completos.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
