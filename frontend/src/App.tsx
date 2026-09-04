import { AboutYouOnboardingModal } from "./components/AboutYouOnboardingModal";
import { AuthPanel } from "./components/AuthPanel";
import { CinerianLogo } from "./components/CinerianLogo";
import { FeedPanel } from "./components/FeedPanel";
import { FollowSuggestionsModal } from "./components/FollowSuggestionsModal";
import { InboxPanel } from "./components/InboxPanel";
import { MediaDetailsProvider } from "./components/MediaDetailsModal";
import { ProfilePanel } from "./components/ProfilePanel";
import { RecommendationPanel } from "./components/RecommendationPanel";
import { SearchPanel } from "./components/SearchPanel";
import { SharedUserPage } from "./components/SharedUserPage";
import { UserProfilePage } from "./components/UserProfilePage";
import { useAuth } from "./hooks/useAuth";
import { usePublicFeatureFlags } from "./hooks/usePublicFeatureFlags";
import { getAccessControl, type AppView } from "./lib/access";
import { trackProductEvent } from "./lib/analytics";
import { signOut } from "./lib/auth";
import { fetchUnreadInboxCount, INBOX_UPDATED_EVENT } from "./lib/inbox";
import {
  buildSharedProfilePath,
  parseSharedProfilePath,
  shareProfileLink
} from "./lib/profileShare";
import { hasSupabaseEnv, supabase } from "./lib/supabase";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Profile } from "./lib/auth";
const ACTIVE_VIEW_STORAGE_KEY = "cinerian-active-view";
const FOLLOW_SUGGESTIONS_SESSION_KEY = "cinerian-follow-suggestions-shown";
export const FEED_SCROLL_TO_TOP_EVENT = "cinerian:feed-scroll-to-top";
export const FEED_REFRESH_EDITORIAL_EVENT = "cinerian:feed-refresh-editorial";

