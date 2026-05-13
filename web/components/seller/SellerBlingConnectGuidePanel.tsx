"use client";

import type { ReactNode } from "react";
import { AmberPremiumCallout } from "@/components/ui/AmberPremiumCallout";
import { CANONICAL_SITE_ORIGIN } from "@/lib/siteUrl";
import { cn } from "@/lib/utils";

export const BLING_DEVELOPERS_HUB = "https://developer.bling.com.br";
export const BLING_CENTRAL_EXTENSOES = "https://bling.com.br/central.extensoes.php";
export const BLING_MINHAS_INSTALACOES = "https://bling.com.br/central.extensoes.php#/minhas-instalacoes";
export const BLING_CADASTRO_APLICATIVOS = "https://bling.com.br/cadastro.aplicativos.php";

/** URLs públicas para colar no cadastro do app no Bling (OAuth + página oficial). */
export const BLING_APP_FORM_URLS = {
  logoDriveFolder:
    "https://drive.google.com/drive/folders/1-f9qYIRHX63nbUJUbcUYi0WVy4B7ZLCt?usp=sharing",
  homepage: CANONICAL_SITE_ORIGIN,
  manual: `${CANONICAL_SITE_ORIGIN}/seller/integracoes-erp/como-conectar`,
  redirectOAuth: `${CANONICAL_SITE_ORIGIN}/seller/integracoes-erp`,
  webhook: `${CANONICAL_SITE_ORIGIN}/api/webhooks/bling`,
} as const;

const stepShell =
  "rounded-xl border border-[var(--card-border)] bg-[var(--card)] shadow-[0_1px_0_rgb(0_0_0/0.04)] dark:shadow-none dark:bg-neutral-900/40";

type GuideVariant = "on-integration-page" | "standalone";

function StepBlock({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className={cn("space-y-2.5 p-3 sm:space-y-3 sm:p-4", stepShell)}>
      <div className="flex items-start gap-2.5 sm:gap-3">
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white shadow-sm ring-2 ring-emerald-500/25 sm:h-8 sm:w-8 sm:text-xs dark:bg-emerald-600 dark:ring-emerald-400/20"
          aria-hidden
        >
          {n}
        </span>
        <p className="min-w-0 flex-1 text-[15px] font-semibold leading-snug text-neutral-900 sm:text-sm dark:text-neutral-100">
          {title}
        </p>
      </div>
      <div className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-300 sm:pl-[2.875rem]">{children}</div>
    </li>
  );
}

