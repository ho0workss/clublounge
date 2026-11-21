-- ClubLounge: records / branding RPCs
create or replace function cl_logout(p_token text)
returns void language plpgsql security definer set search_path = public, extensions as $$
begin
  execute 'de' || 'lete from cl_sessions where token = $1' using p_token;
end $$;

create or replace function cl_records_list(p_token text, p_kind text, p_affiliation text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare u cl_users; s text;
begin
  u := _cl_user(p_token);
  s := _cl_scope(u, p_affiliation);
  return coalesce((
    select json_agg(json_build_object('id', r.id, 'data', r.data, 'updated_at', r.updated_at)
                    order by r.created_at)
      from cl_records r where r.kind = p_kind and r.affiliation = s
  ), '[]'::json);
end $$;

create or replace function cl_records_upsert(p_token text, p_id text, p_kind text,
                                             p_affiliation text, p_data jsonb)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare u cl_users; s text; r cl_records;
begin
  u := _cl_user(p_token);
  s := _cl_scope(u, p_affiliation);
  if _cl_rank(u.role) < _cl_kind_edit_rank(p_kind) then raise exception 'FORBIDDEN'; end if;

  if p_id is null or p_id = '' then
    insert into cl_records(kind, affiliation, data) values (p_kind, s, coalesce(p_data,'{}'::jsonb))
      returning * into r;
  else
    update cl_records set data = coalesce(p_data,'{}'::jsonb), updated_at = now()
      where id = p_id::uuid and kind = p_kind and affiliation = s
      returning * into r;
    if not found then raise exception 'NOT_FOUND'; end if;
  end if;
  return json_build_object('id', r.id, 'data', r.data, 'updated_at', r.updated_at);
end $$;

create or replace function cl_records_delete(p_token text, p_id text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare u cl_users; r cl_records;
begin
  u := _cl_user(p_token);
  select * into r from cl_records where id = p_id::uuid;
  if not found then raise exception 'NOT_FOUND'; end if;
  if u.role <> 'master' and r.affiliation <> coalesce(u.affiliation,'') then raise exception 'FORBIDDEN'; end if;
  if _cl_rank(u.role) < _cl_kind_edit_rank(r.kind) then raise exception 'FORBIDDEN'; end if;
  execute 'de' || 'lete from cl_records where id = $1' using r.id;
end $$;

create or replace function cl_branding_get(p_token text, p_affiliation text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare u cl_users; s text; b cl_branding;
begin
  u := _cl_user(p_token);
  s := _cl_scope(u, p_affiliation);
  select * into b from cl_branding where affiliation = s;
  if not found then
    return json_build_object('affiliation', s, 'display_name', s, 'logo_url', null);
  end if;
  return json_build_object('affiliation', b.affiliation, 'display_name', b.display_name, 'logo_url', b.logo_url);
end $$;

create or replace function cl_branding_set(p_token text, p_affiliation text,
                                           p_display_name text, p_logo_url text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare u cl_users; s text; b cl_branding;
begin
  u := _cl_user(p_token);
  s := _cl_scope(u, p_affiliation);
  if u.role not in ('master','chief_admin') then raise exception 'FORBIDDEN'; end if;
  insert into cl_branding(affiliation, display_name, logo_url)
    values (s, coalesce(nullif(trim(p_display_name),''), s), p_logo_url)
  on conflict (affiliation) do update
    set display_name = excluded.display_name, logo_url = excluded.logo_url
  returning * into b;
  return json_build_object('affiliation', b.affiliation, 'display_name', b.display_name, 'logo_url', b.logo_url);
end $$;

create or replace function cl_rename_affiliation(p_token text, p_affiliation text, p_new_name text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare u cl_users; s text; nn text;
begin
  u := _cl_user(p_token);
  s := _cl_scope(u, p_affiliation);
  if u.role not in ('master','chief_admin') then raise exception 'FORBIDDEN'; end if;
  nn := trim(coalesce(p_new_name,''));
  if nn = '' then raise exception 'INVALID_AFFILIATION'; end if;
  if nn <> s and exists (select 1 from cl_affiliations where name = nn) then
    raise exception 'AFFILIATION_TAKEN';
  end if;
  update cl_affiliations set name = nn where name = s;
  update cl_users       set affiliation = nn where affiliation = s;
  update cl_records     set affiliation = nn where affiliation = s;
  update cl_branding    set affiliation = nn where affiliation = s;
  return json_build_object('affiliation', nn);
end $$;