function DockIcon({ id, badgeCount = 0 }: { id: AppView; badgeCount?: number }) {
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

  if (id === "inbox") {
    return (
      <>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 6h16v12H4z" />
          <path d="m4 8 8 6 8-6" />
        </svg>
        {badgeCount > 0 ? <span className="dock__badge">{badgeCount > 9 ? "9+" : badgeCount}</span> : null}
      </>
    );
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

const dockItems: Array<{ id: AppView; label: string }> = [
  { id: "feed", label: "Inicio" },
  { id: "search", label: "Buscador" },
  { id: "recommendations", label: "Descubri" },
  { id: "inbox", label: "Inbox" },
  { id: "user", label: "Mi cuenta" }
];

type ViewSessionRef = {
  startedAt: number;
  view: AppView;
  userId: string;
};

export default function App() {
  const { session, profile, isLoading, error } = useAuth();
  const { enabledFeatures } = usePublicFeatureFlags();
  const sessionUserId = session?.user.id ?? null;
  const [localProfile, setLocalProfile] = useState<Profile | null>(profile);
  const [activeView, setActiveView] = useState<AppView>(() => {
    if (typeof window === "undefined") {
      return "feed";
    }

    const storedView = window.localStorage.getItem(ACTIVE_VIEW_STORAGE_KEY);
    return dockItems.some((item) => item.id === storedView) ? (storedView as AppView) : "feed";
  });
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
  const [showFollowSuggestions, setShowFollowSuggestions] = useState(false);
  const viewSessionRef = useRef<ViewSessionRef | null>(null);
  const accessControl = useMemo(
    () =>
      getAccessControl({
        session,
        profile: localProfile,
        enabledFeatureOverrides: enabledFeatures
      }),
    [enabledFeatures, localProfile, session]
  );
  const visibleDockItems = useMemo(
    () => dockItems.filter((item) => accessControl.canAccessView(item.id)),
    [accessControl]
  );

  useEffect(() => {
    setLocalProfile(profile);
  }, [profile]);

  useEffect(() => {
    if (!sessionUserId || !localProfile || localProfile.gender === null) {
      return;
    }

    const storageKey = `${FOLLOW_SUGGESTIONS_SESSION_KEY}:${sessionUserId}`;
    if (window.sessionStorage.getItem(storageKey)) {
      return;
    }

    window.sessionStorage.setItem(storageKey, "true");
    setShowFollowSuggestions(true);
  }, [localProfile, sessionUserId]);

  useEffect(() => {
    if (selectedProfileRoute) {
      return;
    }

    if (accessControl.canAccessView(activeView)) {
      return;
    }

    const fallbackView = visibleDockItems[0]?.id ?? "user";
    setActiveView(fallbackView);
  }, [accessControl, activeView, selectedProfileRoute, visibleDockItems]);

  const ownProfileAction = useMemo(() => {
    return (
      <div className="profile-hero__actions profile-hero__actions--own">
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
  }, [localProfile?.username, shareLabel]);

  useEffect(() => {
    function syncRouteFromLocation() {
      setSelectedProfileRoute(parseSharedProfilePath(window.location.pathname));
    }

    window.addEventListener("popstate", syncRouteFromLocation);
    return () => window.removeEventListener("popstate", syncRouteFromLocation);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(ACTIVE_VIEW_STORAGE_KEY, activeView);
  }, [activeView]);

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

  function handleChangeView(view: AppView) {
    if (!selectedProfileRoute && activeView === "feed" && view === "feed") {
      window.dispatchEvent(new CustomEvent(FEED_SCROLL_TO_TOP_EVENT));
      window.dispatchEvent(new CustomEvent(FEED_REFRESH_EDITORIAL_EVENT));
      return;
    }

    setSelectedProfileRoute(null);
    setActiveView(view);
    if (window.location.pathname !== "/") {
      window.history.pushState({}, "", "/");
    }
  }

  function renderActiveView() {
    if (selectedProfileRoute) {
      return (
        <UserProfilePage
          currentUserId={session!.user.id}
          userId={selectedProfileRoute.userId}
          username={selectedProfileRoute.username}
          onOpenUserProfile={handleOpenUserProfile}
          onBack={() => {
            setSelectedProfileRoute(null);
            window.history.pushState({}, "", "/");
          }}
        />
      );
    }

    switch (activeView) {
      case "search":
        if (!accessControl.canAccessView("search")) {
          break;
        }
        return <SearchPanel userId={session!.user.id} onOpenUserProfile={handleOpenUserProfile} />;
      case "recommendations":
        if (!accessControl.canAccessView("recommendations")) {
          break;
        }
        return <RecommendationPanel userId={session!.user.id} />;
      case "user":
        return (
          <ProfilePanel
            userId={session!.user.id}
            viewerUserId={session!.user.id}
            profile={localProfile}
            isOwnProfile
            headerAction={ownProfileAction}
            profileMessage="Tu perfil publico va juntando automaticamente lo que marcaste como visto, guardaste en Watchlist y recomendaste en Cinerian."
            onProfileUpdated={setLocalProfile}
            onOpenUserProfile={handleOpenUserProfile}
          />
        );
      case "inbox":
        if (!accessControl.canAccessView("inbox")) {
          break;
        }
        return (
          <InboxPanel
            userId={session!.user.id}
            onOpenUserProfile={handleOpenUserProfile}
          />
        );
      case "feed":
      default:
        return (
          <FeedPanel
            userId={session!.user.id}
            profile={localProfile}
            canAccessEditorial={accessControl.canAccessFeature("editorial")}
            canAccessPremieres={accessControl.canAccessFeature("premieres")}
            onOpenUserProfile={handleOpenUserProfile}
            highlightedPost={highlightedFeedPost}
            onHighlightHandled={() => setHighlightedFeedPost(null)}
          />
        );
    }
  }

  if (!session) {
    if (selectedProfileRoute) {
      return <SharedUserPage username={selectedProfileRoute.username} />;
    }

    return (
      <div className="auth-shell">
        <div className="auth-shell__inner">
          <section className="auth-hero-card">
            <CinerianLogo className="auth-logo" />
            <p className="section-eyebrow">Cinerian</p>
            <h1>Tu mundo de pelis y series, ahora con identidad real</h1>
            <p className="section-description">
              Sumate a Cinerian para registrar lo que viste, puntuar, recomendar y descubrir que
              mirar con una experiencia social hecha para cinefilos.
            </p>
          </section>

          <div className="auth-shell__form">
            {error ? <div className="app-alert">{error}</div> : null}
            {isLoading ? <div className="app-alert">Cargando sesion...</div> : null}
            <AuthPanel isSupabaseReady={hasSupabaseEnv} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <MediaDetailsProvider userId={session.user.id}>
      {localProfile && localProfile.gender === null ? (
        <AboutYouOnboardingModal profile={localProfile} onComplete={setLocalProfile} />
      ) : null}
      {showFollowSuggestions ? (
        <FollowSuggestionsModal userId={session.user.id} onClose={() => setShowFollowSuggestions(false)} />
      ) : null}

      <div className="app-shell app-shell--immersive">
        {error ? <div className="app-alert app-alert--floating">{error}</div> : null}
        {isLoading ? <div className="app-alert app-alert--floating">Cargando sesion...</div> : null}

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
                  >
                    <span className="dock__icon">
                      <DockIcon id={item.id} badgeCount={item.id === "inbox" ? unreadInboxCount : 0} />
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
              >
                <span className="dock__icon">
                  <LogoutIcon />
                </span>
                <span className="dock__label">Salir</span>
              </button>
            </div>
          </nav>

          <section className={`workspace-content workspace-content--${selectedProfileRoute ? "profile" : activeView}`}>
            {renderActiveView()}
          </section>
        </main>
      </div>
    </MediaDetailsProvider>
  );
}
