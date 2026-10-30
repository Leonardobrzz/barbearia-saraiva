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
