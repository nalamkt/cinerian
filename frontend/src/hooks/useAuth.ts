import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { ensureProfile, getCurrentSession, signOut, type Profile } from "../lib/auth";
import { followUser } from "../lib/follows";
import { PENDING_INVITE_STORAGE_KEY, redeemInvite } from "../lib/invites";
import { supabase } from "../lib/supabase";

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  error: string | null;
};

function isRlsRejection(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  return message.includes("row-level security") || message.includes("policy");
}

async function establishProfile(user: User): Promise<Profile> {
  const pendingCode =
    typeof window === "undefined" ? null : window.localStorage.getItem(PENDING_INVITE_STORAGE_KEY);

  let redeemedInviterId: string | null = null;
  if (pendingCode) {
    try {
      const redemption = await redeemInvite(pendingCode, user.id);
      redeemedInviterId = redemption?.inviterId ?? null;
    } catch {
      redeemedInviterId = null;
    }
  }

  try {
    const { profile, wasCreated } = await ensureProfile({ user });

    if (pendingCode && typeof window !== "undefined") {
      window.localStorage.removeItem(PENDING_INVITE_STORAGE_KEY);
    }

    if (wasCreated && redeemedInviterId) {
      await followUser(user.id, redeemedInviterId);
    }

    return profile;
  } catch (error) {
    if (isRlsRejection(error)) {
      await signOut();
      throw new Error("Invitacion invalida o ya usada. Necesitas un link de invitacion para crear tu cuenta.");
    }

    throw error;
  }
}

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

        const profile = await establishProfile(session.user);
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

        const currentSession = await getCurrentSession();
        setState({
          session: currentSession,
          profile: null,
          isLoading: false,
          error: error instanceof Error ? error.message : "No pude iniciar la sesion."
        });
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

      void establishProfile(session.user)
        .then((profile) => {
          setState({
            session,
            profile,
            isLoading: false,
            error: null
          });
        })
        .catch(async (error) => {
          const currentSession = await getCurrentSession();
          setState({
            session: currentSession,
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
