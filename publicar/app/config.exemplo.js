/**
 * Molde de `config.js`. Copie este arquivo para `app/config.js` e preencha.
 *
 * `config.js` está no `.gitignore` — não porque a chave seja secreta, mas
 * porque o endereço do banco não precisa estar num repositório.
 *
 * A `ANON` é pública por definição: o arquivo é servido a quem abrir o site.
 * Esse é o modelo correto da plataforma — quem protege o dado é o Row Level
 * Security do banco (`banco/001-inicial.sql`), não o segredo da chave. Sem
 * sessão válida, `auth.uid()` é nulo, nenhuma policy casa e a chave não lê
 * uma linha sequer.
 *
 * A chave `service_role` NUNCA entra aqui. Ela ignora o RLS do projeto
 * inteiro — num arquivo público, seria o banco aberto para quem abrisse o
 * código-fonte da página. Existe um teste em `testes/casca.test.js` que
 * decodifica o JWT e falha se a chave publicada não for a `anon`.
 */
export const CONFIG = {
  URL: "https://SEU-PROJETO.supabase.co",
  ANON: "COLE-AQUI-A-CHAVE-ANON",
};

export function configurado() {
  return (
    CONFIG.URL.startsWith("https://") &&
    !CONFIG.ANON.startsWith("COLE-AQUI")
  );
}
