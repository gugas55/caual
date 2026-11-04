-- =====================================================================
-- CAUAL · esquema inicial
--
-- Tabelas da app: colaboradores, processos, pedidos de adesão, avisos,
-- agenda (sessões), prazos, notificações e chat entre colaboradores.
--
-- Acesso (RLS): só quem tem sessão iniciada E tem uma linha ativa em
-- public.colaboradores lê e escreve. Uma conta criada no Auth sem essa
-- linha não vê nada. O papel anon não tem acesso a nenhuma tabela.
-- Apagar processos, pedidos, sessões e prazos fica reservado ao painel da
-- Supabase (service role).
-- =====================================================================

begin;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- ---------------------------------------------------------------------
-- Colaboradores: perfil de cada conta do Auth que trabalha no centro
-- ---------------------------------------------------------------------

create table public.colaboradores (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null check (char_length(nome) between 2 and 120),
  cargo text not null default '',
  email text not null unique,
  presenca text not null default 'offline' check (presenca in ('online', 'ausente', 'offline')),
  cor text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

comment on table public.colaboradores is 'Pessoas do centro com acesso à app. Uma linha por conta do Auth.';

-- Funções de apoio às regras de acesso (no esquema private, que a API não expõe).
create or replace function private.is_colaborador()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.colaboradores c
    where c.id = (select auth.uid()) and c.ativo
  );
$$;

revoke all on function private.is_colaborador() from public;
grant execute on function private.is_colaborador() to authenticated;

create or replace function private.set_atualizado_em()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Processos de arbitragem e mediação
-- ---------------------------------------------------------------------

create table public.processos (
  id uuid primary key default gen_random_uuid(),
  numero text not null unique,
  tipo text not null check (tipo in ('arbitragem', 'mediacao')),
  entrada timestamptz not null default now(),
  conclusao timestamptz,
  resultado text check (resultado in ('acordo', 'sentenca', 'sem_acordo', 'desistencia', 'arquivado')),
  fase text not null default 'Entrada',
  materia text not null,
  requerente text not null,
  requerida text not null,
  valor numeric(12, 2) not null default 0 check (valor >= 0),
  responsavel text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  constraint processos_conclusao_resultado check ((conclusao is null) = (resultado is null)),
  constraint processos_resultado_tipo check (
    resultado is null
    or (tipo = 'arbitragem' and resultado <> 'sem_acordo')
    or (tipo = 'mediacao' and resultado <> 'sentenca')
  )
);

comment on column public.processos.numero is 'Número do processo, por exemplo ARB-2026/0001 ou MED-2026/0001.';
comment on column public.processos.resultado is 'Como terminou: acordo e sentenca contam como resolução.';

create index processos_entrada_idx on public.processos (entrada desc);
create index processos_em_curso_idx on public.processos (entrada desc) where conclusao is null;
create index processos_conclusao_idx on public.processos (conclusao) where conclusao is not null;

create trigger processos_atualizado_em
  before update on public.processos
  for each row execute function private.set_atualizado_em();

-- ---------------------------------------------------------------------
-- Pedidos de adesão de empresas ao centro
-- ---------------------------------------------------------------------

create table public.pedidos_adesao (
  id uuid primary key default gen_random_uuid(),
  empresa text not null,
  nif text check (nif ~ '^[0-9]{9}$'),
  setor text not null default '',
  contacto_email text,
  estado text not null default 'novo' check (estado in ('novo', 'em_analise', 'documentacao', 'aprovado', 'recusado')),
  recebido_em timestamptz not null default now(),
  notas text,
  atualizado_em timestamptz not null default now()
);

create index pedidos_adesao_recebido_idx on public.pedidos_adesao (recebido_em desc);

create trigger pedidos_adesao_atualizado_em
  before update on public.pedidos_adesao
  for each row execute function private.set_atualizado_em();

-- ---------------------------------------------------------------------
-- Avisos internos do painel
-- ---------------------------------------------------------------------

create table public.avisos (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (char_length(titulo) between 1 and 90),
  texto text not null check (char_length(texto) between 1 and 400),
  prioridade text not null default 'normal' check (prioridade in ('normal', 'importante', 'urgente')),
  autor_id uuid default auth.uid() references public.colaboradores (id) on delete set null,
  criado_em timestamptz not null default now()
);