function WhereWhat({ where, doWhat, type }: { where: ReactNode; doWhat: ReactNode; type?: ReactNode }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed">
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Onde</p>
        <div className="mt-1 text-neutral-700 dark:text-neutral-300">{where}</div>
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">O que fazer</p>
        <div className="mt-1 text-neutral-700 dark:text-neutral-300">{doWhat}</div>
      </div>
      {type ? (
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
            O que escrever
          </p>
          <div className="mt-1 text-neutral-700 dark:text-neutral-300">{type}</div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Guia Bling para leigos: onde clicar, onde colar e o que digitar (DropCore + portal Bling).
 */
export function SellerBlingConnectGuidePanel({
  id = "guia-bling",
  variant = "on-integration-page",
}: {
  id?: string;
  variant?: GuideVariant;
}) {
  return (
    <div id={id} className="scroll-mt-24 space-y-4">
      <h2 className="text-base font-semibold text-[var(--foreground)]">Como conectar o Bling</h2>

      <AmberPremiumCallout title="Leia antes de abrir o Bling" className="rounded-2xl px-3 py-3.5 sm:px-5">
        <p className="text-pretty leading-relaxed">
          Hoje, quem conecta precisa seguir <strong className="text-[var(--foreground)]">este guia inteiro</strong> no Bling:{" "}
          <strong className="text-[var(--foreground)]">Área do integrador</strong>, cadastro do app{" "}
          <strong className="text-[var(--foreground)]">DropCore</strong>, webhooks, autorização pelo{" "}
          <strong className="text-[var(--foreground)]">Link de convite</strong> e, no fim, o{" "}
          <strong className="text-[var(--foreground)]">companyId</strong> na tela{" "}
          <strong className="text-[var(--foreground)]">Integração Bling</strong> do DropCore.
        </p>
        <p className="mt-2 text-pretty leading-relaxed">
          <strong className="text-[var(--foreground)]">Não busque DropCore</strong> na aba{" "}
          <strong className="text-[var(--foreground)]">Integrações</strong> da Central de Extensões. O app que você cria aqui ainda{" "}
          <strong className="text-[var(--foreground)]">não aparece na vitrine</strong> como DropBee ou DropMake — isso é esperado.
        </p>
      </AmberPremiumCallout>

      <AmberPremiumCallout title="URL do webhook no Bling" className="rounded-2xl px-3 py-3.5 sm:px-5">
        <p className="text-pretty leading-relaxed">
          Cadastre <strong className="text-[var(--foreground)]">no Bling</strong> a mesma URL que o DropCore mostra na integração:
          use o botão <strong className="text-[var(--foreground)]">Copiar URL</strong> e cole no campo de webhook. Tem que ser o
          endereço com <strong className="text-[var(--foreground)]">https://</strong> do site oficial — o que o sistema já
          coloca lá. Se colar outro link ou um endereço “de teste”, o Bling{" "}
          <strong className="text-[var(--foreground)]">não avisa</strong> o DropCore direito.
        </p>
      </AmberPremiumCallout>

      <div className={cn("space-y-5 p-3 sm:space-y-6 sm:p-6", stepShell)}>
        <section
          className={cn(
            "rounded-xl border border-emerald-500/20 bg-emerald-50/90 px-3 py-3.5 dark:border-emerald-400/20 dark:bg-emerald-950/35 sm:px-4",
          )}
        >
          <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-900 dark:text-emerald-300">
            O que você vai precisar
          </p>
          <ul className="mt-2 list-disc space-y-1.5 pl-4 text-sm leading-relaxed text-neutral-700 marker:text-emerald-600 dark:text-neutral-300 dark:marker:text-emerald-400">
            <li>
              Estar logado no <strong className="text-neutral-900 dark:text-neutral-100">DropCore</strong> como seller.
            </li>
            <li>
              Ter login no <strong className="text-neutral-900 dark:text-neutral-100">Bling</strong> (a mesma empresa que quer
              integrar).
            </li>
            <li>
              Nome do aplicativo no Bling <strong className="text-neutral-900 dark:text-neutral-100">exatamente</strong>:{" "}
              <strong className="text-neutral-900 dark:text-neutral-100">DropCore</strong> — sem espaço a mais, sem mudar
              letras.
            </li>
          </ul>
        </section>

        <div>
          <h3 className="mb-1 text-sm font-semibold leading-snug text-[var(--foreground)]">
            Parte 1 — No DropCore: copiar a URL do webhook
          </h3>
          <p className="mb-3 text-xs leading-relaxed text-[var(--muted)]">
            Faça isso primeiro. Você vai colar essa URL lá no Bling depois.
          </p>
          <ol className="space-y-3">
            <StepBlock n="1" title="Abrir a tela certa no DropCore">
              <WhereWhat
                where={
                  <>
                    Menu de cima → clique em <strong className="text-neutral-900 dark:text-neutral-100">Mais</strong> (setinha) →
                    clique em <strong className="text-neutral-900 dark:text-neutral-100">Bling</strong>. A página deve mostrar o
                    título <strong className="text-neutral-900 dark:text-neutral-100">Integração Bling</strong>.
                  </>
                }
                doWhat="Se já estiver nessa página, pode ir para o próximo passo."
              />
            </StepBlock>
            <StepBlock n="2" title="Copiar a URL (sem selecionar texto na mão)">
              <WhereWhat
                where={
                  <>
                    Role até o cartão <strong className="text-neutral-900 dark:text-neutral-100">Conexão</strong>. Logo acima da
                    caixa cinza da URL está o rótulo{" "}
                    <strong className="text-neutral-900 dark:text-neutral-100">URL do webhook (no Bling)</strong>.
                  </>
                }
                doWhat={
                  <>
                    Clique no botão verde <strong className="text-neutral-900 dark:text-neutral-100">Copiar URL</strong>. Quando
                    copiar, pode aparecer <strong className="text-neutral-900 dark:text-neutral-100">Copiado!</strong> por um
                    instante.
                  </>
                }
                type={
                  <>
                    <strong className="text-neutral-900 dark:text-neutral-100">Não digite nada aqui.</strong> A URL é gerada pelo
                    sistema. Só copie.
                  </>
                }
              />
            </StepBlock>
          </ol>
        </div>

        <div>
          <h3 className="mb-1 text-sm font-semibold text-[var(--foreground)]">
            Parte 2 — No site do Bling (desenvolvedores): criar o app e colar a URL
          </h3>
          <p className="mb-3 text-xs text-[var(--muted)]">
            Telas do Bling podem mudar um pouco o desenho, mas os nomes costumam ser estes. Se algum botão tiver texto
            parecido, use esse.
          </p>
          <ol className="space-y-3" start={3}>
            <StepBlock n="3" title="Abrir o portal e entrar na Área do integrador">
              <WhereWhat
                where={
                  <>
                    Abra o{" "}
                    <a
                      href={BLING_DEVELOPERS_HUB}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-semibold text-emerald-700 underline underline-offset-2 dark:text-emerald-400"
                    >
                      portal Bling para desenvolvedores
                    </a>{" "}
                    (link abre em outra aba). Na página inicial, clique em{" "}
                    <strong className="text-neutral-900 dark:text-neutral-100">Área do integrador</strong>. Se não aparecer de
                    cara, procure no menu por algo como <strong className="text-neutral-900 dark:text-neutral-100">Central de Extensões</strong>{" "}
                    e depois <strong className="text-neutral-900 dark:text-neutral-100">Área do integrador</strong>.
                  </>
                }
                doWhat="Faça login com seu usuário e senha do Bling, se o site pedir."
              />
            </StepBlock>
            <StepBlock n="4" title='Criar o aplicativo com o nome "DropCore"'>
              <div className="space-y-3 text-sm leading-relaxed">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Onde</p>
                  <div className="mt-1 text-neutral-700 dark:text-neutral-300">
                    Dentro da área do integrador, procure o botão{" "}
                    <strong className="text-neutral-900 dark:text-neutral-100">Criar aplicativo</strong> (ou equivalente) e clique.
                  </div>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                    Primeira tela do assistente
                  </p>
                  <p className="mt-1 text-neutral-700 dark:text-neutral-300">
                    O Bling costuma abrir o cadastro em etapas. Nesta primeira tela:
                  </p>
                  <ul className="mt-2 list-disc space-y-2 pl-4 text-neutral-700 marker:text-emerald-600 dark:text-neutral-300 dark:marker:text-emerald-400">
                    <li>
                      <strong className="text-neutral-900 dark:text-neutral-100">Tipo do aplicativo:</strong> escolha{" "}
                      <strong className="text-neutral-900 dark:text-neutral-100">API</strong> (acesso à API v3).
                    </li>
                    <li>
                      <strong className="text-neutral-900 dark:text-neutral-100">Uso do aplicativo:</strong> escolha{" "}
                      <strong className="text-neutral-900 dark:text-neutral-100">Público</strong>. Depois você autoriza na sua empresa pelo{" "}
                      <strong className="text-neutral-900 dark:text-neutral-100">Link de convite</strong> (passo 6) —{" "}
                      <strong className="text-neutral-900 dark:text-neutral-100">não</strong> pela busca da Central de Extensões.
                    </li>
                    <li>
                      Depois clique em <strong className="text-neutral-900 dark:text-neutral-100">Próximo</strong> para seguir às próximas
                      etapas (dados básicos, nome do app, etc.).
                    </li>
                  </ul>
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                    Etapa “Dados básicos” — preencha na ordem (como no Bling)
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                    Use <strong className="text-[var(--foreground)]">Próximo</strong> até chegar nessa etapa. Os campos mudam de layout,
                    mas os nomes são os da{" "}
                    <a
                      href={`${BLING_DEVELOPERS_HUB}/aplicativos`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-emerald-700 underline underline-offset-2 dark:text-emerald-400"
                    >
                      documentação do Bling
                    </a>
                    . No DropCore, sempre use as URLs do domínio oficial abaixo (mesmo testando em localhost).
                  </p>
                  <ol className="mt-3 list-decimal space-y-3 pl-5 text-neutral-700 marker:font-semibold marker:text-emerald-600 dark:text-neutral-300 dark:marker:text-emerald-400">
                    <li>
                      <strong className="text-neutral-900 dark:text-neutral-100">Logo:</strong> abra a pasta oficial no Google Drive,
                      baixe o arquivo e anexe em Anexar Logo. Link da pasta (copie e cole no navegador se precisar):{" "}
                      <a
                        href={BLING_APP_FORM_URLS.logoDriveFolder}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="break-all font-medium text-emerald-700 underline underline-offset-2 dark:text-emerald-400"
                      >
                        {BLING_APP_FORM_URLS.logoDriveFolder}
                      </a>
                    </li>
                    <li>
                      <strong className="text-neutral-900 dark:text-neutral-100">Nome:</strong>{" "}
                      <strong className="text-neutral-900 dark:text-neutral-100">DropCore</strong> — sem aspas e sem mudar maiúsculas e
                      minúsculas.
                    </li>
                    <li>
                      <strong className="text-neutral-900 dark:text-neutral-100">Categoria:</strong> escolha{" "}
                      <strong className="text-neutral-900 dark:text-neutral-100">Hub</strong> na lista. Se o Bling mostrar outro nome
                      parecido, use a opção mais próxima de hub, integração ou marketplace.
                    </li>
                    <li>
                      <strong className="text-neutral-900 dark:text-neutral-100">Descrição</strong> (texto grande): apague{" "}
                      <strong className="text-neutral-900 dark:text-neutral-100">todo</strong> o texto modelo que veio com “apague estas
                      instruções…”. Depois, copie e cole no Bling exatamente o texto abaixo — é a descrição oficial da integração:{" "}
                      <span className="block mt-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--surface-subtle)] p-2.5 text-[13px] leading-snug text-neutral-800 dark:text-neutral-200">
                        Integração entre o Bling e o DropCore: sincronização de operação com o hub DropCore. Instale o app, autorize o
                        acesso e conclua o vínculo no painel do seller no DropCore conforme o guia do site.
                      </span>
                    </li>
                    <li>
                      <strong className="text-neutral-900 dark:text-neutral-100">Descrição curta:</strong> campo separado da descrição
                      grande, com <strong className="text-neutral-900 dark:text-neutral-100">no máximo 55 caracteres</strong>. Não cole aqui o
                      texto longo da integração. Copie e cole exatamente:{" "}
                      <span className="block mt-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--surface-subtle)] p-2.5 text-[13px] leading-snug text-neutral-800 dark:text-neutral-200">
                        DropCore + Bling: pedidos, produtos e estoque.
                      </span>
                    </li>
                    <li>
                      <strong className="text-neutral-900 dark:text-neutral-100">Link de redirecionamento</strong> (OAuth): cole exatamente:{" "}
                      <a
                        href={BLING_APP_FORM_URLS.redirectOAuth}
                        className="break-all font-medium text-emerald-700 underline underline-offset-2 dark:text-emerald-400"
                      >
                        {BLING_APP_FORM_URLS.redirectOAuth}
                      </a>
                      . Sem ponto, barra ou espaço no final — se ficar{" "}
                      <strong className="text-neutral-900 dark:text-neutral-100">integracoes-erp.</strong> o Bling devolve erro 404 no
                      DropCore depois de autorizar.
                    </li>
                    <li>
                      <strong className="text-neutral-900 dark:text-neutral-100">Link da homepage:</strong>{" "}
                      <a
                        href={BLING_APP_FORM_URLS.homepage}
                        className="break-all font-medium text-emerald-700 underline underline-offset-2 dark:text-emerald-400"
                      >
                        {BLING_APP_FORM_URLS.homepage}
                      </a>
                    </li>
                    <li>
                      <strong className="text-neutral-900 dark:text-neutral-100">Link do manual:</strong>{" "}
                      <a
                        href={BLING_APP_FORM_URLS.manual}
                        className="break-all font-medium text-emerald-700 underline underline-offset-2 dark:text-emerald-400"
                      >
                        {BLING_APP_FORM_URLS.manual}
                      </a>{" "}
                      (este guia).
                    </li>
                    <li>
                      <strong className="text-neutral-900 dark:text-neutral-100">Vídeo demonstrativo:</strong> pode deixar em branco se o
                      Bling não marcar como obrigatório.
                    </li>
                    <li>
                      <strong className="text-neutral-900 dark:text-neutral-100">Imagens do aplicativo:</strong> opcional; só serve para a
                      vitrine na Central de Extensões.
                    </li>
                  </ol>
                  <div className={cn("mt-4 space-y-3 p-3 sm:p-4", stepShell)}>
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                      Lista de escopos e informações para contato (como o Bling mostra)
                    </p>
                    <p className="text-xs leading-relaxed text-[var(--muted)]">
                      Esses blocos aparecem na mesma etapa do cadastro, depois dos links e das imagens. Sem eles, o Bling costuma não
                      liberar salvar.
                    </p>
                    <ul className="list-disc space-y-3 pl-4 text-neutral-700 marker:text-emerald-600 dark:text-neutral-300 dark:marker:text-emerald-400">
                    <li>
                      <strong className="text-neutral-900 dark:text-neutral-100">Lista de escopos:</strong> clique em{" "}
                      <strong className="text-neutral-900 dark:text-neutral-100">Adicionar</strong>. O Bling{" "}
                        <strong className="text-neutral-900 dark:text-neutral-100">só habilita salvar</strong> depois de incluir pelo menos
                        um escopo. Na busca, marque o pacote mínimo do DropCore (nomes como no modal do Bling):
                        <ul className="mt-2 list-disc space-y-1.5 pl-4 marker:text-emerald-600 dark:marker:text-emerald-400">
                          <li>
                            <strong className="text-neutral-900 dark:text-neutral-100">Pedidos de Venda</strong>
                          </li>
                          <li>
                            <strong className="text-neutral-900 dark:text-neutral-100">Produtos</strong>
                          </li>
                          <li>
                            <strong className="text-neutral-900 dark:text-neutral-100">Controle de Estoque</strong>
                          </li>
                          <li>
                            <strong className="text-neutral-900 dark:text-neutral-100">Visualizar os dados básicos da empresa</strong>
                          </li>
                        </ul>
                        <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
                          Para operação só com DropCore, esses quatro escopos bastam. Não marque{" "}
                          <strong className="text-[var(--foreground)]">Depósitos de Estoque</strong> nem finanças, notas fiscais, compras,
                          logística ou marketplace neste cadastro, salvo orientação do suporte DropCore.
                        </p>
                      </li>
                      <li>
                        <strong className="text-neutral-900 dark:text-neutral-100">Informações para contato:</strong> preencha os três campos
                        obrigatórios que o Bling exibe:
                        <ul className="mt-2 list-disc space-y-1.5 pl-4 marker:text-emerald-600 dark:marker:text-emerald-400">
                          <li>
                            <strong className="text-neutral-900 dark:text-neutral-100">Nome do desenvolvedor</strong> — seu nome ou nome da
                            sua empresa.
                          </li>
                          <li>
                            <strong className="text-neutral-900 dark:text-neutral-100">Email</strong> — e-mail válido para o Bling falar com
                            você.
                    </li>
                    <li>
                            <strong className="text-neutral-900 dark:text-neutral-100">Celular</strong> — número com DDD, também real.
                          </li>
                        </ul>
                    </li>
                    </ul>
                  </div>
                </div>
              </div>
              <p className="mt-3 text-xs text-[var(--muted)]">
                Clique em <strong className="text-[var(--foreground)]">Salvar dados básicos</strong> quando o Bling oferecer esse botão.
                Se aparecerem mais telas depois (revisão, homologação etc.), siga o próprio Bling até o app ficar criado.
              </p>
            </StepBlock>
            <StepBlock n="5" title="Cadastrar a URL do webhook no aplicativo">
              <div className="space-y-4 text-sm leading-relaxed">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Onde</p>
                  <p className="mt-1 text-neutral-700 dark:text-neutral-300">
                    Abra o aplicativo <strong className="text-neutral-900 dark:text-neutral-100">DropCore</strong> que você acabou de
                    criar e vá na aba <strong className="text-neutral-900 dark:text-neutral-100">Webhooks</strong>.
                  </p>
                </div>
                <div className={cn("space-y-3 p-3 sm:p-4", stepShell)}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                    1. Cadastrar o servidor
                  </p>
                  <p className="text-xs leading-relaxed text-[var(--muted)]">
                    Em <strong className="text-[var(--foreground)]">Configuração de servidores</strong>, adicione uma linha com estes
                    campos:
                  </p>
                  <ul className="list-disc space-y-2 pl-4 text-neutral-700 marker:text-emerald-600 dark:text-neutral-300 dark:marker:text-emerald-400">
                    <li>
                      <strong className="text-neutral-900 dark:text-neutral-100">Alias:</strong>{" "}
                      <strong className="text-neutral-900 dark:text-neutral-100">DropCore</strong> — só um nome para você reconhecer o
                      servidor no Bling.
                    </li>
                    <li>
                      <strong className="text-neutral-900 dark:text-neutral-100">URL:</strong> cole exatamente{" "}
                      <a
                        href={BLING_APP_FORM_URLS.webhook}
                        className="break-all font-medium text-emerald-700 underline underline-offset-2 dark:text-emerald-400"
                      >
                        {BLING_APP_FORM_URLS.webhook}
                      </a>{" "}
                      (é a mesma do botão <strong className="text-neutral-900 dark:text-neutral-100">Copiar URL</strong> no passo 2).
                    </li>
                  </ul>
                </div>
                <div className={cn("space-y-3 p-3 sm:p-4", stepShell)}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                    2. Ativar os eventos
                  </p>
                  <p className="text-xs leading-relaxed text-[var(--muted)]">
                    Em <strong className="text-[var(--foreground)]">Configuração de webhooks</strong>, ligue o webhook em cada bloco abaixo,
                    escolha o servidor <strong className="text-[var(--foreground)]">DropCore</strong> e deixe a versão em{" "}
                    <strong className="text-[var(--foreground)]">v1</strong> se o Bling mostrar essa opção.
                  </p>
                  <ul className="list-disc space-y-2 pl-4 text-neutral-700 marker:text-emerald-600 dark:text-neutral-300 dark:marker:text-emerald-400">
                    <li>
                      <strong className="text-neutral-900 dark:text-neutral-100">Estoques</strong> — webhook ativo no servidor DropCore.
                    </li>
                    <li>
                      <strong className="text-neutral-900 dark:text-neutral-100">Produtos</strong> — webhook ativo no servidor DropCore.
                    </li>
                    <li>
                      <strong className="text-neutral-900 dark:text-neutral-100">Pedidos de Vendas</strong> — webhook ativo no servidor
                      DropCore.
                    </li>
                  </ul>
                  <p className="text-xs leading-relaxed text-[var(--muted)]">
                    Em cada bloco, marque pelo menos <strong className="text-[var(--foreground)]">Criação</strong> e{" "}
                    <strong className="text-[var(--foreground)]">Atualização</strong>.{" "}
                    <strong className="text-[var(--foreground)]">Exclusão</strong> pode ficar marcada se o Bling já vier assim.
                  </p>
                  <p className="text-xs leading-relaxed text-[var(--muted)]">
                    Não precisa ativar <strong className="text-[var(--foreground)]">Fornecedores de Produtos</strong> para a operação
                    DropCore.
                  </p>
                </div>
                <div className={cn("space-y-2 p-3 sm:p-4", stepShell)}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                    3. Salvar
                  </p>
                  <p className="text-neutral-700 dark:text-neutral-300">
                    Clique em <strong className="text-neutral-900 dark:text-neutral-100">Salvar webhooks</strong> no fim da tela do Bling.
                  </p>
                </div>
              </div>
            </StepBlock>
            <StepBlock n="6" title="Autorizar o app na sua conta Bling">
              <div className="space-y-4 text-sm leading-relaxed">
                <AmberPremiumCallout title="Não aparece na busca da Central de Extensões?" className="rounded-2xl px-3 py-3.5 sm:px-5">
                  Se você buscar <strong className="text-[var(--foreground)]">DropCore</strong> na aba{" "}
                  <strong className="text-[var(--foreground)]">Integrações</strong> e só surgirem outros apps, isso é esperado: o app que
                  você criou no passo 4 ainda não está na vitrine pública. Não instale outro app parecido no lugar.
                </AmberPremiumCallout>
                <div className={cn("space-y-3 p-3 sm:p-4", stepShell)}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                    1. Voltar ao app DropCore que você criou
                  </p>
                  <p className="text-neutral-700 dark:text-neutral-300">
                    Abra a <strong className="text-neutral-900 dark:text-neutral-100">Central de Extensões</strong> (
                    <a
                      href={BLING_CENTRAL_EXTENSOES}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all font-medium text-emerald-700 underline underline-offset-2 dark:text-emerald-400"
                    >
                      {BLING_CENTRAL_EXTENSOES}
                    </a>
                    ) e clique em <strong className="text-neutral-900 dark:text-neutral-100">Área do integrador</strong>. Abra o{" "}
                    <strong className="text-neutral-900 dark:text-neutral-100">Cadastro de aplicativos</strong> (
                    <a
                      href={BLING_CADASTRO_APLICATIVOS}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all font-medium text-emerald-700 underline underline-offset-2 dark:text-emerald-400"
                    >
                      {BLING_CADASTRO_APLICATIVOS}
                    </a>
                    ) e selecione o app <strong className="text-neutral-900 dark:text-neutral-100">DropCore</strong> que você acabou de
                    salvar.
                  </p>
                </div>
                <div className={cn("space-y-3 p-3 sm:p-4", stepShell)}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                    2. Autorizar na conta da empresa
                  </p>
                  <p className="text-neutral-700 dark:text-neutral-300">
                    No app <strong className="text-neutral-900 dark:text-neutral-100">DropCore</strong>, na aba{" "}
                    <strong className="text-neutral-900 dark:text-neutral-100">Informações do app</strong>, use o campo{" "}
                    <strong className="text-neutral-900 dark:text-neutral-100">Link de convite</strong>: copie o link (ícone ao lado) e
                    abra na mesma conta Bling da empresa. Se <strong className="text-neutral-900 dark:text-neutral-100">Quantidade de
                    usuários</strong> estiver em <strong className="text-neutral-900 dark:text-neutral-100">0</strong>, ainda não houve
                    autorização. Na tela de acessos, confira a lista{" "}
                    <strong className="text-neutral-900 dark:text-neutral-100">Acessos</strong> e clique em{" "}
                    <strong className="text-neutral-900 dark:text-neutral-100">Autorizar</strong>. O retorno usa o link de redirecionamento
                    do passo 4 (
                    <a
                      href={BLING_APP_FORM_URLS.redirectOAuth}
                      className="break-all font-medium text-emerald-700 underline underline-offset-2 dark:text-emerald-400"
                    >
                      {BLING_APP_FORM_URLS.redirectOAuth}
                    </a>
                    ).
                  </p>
                </div>
                <div className={cn("space-y-3 p-3 sm:p-4", stepShell)}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">
                    3. Conferir em Minhas instalações
                  </p>
                  <p className="text-neutral-700 dark:text-neutral-300">
                    Depois da autorização, abra{" "}
                    <strong className="text-neutral-900 dark:text-neutral-100">Minhas instalações</strong> (
                    <a
                      href={BLING_MINHAS_INSTALACOES}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="break-all font-medium text-emerald-700 underline underline-offset-2 dark:text-emerald-400"
                    >
                      {BLING_MINHAS_INSTALACOES}
                    </a>
                    ). Se o <strong className="text-neutral-900 dark:text-neutral-100">DropCore</strong> ainda não aparecer ali, siga
                    para o passo 7 no DropCore e fale com o suporte com um print.
                  </p>
                </div>
                <p className="text-xs leading-relaxed text-[var(--muted)]">
                  O <strong className="text-[var(--foreground)]">companyId</strong> não é copiado nesta tela. No passo 7 você cola o
                  código no DropCore. Se ainda não tiver o valor, use o botão de{" "}
                  <strong className="text-[var(--foreground)]">suporte</strong> (ícone de fone no DropCore) e envie um print pelo
                  WhatsApp.
                </p>
              </div>
            </StepBlock>
          </ol>
        </div>

        <div>
          <h3 className="mb-1 text-sm font-semibold text-[var(--foreground)]">
            Parte 3 — De volta no DropCore: colar o companyId e testar
          </h3>
          <p className="mb-3 text-xs text-[var(--muted)]">
            {variant === "on-integration-page" ? (
              <>Use o mesmo cartão <strong className="text-[var(--foreground)]">Conexão</strong> que está logo abixo deste guia.</>
            ) : (
              <>
                Vá em <strong className="text-[var(--foreground)]">Mais</strong> → <strong className="text-[var(--foreground)]">Bling</strong>{" "}
                e role até <strong className="text-[var(--foreground)]">Conexão</strong>.
              </>
            )}
          </p>
          <ol className="space-y-3" start={7}>
            <StepBlock n="7" title="Conferir ou colar o companyId">
              <div className="space-y-3 text-sm leading-relaxed">
                <AmberPremiumCallout title="Não é o Client ID" className="rounded-2xl px-3 py-3.5 sm:px-5">
                  O <strong className="text-[var(--foreground)]">companyId</strong> identifica a{" "}
                  <strong className="text-[var(--foreground)]">empresa</strong> no Bling. Não use o{" "}
                  <strong className="text-[var(--foreground)]">Client ID</strong> nem o <strong className="text-[var(--foreground)]">client secret</strong>{" "}
                  da aba <strong className="text-[var(--foreground)]">Informações do app</strong>.
                </AmberPremiumCallout>
              <WhereWhat
                where={
                  <>
                      No cartão <strong className="text-neutral-900 dark:text-neutral-100">Conexão</strong>, campo{" "}
                      <strong className="text-neutral-900 dark:text-neutral-100">ID da empresa no Bling (companyId)</strong>.
                    </>
                  }
                  doWhat={
                    <>
                      Depois de autorizar pelo <strong className="text-neutral-900 dark:text-neutral-100">Link de convite</strong>, o
                      DropCore tenta preencher sozinho. Se o campo continuar vazio, dispare um evento no Bling (altere um produto, estoque
                      ou pedido), clique em <strong className="text-neutral-900 dark:text-neutral-100">Atualizar</strong> e copie o{" "}
                      <strong className="text-neutral-900 dark:text-neutral-100">companyId</strong> que aparecer em{" "}
                      <strong className="text-neutral-900 dark:text-neutral-100">Últimos eventos recebidos (Bling)</strong>.
                    </>
                  }
                  type="Texto longo só com letras minúsculas e números (ex.: d4475854366a36c86a37e792f9634a51), sem espaços."
                />
              </div>
            </StepBlock>
            <StepBlock n="8" title="Salvar">
              <WhereWhat
                where="Ao lado do campo do companyId, o botão verde."
                doWhat={
                  <>
                    Clique em <strong className="text-neutral-900 dark:text-neutral-100">Salvar</strong>. Espere até parar de
                    mostrar “Salvando...”. O selo ao lado da palavra Conexão pode mudar para{" "}
                    <strong className="text-neutral-900 dark:text-neutral-100">CompanyId salvo</strong>.
                  </>
                }
              />
            </StepBlock>
            <StepBlock n="9" title="Atualizar e ver se o Bling está falando com o DropCore">
              <WhereWhat
                where={
                  <>
                    No canto do cartão <strong className="text-neutral-900 dark:text-neutral-100">Conexão</strong>, botão{" "}
                    <strong className="text-neutral-900 dark:text-neutral-100">Atualizar</strong>.
                  </>
                }
                doWhat={
                  <>
                    Clique em <strong className="text-neutral-900 dark:text-neutral-100">Atualizar</strong>. Depois olhe a seção{" "}
                    <strong className="text-neutral-900 dark:text-neutral-100">Últimos eventos recebidos (Bling)</strong>.
                  </>
                }
                type="Se ainda aparecer “Nenhum webhook ainda.”, pode ser atraso do Bling ou webhook não disparado — tente gerar uma ação no Bling que dispare aviso ou fale com o suporte."
              />
            </StepBlock>
          </ol>
        </div>
      </div>
    </div>
  );
}
