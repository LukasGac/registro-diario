-- =====================================================================
-- Registro Diário — hora de acordar e objetivos do dia
--
-- Motivo, registrado porque é o tipo de coisa que se esquece: até aqui o
-- app media a hora de dormir e NÃO media a de acordar. A base de sono era
-- calculada contra um despertador de 5h que ninguém nunca mediu — e em
-- 14/08/2026 isso produziu uma média de "4h54" que estava simplesmente
-- errada. Campo não medido não vira análise; vira número inventado com
-- cara de fato.
--
-- Aplicar depois de 001 e 002. Roda uma vez; é idempotente por
-- `if not exists` nas colunas.
-- =====================================================================

-- ---------------------------------------------------------------------
-- Colunas
--
-- `acordou` é nulo em toda linha anterior a esta migração, e continua
-- nulo: não existe hora de acordar para 09 a 13/08 e preencher com um
-- palpite reintroduziria o defeito que esta migração corrige.
--
-- `objetivos` nasce como array vazio, não nulo. A diferença importa: no
-- cliente, `[]` é "nenhum objetivo definido" e é o estado normal de um
-- dia; nulo obrigaria toda leitura a tratar dois casos para o mesmo fato.
-- ---------------------------------------------------------------------
alter table public.dias
  add column if not exists acordou   time,
  add column if not exists objetivos jsonb not null default '[]'::jsonb;

-- ---------------------------------------------------------------------
-- Validação do jsonb
--
-- Uma CHECK constraint não aceita subconsulta, então a regra mora numa
-- função `immutable` — a única forma de validar estrutura de jsonb no
-- banco. Sem isto, `objetivos` seria um campo livre onde qualquer cliente
-- comprometido despeja o que quiser: o RLS protege o dado de OUTRA pessoa,
-- não protege a forma do dado desta.
--
-- Exatamente duas chaves por item (`texto`, `feito`). Recusar chave extra
-- é o que impede a coluna de virar depósito de payload arbitrário.
-- ---------------------------------------------------------------------
create or replace function public.objetivos_validos(v jsonb)
returns boolean
language sql
immutable
-- Sem search_path fixo, quem controla o search_path da sessão pode fazer um
-- nome aqui dentro resolver para um objeto plantado por ele. Só há chamadas a
-- pg_catalog, que continua resolvido mesmo com a lista vazia.
set search_path = ''
as $$
  select v is null or (
    jsonb_typeof(v) = 'array'
    and jsonb_array_length(v) <= 3
    and not exists (
      select 1
      from jsonb_array_elements(v) as o
      where jsonb_typeof(o) <> 'object'
         or jsonb_typeof(o -> 'texto') <> 'string'
         or jsonb_typeof(o -> 'feito') <> 'boolean'
         or char_length(o ->> 'texto') = 0
         or char_length(o ->> 'texto') > 120
         or (select count(*) from jsonb_object_keys(o)) <> 2
    )
  );
$$;

alter table public.dias
  drop constraint if exists objetivos_bem_formados;

alter table public.dias
  add constraint objetivos_bem_formados check (public.objetivos_validos(objetivos));

-- ---------------------------------------------------------------------
-- noites — a base de sono, calculada
--
-- Mesma regra de `minutosDeSono()` em `app\sono.js`, pelo mesmo motivo
-- declarado na view `saldos` do 001: eu preciso conferir a análise do
-- fechamento de mês contra o banco, sem depender do que a tela mostrou.
--
-- A soma de 1440 quando `acordou <= dormiu` é o que faz a noite atravessar
-- a meia-noite. Sem ela, dormir às 22h e acordar às 5h daria -17 horas.
-- ---------------------------------------------------------------------
create or replace view public.noites
with (security_invoker = on)
as
select
  d.user_id,
  d.data,
  d.dormiu,
  d.acordou,
  case
    when d.dormiu is null or d.acordou is null then null
    else
      ((extract(epoch from d.acordou) - extract(epoch from d.dormiu)) / 60)::int
      + case when d.acordou <= d.dormiu then 1440 else 0 end
  end as minutos_de_sono,
  d.treino,
  d.energia
from public.dias d;

-- ---------------------------------------------------------------------
-- objetivos_do_dia — o jsonb aberto em linhas
--
-- Existe para a análise: "quantos objetivos foram cumpridos em agosto"
-- não se responde com operador de jsonb no meio de um group by sem virar
-- consulta ilegível. `with ordinality` preserva a ordem em que ele
-- escreveu, que é a ordem de prioridade dele.
-- ---------------------------------------------------------------------
create or replace view public.objetivos_do_dia
with (security_invoker = on)
as
select
  d.user_id,
  d.data,
  o.ord::int                       as posicao,
  o.item ->> 'texto'               as texto,
  (o.item ->> 'feito')::boolean    as feito
from public.dias d
cross join lateral jsonb_array_elements(d.objetivos)
  with ordinality as o(item, ord);

-- ---------------------------------------------------------------------
-- Permissões — mesma regra do 001: `anon` não carrega privilégio nenhum,
-- e as views herdam o RLS das tabelas base por `security_invoker`.
-- ---------------------------------------------------------------------
revoke all on public.noites, public.objetivos_do_dia from anon;
grant select on public.noites, public.objetivos_do_dia to authenticated;
