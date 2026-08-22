import { LegalSection } from "./LegalPageShell";
import { LANDING_SALES_EMAIL, LANDING_SALES_WHATSAPP_DISPLAY, landingSalesWhatsapp } from "@/lib/landingContent";

/**
 * Conteúdo das 4 páginas institucionais (Sobre, Termos de Uso, Política de Privacidade,
 * Central de Ajuda) — separado do shell pra ser reaproveitado tanto na rota pública
 * (`/sobre`, `/termos-de-uso`, ...; usa `LegalPageShell`) quanto nas rotas dentro de
 * seller/fornecedor/admin (usam o menu da própria área, mas o mesmo texto).
 */

export const SOBRE_META = {
  title: "Sobre o DropCore",
  subtitle: "O hub B2B que conecta quem vende a quem fabrica e despacha.",
};

export function SobreBody() {
  return (
    <>
      <LegalSection title="O que é o DropCore">
        <p>
          O DropCore é um hub B2B de conexão e governança entre <strong className="text-[var(--foreground)]">sellers</strong>{" "}
          (quem vende nos marketplaces) e <strong className="text-[var(--foreground)]">fornecedores</strong> (quem fabrica,
          estoca e despacha os produtos). Não somos um marketplace nem um ERP, e não intermediamos o pagamento do
          cliente final — nossa função é organizar a ponte entre quem anuncia e quem entrega, com uma camada
          financeira própria (crédito, mensalidade e repasse) por cima.
        </p>
        <p>
          Na prática, isso significa: o seller escolhe produtos de um catálogo com estoque real, anuncia no
          marketplace de sua preferência e atende o cliente. Do outro lado, o fornecedor parceiro separa, embala e
          posta o pedido dentro de um SLA acordado. O DropCore acompanha cada etapa — do pedido à entrega — e libera
          o repasse automaticamente no saldo de quem vende.
        </p>
      </LegalSection>

      <LegalSection title="Como funciona, por dentro">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-[var(--foreground)]">Catálogo com estoque real:</strong> o seller vende a partir de
            produtos já cadastrados por fornecedores parceiros, sem precisar negociar ou comprar estoque próprio.
          </li>
          <li>
            <strong className="text-[var(--foreground)]">Pedido automático:</strong> quando o cliente compra no
            marketplace, o pedido cai direto no painel — sem digitação manual.
          </li>
          <li>
            <strong className="text-[var(--foreground)]">Postagem monitorada por SLA:</strong> cada fornecedor tem um
            prazo de postagem definido; atrasos ou bloqueios aparecem sinalizados no painel do seller.
          </li>
          <li>
            <strong className="text-[var(--foreground)]">Financeiro automatizado:</strong> saldo, crédito (recarga via
            PIX) e repasse ao fornecedor rodam sozinhos, sem planilha paralela.
          </li>
          <li>
            <strong className="text-[var(--foreground)]">Integração com ERP:</strong> quem já usa Olist ou Bling
            mantém o estoque e os pedidos sincronizados automaticamente.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="Onde estamos">
        <p>Av. Presidente Vargas, 1095 — Setor Jardim Marista, GO, CEP 75383-423.</p>
      </LegalSection>

      <LegalSection title="Fale com a gente">
        <p>
          Dúvidas, parcerias ou suporte:{" "}
          <a href={`mailto:${LANDING_SALES_EMAIL}`} className="font-medium text-emerald-600 hover:underline dark:text-emerald-400">
            {LANDING_SALES_EMAIL}
          </a>{" "}
          ou{" "}
          <a
            href={landingSalesWhatsapp()}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-emerald-600 hover:underline dark:text-emerald-400"
          >
            WhatsApp {LANDING_SALES_WHATSAPP_DISPLAY}
          </a>
          .
        </p>
      </LegalSection>
    </>
  );
}

export const TERMOS_DE_USO_META = {
  title: "Termos de Uso",
  subtitle: "Regras de uso da plataforma DropCore para sellers e fornecedores.",
  updatedAt: "18 de agosto de 2026",
};

