-- Barbearia Saraiva — setup completo (esquema + segurança + funções + dados iniciais)
-- Cole tudo no SQL Editor do Supabase e clique em Run.


-- >>> supabase/migrations/20261030000001_schema.sql
-- =====================================================================
-- Barbearia Saraiva — esquema principal
-- Fuso da barbearia: America/Fortaleza (UTC-3, sem horário de verão)
-- =====================================================================

create extension if not exists btree_gist with schema extensions;

-- ---------- tipos ----------
create type public.user_role as enum ('client', 'staff', 'owner');
create type public.service_category as enum ('barber', 'beauty');
create type public.appointment_status as enum ('confirmed', 'in_service', 'done', 'no_show', 'cancelled');
create type public.appointment_origin as enum ('app', 'desk');
create type public.payment_method as enum ('pix', 'credit', 'debit', 'cash');

-- ---------- perfis (1:1 com auth.users) ----------
create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  name          text not null default '',
  phone         text,
  role          public.user_role not null default 'client',
  haircut_note  text not null default '',
  favorite_professional_id uuid,
  created_at    timestamptz not null default now()
);

-- ---------- profissionais ----------
create table public.professionals (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid unique references auth.users (id) on delete set null,
  name            text not null,
  role_label      text not null default 'Barbeiro',
  category        public.service_category not null default 'barber',
  photo_url       text,
  commission_pct  numeric(5,2) not null default 50 check (commission_pct between 0 and 100),
  active          boolean not null default true,
  sort            int not null default 0,
  created_at      timestamptz not null default now()
);

alter table public.profiles
  add constraint profiles_favorite_fk foreign key (favorite_professional_id)
  references public.professionals (id) on delete set null;

-- ---------- serviços ----------
create table public.services (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  description   text not null default '',
  category      public.service_category not null,
  price_cents   int not null check (price_cents >= 0),
  duration_min  int not null check (duration_min > 0 and duration_min <= 480),
  popular       boolean not null default false,
  active        boolean not null default true,
  sort          int not null default 0
);

-- ---------- horário de funcionamento (0 = domingo) ----------
create table public.business_hours (
  weekday     smallint primary key check (weekday between 0 and 6),
  open_time   time,
  close_time  time,
  closed      boolean not null default false,
  check (closed or (open_time is not null and close_time is not null and open_time < close_time))
);

-- ---------- bloqueios (folga, almoço, feriado) ----------
-- professional_id nulo = bloqueia a barbearia inteira
create table public.time_blocks (
  id               uuid primary key default gen_random_uuid(),
  professional_id  uuid references public.professionals (id) on delete cascade,
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  reason           text not null default '',
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  check (starts_at < ends_at)
);
create index time_blocks_range_idx on public.time_blocks using gist (tstzrange(starts_at, ends_at));

-- ---------- agendamentos ----------
create table public.appointments (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid references public.profiles (id) on delete set null,
  client_name      text not null,
  client_phone     text not null default '',
  professional_id  uuid not null references public.professionals (id),
  starts_at        timestamptz not null,
  ends_at          timestamptz not null,
  status           public.appointment_status not null default 'confirmed',
  total_cents      int not null default 0,
  payment_method   public.payment_method,
  notes            text not null default '',
  origin           public.appointment_origin not null default 'app',
  created_by       uuid references auth.users (id) on delete set null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (starts_at < ends_at),
  -- impede dois horários sobrepostos para o mesmo profissional (à prova de corrida)
  constraint appointments_no_overlap exclude using gist (
    professional_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status <> 'cancelled' and status <> 'no_show')
);
create index appointments_pro_start_idx on public.appointments (professional_id, starts_at);
create index appointments_client_idx on public.appointments (client_id, starts_at desc);
create index appointments_start_idx on public.appointments (starts_at);

