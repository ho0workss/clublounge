-- ClubLounge schema: tables
create extension if not exists pgcrypto;

create table if not exists cl_affiliations (
  name       text primary key,
  status     text not null default 'pending' check (status in ('pending','approved')),
  created_by text,
  created_at timestamptz not null default now()
);

create table if not exists cl_users (
  id            uuid primary key default gen_random_uuid(),
  username      text not null unique,
  password_hash text not null,
  role          text not null default 'member'
                check (role in ('master','chief_admin','operator','deputy','member')),
  affiliation   text,
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

create table if not exists cl_sessions (
  token      text primary key,
  user_id    uuid not null,
  expires_at timestamptz not null default now() + interval '3650 days',
  created_at timestamptz not null default now()
);

create table if not exists cl_branding (
  affiliation  text primary key,
  display_name text not null,
  logo_url     text
);

create table if not exists cl_records (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,
  affiliation text not null,
  data        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists cl_records_kind_aff_idx on cl_records(kind, affiliation);
create index if not exists cl_sessions_user_idx    on cl_sessions(user_id);
create index if not exists cl_users_aff_idx        on cl_users(affiliation);

alter table cl_affiliations enable row level security;
alter table cl_users        enable row level security;
alter table cl_sessions     enable row level security;
alter table cl_branding     enable row level security;
alter table cl_records      enable row level security;

revoke all on cl_affiliations, cl_users, cl_sessions, cl_branding, cl_records from anon, authenticated;
