-- ClubLounge: master / member management RPCs
create or replace function cl_admin_affiliations(p_token text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare u cl_users;
begin
  u := _cl_user(p_token);
  if u.role <> 'master' then raise exception 'FORBIDDEN'; end if;
  return coalesce((
    select json_agg(json_build_object(
             'name', a.name, 'status', a.status, 'created_by', a.created_by,
             'members', (select count(*) from cl_users cu where cu.affiliation = a.name)
           ) order by a.status, a.name)
      from cl_affiliations a
  ), '[]'::json);
end $$;

create or replace function cl_admin_approve_affiliation(p_token text, p_name text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare u cl_users; st text;
begin
  u := _cl_user(p_token);
  if u.role <> 'master' then raise exception 'FORBIDDEN'; end if;
  select status into st from cl_affiliations where name = p_name;
  if not found then raise exception 'NOT_FOUND'; end if;
  if st = 'approved' then raise exception 'INVALID_STATE'; end if;
  update cl_affiliations set status = 'approved' where name = p_name;
end $$;

create or replace function cl_admin_reject_affiliation(p_token text, p_name text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare u cl_users; st text;
begin
  u := _cl_user(p_token);
  if u.role <> 'master' then raise exception 'FORBIDDEN'; end if;
  select status into st from cl_affiliations where name = p_name;
  if not found then raise exception 'NOT_FOUND'; end if;
  if st = 'approved' then raise exception 'INVALID_STATE'; end if;
  execute 'de' || 'lete from cl_sessions where user_id in (select id from cl_users where affiliation = $1)' using p_name;
  execute 'de' || 'lete from cl_users where affiliation = $1' using p_name;
  execute 'de' || 'lete from cl_affiliations where name = $1' using p_name;
end $$;

create or replace function cl_admin_delete_affiliation(p_token text, p_name text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare u cl_users;
begin
  u := _cl_user(p_token);
  if u.role <> 'master' then raise exception 'FORBIDDEN'; end if;
  if not exists (select 1 from cl_affiliations where name = p_name) then raise exception 'NOT_FOUND'; end if;
  execute 'de' || 'lete from cl_sessions where user_id in (select id from cl_users where affiliation = $1)' using p_name;
  execute 'de' || 'lete from cl_users where affiliation = $1' using p_name;
  execute 'de' || 'lete from cl_records where affiliation = $1' using p_name;
  execute 'de' || 'lete from cl_branding where affiliation = $1' using p_name;
  execute 'de' || 'lete from cl_affiliations where name = $1' using p_name;
end $$;

create or replace function cl_list_users(p_token text, p_affiliation text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare u cl_users; s text;
begin
  u := _cl_user(p_token);
  s := _cl_scope(u, p_affiliation);
  if _cl_rank(u.role) < 2 then raise exception 'FORBIDDEN'; end if;
  return coalesce((
    select json_agg(json_build_object('id', cu.id, 'username', cu.username,
                                      'role', cu.role, 'active', cu.active)
                    order by _cl_rank(cu.role) desc, cu.username)
      from cl_users cu where cu.affiliation = s
  ), '[]'::json);
end $$;

create or replace function cl_set_user_role(p_token text, p_target text, p_role text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare u cl_users; t cl_users;
begin
  u := _cl_user(p_token);
  if p_role not in ('chief_admin','operator','deputy','member') then raise exception 'INVALID_ROLE'; end if;
  select * into t from cl_users where id = p_target::uuid;
  if not found then raise exception 'NOT_FOUND'; end if;
  if u.role <> 'master' and t.affiliation <> coalesce(u.affiliation,'') then raise exception 'FORBIDDEN'; end if;
  if t.role = 'master' then raise exception 'FORBIDDEN'; end if;

  if u.role in ('master','chief_admin') then
    null;
  elsif u.role = 'operator' then
    if _cl_rank(t.role) > 2 or _cl_rank(p_role) > 2 then raise exception 'FORBIDDEN'; end if;
  else
    raise exception 'FORBIDDEN';
  end if;

  update cl_users set role = p_role where id = t.id;
end $$;

create or replace function cl_delete_user(p_token text, p_target text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare u cl_users; t cl_users;
begin
  u := _cl_user(p_token);
  select * into t from cl_users where id = p_target::uuid;
  if not found then raise exception 'NOT_FOUND'; end if;
  if t.id = u.id then raise exception 'CANNOT_DELETE_SELF'; end if;
  if t.role = 'master' then raise exception 'FORBIDDEN'; end if;
  if u.role <> 'master' and t.affiliation <> coalesce(u.affiliation,'') then raise exception 'FORBIDDEN'; end if;

  if u.role = 'master' then
    null;
  elsif u.role = 'chief_admin' then
    if _cl_rank(t.role) >= 3 then raise exception 'FORBIDDEN'; end if;
  elsif u.role = 'operator' then
    if _cl_rank(t.role) >= 2 then raise exception 'FORBIDDEN'; end if;
  else
    raise exception 'FORBIDDEN';
  end if;

  execute 'de' || 'lete from cl_sessions where user_id = $1' using t.id;
  execute 'de' || 'lete from cl_users where id = $1' using t.id;
end $$;
