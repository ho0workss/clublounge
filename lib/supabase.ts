import { createClient } from "@supabase/supabase-js";

// The publishable (anon) key is designed to be exposed in the browser.
// All privileged logic lives behind SECURITY DEFINER RPCs in Postgres,
// so the anon key alone can never read/write ClubLounge tables directly.
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://chjeoxsvydqgcpuwybzt.supabase.co";

const SUPABASE_ANON_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
  "sb_publishable_U0whkMkS2guFzaSyY4PagQ_HTiaqy-Z";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
