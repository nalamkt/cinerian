import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { ensureProfile, getCurrentSession, type Profile } from "../lib/auth";
import { followUser } from "../lib/follows";
import { PENDING_INVITE_STORAGE_KEY, redeemInvite } from "../lib/invites";
import { supabase } from "../lib/supabase";

type AuthState = {
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  error: string | null;
};

const profileEstablishmentTasks = new Map<string, Promise<Profile>>();

async function establishProfileForUser(user: User): Promise<Profile> {
  const { profile, wasCreated } = await ensureProfile({ user });
  const inviteCode = window.localStorage.getItem(PENDING_INVITE_STORAGE_KEY);

  if (wasCreated && inviteCode) {
    try {
      const inviterId = await redeemInvite(inviteCode, user.id);
      if (inviterId && inviterId !== user.id) {
        await followUser(user.id, inviterId);
      }
    } catch {
      // The account was created successfully; a later login can continue normally.
    } finally {
      window.localStorage.removeItem(PENDING_INVITE_STORAGE_KEY);
    }
  } else if (inviteCode) {
    // Existing members can open a shared link without changing their follows.
    window.localStorage.removeItem(PENDING_INVITE_STORAGE_KEY);
  }

  return profile;
}

function establishProfile(user: User): Promise<Profile> {
  const activeTask = profileEstablishmentTasks.get(user.id);
  if (activeTask) {
    return activeTask;
  }

  const task = establishProfileForUser(user);
  profileEstablishmentTasks.set(user.id, task);
  void task.then(
    () => profileEstablishmentTasks.delete(user.id),
    () => profileEstablishmentTasks.delete(user.id)
  );
  return task;
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
