import { createClient } from "npm:@supabase/supabase-js@2";
import { createEnvironmentHandler } from "./handler.ts";
function serverKey(): string {
  const named = Deno.env.get("SUPABASE_SECRET_KEYS")?.trim();
  if (named) {
    try {
      const parsed = JSON.parse(named);
      if (typeof parsed.default === "string" && parsed.default) return parsed.default;
    } catch { return named; }
  }
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!legacy) throw new Error("Missing server-side Supabase key");
  return legacy;
}
Deno.serve(createEnvironmentHandler(() => createClient(
  Deno.env.get("SUPABASE_URL") || "", serverKey(),
  { auth: { persistSession: false, autoRefreshToken: false } },
)));