create index avisos_criado_idx on public.avisos (criado_em desc);
create index avisos_autor_idx on public.avisos (autor_id);

-- ---------------------------------------------------------------------
-- Agenda (sessões e audiências) e prazos
-- ---------------------------------------------------------------------

create table public.sessoes (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references public.processos (id) on delete cascade,
  tipo text not null check (tipo in ('Audiência arbitral', 'Sessão de mediação', 'Pré-mediação')),
  inicio timestamptz not null,
  local text not null default 'Sala 1',
  responsavel text
);

create index sessoes_inicio_idx on public.sessoes (inicio);
create index sessoes_processo_idx on public.sessoes (processo_id);

create table public.prazos (
  id uuid primary key default gen_random_uuid(),
  processo_id uuid not null references public.processos (id) on delete cascade,
  descricao text not null,
  limite timestamptz not null,
  responsavel text,
  cumprido boolean not null default false
);

create index prazos_abertos_idx on public.prazos (limite) where not cumprido;
create index prazos_processo_idx on public.prazos (processo_id);

-- ---------------------------------------------------------------------
-- Notificações de cada colaborador
-- ---------------------------------------------------------------------

create table public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  destinatario_id uuid not null references public.colaboradores (id) on delete cascade,
  icone text not null default 'info',
  texto text not null,
  lida boolean not null default false,
  criada_em timestamptz not null default now()
);

create index notificacoes_destinatario_idx on public.notificacoes (destinatario_id, criada_em desc);

-- ---------------------------------------------------------------------
-- Chat entre colaboradores
-- ---------------------------------------------------------------------

create table public.conversas (
  id uuid primary key default gen_random_uuid(),
  grupo boolean not null default false,
  nome text,
  criada_por uuid default auth.uid() references public.colaboradores (id) on delete set null,
  criada_em timestamptz not null default now(),
  constraint conversas_nome_grupo check (not grupo or nome is not null)
);

create index conversas_criada_por_idx on public.conversas (criada_por);

create table public.conversa_membros (
  conversa_id uuid not null references public.conversas (id) on delete cascade,
  colaborador_id uuid not null references public.colaboradores (id) on delete cascade,
  ultima_leitura timestamptz not null default now(),
  primary key (conversa_id, colaborador_id)
);

create index conversa_membros_colaborador_idx on public.conversa_membros (colaborador_id);

create table public.mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.conversas (id) on delete cascade,
  autor_id uuid default auth.uid() references public.colaboradores (id) on delete set null,
  texto text not null check (char_length(texto) between 1 and 2000),
  enviada_em timestamptz not null default now()
);

create index mensagens_conversa_idx on public.mensagens (conversa_id, enviada_em);
create index mensagens_autor_idx on public.mensagens (autor_id);

create or replace function private.is_membro(p_conversa uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.conversa_membros m
    where m.conversa_id = p_conversa and m.colaborador_id = (select auth.uid())
  );
$$;

