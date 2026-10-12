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

    void bootstrap();

    if (!supabase) {
      return () => {
        isMounted = false;
      };
    }

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Un cierre de sesion real es el unico evento que debe sacar al usuario
      // de la app. INITIAL_SESSION puede llegar mientras Safari rehidrata el
      // storage, y no debe causar un flash del formulario de acceso.
      if (event === "SIGNED_OUT") {
        setState({
          session: null,
          profile: null,
          isLoading: false,
          error: null
        });
        return;
      }

      if (!session?.user) {
        return;
      }

      // Una renovacion conserva el mismo usuario y no necesita volver a
      // consultar o crear su perfil. Evitamos sumar una segunda operacion de
      // red cada vez que el navegador despierta una pestana en segundo plano.
      if (event === "TOKEN_REFRESHED") {
        setState((current) => ({
          ...current,
          session
        }));
        return;
      }

      setState((current) => ({
        ...current,
        session,
        /*
          Solo la primera resolucion bloquea. onAuthStateChange tambien dispara
          en cada refresh de token y al volver a la pestana: con el perfil ya
          cargado, eso prendia "Cargando sesion..." encima de la app sin que
          hubiera nada que esperar.
        */
        isLoading: current.profile === null
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