create table public.appointment_services (
  appointment_id  uuid not null references public.appointments (id) on delete cascade,
  service_id      uuid not null references public.services (id),
  name            text not null,          -- cópia do nome/preço no momento do agendamento
  price_cents     int not null,
  duration_min    int not null,
  primary key (appointment_id, service_id)
);

-- ---------- push (PWA) ----------
create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  created_at  timestamptz not null default now()
);

-- ---------- updated_at ----------
create function public.touch_updated_at() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
create trigger appointments_touch before update on public.appointments
  for each row execute function public.touch_updated_at();

-- =====================================================================
-- Funções auxiliares de papel (security definer para evitar recursão no RLS)
-- =====================================================================
create function public.my_role() returns public.user_role
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'client'::public.user_role)
$$;

create function public.is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() = 'owner'
$$;

create function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select public.my_role() in ('staff', 'owner')
$$;

create function public.my_professional_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from public.professionals where user_id = auth.uid()
$$;

-- cria o perfil automaticamente quando alguém se cadastra
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, phone)
  values (new.id,
          coalesce(new.raw_user_meta_data ->> 'name', ''),
          coalesce(new.phone, new.raw_user_meta_data ->> 'phone'))
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- o cliente não pode se promover a dono/barbeiro
create function public.protect_profile_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() nulo = service role / SQL editor (administração)
  if new.role is distinct from old.role and auth.uid() is not null and not public.is_owner() then
    raise exception 'Sem permissão para alterar o papel';
  end if;
  return new;
end $$;
create trigger profiles_protect_role before update on public.profiles
  for each row execute function public.protect_profile_role();

-- >>> supabase/migrations/20261030000002_security.sql
-- =====================================================================
-- Regras de acesso (RLS)
--   cliente  -> vê/edita o próprio perfil e vê os próprios agendamentos
--   barbeiro -> vê e atualiza só a própria agenda; cria bloqueios dele
--   dono     -> vê e edita tudo
-- Agendar e cancelar passam por funções (RPC) que validam as regras.
-- =====================================================================

alter table public.profiles             enable row level security;
alter table public.professionals        enable row level security;
alter table public.services             enable row level security;
alter table public.business_hours       enable row level security;
alter table public.time_blocks          enable row level security;
alter table public.appointments         enable row level security;
alter table public.appointment_services enable row level security;
alter table public.push_subscriptions   enable row level security;

-- ---------- perfis ----------
create policy "perfil: ler o próprio ou equipe lê" on public.profiles
  for select to authenticated using (id = auth.uid() or public.is_staff());
create policy "perfil: editar o próprio" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "perfil: dono edita todos" on public.profiles
  for update to authenticated using (public.is_owner()) with check (public.is_owner());

-- ---------- catálogo público (qualquer um pode ver) ----------
create policy "profissionais: leitura pública" on public.professionals
  for select to anon, authenticated using (active or public.is_staff());
create policy "profissionais: dono gerencia" on public.professionals
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "serviços: leitura pública" on public.services
  for select to anon, authenticated using (active or public.is_staff());
create policy "serviços: dono gerencia" on public.services
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

create policy "horários: leitura pública" on public.business_hours
  for select to anon, authenticated using (true);
create policy "horários: dono gerencia" on public.business_hours
  for all to authenticated using (public.is_owner()) with check (public.is_owner());

-- ---------- bloqueios ----------
create policy "bloqueios: equipe lê" on public.time_blocks
  for select to authenticated using (public.is_staff());
create policy "bloqueios: dono gerencia" on public.time_blocks
  for all to authenticated using (public.is_owner()) with check (public.is_owner());
create policy "bloqueios: barbeiro cria os dele" on public.time_blocks
  for insert to authenticated with check (professional_id = public.my_professional_id());
create policy "bloqueios: barbeiro apaga os dele" on public.time_blocks
  for delete to authenticated using (professional_id = public.my_professional_id());

