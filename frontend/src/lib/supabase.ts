import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const storageKey = "cinerian.auth.token";

export const hasSupabaseEnv = Boolean(supabaseUrl && supabaseAnonKey);

/*
  El boton de Apple solo se muestra cuando el provider esta configurado en
  Supabase y en el Apple Developer Portal. Sin la bandera el boton existiria
  pero fallaria al tocarlo, que es peor que no tenerlo.
*/
export const hasAppleAuth =
  hasSupabaseEnv && import.meta.env.VITE_ENABLE_APPLE_AUTH === "true";

export const supabase = hasSupabaseEnv
  ? createClient(supabaseUrl as string, supabaseAnonKey as string, {
      auth: {
        storageKey,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: "pkce"
      }
    })
  : null;
