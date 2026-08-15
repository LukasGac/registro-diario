-- =====================================================================
-- Registro Diário — esquema inicial
--
-- Substitui o par Apps Script + Google Sheets, que só escrevia. A partir
-- daqui o dado tem dono (auth.uid()), é legível pela rede e é isolado por
-- linha. Toda a segurança mora aqui: o cliente é público por definição.
--
-- Aplicar uma vez, no projeto Supabase da região São Paulo.
-- =====================================================================

-- ---------------------------------------------------------------------
-- updated_at é o cursor da sincronização incremental. Tem de vir SEMPRE
-- do relógio do servidor: um celular com a hora errada envenenaria o
-- cursor e faria o pull pular linhas para sempre. O trigger sobrescreve
-- qualquer valor que o cliente tente mandar.
-- ---------------------------------------------------------------------
create or replace function public.tocar_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- contas
-- ---------------------------------------------------------------------
create table public.contas (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid()
                references auth.users (id) on delete cascade,
  slug          text not null check (slug ~ '^[a-z0-9-]{2,32}$'),
  nome          text not null check (length(trim(nome)) between 1 and 40),
  ordem         int  not null default 0,

  -- Nulo = conta ainda sem ponto de partida. O app recusa lançamento nela:
  -- sem saldo inicial, saldo é chute. Ver README, "Primeira vez".
  saldo_inicial numeric(12,2),
  definido_em   date,

  -- Última conferência contra o extrato. Histórico de ajuste que se repete
  -- todo mês é lançamento esquecido, não bug — por isso fica registrado.
  ultima_conferencia date,
  saldo_conferido    numeric(12,2),

  criado_em     timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (user_id, slug),

  -- Ou os dois campos existem, ou nenhum. Meia definição esconde o estado.
  constraint saldo_inicial_completo check (
    (saldo_inicial is null and definido_em is null)
    or (saldo_inicial is not null and definido_em is not null)
  )
);

create trigger contas_updated_at
  before update on public.contas
  for each row execute function public.tocar_updated_at();

-- ---------------------------------------------------------------------
-- lancamentos
--
-- O id é gerado NO CLIENTE (crypto.randomUUID()). É isso que torna a
-- escrita offline idempotente: o aparelho sabe a chave antes de existir
-- rede, então reenviar o mesmo lançamento é upsert, nunca linha nova.
-- ---------------------------------------------------------------------
create table public.lancamentos (
  id            uuid primary key,
  user_id       uuid not null default auth.uid()
                references auth.users (id) on delete cascade,

  data          date not null,
  tipo          text not null
                check (tipo in ('saida','entrada','transferencia','ajuste')),

  conta_id         uuid not null references public.contas (id) on delete restrict,
  conta_destino_id uuid references public.contas (id) on delete restrict,

  grupo         text,
  categoria     text,
  valor         numeric(12,2) not null,
  descricao     text check (descricao is null or length(descricao) <= 200),

  -- Id da linha correspondente na planilha antiga ('2026-08-11-m3k9x').
  -- Existe só para a importação poder rodar duas vezes sem duplicar.
  origem_id     text,

  -- Apagar não some com o histórico: marca a data. O truque antigo de
  -- sobrescrever com tipo 'cancelado' e valor 0 existia porque a planilha
  -- não tem delete — aqui não é mais necessário.
  deleted_at    timestamptz,

  criado_em     timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  unique (user_id, origem_id),

  -- Ajuste carrega o delta com sinal, e é a DIREÇÃO dele que denuncia o
  -- lançamento esquecido (negativo: o app contava a mais). Por isso ele é
  -- o único tipo que aceita negativo — e não aceita zero, que não é ajuste.
  constraint valor_coerente_com_tipo check (
    (tipo = 'ajuste' and valor <> 0)
    or (tipo <> 'ajuste' and valor > 0)
  ),

  -- Transferência tem destino e não tem categoria; o resto é o inverso.
  -- Sem isto, uma transferência com categoria entraria no total do mês e
  -- inflaria um grupo do ORÇAMENTO com dinheiro que só mudou de bolso.
  constraint transferencia_bem_formada check (
    case
      when tipo = 'transferencia' then
        conta_destino_id is not null
        and conta_destino_id <> conta_id
        and grupo is null and categoria is null
      when tipo = 'ajuste' then
        conta_destino_id is null and grupo is null and categoria is null
      else
        conta_destino_id is null
        and grupo is not null and categoria is not null
    end
  )
);