-- ---------- agendamentos ----------
create policy "agendamentos: cliente vê os seus" on public.appointments
  for select to authenticated using (client_id = auth.uid());
create policy "agendamentos: barbeiro vê a própria agenda" on public.appointments
  for select to authenticated using (professional_id = public.my_professional_id());
create policy "agendamentos: dono vê tudo" on public.appointments
  for select to authenticated using (public.is_owner());
create policy "agendamentos: barbeiro atualiza a própria agenda" on public.appointments
  for update to authenticated
  using (professional_id = public.my_professional_id())
  with check (professional_id = public.my_professional_id());
create policy "agendamentos: dono atualiza tudo" on public.appointments
  for update to authenticated using (public.is_owner()) with check (public.is_owner());

-- só estas colunas podem ser alteradas diretamente (status, pagamento, observação)
revoke insert, update, delete on public.appointments from anon, authenticated;
grant select on public.appointments to authenticated;
grant update (status, payment_method, notes) on public.appointments to authenticated;

create policy "itens: visíveis junto com o agendamento" on public.appointment_services
  for select to authenticated using (
    exists (select 1 from public.appointments a where a.id = appointment_id)
  );
revoke insert, update, delete on public.appointment_services from anon, authenticated;

-- ---------- push ----------
create policy "push: cada um gerencia as suas" on public.push_subscriptions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------- tempo real (agenda do painel atualiza sozinha) ----------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.appointments, public.time_blocks;
  end if;
end $$;

-- >>> supabase/migrations/20261030000003_functions.sql
-- =====================================================================
-- Funções de negócio (RPC)
-- =====================================================================

