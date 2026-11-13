import { AuthPanel } from "./components/AuthPanel";
import { AuthShowcase } from "./components/AuthShowcase";
import { AuthSteps } from "./components/AuthSteps";
import { AppViewStack } from "./components/AppViewStack";
import { CinerianLogo } from "./components/CinerianLogo";
import { DiscoveryHub } from "./components/DiscoveryHub";
import { FeedPanel } from "./components/FeedPanel";
import { FollowSuggestionsModal } from "./components/FollowSuggestionsModal";
import { InboxPanel } from "./components/InboxPanel";
import { LoadingState } from "./components/LoadingState";
import { MediaDetailsProvider } from "./components/MediaDetailsModal";
import { ProfilePanel } from "./components/ProfilePanel";
import { SharedUserPage } from "./components/SharedUserPage";
import { UserProfilePage } from "./components/UserProfilePage";
import { VisualReadyGate } from "./components/VisualReadyGate";
import { WelcomeOnboarding } from "./components/WelcomeOnboarding";
import { useAuth } from "./hooks/useAuth";
import { usePublicFeatureFlags } from "./hooks/usePublicFeatureFlags";
import { getAccessControl, isAppView, type AppView } from "./lib/access";
import { MAIN_NAV_ITEMS, resolveApbView } from "./lib/apbNavigation";
import { trackProductEvent } from "./lib/analytics";
import { signOut } from "./lib/auth";
import { fetchDiscoverFilters } from "./lib/discoverFilters";
import { fetchUnreadInboxCount, INBOX_UPDATED_EVENT } from "./lib/inbox";
import { createAndShareInvite, PENDING_INVITE_STORAGE_KEY } from "./lib/invites";
import { clearOneSignalUser, identifyOneSignalUser } from "./lib/oneSignal";
import { recordNotificationActivity } from "./lib/pushNotifications";
import {
  buildSharedProfilePath,
  parseSharedProfilePath,
  shareProfileLink
} from "./lib/profileShare";
import { hasSupabaseEnv, supabase } from "./lib/supabase";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Profile } from "./lib/auth";
export const FEED_SCROLL_TO_TOP_EVENT = "cinerian:feed-scroll-to-top";
export const FEED_REFRESH_EDITORIAL_EVENT = "cinerian:feed-refresh-editorial";
const ACTIVE_VIEW_STORAGE_KEY = "cinerian:active-view";
const SCROLLBAR_REVEAL_SELECTOR = [
  ".timeline-editorial__grid",
  ".search-browse__rail",
  ".search-browse__talent-rail",
  ".media-modal__cast--carousel",
  ".inbox-subtabs"
].join(", ");

function getStoredActiveView(userId: string) {
  try {
    const storedView = window.localStorage.getItem(`${ACTIVE_VIEW_STORAGE_KEY}:${userId}`);
    return isAppView(storedView) ? (storedView === "inbox" ? "feed" : storedView) : null;
  } catch {
    return null;
  }
}

function getRequestedView() {
  const view = new URLSearchParams(window.location.search).get("view");
  return isAppView(view) ? view : null;
}

function DockIcon({ id }: { id: AppView }) {
  if (id === "feed") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" />
      </svg>
    );
  }

  if (id === "search") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="6.5" />
        <path d="m16 16 4 4" />
      </svg>
    );
  }

  if (id === "recommendations") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m12 3 2.6 5.27 5.82.85-4.21 4.1.99 5.78L12 16.22 6.8 19l1-5.78L3.58 9.12l5.82-.85z" />
      </svg>
    );
  }

  if (id === "watching") {
    return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m10 9 5 3-5 3z" /></svg>;
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  );
}

function LogoutIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4" />
      <path d="M10 17l5-5-5-5" />
      <path d="M15 12H4" />
    </svg>
  );
}

type ViewSessionRef = {
  startedAt: number;
  view: AppView;
  userId: string;
};

