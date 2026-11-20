import { useEffect, useMemo, useRef, useState } from "react";
import { decideTrailerAutoplayRecovery, recoverBlockedTrailerAutoplay, requestTrailerAutoplay, shouldRestoreTrailerSound } from "../lib/trailerPlayback";
import { youtubeThumbnailUrl } from "../lib/discoverTrailer";
import { chooseTrailerPresentation, shouldExpandTrailerOnRotation, shouldLeaveTrailerOnRotation, type TrailerPresentationMode } from "../lib/trailerFullscreen";

type DiscoverTrailerPlayerProps = {
  title: string;
  trailerUrl: string | null;
  posterUrl: string;
  backdropUrl?: string | null;
  active: boolean;
  /** Carga el iframe oculto y en pausa para que al pasar al siguiente arranque sin esperar. */
  preload?: boolean;
  soundEnabled: boolean;
  onSoundEnabledChange: (enabled: boolean) => void;
};

type YouTubePlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  mute: () => void;
  unMute: () => void;
  isMuted: () => boolean;
  getPlayerState: () => number;
};

type YouTubeApi = {
  Player: new (element: HTMLIFrameElement, options: {
    events: {
      onReady: (event: { target: YouTubePlayer }) => void;
      onStateChange: (event: { data: number }) => void;
      onAutoplayBlocked: () => void;
      onError: (event: { data: number }) => void;
    };
  }) => YouTubePlayer;
};

type YouTubeWindow = Window & { YT?: YouTubeApi; onYouTubeIframeAPIReady?: () => void };
let apiPromise: Promise<YouTubeApi> | null = null;
let nextDiagnosticPlayerId = 0;

/*
  Safari en iPhone pausa el video si se le activa el sonido sin un toque. La
  primera vez que pasa lo recordamos: el resto de la sesión los tráileres
  arrancan en silencio en vez de pelear con el navegador y quedar en pausa.
*/
let browserBlocksAutoplaySound = false;
// Cuánto esperar a que el video arranque antes de pedir un toque: primero 4 s y después tandas de 2,5 s.
const PLAYBACK_FIRST_WAIT_MS = 4000;
const PLAYBACK_RETRY_WAIT_MS = 2500;
const PLAYBACK_WATCH_ROUNDS = 6;

function logTrailerDiagnostic(playerId: number, event: string, details: Record<string, unknown> = {}) {
  try {
    if (window.localStorage.getItem("cinerian:trailer-diagnostics") !== "1") return;
    console.info("[Cinerian trailer]", {
      playerId,
      event,
      visibility: document.visibilityState,
      ...details
    });
  } catch { /* El diagnóstico nunca debe afectar la reproducción. */ }
}