export function TermosDeUsoBody() {
  return (
    <>
      <LegalSection title="1. Aceitação">
        <p>
          Ao criar uma conta ou usar o DropCore — seja como seller, fornecedor ou membro de uma organização —, você
          concorda com estes Termos de Uso e com a nossa{" "}
          <a href="/privacidade" className="font-medium text-emerald-600 hover:underline dark:text-emerald-400">
            Política de Privacidade
          </a>
          . Se não concordar, não utilize a plataforma.
        </p>
      </LegalSection>

      <LegalSection title="2. O que é o DropCore">
        <p>
          O DropCore é um hub B2B que conecta sellers a fornecedores, com uma camada financeira própria (crédito,
          mensalidade e repasse) e integrações com ERPs externos (Olist, Bling). O DropCore <strong className="text-[var(--foreground)]">não é
          marketplace</strong> — não vende produtos ao consumidor final — e <strong className="text-[var(--foreground)]">não é ERP</strong> —
          não substitui a gestão fiscal/contábil do seller ou do fornecedor. O DropCore também{" "}
          <strong className="text-[var(--foreground)]">não intermedia o pagamento do cliente final</strong>; esse pagamento ocorre
          diretamente no marketplace onde o produto foi anunciado.
        </p>
      </LegalSection>

      <LegalSection title="3. Cadastro e organização">
        <p>
          O acesso ao DropCore é feito por convite. Cada conta pertence a uma organização (<em>org</em>), com um ou
          mais membros vinculados a um perfil de seller ou de fornecedor. As informações fornecidas no cadastro
          precisam ser verdadeiras, completas e mantidas atualizadas — dados incorretos podem impedir o repasse
          financeiro ou o envio de pedidos.
        </p>
      </LegalSection>

      <LegalSection title="4. Papéis e responsabilidades">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <strong className="text-[var(--foreground)]">Seller:</strong> responsável por anunciar corretamente os
            produtos do catálogo, atender o cliente final no marketplace e manter saldo suficiente para cobrir o
            custo dos pedidos.
          </li>
          <li>
            <strong className="text-[var(--foreground)]">Fornecedor:</strong> responsável por manter o estoque e o
            catálogo atualizados, separar, embalar e postar os pedidos dentro do SLA acordado.
          </li>
          <li>
            <strong className="text-[var(--foreground)]">DropCore:</strong> responsável por operar a plataforma, o
            fluxo de pedidos entre seller e fornecedor, e a camada financeira (crédito, mensalidade e repasse).
          </li>
        </ul>
        <p>
          A troca de fornecedor por um seller está sujeita a um período mínimo de vínculo (normalmente 3 meses),
          usado para proteger a estabilidade do catálogo contra trocas por impulso.
        </p>
      </LegalSection>

      <LegalSection title="5. Camada financeira">
        <p>
          O uso da plataforma pode envolver mensalidade (seller), recarga de saldo via PIX (processada pelo Mercado
          Pago) e repasse ao fornecedor conforme os pedidos entregues. Cada pedido debita do saldo do seller conforme
          o custo DropCore correspondente. O fornecedor recebe o valor de repasse a que tem direito — os detalhes de
          taxa e composição do valor cobrado pelo DropCore são informação exclusiva do seller e do DropCore, não do
          fornecedor.
        </p>
        <p>
          O DropCore pode suspender o envio de novos pedidos de uma conta com saldo insuficiente, mensalidade em
          atraso ou pendência financeira não resolvida.
        </p>
      </LegalSection>

      <LegalSection title="6. Uso adequado">
        <p>
          É proibido: usar a plataforma para fins ilícitos; burlar o fluxo de pedidos, estoque ou financeiro;
          tentar acessar dados de outra organização, seller ou fornecedor sem autorização; ou interferir no
          funcionamento normal da plataforma. O DropCore pode suspender ou encerrar contas que violem estas regras.
        </p>
      </LegalSection>

      <LegalSection title="7. Propriedade intelectual">
        <p>
          Marca, layout, código e demais elementos do DropCore pertencem ao DropCore. Fotos e descrições de produtos
          cadastradas por fornecedores permanecem de sua responsabilidade e autoria, cedidas ao DropCore apenas para
          exibição dentro da plataforma (catálogo, vitrine de produtos).
        </p>
      </LegalSection>

      <LegalSection title="8. Limitação de responsabilidade">
        <p>
          O DropCore atua como camada de conexão e governança entre seller e fornecedor — não garante vendas,
          faturamento ou disponibilidade contínua de qualquer produto do catálogo. Atrasos causados por
          transportadora, marketplace ou terceiros fora do controle direto do DropCore não geram responsabilidade
          para a plataforma, sem prejuízo do monitoramento de SLA já oferecido.
        </p>
      </LegalSection>

      <LegalSection title="9. Suspensão e encerramento">
        <p>
          Qualquer parte pode encerrar o vínculo com o DropCore, respeitando pendências financeiras e o período
          mínimo de vínculo com fornecedor, quando aplicável. O DropCore pode suspender contas em caso de violação
          destes Termos, fraude ou risco à operação de terceiros.
        </p>
      </LegalSection>

      <LegalSection title="10. Alterações destes termos">
        <p>
          Estes Termos podem ser atualizados para refletir mudanças na plataforma ou na legislação. Alterações
          relevantes serão comunicadas pelos canais de contato cadastrados. O uso continuado após a atualização
          representa aceite dos novos termos.
        </p>
      </LegalSection>

      <LegalSection title="11. Contato">
        <p>
          Dúvidas sobre estes Termos:{" "}
          <a href={`mailto:${LANDING_SALES_EMAIL}`} className="font-medium text-emerald-600 hover:underline dark:text-emerald-400">
            {LANDING_SALES_EMAIL}
          </a>
          .
        </p>
      </LegalSection>
    </>
  );
}