create trigger lancamentos_updated_at
  before update on public.lancamentos
  for each row execute function public.tocar_updated_at();

-- O pull incremental varre por updated_at dentro do usuário. Sem este
-- índice, cada abertura do app faz seq scan na tabela inteira.
create index lancamentos_sync
  on public.lancamentos (user_id, updated_at);

-- O resumo do mês e o saldo filtram por data e conta.
create index lancamentos_por_data
  on public.lancamentos (user_id, data desc) where deleted_at is null;

create index lancamentos_por_conta
  on public.lancamentos (conta_id) where deleted_at is null;

-- ---------------------------------------------------------------------
-- dias — o Registro Diário
--
-- Chave natural (user_id, data): um dia tem um registro. Preserva o upsert
-- por data que o app já fazia contra a planilha.
-- ---------------------------------------------------------------------
create table public.dias (
  user_id    uuid not null default auth.uid()
             references auth.users (id) on delete cascade,
  data       date not null,

  treino     text check (treino is null or treino in ('forca','corrida','ambos','nada')),
  dormiu     time,
  energia    int  check (energia is null or energia between 1 and 5),
  janela     text check (janela is null or length(janela) <= 400),

  criado_em  timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (user_id, data)
);

create trigger dias_updated_at
  before update on public.dias
  for each row execute function public.tocar_updated_at();

create index dias_sync on public.dias (user_id, updated_at);

-- ---------------------------------------------------------------------
-- saldos — a mesma regra de saldoDe() no cliente, para eu conferir na
-- análise do dia 20 e para o teste de aceitação da migração.
--
-- security_invoker é obrigatório: sem ele a view roda com os privilégios
-- do dono e IGNORA o RLS das tabelas base. Seria uma porta lateral aberta.
-- ---------------------------------------------------------------------
create view public.saldos
with (security_invoker = on)
as
select
  c.id      as conta_id,
  c.user_id,
  c.slug,
  c.nome,
  c.saldo_inicial,
  c.ultima_conferencia,
  case when c.saldo_inicial is null then null else
    c.saldo_inicial
    + coalesce((
        select sum(case
                 when l.tipo in ('entrada','ajuste') then l.valor
                 when l.tipo = 'saida' then -l.valor
                 else 0
               end)
        from public.lancamentos l
        where l.conta_id = c.id
          and l.deleted_at is null
          and l.tipo <> 'transferencia'
      ), 0)
    - coalesce((
        select sum(l.valor) from public.lancamentos l
        where l.conta_id = c.id and l.tipo = 'transferencia' and l.deleted_at is null
      ), 0)
    + coalesce((
        select sum(l.valor) from public.lancamentos l
        where l.conta_destino_id = c.id and l.tipo = 'transferencia' and l.deleted_at is null
      ), 0)
  end as saldo
from public.contas c;

-- =====================================================================
-- Row Level Security
--
-- A anon key vive dentro de um HTML público. É o RLS que segura tudo:
-- sem sessão, auth.uid() é nulo e nenhuma policy casa — a chave não lê
-- uma linha sequer.
--
-- O `with check` não é redundante com o `using`: sem ele, um cliente
-- comprometido grava linha com user_id de outra pessoa.
-- =====================================================================

alter table public.contas      enable row level security;
alter table public.lancamentos enable row level security;
alter table public.dias        enable row level security;

alter table public.contas      force row level security;
alter table public.lancamentos force row level security;
alter table public.dias        force row level security;

create policy dono_contas on public.contas
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy dono_lancamentos on public.lancamentos
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy dono_dias on public.dias
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Cinto e suspensório: RLS já bloqueia quem não tem sessão, mas o papel
-- `anon` não tem motivo nenhum para carregar privilégio nestas tabelas.
revoke all on public.contas, public.lancamentos, public.dias, public.saldos from anon;

grant select, insert, update, delete
  on public.contas, public.lancamentos, public.dias to authenticated;
grant select on public.saldos to authenticated;
