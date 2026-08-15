-- =====================================================================
-- Endurecimento apontado pelo linter de segurança do Supabase
--
-- Rodado em 14/08/2026, depois do 003. Nada aqui muda comportamento do
-- app: são privilégios e resolução de nomes.
--
-- O `set search_path` de `objetivos_validos` já está na definição dela em
-- `003-sono-e-objetivos.sql` — quem rodar o banco do zero não precisa
-- desta linha. Ela fica aqui porque ESTE projeto criou a função antes da
-- correção, e um arquivo de migração descreve o que foi aplicado.
-- =====================================================================

-- `tocar_updated_at` vem do 001 e nasceu sem search_path fixo.
alter function public.tocar_updated_at()       set search_path = '';
alter function public.objetivos_validos(jsonb) set search_path = '';

-- ---------------------------------------------------------------------
-- `public.rls_auto_enable()` é um event trigger da plataforma Supabase que
-- liga RLS sozinho em tabela nova criada em `public`. Não veio de nenhum
-- arquivo deste diretório.
--
-- Ela é SECURITY DEFINER e estava com EXECUTE aberto para `anon` — ou
-- seja, exposta em `/rest/v1/rpc/rls_auto_enable` para quem tem a chave
-- pública. O risco concreto é nulo (função `returns event_trigger` recusa
-- chamada direta), mas privilégio que não serve para nada é superfície
-- sem dono, e é assim que se acumula o que ninguém audita depois.
--
-- Revogar não desliga o event trigger: ele roda com o privilégio do dono,
-- não do papel que executou o CREATE TABLE.
-- ---------------------------------------------------------------------
revoke execute on function public.rls_auto_enable() from anon, authenticated, public;

-- ---------------------------------------------------------------------
-- Fica um aviso que NÃO se resolve por SQL:
--
--   Authentication → Providers → Email → "Leaked password protection"
--
-- Checa a senha contra o HaveIBeenPwned no cadastro e na troca. Vale ligar
-- no painel. Como o signup está desabilitado e só existe um usuário, o
-- alcance é a troca de senha — mas o custo de ligar é um clique.
-- ---------------------------------------------------------------------
