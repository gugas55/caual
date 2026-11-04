-- =====================================================================
-- CAUAL · chat da equipa e presença
--
-- - Conversa de grupo "Equipa CAUAL": cada colaborador novo entra nela
--   automaticamente.
-- - Um colaborador desativado deixa de ver as conversas onde está.
-- - Canal de presença "equipa:presenca" (Realtime privado): só
--   colaboradores ativos o leem e escrevem.
-- =====================================================================

begin;

-- Conversa da equipa (uma só).
alter table public.conversas add column equipa boolean not null default false;
create unique index conversas_equipa_unica on public.conversas (equipa) where equipa;

insert into public.conversas (grupo, nome, equipa, criada_por)
values (true, 'Equipa CAUAL', true, null);

create or replace function private.juntar_a_equipa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.conversa_membros (conversa_id, colaborador_id)
  select c.id, new.id
  from public.conversas c
  where c.equipa
  on conflict do nothing;
  return new;
end;
$$;

revoke all on function private.juntar_a_equipa() from public;

create trigger colaboradores_juntar_a_equipa
  after insert on public.colaboradores
  for each row execute function private.juntar_a_equipa();

-- Quem já for colaborador entra também (hoje não há ninguém, fica por segurança).
insert into public.conversa_membros (conversa_id, colaborador_id)
select c.id, p.id
from public.conversas c
cross join public.colaboradores p
where c.equipa
on conflict do nothing;

-- Só membros ativos contam como membros.
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
    join public.colaboradores c on c.id = m.colaborador_id
    where m.conversa_id = p_conversa
      and m.colaborador_id = (select auth.uid())
      and c.ativo
  );
$$;

-- Presença em tempo real (canal privado).
create policy "presenca_equipa_ler" on realtime.messages
  for select to authenticated
  using (
    (select realtime.topic()) = 'equipa:presenca'
    and realtime.messages.extension = 'presence'
    and (select private.is_colaborador())
  );

create policy "presenca_equipa_anunciar" on realtime.messages
  for insert to authenticated
  with check (
    (select realtime.topic()) = 'equipa:presenca'
    and realtime.messages.extension = 'presence'
    and (select private.is_colaborador())
  );

commit;