export const PRIVACIDADE_META = {
  title: "Política de Privacidade",
  subtitle: "Como tratamos os dados de quem usa o DropCore, em conformidade com a LGPD.",
  updatedAt: "18 de agosto de 2026",
};

export function PrivacidadeBody() {
  return (
    <>
      <LegalSection title="1. Quem trata os dados">
        <p>
          O DropCore é o controlador dos dados pessoais tratados dentro da plataforma, coletados diretamente de
          sellers, fornecedores e membros de organizações cadastradas.
        </p>
      </LegalSection>

      <LegalSection title="2. Quais dados coletamos">
        <ul className="list-disc space-y-2 pl-5">
          <li>Dados de cadastro: nome, e-mail, telefone, CNPJ/CPF e dados da organização.</li>
          <li>Documentos de verificação (ex.: documento de identidade, comprovante de depósito), quando exigidos.</li>
          <li>Dados de catálogo, estoque e pedidos vinculados a seller e fornecedor.</li>
          <li>
            Dados financeiros de operação: saldo, crédito, mensalidade e histórico de recargas via PIX (processadas
            pelo Mercado Pago) — o DropCore não armazena dados de cartão ou senha bancária.
          </li>
          <li>Dados técnicos de acesso e uso da plataforma (ex.: logs, dispositivo, data/hora de login).</li>
        </ul>
      </LegalSection>

      <LegalSection title="3. Para que usamos esses dados">
        <ul className="list-disc space-y-2 pl-5">
          <li>Operar o cadastro, o vínculo entre seller e fornecedor, e o fluxo de pedidos.</li>
          <li>Processar recargas de saldo, mensalidades e repasses financeiros.</li>
          <li>Sincronizar estoque e pedidos com integrações de ERP (Olist, Bling), quando habilitadas pelo usuário.</li>
          <li>Verificar identidade e prevenir fraude no cadastro de sellers e fornecedores.</li>
          <li>Enviar notificações operacionais (pedido, SLA, financeiro) relacionadas ao uso da plataforma.</li>
          <li>Cumprir obrigações legais e regulatórias.</li>
        </ul>
      </LegalSection>

      <LegalSection title="4. Com quem compartilhamos">
        <p>
          Compartilhamos dados apenas com terceiros necessários à operação: processador de pagamento (Mercado Pago,
          para recargas via PIX), plataformas de ERP integradas por opção do próprio seller/fornecedor (Olist,
          Bling), e provedores de infraestrutura (banco de dados e armazenamento) que hospedam a plataforma.
        </p>
        <p>
          O fornecedor nunca tem acesso à taxa ou percentual cobrado pelo DropCore ao seller — vê apenas o valor que
          lhe é devido no repasse. Não vendemos dados pessoais a terceiros.
        </p>
      </LegalSection>

      <LegalSection title="5. Onde e como armazenamos">
        <p>
          Os dados são armazenados em infraestrutura com controle de acesso por linha (Row Level Security), de forma
          que cada organização só acessa os dados vinculados a ela. Documentos sensíveis (ex.: documento de seller,
          comprovante de depósito) ficam em armazenamento privado, acessível apenas por link assinado e temporário
          para o respectivo dono do dado.
        </p>
      </LegalSection>

      <LegalSection title="6. Seus direitos">
        <p>Conforme a Lei Geral de Proteção de Dados (LGPD), você pode solicitar, a qualquer momento:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Confirmação da existência de tratamento e acesso aos seus dados.</li>
          <li>Correção de dados incompletos, inexatos ou desatualizados.</li>
          <li>Anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desconformidade.</li>
          <li>Portabilidade dos dados a outro fornecedor de serviço.</li>
          <li>Informação sobre o compartilhamento dos seus dados com terceiros.</li>
          <li>Revogação do consentimento, quando o tratamento depender dele.</li>
        </ul>
        <p>
          Pedidos podem ser feitos pelo canal de contato abaixo. Respondemos dentro do prazo legal aplicável.
        </p>
      </LegalSection>

      <LegalSection title="7. Retenção de dados">
        <p>
          Mantemos os dados enquanto durar o vínculo com o DropCore e pelo período adicional exigido por obrigação
          legal, fiscal ou financeira (ex.: histórico de pedidos e repasses), mesmo após o encerramento da conta.
        </p>
      </LegalSection>

      <LegalSection title="8. Cookies">
        <p>
          Usamos cookies essenciais para manter sua sessão autenticada e lembrar preferências de exibição (ex.: tema
          claro/escuro). Não usamos cookies de rastreamento publicitário de terceiros dentro da plataforma logada.
        </p>
      </LegalSection>

      <LegalSection title="9. Alterações desta política">
        <p>
          Esta política pode ser atualizada para refletir mudanças na plataforma ou na legislação. A data da última
          atualização está sempre indicada no topo desta página.
        </p>
      </LegalSection>

      <LegalSection title="10. Contato">
        <p>
          Para exercer seus direitos ou tirar dúvidas sobre esta política:{" "}
          <a href={`mailto:${LANDING_SALES_EMAIL}`} className="font-medium text-emerald-600 hover:underline dark:text-emerald-400">
            {LANDING_SALES_EMAIL}
          </a>
          .
        </p>
      </LegalSection>
    </>
  );
}