export default function App() {
  const { session, profile, isLoading, error } = useAuth();
  const { enabledFeatures, defaultView, isLoading: isLoadingPublicConfiguration } = usePublicFeatureFlags();
  const sessionUserId = session?.user.id ?? null;
  const [localProfile, setLocalProfile] = useState<Profile | null>(profile);
  const [activeView, setActiveView] = useState<AppView>("feed");
  const [isActiveViewRestored, setIsActiveViewRestored] = useState(false);
  const [unreadInboxCount, setUnreadInboxCount] = useState(0);
  const [highlightedFeedPost, setHighlightedFeedPost] = useState<{
    postId: string;
    openComments?: boolean;
    focusCommentInput?: boolean;
  } | null>(null);
  const [selectedProfileRoute, setSelectedProfileRoute] = useState<{
    userId?: string;
    username: string;
  } | null>(() => parseSharedProfilePath(window.location.pathname));
  const [shareLabel, setShareLabel] = useState("Compartir perfil");
  const [inviteLabel, setInviteLabel] = useState("Invitar");
  const [showWelcomeOnboarding, setShowWelcomeOnboarding] = useState(false);
  const [showFollowSuggestions, setShowFollowSuggestions] = useState(false);
  const viewSessionRef = useRef<ViewSessionRef | null>(null);
  const followSuggestionsLoginRef = useRef<string | null>(null);
  const oneSignalUserRef = useRef<string | null | undefined>(undefined);
  const oneSignalLinkedRef = useRef<string | null>(null);
  const oneSignalPendingRef = useRef<string | null>(null);
  const hasAppliedDefaultViewRef = useRef(false);
  const restoredActiveViewUserRef = useRef<string | null>(null);
  const persistedActiveViewUserRef = useRef<string | null>(null);
  const accessControl = useMemo(
    () =>
      getAccessControl({
        session,
        profile: localProfile,
        enabledFeatureOverrides: enabledFeatures
      }),
    [enabledFeatures, localProfile, session]
  );
  const canSearch = accessControl.canAccessView("search");
  const canDiscover = accessControl.canAccessView("recommendations");
  const hasDiscoveryAccess = canSearch || canDiscover;
  const visibleDockItems = useMemo(
    () => MAIN_NAV_ITEMS.filter((item) => item.id === "recommendations" ? hasDiscoveryAccess : accessControl.canAccessView(item.id)),
    [accessControl, hasDiscoveryAccess]
  );
  const isDiscoverActive = activeView === "recommendations" && !selectedProfileRoute;

  useEffect(() => {
    function dismissTopmostPopup(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented || event.isComposing) {
        return;
      }

      const dismissControls = Array.from(
        document.querySelectorAll<HTMLButtonElement>("[data-escape-dismiss]")
      ).filter((control) => {
        const style = window.getComputedStyle(control);
        return (
          !control.disabled &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          control.getClientRects().length > 0
        );
      });
      const topmostControl = dismissControls[dismissControls.length - 1];

      if (!topmostControl) {
        return;
      }

      // Each popup exposes its own dismissal action; Escape only closes the top layer.
      event.preventDefault();
      event.stopImmediatePropagation();
      topmostControl.click();
    }

    window.addEventListener("keydown", dismissTopmostPopup, true);
    return () => window.removeEventListener("keydown", dismissTopmostPopup, true);
  }, []);

  useEffect(() => {
    const hideTimers = new WeakMap<HTMLElement, number>();

    function revealScrollbar(event: Event) {
      const target = event.target;
      if (!(target instanceof HTMLElement) || !target.matches(SCROLLBAR_REVEAL_SELECTOR)) {
        return;
      }

      const previousTimer = hideTimers.get(target);
      if (previousTimer) {
        window.clearTimeout(previousTimer);
      }

      target.classList.add("is-scrollbar-visible");
      hideTimers.set(
        target,
        window.setTimeout(() => target.classList.remove("is-scrollbar-visible"), 760)
      );
    }

    document.addEventListener("scroll", revealScrollbar, true);
    return () => document.removeEventListener("scroll", revealScrollbar, true);
  }, []);

  useEffect(() => {
    setLocalProfile(profile);
  }, [profile]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!sessionUserId) {
      if (oneSignalUserRef.current !== null) {
        oneSignalUserRef.current = null;
        oneSignalLinkedRef.current = null;
        void clearOneSignalUser().catch(() => undefined);
      }
      return;
    }

    const pushUserId = sessionUserId;
    oneSignalUserRef.current = pushUserId;
    function linkPushUser() {
      if (oneSignalLinkedRef.current === pushUserId || oneSignalPendingRef.current === pushUserId) {
        return;
      }

      oneSignalPendingRef.current = pushUserId;
      void identifyOneSignalUser(pushUserId).then(() => {
        if (oneSignalUserRef.current === pushUserId) {
          oneSignalLinkedRef.current = pushUserId;
        }
      }).catch(() => {
        // El próximo foco o reconexión reintentará sin bloquear la app.
      }).finally(() => {
        if (oneSignalPendingRef.current === pushUserId) {
          oneSignalPendingRef.current = null;
        }
      });
    }

    linkPushUser();
    window.addEventListener("focus", linkPushUser);
    window.addEventListener("online", linkPushUser);
    return () => {
      window.removeEventListener("focus", linkPushUser);
      window.removeEventListener("online", linkPushUser);
    };
  }, [isLoading, sessionUserId]);

  useEffect(() => {
    if (!sessionUserId) {
      return;
    }
    const currentUserId = sessionUserId;

    function recordActivityIfVisible() {
      if (document.visibilityState !== "hidden") {
        void recordNotificationActivity(currentUserId);
      }
    }

    recordActivityIfVisible();
    document.addEventListener("visibilitychange", recordActivityIfVisible);
    window.addEventListener("focus", recordActivityIfVisible);
    return () => {
      document.removeEventListener("visibilitychange", recordActivityIfVisible);
      window.removeEventListener("focus", recordActivityIfVisible);
    };
  }, [sessionUserId]);

  useEffect(() => {
    let isMounted = true;

    if (!sessionUserId) {
      followSuggestionsLoginRef.current = null;
      restoredActiveViewUserRef.current = null;
      persistedActiveViewUserRef.current = null;
      setIsActiveViewRestored(false);
      setShowWelcomeOnboarding(false);
      setShowFollowSuggestions(false);
      return () => {
        isMounted = false;
      };
    }

    if (!localProfile || followSuggestionsLoginRef.current === sessionUserId) {
      return () => {
        isMounted = false;
      };
    }

    const userId = sessionUserId;
    followSuggestionsLoginRef.current = userId;
    hasAppliedDefaultViewRef.current = false;

    if (!selectedProfileRoute) {
      const requested = resolveApbView(getRequestedView(), canSearch, canDiscover);
      const stored = resolveApbView(getStoredActiveView(userId), canSearch, canDiscover);
      const preferred = resolveApbView(defaultView === "inbox" ? "feed" : defaultView, canSearch, canDiscover);
      const initial = [requested, stored, preferred].find((view) =>
        view && (view === "recommendations" ? hasDiscoveryAccess : accessControl.canAccessView(view))
      );
      setActiveView(initial ?? visibleDockItems[0]?.id ?? "user");
      restoredActiveViewUserRef.current = userId;
      setIsActiveViewRestored(true);
      if (window.location.pathname !== "/") {
        window.history.replaceState({}, "", "/");
      }
    }

    async function checkOnboarding() {
      const filters = await fetchDiscoverFilters(userId);
      if (!isMounted) {
        return;
      }

      // El onboarding vuelve a aparecer solo si faltan las plataformas.
      setShowWelcomeOnboarding(filters.providerIds.length === 0);
      setShowFollowSuggestions(false);
    }

    void checkOnboarding();
    return () => {
      isMounted = false;
    };
  }, [accessControl, canDiscover, canSearch, defaultView, hasDiscoveryAccess, localProfile, selectedProfileRoute, sessionUserId, visibleDockItems]);

  useEffect(() => {
    const inviteCode = new URLSearchParams(window.location.search).get("invite");
    if (inviteCode) {
      window.localStorage.setItem(PENDING_INVITE_STORAGE_KEY, inviteCode);
    }
  }, []);

  useEffect(() => {
    if (selectedProfileRoute) {
      return;
    }

    if (activeView === "recommendations" ? hasDiscoveryAccess : accessControl.canAccessView(activeView)) {
      return;
    }

    const fallbackView = visibleDockItems.find((item) => item.id === defaultView)?.id ?? visibleDockItems[0]?.id ?? "user";
    setActiveView(fallbackView);
  }, [accessControl, activeView, defaultView, hasDiscoveryAccess, selectedProfileRoute, visibleDockItems]);

  useEffect(() => {
    if (hasAppliedDefaultViewRef.current || isLoadingPublicConfiguration || selectedProfileRoute || !sessionUserId) {
      return;
    }

    const requestedView = resolveApbView(getRequestedView(), canSearch, canDiscover);
    const storedView = resolveApbView(getStoredActiveView(sessionUserId), canSearch, canDiscover);
    const preferredView = resolveApbView(defaultView === "inbox" ? "feed" : defaultView, canSearch, canDiscover);
    const initialView = [requestedView, storedView, preferredView].find((view) =>
      view && (view === "recommendations" ? hasDiscoveryAccess : accessControl.canAccessView(view))
    ) ?? visibleDockItems[0]?.id ?? "user";
    setActiveView(initialView);
    hasAppliedDefaultViewRef.current = true;
    restoredActiveViewUserRef.current = sessionUserId;
    setIsActiveViewRestored(true);
  }, [accessControl, canDiscover, canSearch, defaultView, hasDiscoveryAccess, isLoadingPublicConfiguration, selectedProfileRoute, sessionUserId, visibleDockItems]);

  useEffect(() => {
    if (sessionUserId && persistedActiveViewUserRef.current !== sessionUserId) {
      // Nunca persistas durante el primer render de una sesión: todavía puede
      // estar aplicándose la vista que quedó guardada para esa persona.
      persistedActiveViewUserRef.current = sessionUserId;
      return;
    }

    if (
      !sessionUserId ||
      selectedProfileRoute ||
      !isActiveViewRestored ||
      restoredActiveViewUserRef.current !== sessionUserId
    ) {
      return;
    }

    try {
      window.localStorage.setItem(`${ACTIVE_VIEW_STORAGE_KEY}:${sessionUserId}`, activeView);
    } catch {
      // La navegacion sigue funcionando aunque el navegador bloquee el almacenamiento local.
    }
  }, [activeView, isActiveViewRestored, selectedProfileRoute, sessionUserId]);

  useEffect(() => {
    const lockClass = "discover-mobile-lock";
    const root = document.documentElement;
    const body = document.body;

    if (!isDiscoverActive) {
      root.classList.remove(lockClass);
      body.classList.remove(lockClass);
      return;
    }

    // Descubrí administra el espacio interno de la ficha; la página no debe desplazarse.
    window.scrollTo(0, 0);
    root.classList.add(lockClass);
    body.classList.add(lockClass);

    return () => {
      root.classList.remove(lockClass);
      body.classList.remove(lockClass);
    };
  }, [isDiscoverActive]);

  const ownProfileAction = useMemo(() => {
    return (
      <div className="profile-hero__actions profile-hero__actions--own">
        <button
          type="button"
          className="recommendation-action-button recommendation-action-button--small"
          disabled={!sessionUserId}
          data-tooltip={inviteLabel}
          aria-label={inviteLabel}
          onClick={async () => {
            if (!sessionUserId) {
              return;
            }

            try {
              const result = await createAndShareInvite(sessionUserId);
              if (result === "cancelled") {
                return;
              }
              setInviteLabel(result === "shared" ? "Invitación enviada" : "Link copiado");
            } catch {
              setInviteLabel("No se pudo invitar");
            } finally {
              window.setTimeout(() => setInviteLabel("Invitar"), 1800);
            }
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M19 8v6" />
            <path d="M22 11h-6" />
          </svg>
        </button>
        <button
          type="button"
          className="recommendation-action-button recommendation-action-button--small"
          disabled={!localProfile?.username}
          data-tooltip={shareLabel}
          aria-label={shareLabel}
          onClick={async () => {
            if (!localProfile?.username) {
              return;
            }

            const result = await shareProfileLink(localProfile.username);
            if (result === "cancelled") {
              return;
            }
            setShareLabel(result === "shared" ? "Compartido" : "Link copiado");
            window.setTimeout(() => setShareLabel("Compartir perfil"), 1800);
          }}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 15V4" />
            <path d="M7 8 12 3 17 8" />
            <path d="M5 13v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" />
          </svg>
        </button>
      </div>
    );
  }, [inviteLabel, localProfile?.username, sessionUserId, shareLabel]);

  useEffect(() => {
    function syncRouteFromLocation() {
      setSelectedProfileRoute(parseSharedProfilePath(window.location.pathname));
    }

    window.addEventListener("popstate", syncRouteFromLocation);
    return () => window.removeEventListener("popstate", syncRouteFromLocation);
  }, []);

  useEffect(() => {
    const currentTrackedView: AppView = selectedProfileRoute ? "user" : activeView;

    function startViewSession() {
      if (!sessionUserId) {
        viewSessionRef.current = null;
        return;
      }

      viewSessionRef.current = {
        startedAt: Date.now(),
        view: currentTrackedView,
        userId: sessionUserId
      };
    }

    function flushViewSession(reason: "view_change" | "background" | "pagehide") {
      const currentSession = viewSessionRef.current;
      if (!currentSession) {
        return;
      }

      viewSessionRef.current = null;
      const durationMs = Date.now() - currentSession.startedAt;
      if (durationMs < 3_000 || durationMs > 2 * 60 * 60 * 1000) {
        return;
      }

      void trackProductEvent({
        eventName: "view_session_recorded",
        userId: currentSession.userId,
        featureKey: currentSession.view,
        metadata: {
          durationMs,
          durationSeconds: Math.round(durationMs / 1000),
          reason,
          view: currentSession.view
        }
      });
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "hidden") {
        flushViewSession("background");
        return;
      }

      startViewSession();
    }

    function handlePageHide() {
      flushViewSession("pagehide");
    }

    startViewSession();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
      flushViewSession("view_change");
    };
  }, [activeView, selectedProfileRoute, sessionUserId]);

  useEffect(() => {
    if (!sessionUserId) {
      setUnreadInboxCount(0);
      return;
    }

    const currentUserId = sessionUserId;
    let isMounted = true;

    async function loadUnreadCount() {
      try {
        const count = await fetchUnreadInboxCount(currentUserId);
        if (isMounted) {
          setUnreadInboxCount(count);
        }
      } catch {
        if (isMounted) {
          setUnreadInboxCount(0);
        }
      }
    }

    function handleInboxUpdated(event: Event) {
      const detail = (event as CustomEvent<{ userId?: string }>).detail;
      if (detail?.userId && detail.userId !== currentUserId) {
        return;
      }

      void loadUnreadCount();
    }

    void loadUnreadCount();
    window.addEventListener(INBOX_UPDATED_EVENT, handleInboxUpdated as EventListener);

    const inboxChannel = supabase
      ?.channel(`inbox-updates-${currentUserId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "recommendation_messages", filter: `recipient_id=eq.${currentUserId}` },
        () => window.dispatchEvent(new CustomEvent(INBOX_UPDATED_EVENT, { detail: { userId: currentUserId } }))
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "recommendation_message_replies", filter: `recipient_id=eq.${currentUserId}` },
        () => window.dispatchEvent(new CustomEvent(INBOX_UPDATED_EVENT, { detail: { userId: currentUserId } }))
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "feed_post_comment_notifications", filter: `recipient_user_id=eq.${currentUserId}` },
        () => window.dispatchEvent(new CustomEvent(INBOX_UPDATED_EVENT, { detail: { userId: currentUserId } }))
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "recommendation_messages", filter: `sender_id=eq.${currentUserId}` },
        () => window.dispatchEvent(new CustomEvent(INBOX_UPDATED_EVENT, { detail: { userId: currentUserId } }))
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "recommendation_message_replies", filter: `sender_id=eq.${currentUserId}` },
        () => window.dispatchEvent(new CustomEvent(INBOX_UPDATED_EVENT, { detail: { userId: currentUserId } }))
      )
      .subscribe();

    return () => {
      isMounted = false;
      window.removeEventListener(INBOX_UPDATED_EVENT, handleInboxUpdated as EventListener);
      if (inboxChannel && supabase) {
        void supabase.removeChannel(inboxChannel);
      }
    };
  }, [sessionUserId]);

  function handleOpenUserProfile(profileRef: { userId: string; username?: string }) {
    void trackProductEvent({
      eventName: "profile_opened",
      userId: session?.user.id ?? null,
      featureKey: "user",
      metadata: {
        targetUserId: profileRef.userId,
        hasUsername: Boolean(profileRef.username)
      }
    });

    if (profileRef.userId === session!.user.id) {
      setSelectedProfileRoute(null);
      setActiveView("user");
      if (window.location.pathname !== "/") {
        window.history.pushState({}, "", "/");
      }
      return;
    }

    if (!profileRef.username) {
      return;
    }

    setSelectedProfileRoute({
      userId: profileRef.userId,
      username: profileRef.username
    });
    window.history.pushState({}, "", buildSharedProfilePath(profileRef.username));
  }

  function handleCompareUser(profileRef: { userId: string; username: string }) {
    handleOpenUserProfile(profileRef);
    window.history.replaceState({}, "", `${buildSharedProfilePath(profileRef.username)}?tab=mutual-likes`);
  }

  function handleChangeView(view: AppView) {
    const destination = resolveApbView(view, canSearch, canDiscover);
    if (!destination || !(destination === "recommendations" ? hasDiscoveryAccess : accessControl.canAccessView(destination))) return;
    if (!selectedProfileRoute && activeView === "feed" && destination === "feed") {
      window.dispatchEvent(new CustomEvent(FEED_SCROLL_TO_TOP_EVENT));
      window.dispatchEvent(new CustomEvent(FEED_REFRESH_EDITORIAL_EVENT));
      return;
    }

    setSelectedProfileRoute(null);
    setActiveView(destination);
    if (window.location.pathname !== "/" || new URLSearchParams(window.location.search).has("view")) {
      window.history.pushState({}, "", "/");
    }
  }

  // Las vistas principales permanecen montadas incluso al visitar un perfil
  // ajeno. Sus búsquedas, filtros y mazo no vuelven a arrancar al regresar.
  function renderActiveView() {
    return (
      <AppViewStack
        activeView={activeView}
        showProfile={Boolean(selectedProfileRoute)}
        recommendations={hasDiscoveryAccess ? (
          <DiscoveryHub
            userId={session!.user.id}
            canSearch={canSearch}
            canDiscover={canDiscover}
            onOpenUserProfile={handleOpenUserProfile}
          />
        ) : null}
        feed={
          <FeedPanel
            userId={session!.user.id}
            profile={localProfile}
            canAccessEditorial={accessControl.canAccessFeature("editorial")}
            canAccessPremieres={accessControl.canAccessFeature("premieres")}
            onOpenUserProfile={handleOpenUserProfile}
            onCompareUser={handleCompareUser}
            highlightedPost={highlightedFeedPost}
            onHighlightHandled={() => setHighlightedFeedPost(null)}
          />
        }
        inbox={accessControl.canAccessView("inbox") ? (
          <InboxPanel
            userId={session!.user.id}
            onStartRecommendation={canSearch ? () => handleChangeView("search") : undefined}
          />
        ) : null}
        user={
          <ProfilePanel
            userId={session!.user.id}
            viewerUserId={session!.user.id}
            profile={localProfile}
            isOwnProfile
            watchingOnly={activeView === "watching"}
            headerAction={ownProfileAction}
            profileMessage="Tu perfil publico va juntando automaticamente lo que marcaste como visto, guardaste en Watchlist y recomendaste en Cinerian."
            onProfileUpdated={setLocalProfile}
            onOpenUserProfile={handleOpenUserProfile}
            onNavigateToSearch={accessControl.canAccessView("search") ? () => handleChangeView("search") : undefined}
          />
        }
        profile={selectedProfileRoute ? (
          <UserProfilePage
            key={selectedProfileRoute.userId ?? selectedProfileRoute.username}
            currentUserId={session!.user.id}
            userId={selectedProfileRoute.userId}
            username={selectedProfileRoute.username}
            onOpenUserProfile={handleOpenUserProfile}
            onNavigateToSearch={accessControl.canAccessView("search") ? () => handleChangeView("search") : undefined}
          />
        ) : null}
      />
    );
  }

  // Supabase restaura la sesion desde localStorage al iniciar una pagina nueva.
  // Mientras esa lectura esta en curso, nunca mostramos el formulario de login:
  // Safari puede suspender y reconstruir una pestana al volver a la app.
  if (!session && isLoading && !selectedProfileRoute) {
    return (
      <div className="session-restore-gate" role="status" aria-live="polite">
        <CinerianLogo className="session-restore-gate__logo" />
        <LoadingState label="Recuperando tu sesión..." />
      </div>
    );
  }

  if (!session) {
    if (selectedProfileRoute) {
      return <SharedUserPage username={selectedProfileRoute.username} />;
    }

    return (
      <div className="auth-shell">
        <section className="auth-intro">
          <CinerianLogo className="auth-logo" />
          <div className="auth-intro__body">
            {/*
              Dos redacciones de la misma frase en un solo h1: la larga lleva el
              contraste con el algoritmo, que necesita lugar, y en mobile entra
              la corta. Van como spans y no como dos h1 para no repetir el
              encabezado en el arbol de accesibilidad.
            */}
            <h1>
              <span className="auth-intro__long">
                Tu ranking de películas no lo arma un algoritmo.{" "}
                <em>Lo arma tu círculo.</em>
              </span>
              <span className="auth-intro__short">
                Tu ranking lo arma <em>tu círculo</em>.
              </span>
            </h1>
            <AuthShowcase />
            <AuthSteps />
          </div>
        </section>

        <div className="auth-shell__form">
          {error ? <div className="app-alert">{error}</div> : null}
          {isLoading ? <div className="app-alert app-alert--session-status">Cargando sesión...</div> : null}
          <AuthPanel isSupabaseReady={hasSupabaseEnv} />
        </div>
      </div>
    );
  }

  return (
    <MediaDetailsProvider
      userId={session.user.id}
      profile={localProfile}
      onProfileUpdated={setLocalProfile}
      onOpenUserProfile={handleOpenUserProfile}
    >
      <VisualReadyGate canReveal={isActiveViewRestored} />
      {showWelcomeOnboarding && localProfile ? (
        <WelcomeOnboarding
          profile={localProfile}
          onComplete={() => {
            setShowWelcomeOnboarding(false);
            setShowFollowSuggestions(true);
          }}
        />
      ) : null}
      {!showWelcomeOnboarding && showFollowSuggestions ? (
        <FollowSuggestionsModal userId={session.user.id} onClose={() => setShowFollowSuggestions(false)} />
      ) : null}

      <div className={`app-shell app-shell--immersive${isDiscoverActive ? " app-shell--discover" : ""}`}>
        {error ? <div className="app-alert app-alert--floating">{error}</div> : null}
        {isLoading ? <div className="app-alert app-alert--session-status">Cargando sesión...</div> : null}

        <main className="workspace-grid workspace-grid--immersive">
          <nav className="dock">
            <div className="dock__items">
              <div className="dock__brand">
                <CinerianLogo className="dock__brand-logo" />
              </div>
              <div className="dock__nav">
                {visibleDockItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`dock__button ${selectedProfileRoute ? "" : activeView === item.id ? "is-active" : ""}`}
                    onClick={() => handleChangeView(item.id)}
                    aria-label={item.label}
                    title={item.label}
                  >
                    <span className="dock__icon">
                      <DockIcon id={item.id} />
                    </span>
                    <span className="dock__label">{item.label}</span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                className="dock__button dock__button--logout"
                onClick={() => void signOut()}
                aria-label="Cerrar sesion"
                title="Salir"
              >
                <span className="dock__icon">
                  <LogoutIcon />
                </span>
                <span className="dock__label">Salir</span>
              </button>
            </div>
          </nav>

          <section className={`workspace-content workspace-content--${selectedProfileRoute ? "profile" : activeView}`}>
            {accessControl.canAccessView("inbox") ? (
              <header className="app-utility-bar">
                <button
                  type="button"
                  className={`app-notifications-button ${activeView === "inbox" && !selectedProfileRoute ? "is-active" : ""}`}
                  onClick={() => handleChangeView("inbox")}
                  aria-label={unreadInboxCount ? `Abrir bandeja, ${unreadInboxCount} pendientes` : "Abrir bandeja"}
                  title="Bandeja y notificaciones"
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 9h18c0-1-3-2-3-9Z" /><path d="M10 21h4" /></svg>
                  {unreadInboxCount > 0 ? <span className="dock__badge">{unreadInboxCount > 9 ? "9+" : unreadInboxCount}</span> : null}
                </button>
              </header>
            ) : null}
            {renderActiveView()}
          </section>
        </main>
      </div>
    </MediaDetailsProvider>
  );
}
