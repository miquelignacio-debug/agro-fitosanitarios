-- ============================================================
-- PROGRAMA FITOSANITARIO — Correr en Supabase SQL Editor
-- ============================================================

create table if not exists programas_fitosanitarios (
  id         uuid primary key default gen_random_uuid(),
  empresa_id uuid not null references empresas(id) on delete cascade,
  nombre     text not null,
  temporada  text not null,
  activo     boolean not null default true,
  notas      text,
  created_at timestamptz not null default now()
);

create table if not exists programa_cuarteles (
  programa_id uuid not null references programas_fitosanitarios(id) on delete cascade,
  cuartel_id  uuid not null references cuarteles(id) on delete cascade,
  primary key (programa_id, cuartel_id)
);

create table if not exists programa_etapas (
  id                uuid primary key default gen_random_uuid(),
  programa_id       uuid not null references programas_fitosanitarios(id) on delete cascade,
  numero            int  not null,
  etapa_fenologica  text not null,
  mojamiento_ltha   numeric,
  notas             text,
  created_at        timestamptz not null default now()
);

create table if not exists programa_etapa_lineas (
  id              uuid primary key default gen_random_uuid(),
  etapa_id        uuid not null references programa_etapas(id) on delete cascade,
  objetivo        text,
  producto_id     uuid references productos(id),
  producto_nombre text not null,
  dosis_valor     numeric,
  dosis_unidad    text not null default 'cc/100lt',
  destacado       boolean not null default false,
  orden           int not null default 0,
  created_at      timestamptz not null default now()
);

-- RLS (ajustar si el proyecto usa políticas más estrictas)
alter table programas_fitosanitarios  enable row level security;
alter table programa_cuarteles        enable row level security;
alter table programa_etapas           enable row level security;
alter table programa_etapa_lineas     enable row level security;

create policy "auth_users" on programas_fitosanitarios  for all to authenticated using (true) with check (true);
create policy "auth_users" on programa_cuarteles        for all to authenticated using (true) with check (true);
create policy "auth_users" on programa_etapas           for all to authenticated using (true) with check (true);
create policy "auth_users" on programa_etapa_lineas     for all to authenticated using (true) with check (true);