-- ---------- horários livres de um profissional num dia ----------
create or replace function public.get_available_slots(
  p_professional uuid,
  p_date date,
  p_duration int
) returns table (slot_start timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare
  tz constant text := 'America/Fortaleza';
  bh public.business_hours;
begin
  if p_duration is null or p_duration <= 0 then return; end if;
  if not exists (select 1 from professionals where id = p_professional and active) then return; end if;

  select * into bh from business_hours where weekday = extract(dow from p_date)::int;
  if not found or bh.closed then return; end if;

  return query
  with grid as (
    select (gs at time zone tz) as s
    from generate_series(
      p_date + bh.open_time,
      p_date + bh.close_time - make_interval(mins => p_duration),
      interval '30 minutes'
    ) gs
  )
  select g.s
  from grid g
  where g.s > now() + interval '15 minutes'
    and not exists (
      select 1 from appointments a
      where a.professional_id = p_professional
        and a.status not in ('cancelled', 'no_show')
        and tstzrange(a.starts_at, a.ends_at) && tstzrange(g.s, g.s + make_interval(mins => p_duration))
    )
    and not exists (
      select 1 from time_blocks b
      where (b.professional_id = p_professional or b.professional_id is null)
        and tstzrange(b.starts_at, b.ends_at) && tstzrange(g.s, g.s + make_interval(mins => p_duration))
    )
  order by g.s;
end $$;

-- ---------- dias com pelo menos um horário livre (para a faixa de datas) ----------
create or replace function public.get_available_days(
  p_professional uuid,
  p_from date,
  p_days int,
  p_duration int
) returns table (day date, free_slots int)
language sql stable security definer set search_path = public as $$
  select d::date, (select count(*)::int from public.get_available_slots(p_professional, d::date, p_duration))
  from generate_series(p_from, p_from + (least(p_days, 31) - 1), interval '1 day') d
$$;

-- ---------- criar agendamento ----------
-- Cliente logado: agenda para si.
-- Equipe (balcão/WhatsApp): informa p_client_name/p_client_phone.
create or replace function public.book_appointment(
  p_professional uuid,
  p_service_ids uuid[],
  p_starts_at timestamptz,
  p_notes text default '',
  p_client_name text default null,
  p_client_phone text default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  tz constant text := 'America/Fortaleza';
  uid uuid := auth.uid();
  is_desk boolean;
  pro professionals;
  prof profiles;
  n_req int;
  n_ok int;
  tot_price int;
  tot_dur int;
  ends timestamptz;
  local_start timestamp;
  local_end timestamp;
  bh business_hours;
  new_id uuid;
begin
  if uid is null then raise exception 'Faça login para agendar' using errcode = '28000'; end if;

  is_desk := p_client_name is not null and public.is_staff();
  if p_client_name is not null and not public.is_staff() then
    raise exception 'Sem permissão' using errcode = '42501';
  end if;

  select * into pro from professionals where id = p_professional and active;
  if not found then raise exception 'Profissional indisponível'; end if;

  -- barbeiro só lança encaixe na própria agenda
  if is_desk and not public.is_owner() and pro.id is distinct from public.my_professional_id() then
    raise exception 'Você só pode agendar na sua agenda' using errcode = '42501';
  end if;

  n_req := (select count(distinct x) from unnest(p_service_ids) x);
  if n_req = 0 then raise exception 'Escolha pelo menos um serviço'; end if;

  select count(*), coalesce(sum(price_cents), 0), coalesce(sum(duration_min), 0)
    into n_ok, tot_price, tot_dur
  from services
  where id = any (p_service_ids) and active and category = pro.category;
  if n_ok <> n_req then raise exception 'Serviço inválido para este profissional'; end if;

  ends := p_starts_at + make_interval(mins => tot_dur);

  if not is_desk and p_starts_at < now() + interval '10 minutes' then
    raise exception 'Escolha um horário futuro';
  end if;

  -- dentro do horário de funcionamento
  local_start := p_starts_at at time zone tz;
  local_end := ends at time zone tz;
  select * into bh from business_hours where weekday = extract(dow from local_start)::int;
  if not found or bh.closed
     or local_start::time < bh.open_time
     or local_end::date <> local_start::date
     or local_end::time > bh.close_time then
    raise exception 'Fora do horário de funcionamento';
  end if;

  if exists (
    select 1 from time_blocks b
    where (b.professional_id = pro.id or b.professional_id is null)
      and tstzrange(b.starts_at, b.ends_at) && tstzrange(p_starts_at, ends)
  ) then
    raise exception 'Horário bloqueado';
  end if;

  if not is_desk then
    select * into prof from profiles where id = uid;
    if coalesce(trim(prof.name), '') = '' then raise exception 'Complete seu nome no perfil'; end if;
  end if;

  begin
    insert into appointments (client_id, client_name, client_phone, professional_id, starts_at, ends_at,
                              total_cents, notes, origin, created_by)
    values (case when is_desk then null else uid end,
            case when is_desk then trim(p_client_name) else prof.name end,
            case when is_desk then coalesce(p_client_phone, '') else coalesce(prof.phone, '') end,
            pro.id, p_starts_at, ends, tot_price, coalesce(p_notes, ''),
            case when is_desk then 'desk'::appointment_origin else 'app'::appointment_origin end,
            uid)
    returning id into new_id;
  exception when exclusion_violation then
    raise exception 'Esse horário acabou de ser ocupado' using errcode = 'P0001';
  end;

  insert into appointment_services (appointment_id, service_id, name, price_cents, duration_min)
  select new_id, s.id, s.name, s.price_cents, s.duration_min
  from services s where s.id = any (p_service_ids);

  return new_id;
end $$;

-- ---------- cliente cancela o próprio horário ----------
create or replace function public.cancel_my_appointment(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  update appointments
     set status = 'cancelled'
   where id = p_id
     and client_id = auth.uid()
     and status = 'confirmed'
     and starts_at > now();
  if not found then raise exception 'Não foi possível cancelar este horário'; end if;
end $$;

-- ---------- métricas do painel ----------
-- Dono vê tudo (ou filtra por profissional); barbeiro vê só os próprios números.
create or replace function public.dashboard(
  p_from date,
  p_to date,
  p_professional uuid default null
) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  tz constant text := 'America/Fortaleza';
  pro_filter uuid;
  n_pros int;
  open_min numeric;
  result jsonb;
begin
  if not public.is_staff() then raise exception 'Sem permissão' using errcode = '42501'; end if;
  pro_filter := case when public.is_owner() then p_professional else public.my_professional_id() end;
  if not public.is_owner() and pro_filter is null then raise exception 'Conta sem profissional vinculado'; end if;

  n_pros := case when pro_filter is null then (select count(*) from professionals where active) else 1 end;
  select coalesce(sum(extract(epoch from (bh.close_time - bh.open_time)) / 60), 0)
    into open_min
  from generate_series(p_from, p_to, interval '1 day') d
  join business_hours bh on bh.weekday = extract(dow from d)::int and not bh.closed;

  with base as (
    select a.*, (a.starts_at at time zone tz) as local_start
    from appointments a
    where (a.starts_at at time zone tz)::date between p_from and p_to
      and (pro_filter is null or a.professional_id = pro_filter)
  ),
  done as (select * from base where status = 'done')
  select jsonb_build_object(
    'revenue_cents',   (select coalesce(sum(total_cents), 0) from done),
    'expected_cents',  (select coalesce(sum(total_cents), 0) from base where status in ('confirmed', 'in_service')),
    'done_count',      (select count(*) from done),
    'pending_count',   (select count(*) from base where status in ('confirmed', 'in_service')),
    'no_show_count',   (select count(*) from base where status = 'no_show'),
    'cancelled_count', (select count(*) from base where status = 'cancelled'),
    'booked_minutes',  (select coalesce(sum(extract(epoch from (ends_at - starts_at)) / 60), 0) from base where status <> 'cancelled'),
    'open_minutes',    open_min * n_pros,
    'by_day', (
      select coalesce(jsonb_agg(jsonb_build_object('day', d::date, 'revenue_cents', coalesce(x.rev, 0), 'count', coalesce(x.n, 0)) order by d), '[]')
      from generate_series(p_from, p_to, interval '1 day') d
      left join (select local_start::date dd, sum(total_cents) rev, count(*) n from done group by 1) x on x.dd = d::date
    ),
    'by_hour', (
      select coalesce(jsonb_agg(jsonb_build_object('hour', h, 'revenue_cents', rev, 'count', n, 'scheduled', sch) order by h), '[]')
      from (
        select extract(hour from local_start)::int h,
               coalesce(sum(total_cents) filter (where status = 'done'), 0) rev,
               count(*) filter (where status = 'done') n,
               count(*) filter (where status in ('confirmed', 'in_service')) sch
        from base group by 1
      ) t
    ),
    'by_professional', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'name', p.name, 'photo_url', p.photo_url, 'commission_pct', p.commission_pct,
        'count', coalesce(x.n, 0), 'revenue_cents', coalesce(x.rev, 0),
        'booked_minutes', coalesce(x.mins, 0),
        'commission_cents', round(coalesce(x.rev, 0) * p.commission_pct / 100)
      ) order by coalesce(x.rev, 0) desc, p.sort), '[]')
      from professionals p
      left join (
        select professional_id,
               count(*) filter (where status = 'done') n,
               sum(total_cents) filter (where status = 'done') rev,
               sum(extract(epoch from (ends_at - starts_at)) / 60) filter (where status <> 'cancelled') mins
        from base group by 1
      ) x on x.professional_id = p.id
      where p.active and (pro_filter is null or p.id = pro_filter)
    ),
    'by_service', (
      select coalesce(jsonb_agg(jsonb_build_object('name', name, 'count', n, 'revenue_cents', rev) order by n desc), '[]')
      from (
        select s.name, count(*) n, sum(s.price_cents) rev
        from appointment_services s join done d on d.id = s.appointment_id
        group by s.name order by count(*) desc limit 8
      ) t
    ),
    'by_payment', (
      select coalesce(jsonb_agg(jsonb_build_object('method', payment_method, 'revenue_cents', rev, 'count', n) order by rev desc), '[]')
      from (select coalesce(payment_method::text, 'nao_informado') payment_method, sum(total_cents) rev, count(*) n from done group by 1) t
    )
  ) into result;

  return result;
