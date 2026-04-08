import { redirect } from "next/navigation";

/** Mantido para links antigos: cadastro unificado em /fornecedor/cadastro */
export default function FornecedorDadosBancariosRedirectPage() {
  redirect("/fornecedor/cadastro#repasse");
}
