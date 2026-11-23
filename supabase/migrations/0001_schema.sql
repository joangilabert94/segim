-- Segim · Esquema inicial de Supabase
--
-- Cómo usarlo: Supabase → SQL Editor → New query → pegar todo → Run.
-- Es idempotente en lo esencial (if not exists / drop policy antes de crear), así que
-- se puede volver a ejecutar mientras se itera.
--
-- Modelo: cada tabla cuelga de auth.users por user_id, y el Row Level Security hace que
-- cada usuario solo vea sus filas.
--
-- Ids: rutinas, días, ejercicios de rutina, catálogo y sesiones conservan el id que ya
-- genera la app (`newId()`, texto). Es obligatorio: `sessions.day_id` se cruza con
-- `routine_days.id` para saber qué día toca (suggestDay) y para pintar la sesión en curso.
-- Las filas que en la app no tienen id propio (series planeadas y hechas, ejercicios de la
-- sesión) usan uuid del servidor: se reescriben entero con su padre.
--
-- Convención de orden: la columna `position` (0, 1, 2...) conserva el orden de la app.

create table if not exists public.exercises (
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id          text not null,
  name        text not null,
  muscle_group text,
  load_type   text check (load_type in ('external', 'bodyweight', 'assisted')),
  unilateral  boolean not null default false,
  increment   numeric(5, 2),
  created_at  timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.routines (
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id                text not null,
  name              text not null,
  archived          boolean not null default false,
  source_routine_id text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.routine_days (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id         text not null,
  routine_id text not null,
  name       text not null,
  position   integer not null default 0,
  primary key (user_id, id),
  foreign key (user_id, routine_id) references public.routines (user_id, id) on delete cascade
);

create table if not exists public.routine_exercises (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id           text not null,
  day_id       text not null,
  exercise_id  text,
  name         text not null,
  muscle_group text,
  position     integer not null default 0,
  primary key (user_id, id),
  foreign key (user_id, day_id) references public.routine_days (user_id, id) on delete cascade,
  foreign key (user_id, exercise_id) references public.exercises (user_id, id) on delete set null
);

create table if not exists public.planned_sets (
  user_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id                  uuid not null default gen_random_uuid(),
  routine_exercise_id text not null,
  position            integer not null default 0,
  weight              numeric(7, 2),
  reps                integer not null,
  reps_max            integer,
  duration_sec        integer,
  note                text,
  primary key (user_id, id),
  foreign key (user_id, routine_exercise_id)
    references public.routine_exercises (user_id, id) on delete cascade
);

create table if not exists public.sessions (
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id         text not null,
  date       date not null,
  routine_id text,
  day_id     text,
  day_name   text not null,
  status     text not null check (status in ('in-progress', 'completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.session_entries (
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id           uuid not null default gen_random_uuid(),
  session_id   text not null,
  exercise_id  text,
  exercise_name text not null,
  note         text,
  position     integer not null default 0,
  primary key (user_id, id),
  foreign key (user_id, session_id) references public.sessions (user_id, id) on delete cascade,
  foreign key (user_id, exercise_id) references public.exercises (user_id, id) on delete set null
);

create table if not exists public.performed_sets (
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id               uuid not null default gen_random_uuid(),
  session_entry_id uuid not null,
  position         integer not null default 0,
  weight           numeric(7, 2) not null,
  reps             integer not null,
  reps_max         integer,
  duration_sec     integer,
  done             boolean not null default false,
  extra            boolean not null default false,
  note             text,
  primary key (user_id, id),
  foreign key (user_id, session_entry_id)
    references public.session_entries (user_id, id) on delete cascade
);

-- Una fila por usuario: preferencias de la app.
create table if not exists public.settings (
  user_id               uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  unit                  text not null default 'kg' check (unit in ('kg', 'lb')),
  rest_presets          integer[] not null default '{60,90,120,180,240,300}',
  active_routine_id     text,
  theme                 text not null default 'auto' check (theme in ('auto', 'light', 'dark')),
  auto_backup           boolean not null default false,
  progression_increment numeric(5, 2) not null default 2.5,
  bodyweight            numeric(7, 2),
  updated_at            timestamptz not null default now()
);

-- Índices de las claves foráneas que no van cubiertas por la PK (user_id, ...).
create index if not exists routine_days_routine_idx on public.routine_days (routine_id);
create index if not exists routine_exercises_day_idx on public.routine_exercises (day_id);
create index if not exists routine_exercises_exercise_idx on public.routine_exercises (exercise_id);
create index if not exists planned_sets_exercise_idx on public.planned_sets (routine_exercise_id);
create index if not exists sessions_user_date_idx on public.sessions (user_id, date desc);
create index if not exists session_entries_session_idx on public.session_entries (session_id);
create index if not exists session_entries_exercise_idx on public.session_entries (exercise_id);
create index if not exists performed_sets_entry_idx on public.performed_sets (session_entry_id);

-- updated_at automático en las tablas que guardan "cuándo cambió" (para resolver conflictos).
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_updated_at on public.routines;
create trigger touch_updated_at before update on public.routines
for each row execute function public.touch_updated_at();

drop trigger if exists touch_updated_at on public.sessions;
create trigger touch_updated_at before update on public.sessions
for each row execute function public.touch_updated_at();

drop trigger if exists touch_updated_at on public.settings;
create trigger touch_updated_at before update on public.settings
for each row execute function public.touch_updated_at();

-- Row Level Security: sin políticas, la publishable key no ve nada.
alter table public.exercises         enable row level security;
alter table public.routines          enable row level security;
alter table public.routine_days      enable row level security;
alter table public.routine_exercises enable row level security;
alter table public.planned_sets      enable row level security;
alter table public.sessions          enable row level security;
alter table public.session_entries   enable row level security;
alter table public.performed_sets    enable row level security;
alter table public.settings          enable row level security;

drop policy if exists "own exercises" on public.exercises;
create policy "own exercises" on public.exercises
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own routines" on public.routines;
create policy "own routines" on public.routines
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own routine days" on public.routine_days;
create policy "own routine days" on public.routine_days
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own routine exercises" on public.routine_exercises;
create policy "own routine exercises" on public.routine_exercises
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own planned sets" on public.planned_sets;
create policy "own planned sets" on public.planned_sets
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own sessions" on public.sessions;
create policy "own sessions" on public.sessions
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own session entries" on public.session_entries;
create policy "own session entries" on public.session_entries
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own performed sets" on public.performed_sets;
create policy "own performed sets" on public.performed_sets
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "own settings" on public.settings;
create policy "own settings" on public.settings
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Permisos explícitos: el rol `authenticated` puede consultar y escribir (el RLS decide
-- qué filas), y `anon` no toca ninguna tabla. Supabase ya los crea por defecto, pero así
-- el esquema no depende de la configuración del proyecto.
grant select, insert, update, delete on
  public.exercises, public.routines, public.routine_days, public.routine_exercises,
  public.planned_sets, public.sessions, public.session_entries, public.performed_sets,
  public.settings
  to authenticated;

revoke all on
  public.exercises, public.routines, public.routine_days, public.routine_exercises,
  public.planned_sets, public.sessions, public.session_entries, public.performed_sets,
  public.settings
  from anon;

-- Realtime: cada tabla publicada emite sus cambios. El cliente solo recibe las filas
-- que el RLS le deja leer, así que la autorización es la misma que en las consultas.
do $$
declare
  t text;
begin
  foreach t in array array[
    'exercises', 'routines', 'routine_days', 'routine_exercises', 'planned_sets',
    'sessions', 'session_entries', 'performed_sets', 'settings'
  ] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- Vistas de consulta (security_invoker: respetan el RLS de quien consulta).
create or replace view public.v_routine_plan
with (security_invoker = true) as
select
  r.user_id,
  r.name                as routine,
  d.name                as day,
  d.position            as day_position,
  e.name                as exercise,
  e.muscle_group,
  ps.position           as set_position,
  ps.weight,
  ps.reps,
  coalesce(ps.reps_max, ps.reps) as reps_max,
  ps.duration_sec,
  ps.note
from public.routines r
join public.routine_days d       on d.user_id = r.user_id and d.routine_id = r.id
join public.routine_exercises e  on e.user_id = d.user_id and e.day_id = d.id
left join public.planned_sets ps on ps.user_id = e.user_id and ps.routine_exercise_id = e.id
where not r.archived;

create or replace view public.v_session_sets
with (security_invoker = true) as
select
  s.user_id,
  s.date,
  s.day_name,
  s.status,
  e.exercise_name,
  ps.position          as set_position,
  ps.weight,
  ps.reps,
  ps.duration_sec,
  ps.done,
  ps.extra,
  (ps.weight * ps.reps) as volume
from public.sessions s
join public.session_entries e   on e.user_id = s.user_id and e.session_id = s.id
join public.performed_sets ps   on ps.user_id = e.user_id and ps.session_entry_id = e.id;

grant select on public.v_routine_plan, public.v_session_sets to authenticated;
