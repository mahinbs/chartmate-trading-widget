// Originally Lovable-generated. Migrated to env-var-driven on 2026-05-27
// as part of the ECC P-256 JWT key rotation: the publishable key now lives
// in .env (and Vercel project env) under VITE_SUPABASE_PUBLISHABLE_KEY,
// so future key rotations don't require a code edit + Lovable-regenerator
// drift can't silently revert to a stale key literal.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ?? "https://ssesqiqtndhurfyntgbm.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_PUBLISHABLE_KEY) {
  // Fail loudly at boot rather than 401-spamming every request.
  throw new Error(
    "VITE_SUPABASE_PUBLISHABLE_KEY is missing. " +
    "Set it in .env (local) and Vercel project env (prod)."
  );
}

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});