function loadYouTubeApi(): Promise<YouTubeApi> {
  const page = window as YouTubeWindow;
  if (page.YT?.Player) return Promise.resolve(page.YT);
  if (apiPromise) return apiPromise;
  const pending = new Promise<YouTubeApi>((resolve, reject) => {
    const previous = page.onYouTubeIframeAPIReady;
    page.onYouTubeIframeAPIReady = () => {
      previous?.();
      if (page.YT?.Player) resolve(page.YT);
      else reject(new Error("YouTube IFrame API no disponible"));
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    script.onerror = () => reject(new Error("No se pudo cargar YouTube IFrame API"));
    document.head.appendChild(script);
  }).catch((error) => {
    apiPromise = null;
    throw error;
  });
  apiPromise = pending;
  return pending;
}

export function buildDiscoverTrailerUrl(trailerUrl: string | null, origin: string): string | null {
  if (!trailerUrl) return null;
  try {
    const source = new URL(trailerUrl);
    const match = source.pathname.match(/^\/embed\/([A-Za-z0-9_-]+)$/);
    if (source.origin !== "https://www.youtube.com" || !match) return null;
    const url = new URL(`https://www.youtube.com/embed/${match[1]}`);
    url.searchParams.set("autoplay", "0");
    url.searchParams.set("mute", "1");
    url.searchParams.set("playsinline", "1");
    url.searchParams.set("cc_lang_pref", "es");
    url.searchParams.set("controls", "0");
    url.searchParams.set("enablejsapi", "1");
    url.searchParams.set("origin", origin);
    return url.toString();
  } catch {
    return null;
  }
}

export function isPermanentYouTubeError(code: number) {
  return code === 2 || code === 100 || code === 101 || code === 150;
}

export function DiscoverTrailerPlayer({ title, trailerUrl, posterUrl, backdropUrl, active, preload = false, soundEnabled, onSoundEnabledChange }: DiscoverTrailerPlayerProps) {
  const diagnosticPlayerId = useRef(0);
  if (!diagnosticPlayerId.current) diagnosticPlayerId.current = ++nextDiagnosticPlayerId;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const mediaRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;
  const autoplayAttemptRef = useRef<"sound" | "muted" | null>(null);
  const autoplayBlockedRef = useRef(false);
  const userPausedRef = useRef(false);
  const autoplayTimerRef = useRef<number | null>(null);
  const soundCheckTimerRef = useRef<number | null>(null);
  const postPlaySoundTimerRef = useRef<number | null>(null);
  const postPlaySoundPendingRef = useRef(false);
  const postPlaySoundAttemptedRef = useRef(false);
  const hasPlayedRef = useRef(false);
  const [hasMounted, setHasMounted] = useState(active || preload);
  const [hasStartedPlaying, setHasStartedPlaying] = useState(false);
  const thumbnailUrl = useMemo(() => youtubeThumbnailUrl(trailerUrl), [trailerUrl]);
  const [apiReady, setApiReady] = useState(false);
  const [apiUnavailable, setApiUnavailable] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [playbackState, setPlaybackState] = useState<"loading" | "playing" | "paused" | "blocked">("loading");
  const [playbackError, setPlaybackError] = useState(false);
  const [canRetry, setCanRetry] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [presentationMode, setPresentationMode] = useState<TrailerPresentationMode>("inline");
  const presentationModeRef = useRef<TrailerPresentationMode>("inline");
  const [mobilePresentation, setMobilePresentation] = useState(false);
  const mobilePresentationRef = useRef(false);
  const landscapeRef = useRef(false);
  const dismissedRef = useRef(false);
  const nativeOwnedRef = useRef(false);
  const nativeRequestPendingRef = useRef(false);
  const requestTokenRef = useRef(0);
  const playingRef = useRef(false);
  playingRef.current = playbackState === "playing";
  const availableUrl = useMemo(
    () => buildDiscoverTrailerUrl(trailerUrl, typeof window === "undefined" ? "https://cinerian.app" : window.location.origin),
    [trailerUrl, retryCount]
  );
  const embedUrl = hasMounted ? availableUrl : null;
  const hasPlayableVideoRef = useRef(false);
  hasPlayableVideoRef.current = Boolean(embedUrl && !playbackError && !apiUnavailable && !preload);
  const artworkUrl = backdropUrl || (posterUrl && posterUrl !== "/images/base.png" ? posterUrl : null);

  function present(mode: TrailerPresentationMode) {
    presentationModeRef.current = mode;
    setPresentationMode(mode);
  }

  function leavePresentation(manual: boolean) {
    requestTokenRef.current += 1;
    if (manual) dismissedRef.current = true;
    present("inline");
    if (nativeOwnedRef.current && document.fullscreenElement === mediaRef.current) {
      void document.exitFullscreen().catch(() => undefined);
    }
    nativeOwnedRef.current = false;
  }

  function enterPresentation(manual: boolean) {
    const media = mediaRef.current;
    if (!media || !mobilePresentationRef.current || !activeRef.current || !playingRef.current ||
      !hasPlayableVideoRef.current || presentationModeRef.current !== "inline" || nativeRequestPendingRef.current || (!manual && dismissedRef.current)) return;
    const token = ++requestTokenRef.current;
    const choice = chooseTrailerPresentation({
      nativeSupported: typeof media.requestFullscreen === "function" && document.fullscreenEnabled !== false,
      userActivated: manual || navigator.userActivation?.isActive === true
    });
    if (choice === "immersive") {
      present("immersive");
      return;
    }
    nativeRequestPendingRef.current = true;
    try {
      void media.requestFullscreen().then(() => {
        nativeRequestPendingRef.current = false;
        if (token !== requestTokenRef.current || !activeRef.current || (!manual && !landscapeRef.current)) {
          if (document.fullscreenElement === media) void document.exitFullscreen().catch(() => undefined);
          return;
        }
        if (document.fullscreenElement !== media) return;
        nativeOwnedRef.current = true;
        present("native");
      }).catch(() => {
        nativeRequestPendingRef.current = false;
        if (token === requestTokenRef.current && activeRef.current && (manual || landscapeRef.current)) present("immersive");
      });
    } catch {
      nativeRequestPendingRef.current = false;
      if (token === requestTokenRef.current) present("immersive");
    }
  }

  useEffect(() => {
    if (preload) return;
    const orientation = window.matchMedia("(orientation: landscape)");
    const mobile = window.matchMedia("(pointer: coarse) and (max-width: 1100px)");
    landscapeRef.current = orientation.matches;
    mobilePresentationRef.current = mobile.matches;
    setMobilePresentation(mobile.matches);
    function handleOrientation() {
      const wasLandscape = landscapeRef.current;
      const isLandscape = orientation.matches;
      mobilePresentationRef.current = mobile.matches;
      setMobilePresentation(mobile.matches);
      if (wasLandscape === isLandscape) return;
      landscapeRef.current = isLandscape;
      if (!isLandscape) {
        requestTokenRef.current += 1;
        if (shouldLeaveTrailerOnRotation(wasLandscape, isLandscape, presentationModeRef.current)) leavePresentation(false);
        dismissedRef.current = false;
      } else if (shouldExpandTrailerOnRotation({
        wasLandscape, isLandscape, mobile: mobile.matches, active: activeRef.current,
        playing: playingRef.current, hasVideo: hasPlayableVideoRef.current,
        dismissed: dismissedRef.current, mode: presentationModeRef.current
      })) {
        enterPresentation(false);
      }
    }
    if (orientation.addEventListener) orientation.addEventListener("change", handleOrientation);
    else orientation.addListener(handleOrientation);
    if (mobile.addEventListener) mobile.addEventListener("change", handleOrientation);
    else mobile.addListener(handleOrientation);
    window.addEventListener("resize", handleOrientation);
    return () => {
      if (orientation.removeEventListener) orientation.removeEventListener("change", handleOrientation);
      else orientation.removeListener(handleOrientation);
      if (mobile.removeEventListener) mobile.removeEventListener("change", handleOrientation);
      else mobile.removeListener(handleOrientation);
      window.removeEventListener("resize", handleOrientation);
      requestTokenRef.current += 1;
      if (nativeOwnedRef.current && document.fullscreenElement === mediaRef.current) void document.exitFullscreen().catch(() => undefined);
    };
  }, [preload]);

  useEffect(() => {
    function handleFullscreenChange() {
      if (!nativeOwnedRef.current || document.fullscreenElement === mediaRef.current) return;
      nativeOwnedRef.current = false;
      dismissedRef.current = true;
      present("inline");
    }
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  useEffect(() => {
    if (!active || !embedUrl || playbackError || apiUnavailable) leavePresentation(false);
  }, [active, embedUrl, playbackError, apiUnavailable]);

  useEffect(() => {
    if (presentationMode !== "immersive") return;
    document.documentElement.classList.add("trailer-immersive");
    document.body.classList.add("trailer-immersive");
    function exitOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") leavePresentation(true);
    }
    document.addEventListener("keydown", exitOnEscape);
    return () => {
      document.documentElement.classList.remove("trailer-immersive");
      document.body.classList.remove("trailer-immersive");
      document.removeEventListener("keydown", exitOnEscape);
    };
  }, [presentationMode]);

  useEffect(() => {
    if (active || preload) setHasMounted(true);
  }, [active, preload]);

  function clearAutoplayTimer() {
    if (autoplayTimerRef.current !== null) window.clearTimeout(autoplayTimerRef.current);
    autoplayTimerRef.current = null;
  }

  function checkActualSound(player: YouTubePlayer) {
    if (soundCheckTimerRef.current !== null) window.clearTimeout(soundCheckTimerRef.current);
    soundCheckTimerRef.current = window.setTimeout(() => {
      if (playerRef.current !== player) return;
      const muted = player.isMuted();
      setIsMuted(muted);
      logTrailerDiagnostic(diagnosticPlayerId.current, "sound_state_confirmed", { preferredSound: soundEnabledRef.current, muted });
    }, 300);
  }

  function restorePreferredSoundAfterPlaying(player: YouTubePlayer) {
    const muted = player.isMuted();
    if (browserBlocksAutoplaySound || !shouldRestoreTrailerSound(soundEnabledRef.current, postPlaySoundAttemptedRef.current, muted, activeRef.current)) return false;
    postPlaySoundAttemptedRef.current = true;
    postPlaySoundPendingRef.current = true;
    logTrailerDiagnostic(diagnosticPlayerId.current, "post_play_unmute_requested", { preferredSound: soundEnabledRef.current, muted });
    try {
      player.unMute();
    } catch (error) {
      postPlaySoundPendingRef.current = false;
      logTrailerDiagnostic(diagnosticPlayerId.current, "post_play_unmute_failed", { errorType: error instanceof Error ? error.name : "unknown" });
      return true;
    }
    if (!postPlaySoundPendingRef.current) return true;
    postPlaySoundTimerRef.current = window.setTimeout(() => {
      if (playerRef.current !== player || !activeRef.current || !postPlaySoundPendingRef.current) return;
      postPlaySoundPendingRef.current = false;
      const actualMuted = player.isMuted();
      const state = player.getPlayerState();
      logTrailerDiagnostic(diagnosticPlayerId.current, "post_play_unmute_result", { preferredSound: soundEnabledRef.current, muted: actualMuted, playerState: state });
      setIsMuted(actualMuted);
      if (actualMuted || state === 2) browserBlocksAutoplaySound = true;
      if (state === 2 && !userPausedRef.current) {
        logTrailerDiagnostic(diagnosticPlayerId.current, "post_play_unmute_recovery", { reason: "playback_paused" });
        attemptPlayback(player, false);
      }
    }, 350);
    return true;
  }

  function confirmPlaybackStarted(player: YouTubePlayer, source: "state_change" | "timeout" | "autoplay_blocked") {
    logTrailerDiagnostic(diagnosticPlayerId.current, "playback_started", { source, active: activeRef.current, muted: player.isMuted(), preferredSound: soundEnabledRef.current });
    clearAutoplayTimer();
    autoplayAttemptRef.current = null;
    autoplayBlockedRef.current = false;
    hasPlayedRef.current = true;
    setHasStartedPlaying(true);
    setPlaybackState("playing");
    setIsMuted(player.isMuted());
    if (!restorePreferredSoundAfterPlaying(player) && !postPlaySoundPendingRef.current) checkActualSound(player);
  }

  function retryAutoplayMuted(player: YouTubePlayer, reason: "youtube_blocked" | "timeout_not_playing") {
    logTrailerDiagnostic(diagnosticPlayerId.current, "muted_retry_requested", { reason, preferredSound: soundEnabledRef.current });
    logTrailerDiagnostic(diagnosticPlayerId.current, "mute_requested", { reason });
    clearAutoplayTimer();
    browserBlocksAutoplaySound = true;
    autoplayAttemptRef.current = "muted";
    setIsMuted(true);
    recoverBlockedTrailerAutoplay(player, "sound");
    if (autoplayAttemptRef.current !== "muted") return;
    watchPlaybackStart(player);
  }

  // Vigila que el video arranque. Si YouTube sigue cargando, espera; si no arrancó, reintenta en silencio.
  function watchPlaybackStart(player: YouTubePlayer, round = 0) {
    clearAutoplayTimer();
    autoplayTimerRef.current = window.setTimeout(() => {
      const attempted = autoplayAttemptRef.current;
      if (!attempted || playerRef.current !== player) return;
      const state = player.getPlayerState();
      const decision = decideTrailerAutoplayRecovery("timeout", attempted, state);
      logTrailerDiagnostic(diagnosticPlayerId.current, "playback_timeout", { attempted, round, playerState: state, muted: player.isMuted(), preferredSound: soundEnabledRef.current, decision });
      if (decision === "playing") {
        confirmPlaybackStarted(player, "timeout");
        return;
      }
      const canRetry = activeRef.current && !userPausedRef.current;
      if (decision === "retry-muted" && canRetry) {
        retryAutoplayMuted(player, "timeout_not_playing");
        return;
      }
      if (canRetry && round < PLAYBACK_WATCH_ROUNDS) {
        // 3 = cargando: alcanza con seguir esperando.
        if (state !== 3) {
          autoplayAttemptRef.current = "muted";
          setIsMuted(true);
          requestTrailerAutoplay(player, false);
        }
        watchPlaybackStart(player, round + 1);
        return;
      }
      autoplayAttemptRef.current = null;
      autoplayBlockedRef.current = true;
      setPlaybackState("blocked");
    }, round === 0 ? PLAYBACK_FIRST_WAIT_MS : PLAYBACK_RETRY_WAIT_MS);
  }

  function attemptPlayback(player: YouTubePlayer, withSound: boolean) {
    clearAutoplayTimer();
    autoplayBlockedRef.current = false;
    autoplayAttemptRef.current = withSound ? "sound" : "muted";
    setPlaybackState("loading");
    setIsMuted(!withSound);
    logTrailerDiagnostic(diagnosticPlayerId.current, "autoplay_requested", { active: activeRef.current, withSound });
    logTrailerDiagnostic(diagnosticPlayerId.current, withSound ? "unmute_requested" : "mute_requested", { reason: withSound ? "sound_preference" : hasPlayedRef.current ? "muted_recovery_or_resume" : "initial_autoplay" });
    requestTrailerAutoplay(player, withSound);
    watchPlaybackStart(player);
  }

  useEffect(() => {
    if (!embedUrl || !iframeRef.current) {
      logTrailerDiagnostic(diagnosticPlayerId.current, "player_not_mounted", { active: activeRef.current, hasTrailer: Boolean(availableUrl) });
      return;
    }
    let cancelled = false;
    const iframe = iframeRef.current;
    logTrailerDiagnostic(diagnosticPlayerId.current, "player_waiting_for_api", { active: activeRef.current });
    setApiReady(false);
    setApiUnavailable(false);
    setPlaybackState("loading");
    setHasStartedPlaying(false);
    setIsMuted(true);
    setPlaybackError(false);
    setCanRetry(true);
    void loadYouTubeApi().then((api) => {
      if (cancelled || !iframe.isConnected) return;
      logTrailerDiagnostic(diagnosticPlayerId.current, "player_constructing", { active: activeRef.current, initiallyMuted: new URL(embedUrl).searchParams.get("mute") === "1", preferredSound: soundEnabledRef.current });
      playerRef.current = new api.Player(iframe, { events: {
        onReady: ({ target }) => {
          if (cancelled) return;
          playerRef.current = target;
          logTrailerDiagnostic(diagnosticPlayerId.current, "player_ready", { active: activeRef.current, preferredSound: soundEnabledRef.current });
          setApiReady(true);
        },
        onStateChange: ({ data }) => {
          if (cancelled) return;
          logTrailerDiagnostic(diagnosticPlayerId.current, "player_state", { state: data, active: activeRef.current, attempted: autoplayAttemptRef.current });
          if (data === 1) {
            if (playerRef.current) confirmPlaybackStarted(playerRef.current, "state_change");
          } else if (data === 2 || data === 0) {
            if (data === 2 && postPlaySoundPendingRef.current && activeRef.current && !userPausedRef.current && playerRef.current) {
              browserBlocksAutoplaySound = true;
              postPlaySoundPendingRef.current = false;
              if (postPlaySoundTimerRef.current !== null) window.clearTimeout(postPlaySoundTimerRef.current);
              postPlaySoundTimerRef.current = null;
              logTrailerDiagnostic(diagnosticPlayerId.current, "post_play_unmute_result", { preferredSound: soundEnabledRef.current, muted: playerRef.current.isMuted(), playerState: data });
              logTrailerDiagnostic(diagnosticPlayerId.current, "post_play_unmute_recovery", { reason: "playback_paused" });
              attemptPlayback(playerRef.current, false);
              return;
            }
            setPlaybackState("paused");
          }
        },
        onAutoplayBlocked: () => {
          const player = playerRef.current;
          const playerState = player?.getPlayerState() ?? null;
          const decision = player && autoplayAttemptRef.current ? decideTrailerAutoplayRecovery("blocked", autoplayAttemptRef.current, playerState ?? -1) : null;
          logTrailerDiagnostic(diagnosticPlayerId.current, "autoplay_blocked", { active: activeRef.current, attempted: autoplayAttemptRef.current, playerState, muted: player?.isMuted(), preferredSound: soundEnabledRef.current, decision, ignored: cancelled || !activeRef.current || userPausedRef.current || !autoplayAttemptRef.current });
          if (cancelled || !activeRef.current || userPausedRef.current || !autoplayAttemptRef.current) return;
          if (decision === "playing" && player) {
            confirmPlaybackStarted(player, "autoplay_blocked");
          } else if (decision === "retry-muted" && player) {
            retryAutoplayMuted(player, "youtube_blocked");
          } else {
            clearAutoplayTimer();
            autoplayAttemptRef.current = null;
            autoplayBlockedRef.current = true;
            setPlaybackState("blocked");
          }
        },
        onError: ({ data }) => {
          if (cancelled) return;
          logTrailerDiagnostic(diagnosticPlayerId.current, "playback_failed", { youtubeError: data, permanent: isPermanentYouTubeError(data) });
          clearAutoplayTimer();
          autoplayAttemptRef.current = null;
          setCanRetry(!isPermanentYouTubeError(data));
          setPlaybackError(true);
        }
      } });
    }).catch((error: unknown) => {
      logTrailerDiagnostic(diagnosticPlayerId.current, "api_failed", { errorType: error instanceof Error ? error.name : "unknown" });
      if (!cancelled) { setApiUnavailable(true); setPlaybackError(true); }
    });
    return () => {
      logTrailerDiagnostic(diagnosticPlayerId.current, "player_cleanup", { active: activeRef.current });
      cancelled = true;
      clearAutoplayTimer();
      if (soundCheckTimerRef.current !== null) window.clearTimeout(soundCheckTimerRef.current);
      if (postPlaySoundTimerRef.current !== null) window.clearTimeout(postPlaySoundTimerRef.current);
      postPlaySoundPendingRef.current = false;
      autoplayAttemptRef.current = null;
      if (playerRef.current && iframe.isConnected) {
        try { playerRef.current.pauseVideo(); }
        catch { /* El iframe ya puede estar desmontado al cambiar de título. */ }
      }
      playerRef.current = null;
    };
  }, [embedUrl, retryCount]);

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !apiReady) {
      logTrailerDiagnostic(diagnosticPlayerId.current, "player_not_ready", { active, apiReady, hasPlayer: Boolean(player) });
      return;
    }
    if (!active) {
      logTrailerDiagnostic(diagnosticPlayerId.current, "inactive_pause_requested");
      clearAutoplayTimer();
      postPlaySoundPendingRef.current = false;
      if (postPlaySoundTimerRef.current !== null) window.clearTimeout(postPlaySoundTimerRef.current);
      postPlaySoundTimerRef.current = null;
      autoplayAttemptRef.current = null;
      player.pauseVideo();
      setPlaybackState("paused");
      return;
    }
    if (!userPausedRef.current && !autoplayBlockedRef.current) attemptPlayback(player, hasPlayedRef.current && soundEnabledRef.current && !browserBlocksAutoplaySound);
    else logTrailerDiagnostic(diagnosticPlayerId.current, "autoplay_skipped", { userPaused: userPausedRef.current, previousBlock: autoplayBlockedRef.current });
  }, [active, apiReady]);

  function resumeBlockedPlayback() {
    const player = playerRef.current;
    if (!player) return;
    userPausedRef.current = false;
    logTrailerDiagnostic(diagnosticPlayerId.current, "blocked_resume_requested");
    attemptPlayback(player, false);
  }

  function toggleSound() {
    const player = playerRef.current;
    if (!player) return;
    const enableSound = isMuted;
    postPlaySoundAttemptedRef.current = true;
    postPlaySoundPendingRef.current = false;
    if (postPlaySoundTimerRef.current !== null) window.clearTimeout(postPlaySoundTimerRef.current);
    postPlaySoundTimerRef.current = null;
    soundEnabledRef.current = enableSound;
    // La persona tocó el parlante: el navegador puede volver a permitir sonido.
    if (enableSound) browserBlocksAutoplaySound = false;
    onSoundEnabledChange(enableSound);
    logTrailerDiagnostic(diagnosticPlayerId.current, enableSound ? "unmute_requested" : "mute_requested", { reason: "user_toggle" });
    if (enableSound) player.unMute();
    else player.mute();
    setIsMuted(!enableSound);
    checkActualSound(player);
    if (enableSound && playbackState === "blocked") {
      userPausedRef.current = false;
      attemptPlayback(player, true);
    }
  }

  return (
    <div ref={mediaRef} className={`discover-trailer__media${preload ? " is-preloading" : ""}${!embedUrl || playbackError || apiUnavailable ? " is-poster" : ""}${presentationMode === "immersive" ? " is-immersive" : ""}`} aria-hidden={preload || undefined}>
      <div className="discover-trailer__frame">
        {embedUrl && !playbackError && !apiUnavailable ? (
          <>
            <iframe
              key={`${embedUrl}:${retryCount}`}
              ref={iframeRef}
              src={embedUrl}
              title={`Tráiler de ${title}`}
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
              tabIndex={preload ? -1 : undefined}
            />
            {thumbnailUrl ? <img className={`discover-trailer__cover${hasStartedPlaying || playbackState === "blocked" ? " is-hidden" : ""}`} src={thumbnailUrl} alt="" aria-hidden="true" /> : null}
          </>
        ) : artworkUrl ? (
          <img className={backdropUrl ? "discover-trailer__backdrop" : "discover-trailer__poster-fallback"} src={artworkUrl} alt={`Imagen de ${title}`} />
        ) : (
          <div className="discover-trailer__missing-image">{title}</div>
        )}
      </div>
      {playbackError && canRetry ? <button type="button" className="discover-trailer__retry" onClick={() => { setPlaybackError(false); setRetryCount((value) => value + 1); }}>Reintentar tráiler</button> : null}
      {embedUrl && !apiUnavailable && !playbackError && !preload ? (
        <div className="discover-trailer__playback" aria-label="Controles del tráiler">
          {playbackState === "blocked" && active && apiReady ? <button type="button" className="discover-trailer__resume" onClick={resumeBlockedPlayback}>Reproducir tráiler</button> : null}
          {mobilePresentation && active && (playbackState === "playing" || presentationMode !== "inline") ? (
            <button type="button" className="discover-trailer__fullscreen-toggle" aria-label={presentationMode === "inline" ? "Pantalla completa" : "Salir de pantalla completa"} onClick={() => presentationMode === "inline" ? enterPresentation(true) : leavePresentation(true)}>
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d={presentationMode === "inline" ? "M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5" : "M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"} /></svg>
            </button>
          ) : null}
          <button type="button" className="discover-trailer__sound-toggle" disabled={!apiReady} aria-label={isMuted ? "Activar sonido del tráiler" : "Silenciar tráiler"} onClick={toggleSound}>
            <span className="discover-trailer__playback-label">{isMuted ? "Activar sonido" : "Silenciar"}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" />{isMuted ? <path d="m17 9 5 6m0-6-5 6" /> : <><path d="M17 9a4 4 0 0 1 0 6" /><path d="M20 6a8 8 0 0 1 0 12" /></>}</svg>
          </button>
        </div>
      ) : null}
    </div>
  );
}