end $$;

-- ---------- relatório de clientes (só o dono) ----------
create or replace function public.clients_report(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  tz constant text := 'America/Fortaleza';
begin
  if not public.is_owner() then raise exception 'Sem permissão' using errcode = '42501'; end if;
  return (
    with v as (
      -- cliente identificado pela conta ou, no balcão, pelo telefone
      select coalesce(client_id::text, nullif(regexp_replace(client_phone, '\D', '', 'g'), ''), lower(client_name)) ckey,
             client_name, client_phone, professional_id, total_cents, status,
             (starts_at at time zone tz)::date d
      from appointments
      where (starts_at at time zone tz)::date <= p_to
    ),
    agg as (
      select ckey,
             (array_agg(client_name order by d desc))[1] name,
             (array_agg(client_phone order by d desc))[1] phone,
             count(*) filter (where status = 'done') visits,
             coalesce(sum(total_cents) filter (where status = 'done'), 0) spent,
             count(*) filter (where status = 'no_show') no_shows,
             max(d) filter (where status = 'done') last_visit,
             min(d) filter (where status = 'done') first_visit,
             bool_or(status = 'confirmed' and d >= current_date) has_future,
             mode() within group (order by professional_id) fav_pro
      from v group by ckey
    )
    select jsonb_build_object(
      'active',  (select count(*) from agg where last_visit >= p_from),
      'new',     (select count(*) from agg where first_visit between p_from and p_to),
      'top',     (select coalesce(jsonb_agg(t), '[]') from (select name, phone, visits, spent, last_visit, fav_pro from agg where visits > 0 order by spent desc limit 10) t),
      'lost',    (select coalesce(jsonb_agg(t), '[]') from (select name, phone, visits, spent, last_visit, fav_pro from agg
                    where visits >= 2 and last_visit < current_date - 30 and not coalesce(has_future, false)
                    order by visits desc limit 15) t),
      'no_shows',(select coalesce(jsonb_agg(t), '[]') from (select name, phone, no_shows from agg where no_shows > 0 order by no_shows desc limit 8) t)
    )
  );
end $$;

-- ---------- permissões das funções ----------
revoke all on function public.get_available_slots(uuid, date, int) from public;
revoke all on function public.get_available_days(uuid, date, int, int) from public;
revoke all on function public.book_appointment(uuid, uuid[], timestamptz, text, text, text) from public;
revoke all on function public.cancel_my_appointment(uuid) from public;
revoke all on function public.dashboard(date, date, uuid) from public;
revoke all on function public.clients_report(date, date) from public;
grant execute on function public.get_available_slots(uuid, date, int) to anon, authenticated;
grant execute on function public.get_available_days(uuid, date, int, int) to anon, authenticated;
grant execute on function public.book_appointment(uuid, uuid[], timestamptz, text, text, text) to authenticated;
grant execute on function public.cancel_my_appointment(uuid) to authenticated;
grant execute on function public.dashboard(date, date, uuid) to authenticated;
grant execute on function public.clients_report(date, date) to authenticated;

-- >>> supabase/seed.sql
-- =====================================================================
-- Dados iniciais da Barbearia Saraiva
-- Preços, durações e horários são EXEMPLOS: confirme com o dono e ajuste
-- pelo painel (Serviços) ou aqui antes de rodar.
-- =====================================================================

insert into public.business_hours (weekday, open_time, close_time, closed) values
  (0, null,    null,    true),   -- domingo
  (1, '09:00', '20:00', false),
  (2, '09:00', '20:00', false),
  (3, '09:00', '20:00', false),
  (4, '09:00', '20:00', false),
  (5, '09:00', '20:00', false),
  (6, '08:00', '18:00', false)
on conflict (weekday) do update
  set open_time = excluded.open_time, close_time = excluded.close_time, closed = excluded.closed;

insert into public.professionals (name, role_label, category, photo_url, commission_pct, sort) values
  ('Jackson',    'Barbeiro',         'barber', '/team/jackson.jpg',  50, 1),
  ('Henrique',   'Barbeiro',         'barber', '/team/henrique.jpg', 50, 2),
  ('Júnior',     'Barbeiro',         'barber', '/team/junior.jpg',   50, 3),
  ('Willian',    'Barbeiro',         'barber', '/team/willian.jpg',  50, 4),
  ('Barbeiro 5', 'Barbeiro',         'barber', '/team/p4.jpg',       50, 5),
  ('Barbeiro 6', 'Barbeiro',         'barber', '/team/p6.jpg',       50, 6),
  ('Barbeiro 7', 'Barbeiro',         'barber', '/team/p7.jpg',       50, 7),
  ('Barbeiro 8', 'Barbeiro',         'barber', '/team/p8.jpg',       50, 8),
  ('Manicure',   'Unhas & Estética', 'beauty', '/team/mulher.jpg',   60, 9);

insert into public.services (name, description, category, price_cents, duration_min, popular, sort) values
  ('Corte masculino',           'Tesoura e/ou máquina, lavagem e finalização', 'barber',  4000,  40, false, 1),
  ('Barba',                     'Toalha quente, navalha e balm',               'barber',  3000,  30, false, 2),
  ('Corte + Barba',             'O combo completo da casa',                    'barber',  6000,  60, true,  3),
  ('Pezinho / Acabamento',      'Contorno e nuca',                             'barber',  1500,  15, false, 4),
  ('Sobrancelha',               'Na navalha ou pinça',                         'barber',  1500,  10, false, 5),
  ('Pigmentação',               'Barba ou cabelo',                             'barber',  2500,  20, false, 6),
  ('Hidratação capilar',        'Tratamento com máscara',                      'barber',  3000,  20, false, 7),
  ('Luzes',                     'Inclui tonalização',                          'barber', 10000,  90, false, 8),
  ('Platinado',                 'Descoloração global',                         'barber', 13000, 120, false, 9),
  ('Progressiva masculina',     'Alinhamento dos fios',                        'barber',  8000,  60, false, 10),
  ('Manicure',                  'Cutilagem e esmaltação',                      'beauty',  3000,  45, false, 1),
  ('Pedicure',                  'Cutilagem, lixa e esmaltação',                'beauty',  3500,  45, false, 2),
  ('Mão + Pé',                  'Combo completo',                              'beauty',  6000,  80, true,  3),
  ('Esmaltação em gel',         'Duração de até 3 semanas',                    'beauty',  7000,  60, false, 4),
  ('Alongamento em gel',        'Fibra ou molde',                              'beauty', 15000, 120, false, 5),
  ('Manutenção do alongamento', 'A cada 15–20 dias',                           'beauty',  9000,  90, false, 6),
  ('Spa dos pés',               'Esfoliação, hidratação e massagem',           'beauty',  5000,  40, false, 7),
  ('Design de sobrancelha',     'Com ou sem henna',                            'beauty',  3500,  30, false, 8);

-- Depois de criar a conta do DONO (Authentication > Users > Add user, com e-mail e senha),
-- rode no SQL Editor trocando o e-mail:
--   update public.profiles set role = 'owner', name = 'Saraiva'
--   where id = (select id from auth.users where email = 'dono@exemplo.com');
-- Os barbeiros o dono cria pelo próprio painel (Equipe > Criar acesso).
