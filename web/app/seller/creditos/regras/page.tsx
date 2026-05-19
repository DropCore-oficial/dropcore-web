import Link from "next/link";
import { SellerNav } from "../../SellerNav";
import { Alert } from "@/components/ui/Alert";
import {
  SELLER_CREDITO_MESES_VALIDADE,
  SELLER_CREDITO_NAO_PAGA_MENSALIDADE,
  SELLER_MENSALIDADE_NAO_E_RECARGA,
} from "@/lib/sellerCreditoTermos";
import { SellerPixRecargaVsMensalidadeBox } from "@/components/seller/SellerPixRecargaVsMensalidadeBox";

export const metadata = {
  title: "Regras de créditos DropCore",
};

export default function SellerCreditosRegrasPage() {
  return (
    <div className="min-h-screen bg-[var(--background)] text-[var(--foreground)] app-bg pt-[calc(3.5rem+env(safe-area-inset-top,0px))] md:pt-14 pb-[calc(6.25rem+env(safe-area-inset-bottom,0px))] md:pb-10">
      <main className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8 pb-4">
        <Link
          href="/seller/dashboard"
          className="text-sm text-emerald-600 dark:text-emerald-400 hover:underline"
        >
          ← Voltar ao painel
        </Link>
        <h1 className="mt-4 text-2xl font-bold text-[var(--foreground)]">Créditos DropCore</h1>
        <p className="mt-2 text-sm text-[var(--muted)]">
          Regras da recarga via PIX no painel do seller. Versão para consulta — o aceite na recarga usa o mesmo
          conteúdo.
        </p>

        <SellerPixRecargaVsMensalidadeBox className="mt-6" />

        <Alert variant="warning" title="Antes de recarregar" className="mt-4">
          <ul className="list-disc pl-4 space-y-2 text-sm break-words">
            <li>
              <strong>Recarga não paga mensalidade:</strong> {SELLER_CREDITO_NAO_PAGA_MENSALIDADE} Use o botão{" "}
              <strong>Pagar mensalidade</strong> no painel para o plano.
            </li>
            <li>
              O valor pago por PIX vira <strong>crédito DropCore</strong>, para uso exclusivo na plataforma (pedidos,
              taxas e serviços internos).
            </li>
            <li>
              <strong>Não é depósito bancário:</strong> não há saque, transferência para conta bancária nem reembolso
              após a confirmação do pagamento.
            </li>
            <li>
              Cada recarga tem validade de <strong>{SELLER_CREDITO_MESES_VALIDADE} meses</strong> a partir da data em
              que o crédito é confirmado.
            </li>
            <li>
              O saldo não utilizado dentro desse prazo <strong>expira</strong> e deixa de estar disponível.
            </li>
            <li>O consumo usa primeiro os créditos que vencem antes (ordem por validade).</li>
          </ul>
        </Alert>

        <section className="mt-8 space-y-4 text-sm text-[var(--foreground)] pb-2">
          <h2 className="text-lg font-semibold">Dois PIX diferentes no painel</h2>
          <p className="text-[var(--muted)] break-words leading-relaxed">
            <strong>Recarga de créditos</strong> — saldo para pedidos (mín. R$ 500). {SELLER_CREDITO_NAO_PAGA_MENSALIDADE}
          </p>
          <p className="text-[var(--muted)] break-words leading-relaxed">
            <strong>Mensalidade do plano</strong> — cobrança do acesso ao painel DropCore. {SELLER_MENSALIDADE_NAO_E_RECARGA}
          </p>

          <h2 className="text-lg font-semibold pt-2">Recarga mínima</h2>
          <p className="text-[var(--muted)] break-words">
            O valor mínimo por recarga via PIX é R$ 500,00, salvo alteração comunicada pela DropCore.
          </p>

          <h2 className="text-lg font-semibold">Pagamento PIX</h2>
          <p className="text-[var(--muted)] break-words">
            O QR Code PIX gerado no painel tem validade curta (cerca de 30 minutos) apenas para concluir o pagamento.
            Isso é diferente da validade dos créditos após a confirmação.
          </p>

          <h2 className="text-lg font-semibold">Avisos de vencimento</h2>
          <p className="text-[var(--muted)] break-words">
            Enviaremos notificações quando créditos estiverem próximos de expirar (aproximadamente 30 e 7 dias antes),
            quando possível.
          </p>

          <h2 className="text-lg font-semibold">Dúvidas</h2>
          <p className="text-[var(--muted)] break-words">
            Em caso de erro na recarga (pagamento confirmado e crédito não apareceu), contate o suporte da sua
            organização ou da DropCore com o comprovante PIX.
          </p>
        </section>
      </main>
      <SellerNav active="dashboard" />
    </div>
  );
}