revoke all on function private.is_membro(uuid) from public;
grant execute on function private.is_membro(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Privilégios: nada para anon; alterações a colunas limitadas
-- ---------------------------------------------------------------------

revoke all on all tables in schema public from anon;

revoke update on public.colaboradores from authenticated;
grant update (presenca, cor) on public.colaboradores to authenticated;

revoke update on public.notificacoes from authenticated;
grant update (lida) on public.notificacoes to authenticated;

revoke update on public.conversa_membros from authenticated;
grant update (ultima_leitura) on public.conversa_membros to authenticated;

-- ---------------------------------------------------------------------
-- Regras de acesso (RLS)
-- ---------------------------------------------------------------------

alter table public.colaboradores enable row level security;
alter table public.processos enable row level security;
alter table public.pedidos_adesao enable row level security;
alter table public.avisos enable row level security;
alter table public.sessoes enable row level security;
alter table public.prazos enable row level security;
alter table public.notificacoes enable row level security;
alter table public.conversas enable row level security;
alter table public.conversa_membros enable row level security;
alter table public.mensagens enable row level security;

-- Colaboradores: todos os colegas veem a equipa; cada um muda a sua presença.
create policy "colaboradores_ver" on public.colaboradores
  for select to authenticated
  using ((select private.is_colaborador()));

create policy "colaboradores_atualizar_proprio" on public.colaboradores
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Processos, pedidos de adesão, sessões e prazos: trabalho comum da equipa.
create policy "processos_ver" on public.processos
  for select to authenticated using ((select private.is_colaborador()));
create policy "processos_criar" on public.processos
  for insert to authenticated with check ((select private.is_colaborador()));
create policy "processos_alterar" on public.processos
  for update to authenticated
  using ((select private.is_colaborador()))
  with check ((select private.is_colaborador()));

create policy "pedidos_adesao_ver" on public.pedidos_adesao
  for select to authenticated using ((select private.is_colaborador()));
create policy "pedidos_adesao_criar" on public.pedidos_adesao
  for insert to authenticated with check ((select private.is_colaborador()));
create policy "pedidos_adesao_alterar" on public.pedidos_adesao
  for update to authenticated
  using ((select private.is_colaborador()))
  with check ((select private.is_colaborador()));

create policy "sessoes_ver" on public.sessoes
  for select to authenticated using ((select private.is_colaborador()));
create policy "sessoes_criar" on public.sessoes
  for insert to authenticated with check ((select private.is_colaborador()));
create policy "sessoes_alterar" on public.sessoes
  for update to authenticated
  using ((select private.is_colaborador()))
  with check ((select private.is_colaborador()));

create policy "prazos_ver" on public.prazos
  for select to authenticated using ((select private.is_colaborador()));
create policy "prazos_criar" on public.prazos
  for insert to authenticated with check ((select private.is_colaborador()));
create policy "prazos_alterar" on public.prazos
  for update to authenticated
  using ((select private.is_colaborador()))
  with check ((select private.is_colaborador()));

-- Avisos: todos leem; cada um publica em seu nome e só mexe nos seus.
create policy "avisos_ver" on public.avisos
  for select to authenticated using ((select private.is_colaborador()));
create policy "avisos_publicar" on public.avisos
  for insert to authenticated
  with check ((select private.is_colaborador()) and autor_id = (select auth.uid()));
create policy "avisos_alterar_proprio" on public.avisos
  for update to authenticated
  using (autor_id = (select auth.uid()))
  with check (autor_id = (select auth.uid()));
create policy "avisos_apagar_proprio" on public.avisos
  for delete to authenticated
  using (autor_id = (select auth.uid()));

-- Notificações: cada um vê e marca como lidas só as suas.
create policy "notificacoes_ver_proprias" on public.notificacoes
  for select to authenticated using (destinatario_id = (select auth.uid()));
create policy "notificacoes_marcar_lidas" on public.notificacoes
  for update to authenticated
  using (destinatario_id = (select auth.uid()))
  with check (destinatario_id = (select auth.uid()));

-- Conversas: veem-nas os membros (e quem a criou, para poder juntar membros).
create policy "conversas_ver" on public.conversas
  for select to authenticated
  using ((select private.is_membro(id)) or criada_por = (select auth.uid()));
create policy "conversas_criar" on public.conversas
  for insert to authenticated
  with check ((select private.is_colaborador()) and criada_por = (select auth.uid()));

-- Membros: quem está na conversa vê os outros membros; quem a criou junta membros;
-- cada um atualiza a sua última leitura.
create policy "conversa_membros_ver" on public.conversa_membros
  for select to authenticated
  using ((select private.is_membro(conversa_id)));
create policy "conversa_membros_juntar" on public.conversa_membros
  for insert to authenticated
  with check (
    (select private.is_colaborador())
    and exists (
      select 1 from public.conversas c
      where c.id = conversa_id and c.criada_por = (select auth.uid())
    )
  );
create policy "conversa_membros_ler" on public.conversa_membros
  for update to authenticated
  using (colaborador_id = (select auth.uid()))
  with check (colaborador_id = (select auth.uid()));

-- Mensagens: só os membros da conversa leem e escrevem, sempre em seu nome.
create policy "mensagens_ver" on public.mensagens
  for select to authenticated
  using ((select private.is_membro(conversa_id)));
create policy "mensagens_enviar" on public.mensagens
  for insert to authenticated
  with check (autor_id = (select auth.uid()) and (select private.is_membro(conversa_id)));

-- Tempo real para o chat e as notificações (respeita as regras acima).
alter publication supabase_realtime add table public.mensagens, public.notificacoes;

commit;
