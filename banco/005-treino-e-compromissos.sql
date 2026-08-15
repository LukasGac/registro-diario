-- =====================================================================
-- Registro Diário — detalhe do treino e vitrine de compromissos
--
-- Duas coisas sem relação entre si, na mesma migração porque foram
-- pedidas juntas em 14/08/2026.
--
-- Aplicar depois de 004.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Detalhe do treino
--
-- `treino` dizia só a modalidade. Sem os quilômetros não dá para conferir
-- a corrida contra o plano de treino — um longão muito acima do previsto
-- só aparece se alguém tiver escrito por acaso no campo de texto livre.
--
-- Sem os grupos musculares não dá para verificar a prioridade declarada
-- no mesmo plano: "fui à academia" não prova nada sobre postura.
-- ---------------------------------------------------------------------
alter table public.dias
  add column if not exists treino_km     numeric(5,2),
  add column if not exists treino_grupos text[];

-- 300 km é absurdo por desenho: o teto existe para pegar dedo errado
-- (150 em vez de 15), não para limitar ninguém. Zero não é corrida.
alter table public.dias drop constraint if exists treino_km_plausivel;
alter table public.dias add constraint treino_km_plausivel
  check (treino_km is null or (treino_km > 0 and treino_km <= 300));

-- ---------------------------------------------------------------------
-- Grupos musculares
--
-- Função `immutable` de novo, pela mesma razão do 003: CHECK não aceita
-- subconsulta, e a checagem de duplicata precisa de uma.
--
-- Recusar repetido não é preciosismo: `{costas,costas}` contaria duas
-- vezes na análise de frequência por grupo, que é justamente a conta que
-- estes campos existem para permitir.
-- ---------------------------------------------------------------------
create or replace function public.treino_grupos_validos(v text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select v is null or (
    array_length(v, 1) between 1 and 6
    and v <@ array['costas','biceps','peito','triceps','ombro','perna']::text[]
    and array_length(v, 1) = (select count(distinct g) from unnest(v) as g)
  );
$$;

alter table public.dias drop constraint if exists treino_grupos_bem_formados;
alter table public.dias add constraint treino_grupos_bem_formados
  check (public.treino_grupos_validos(treino_grupos));

-- Detalhe sem a modalidade correspondente é dado órfão: quilômetro num dia
-- de força, ou grupo muscular num dia em que não houve treino nenhum.
alter table public.dias drop constraint if exists treino_detalhe_coerente;
alter table public.dias add constraint treino_detalhe_coerente
  check (
    (treino_km is null     or treino in ('corrida','ambos'))
    and
    (treino_grupos is null or treino in ('forca','ambos'))
  );

-- ---------------------------------------------------------------------
-- compromissos — vitrine, não fonte
--
-- REGRA QUE NÃO PODE SER QUEBRADA: esta tabela é uma CÓPIA DERIVADA. A
-- verdade sobre o que foi combinado e até quando mora em documentos fora
-- deste repositório. Duas cópias editáveis do mesmo prazo divergem, e
-- depois nenhuma das duas é confiável.
--
-- O que torna a cópia segura é o fluxo ser de mão única: documento →
-- banco, regenerado, nunca o contrário. Por isso o papel `authenticated`
-- recebe só SELECT, mais abaixo. O app MOSTRA e deixa puxar para objetivo
-- do dia; não deixa editar prazo, texto nem marcar concluído.
--
-- Cumprir um compromisso vira um objetivo marcado num dia — que é dado
-- melhor: tem data. Fechar o compromisso na origem continua sendo ato de
-- quem mantém o documento.
--
-- `gerado_em` é o carimbo de defasagem. A vitrine pode estar velha; o que
-- ela não pode é fingir que não está.
-- ---------------------------------------------------------------------
create table if not exists public.compromissos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid()
             references auth.users (id) on delete cascade,

  titulo     text not null check (length(trim(titulo)) between 1 and 160),
  prova      text check (prova is null or length(prova) <= 200),
  prazo      date not null,

  -- Chave estável do item no arquivo de origem ('decisao-3-cotacao'). É o
  -- que permite regenerar a vitrine sem duplicar linha.
  origem     text not null check (origem ~ '^[a-z0-9-]{3,48}$'),
  -- Caminho do arquivo que manda. Fica visível no app de propósito: quem
  -- olhar tem de saber onde está a verdade.
  fonte      text not null,

  gerado_em  timestamptz not null default now(),
  criado_em  timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (user_id, origem)
);

drop trigger if exists compromissos_updated_at on public.compromissos;
create trigger compromissos_updated_at
  before update on public.compromissos
  for each row execute function public.tocar_updated_at();

create index if not exists compromissos_sync
  on public.compromissos (user_id, updated_at);

create index if not exists compromissos_por_prazo
  on public.compromissos (user_id, prazo);

alter table public.compromissos enable row level security;
alter table public.compromissos force row level security;

-- Leitura, e só. Note o `for select`: as outras tabelas usam `for all`.
-- A diferença é o ponto inteiro desta tabela — sem política de escrita,
-- nenhum insert/update/delete casa, e a vitrine não tem como virar fonte
-- nem por bug de cliente nem por chamada direta à API.
drop policy if exists dono_compromissos on public.compromissos;
create policy dono_compromissos on public.compromissos
  for select to authenticated
  using (user_id = auth.uid());

revoke all on public.compromissos from anon, authenticated;
grant select on public.compromissos to authenticated;