export const CENTRAL_DE_AJUDA_META = {
  title: "Central de Ajuda",
  subtitle: "Respostas rápidas sobre saldo, PIX, SLA, fornecedor e conta.",
};

const FAQ_AJUDA = [
  {
    q: "Como recarrego meu saldo?",
    a: "No painel do seller, acesse a tela de saldo e gere uma cobrança PIX. O crédito é liberado automaticamente após a confirmação do pagamento pelo Mercado Pago.",
  },
  {
    q: "Paguei o PIX mas meu saldo não caiu. O que faço?",
    a: "A confirmação costuma ser rápida, mas pode levar alguns minutos. Se o saldo não atualizar, entre em contato pelo WhatsApp ou e-mail com o comprovante em mãos.",
  },
  {
    q: "O que significa um pedido \"atrasado\" ou \"travado\"?",
    a: "Cada fornecedor tem um SLA de postagem combinado. Pedidos que passam desse prazo, ou que ficam bloqueados por outro motivo (ex.: aguardando estoque), aparecem sinalizados no seu painel — você não precisa cobrar manualmente.",
  },
  {
    q: "Posso trocar de fornecedor?",
    a: "Sim, respeitando um período mínimo de vínculo (normalmente 3 meses) antes da troca livre. Isso protege a estabilidade do seu catálogo contra trocas por impulso.",
  },
  {
    q: "Como funciona a mensalidade do plano?",
    a: "A mensalidade é cobrada conforme o plano do seller e não credita saldo — ela libera os recursos do plano após a confirmação do pagamento no Mercado Pago.",
  },
  {
    q: "Sou fornecedor. Como recebo o repasse?",
    a: "O repasse é calculado por ciclo, com base nos pedidos entregues, e liberado automaticamente. Você vê o valor a receber no seu painel — o percentual cobrado ao seller não é exibido, só o valor que é seu.",
  },
  {
    q: "Esqueci minha senha ou não consigo entrar",
    a: "Use a opção de recuperação de senha na tela de login. Se o problema continuar, fale com a gente pelos canais abaixo.",
  },
  {
    q: "Como funciona a integração com Olist ou Bling?",
    a: "Nas configurações da sua conta é possível conectar sua integração de Olist/Tiny ou Bling para manter estoque e pedidos sincronizados automaticamente.",
  },
] as const;

export function CentralDeAjudaBody() {
  return (
    <>
      <LegalSection title="Perguntas frequentes">
        <div className="space-y-3">
          {FAQ_AJUDA.map((item) => (
            <details
              key={item.q}
              className="group rounded-2xl border border-[var(--card-border)] bg-[var(--card)] p-4 shadow-sm"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-[var(--foreground)] sm:text-base">
                {item.q}
                <span className="shrink-0 text-[var(--muted)] transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-[var(--muted)] sm:text-base">{item.a}</p>
            </details>
          ))}
        </div>
      </LegalSection>

      <LegalSection title="Não encontrou o que precisava?">
        <p>Fale direto com a nossa equipe — respondemos o mais rápido possível.</p>
        <div className="flex flex-col gap-1.5 pt-1 sm:flex-row sm:flex-wrap">
          <a
            href={landingSalesWhatsapp("Olá! Preciso de ajuda com o DropCore.")}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full rounded-md bg-emerald-600 px-2.5 py-1.5 text-center text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-700 sm:w-auto"
          >
            Falar no WhatsApp
          </a>
          <a
            href={`mailto:${LANDING_SALES_EMAIL}`}
            className="w-full rounded-md border border-[var(--card-border)] bg-[var(--card)] px-2.5 py-1.5 text-center text-[11px] font-semibold text-[var(--foreground)] hover:bg-[var(--muted)]/10 sm:w-auto"
          >
            Enviar e-mail
          </a>
        </div>
      </LegalSection>
    </>
  );
}
