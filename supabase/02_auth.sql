-- ClubLounge: helpers + auth RPCs
create or replace function _cl_rank(p_role text) returns int
language sql immutable as $$
  select case p_role
    when 'master' then 4 when 'chief_admin' then 3
    when 'operator' then 2 when 'deputy' then 1 else 0 end;
$$;

-- minimum rank required to WRITE a record of this kind
create or replace function _cl_kind_edit_rank(p_kind text) returns int
language sql immutable as $$
  select case p_kind
    when 'liquor' then 2 when 'liquor_set' then 2 when 'beverage' then 2
    when 'table' then 2 when 'venue' then 2
    when 'supply' then 1 when 'shift' then 1
    else 0 end;
$$;

create or replace function _cl_user(p_token text) returns cl_users
language plpgsql security definer set search_path = public, extensions as $$
declare u cl_users;
begin
  if p_token is null or p_token = '' then raise exception 'NOT_AUTHENTICATED'; end if;
  select cu.* into u from cl_users cu
    join cl_sessions s on s.user_id = cu.id
   where s.token = p_token and s.expires_at > now();
  if not found then raise exception 'NOT_AUTHENTICATED'; end if;
  if not u.active then raise exception 'ACCOUNT_INACTIVE'; end if;
  return u;
end $$;

-- which affiliation this caller is allowed to act on
create or replace function _cl_scope(u cl_users, p_affiliation text) returns text
language plpgsql immutable as $$
declare s text;
begin
  if u.role = 'master' then
    s := coalesce(nullif(p_affiliation,''), u.affiliation);
  else
    s := u.affiliation;
  end if;
  if s is null or s = '' then raise exception 'AFFILIATION_REQUIRED'; end if;
  return s;
end $$;

create or replace function cl_signup(p_username text, p_password text, p_affiliation text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare aff cl_affiliations; uid uuid; tok text; new_role text; st text;
begin
  if p_username is null or length(trim(p_username)) < 2 then raise exception 'INVALID_USERNAME'; end if;
  if p_password is null or length(p_password) < 4 then raise exception 'INVALID_PASSWORD'; end if;
  if p_affiliation is null or length(trim(p_affiliation)) = 0 then raise exception 'INVALID_AFFILIATION'; end if;

  p_username := trim(p_username);
  p_affiliation := trim(p_affiliation);

  if exists (select 1 from cl_users where username = p_username) then
    raise exception 'USERNAME_TAKEN';
  end if;

  select * into aff from cl_affiliations where name = p_affiliation;
  if not found then
    insert into cl_affiliations(name, status, created_by)
      values (p_affiliation, 'pending', p_username);
    new_role := 'chief_admin'; st := 'pending';
  else
    new_role := 'member'; st := aff.status;
  end if;

  insert into cl_users(username, password_hash, role, affiliation, active)
    values (p_username, crypt(p_password, gen_salt('bf')), new_role, p_affiliation, true)
    returning id into uid;

  if st <> 'approved' then
    return json_build_object('pending', true, 'affiliation', p_affiliation);
  end if;

  tok := encode(gen_random_bytes(32), 'hex');
  insert into cl_sessions(token, user_id) values (tok, uid);
  return json_build_object('pending', false, 'token', tok, 'username', p_username,
                           'role', new_role, 'affiliation', p_affiliation);
end $$;

create or replace function cl_login(p_username text, p_password text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare u cl_users; tok text; st text;
begin
  select * into u from cl_users where username = trim(coalesce(p_username,''));
  if not found or u.password_hash <> crypt(p_password, u.password_hash) then
    raise exception 'INVALID_CREDENTIALS';
  end if;
  if not u.active then raise exception 'ACCOUNT_INACTIVE'; end if;

  if u.affiliation is not null then
    select status into st from cl_affiliations where name = u.affiliation;
    if coalesce(st,'pending') <> 'approved' then raise exception 'PENDING_APPROVAL'; end if;
  end if;

  tok := encode(gen_random_bytes(32), 'hex');
  insert into cl_sessions(token, user_id) values (tok, u.id);
  return json_build_object('pending', false, 'token', tok, 'username', u.username,
                           'role', u.role, 'affiliation', u.affiliation);
end $$;

create or replace function cl_me(p_token text)
returns json language plpgsql security definer set search_path = public, extensions as $$
declare u cl_users;
begin
  u := _cl_user(p_token);
  return json_build_object('username', u.username, 'role', u.role, 'affiliation', u.affiliation);
end $$;

create or replace function cl_change_password(p_token text, p_old text, p_new text)
returns void language plpgsql security definer set search_path = public, extensions as $$
declare u cl_users;
begin
  u := _cl_user(p_token);
  if u.password_hash <> crypt(p_old, u.password_hash) then raise exception 'INVALID_CREDENTIALS'; end if;
  if p_new is null or length(p_new) < 4 then raise exception 'INVALID_PASSWORD'; end if;
  update cl_users set password_hash = crypt(p_new, gen_salt('bf')) where id = u.id;
end $$;

create or replace function cl_affiliations_list()
returns json language sql security definer set search_path = public, extensions as $$
  select coalesce(json_agg(name order by name), '[]'::json)
    from cl_affiliations where status = 'approved';
$$;
