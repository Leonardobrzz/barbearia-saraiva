import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Cliente com service role — só use em rotas de servidor, depois de checar permissão. */
export function supabaseAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
