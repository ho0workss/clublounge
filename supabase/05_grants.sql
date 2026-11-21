-- ClubLounge: expose only the public cl_* RPCs to the browser key.
-- Tables stay unreachable (RLS on, no policies, privileges revoked);
-- internal _cl_* helpers are never callable from the client.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure::text as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and (p.proname like 'cl\_%' or p.proname like '\_cl\_%')
  loop
    execute format('alter function %s set search_path = public, extensions', f.sig);
  end loop;

  for f in
    select p.oid::regprocedure::text as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like 'cl\_%'
  loop
    execute format('grant execute on function %s to anon, authenticated', f.sig);
  end loop;

  -- Postgres grants EXECUTE on new functions to PUBLIC by default, so the
  -- internal helpers must be revoked from PUBLIC as well as from the API
  -- roles. _cl_user in particular returns a cl_users row, password hash
  -- included, and must never be reachable over /rest/v1/rpc.
  for f in
    select p.oid::regprocedure::text as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname like '\_cl\_%'
  loop
    execute format('revoke all on function %s from public', f.sig);
    execute format('revoke all on function %s from anon, authenticated', f.sig);
  end loop;
end $$;
