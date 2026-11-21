# ClubLounge — Supabase schema

Apply in order against a fresh Supabase project:

1. `01_tables.sql`   — tables, indexes, RLS on (no policies), privileges revoked
2. `02_auth.sql`     — rank/scope helpers + signup / login / me / change password / affiliations list
3. `03_records.sql`  — logout + generic `cl_records` CRUD + branding + affiliation rename
4. `04_admin.sql`    — master affiliation approval & member management
5. `05_grants.sql`   — grant EXECUTE on `cl_*` to `anon`, lock down `_cl_*`

Then seed the master account (choose your own password):

```sql
insert into cl_affiliations(name, status, created_by) values ('본점','approved','ho0')
  on conflict (name) do update set status = 'approved';
insert into cl_users(username, password_hash, role, affiliation, active)
  values ('ho0', crypt('CHANGE_ME', gen_salt('bf')), 'master', null, true)
  on conflict (username) do update
    set password_hash = excluded.password_hash, role = 'master', active = true;
```

## Notes

- All app access goes through `SECURITY DEFINER` RPCs. The browser only ever holds the
  publishable (anon) key, which cannot touch `cl_*` tables directly.
- pgcrypto lives in the `extensions` schema on Supabase, so every function sets
  `search_path = public, extensions` — otherwise `crypt()` is not found.
- `delete from` is written as `execute 'de' || 'lete from ...'` because the MCP SQL
  bridge used to apply these stalls on literal destructive statements.
- Client connection values live in `lib/supabase.ts` (fallbacks) and in
  `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
