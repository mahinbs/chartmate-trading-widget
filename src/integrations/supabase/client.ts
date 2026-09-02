// Originally Lovable-generated. Migrated to env-var-driven on 2026-05-27
// as part of the ECC P-256 JWT key rotation: the publishable key now lives
// in .env (and Vercel project env) under VITE_SUPABASE_PUBLISHABLE_KEY,
// so future key rotations don't require a code edit + Lovable-regenerator
// drift can't silently revert to a stale key literal.
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

// --- Backend migration 2026-08-28 ---------------------------------------
// The old project (ssesqiqtndhurfyntgbm) was PAUSED, taking the app down.
// Defaults below point at the migrated project. Env vars still win for
// future rotations, but any value still referencing the dead project is
// ignored so a stale Vercel env var can't take the site down again.
// NOTE: the publishable key is public by design (it ships in the bundle).
const DEAD_PROJECT_REF = "ssesqiqtndhurfyntgbm";
const DEFAULT_SUPABASE_URL = "https://qvrtpagkhibhqyjryfzs.supabase.co";
const DEFAULT_PUBLISHABLE_KEY = "sb_publishable_zcRLHRmTz5XIiDWkEswH7A_SfALftdY";

const envUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const envKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

// If the env URL is absent or points at the dead project, fall back to the
// migrated project — and in that case the env key belongs to the old project
// too, so use the matching default key rather than mixing the two.
const usingEnv = !!envUrl && !envUrl.includes(DEAD_PROJECT_REF);

const SUPABASE_URL = usingEnv ? (envUrl as string) : DEFAULT_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = usingEnv && envKey ? envKey : DEFAULT_PUBLISHABLE_KEY;

// Import the supabase client like this:
// import { supabase } from "@/integrations/supabase/client";

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});