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

    void bootstrap();

    if (!supabase) {
      return () => {
        isMounted = false;
      };
    }

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
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

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return state;
}
