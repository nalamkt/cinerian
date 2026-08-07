import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { ensureProfile, getCurrentSession, type Profile } from "../lib/auth";
import { supabase } from "../lib/supabase";

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  error: string | null;
};

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    session: null,
    profile: null,
    isLoading: true,
    error: null
  });

  useEffect(() => {
    let isMounted = true;

    async function bootstrap() {
      try {
        const session = await getCurrentSession();
        if (!isMounted) {
          return;
        }

        if (!session?.user) {
          setState({
            session: null,
            profile: null,
            isLoading: false,
            error: null
          });
          return;
        }

        const profile = await ensureProfile({ user: session.user });
        if (!isMounted) {
          return;
        }

        setState({
          session,
          profile,
          isLoading: false,
          error: null
        });
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setState((current) => ({
          ...current,
          isLoading: false,
          error: error instanceof Error ? error.message : "No pude iniciar la sesion."
        }));
      }
    }

    async function recoverSession() {
      if (!supabase) {
        return;
      }

      try {
        const {
          data: { session }
        } = await supabase.auth.getSession();

        if (!session) {
          return;
        }

        await supabase.auth.refreshSession();
      } catch {
        // Let the regular auth listener and bootstrap flow own visible errors.
      }
    }

    void bootstrap();
    void recoverSession();

    if (!supabase) {
      return () => {
        isMounted = false;
      };
    }

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!session?.user) {
        setState({
          session: null,
          profile: null,
          isLoading: false,
          error: null
        });
        return;
      }

      setState((current) => ({
        ...current,
        session,
        isLoading: true
      }));

      if (event === "TOKEN_REFRESHED") {
        setState((current) => ({
          ...current,
          session
        }));
      }

      void ensureProfile({ user: session.user })
        .then((profile) => {
          setState({
            session,
            profile,
            isLoading: false,
            error: null
          });
        })
        .catch((error) => {
          setState({
            session,
            profile: null,
            isLoading: false,
            error: error instanceof Error ? error.message : "No pude cargar el perfil."
          });
        });
    });

    function handleVisibilityRecovery() {
      if (document.visibilityState === "visible") {
        void recoverSession();
      }
    }

    function handlePageShowRecovery() {
      void recoverSession();
    }

    function handleOnlineRecovery() {
      void recoverSession();
    }

    window.addEventListener("pageshow", handlePageShowRecovery);
    window.addEventListener("online", handleOnlineRecovery);
    document.addEventListener("visibilitychange", handleVisibilityRecovery);

    return () => {
      isMounted = false;
      subscription.unsubscribe();
      window.removeEventListener("pageshow", handlePageShowRecovery);
      window.removeEventListener("online", handleOnlineRecovery);
      document.removeEventListener("visibilitychange", handleVisibilityRecovery);
    };
  }, []);

  return state;
}
