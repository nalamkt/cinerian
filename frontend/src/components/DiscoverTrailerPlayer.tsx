import { useEffect, useMemo, useRef, useState } from "react";
import { decideTrailerAutoplayRecovery, recoverBlockedTrailerAutoplay, requestTrailerAutoplay, shouldRestoreTrailerSound } from "../lib/trailerPlayback";

type DiscoverTrailerPlayerProps = {
  title: string;
  trailerUrl: string | null;
  posterUrl: string;
  active: boolean;
  soundEnabled: boolean;
  onSoundEnabledChange: (enabled: boolean) => void;
  onUnplayable?: () => void;
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

export function DiscoverTrailerPlayer({ title, trailerUrl, posterUrl, active, soundEnabled, onSoundEnabledChange, onUnplayable }: DiscoverTrailerPlayerProps) {
  const diagnosticPlayerId = useRef(0);
  if (!diagnosticPlayerId.current) diagnosticPlayerId.current = ++nextDiagnosticPlayerId;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const soundEnabledRef = useRef(soundEnabled);
  soundEnabledRef.current = soundEnabled;
  const onUnplayableRef = useRef(onUnplayable);
  onUnplayableRef.current = onUnplayable;
  const autoplayAttemptRef = useRef<"sound" | "muted" | null>(null);
  const autoplayBlockedRef = useRef(false);
  const userPausedRef = useRef(false);
  const autoplayTimerRef = useRef<number | null>(null);
  const soundCheckTimerRef = useRef<number | null>(null);
  const postPlaySoundTimerRef = useRef<number | null>(null);
  const postPlaySoundPendingRef = useRef(false);
  const postPlaySoundAttemptedRef = useRef(false);
  const hasPlayedRef = useRef(false);
  const [hasMounted, setHasMounted] = useState(active);
  const [apiReady, setApiReady] = useState(false);
  const [apiUnavailable, setApiUnavailable] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [playbackState, setPlaybackState] = useState<"loading" | "playing" | "paused" | "blocked">("loading");
  const [playbackError, setPlaybackError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const availableUrl = useMemo(
    () => buildDiscoverTrailerUrl(trailerUrl, typeof window === "undefined" ? "https://cinerian.app" : window.location.origin),
    [trailerUrl, retryCount]
  );
  const embedUrl = hasMounted ? availableUrl : null;

  useEffect(() => {
    if (active) setHasMounted(true);
  }, [active]);

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
    if (!shouldRestoreTrailerSound(soundEnabledRef.current, postPlaySoundAttemptedRef.current, muted, activeRef.current)) return false;
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
    setPlaybackState("playing");
    setIsMuted(player.isMuted());
    if (!restorePreferredSoundAfterPlaying(player) && !postPlaySoundPendingRef.current) checkActualSound(player);
  }

  function retryAutoplayMuted(player: YouTubePlayer, reason: "youtube_blocked" | "timeout_not_playing") {
    logTrailerDiagnostic(diagnosticPlayerId.current, "muted_retry_requested", { reason, preferredSound: soundEnabledRef.current });
    logTrailerDiagnostic(diagnosticPlayerId.current, "mute_requested", { reason });
    clearAutoplayTimer();
    autoplayAttemptRef.current = "muted";
    setIsMuted(true);
    recoverBlockedTrailerAutoplay(player, "sound");
    if (autoplayAttemptRef.current !== "muted") return;
    autoplayTimerRef.current = window.setTimeout(() => {
      if (autoplayAttemptRef.current === "muted") {
        const state = player.getPlayerState();
        logTrailerDiagnostic(diagnosticPlayerId.current, "playback_timeout", { attempted: "muted", playerState: state, muted: player.isMuted(), preferredSound: soundEnabledRef.current });
        if (state === 1) {
          confirmPlaybackStarted(player, "timeout");
          return;
        }
        autoplayAttemptRef.current = null;
        autoplayBlockedRef.current = true;
        setPlaybackState("blocked");
      }
    }, 6000);
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
    autoplayTimerRef.current = window.setTimeout(() => {
      if (autoplayAttemptRef.current) {
        const attempted = autoplayAttemptRef.current;
        const state = player.getPlayerState();
        const decision = decideTrailerAutoplayRecovery("timeout", attempted, state);
        logTrailerDiagnostic(diagnosticPlayerId.current, "playback_timeout", { attempted, playerState: state, muted: player.isMuted(), preferredSound: soundEnabledRef.current, decision });
        if (decision === "playing") {
          confirmPlaybackStarted(player, "timeout");
          return;
        }
        if (decision === "retry-muted" && playerRef.current === player && activeRef.current && !userPausedRef.current) {
          retryAutoplayMuted(player, "timeout_not_playing");
          return;
        }
        autoplayAttemptRef.current = null;
        autoplayBlockedRef.current = true;
        setPlaybackState("blocked");
      }
    }, 6000);
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
    setIsMuted(true);
    setPlaybackError(false);
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
          if (isPermanentYouTubeError(data)) onUnplayableRef.current?.();
          else setPlaybackError(true);
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
    if (!userPausedRef.current && !autoplayBlockedRef.current) attemptPlayback(player, hasPlayedRef.current && soundEnabledRef.current);
    else logTrailerDiagnostic(diagnosticPlayerId.current, "autoplay_skipped", { userPaused: userPausedRef.current, previousBlock: autoplayBlockedRef.current });
  }, [active, apiReady]);

  function togglePlayback() {
    const player = playerRef.current;
    if (!player) return;
    if (player.getPlayerState() === 1) {
      userPausedRef.current = true;
      player.pauseVideo();
    } else {
      userPausedRef.current = false;
      attemptPlayback(player, soundEnabledRef.current);
    }
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
    <div className="discover-trailer__media">
      <div className="discover-trailer__frame">
        {embedUrl ? (
          <iframe
            key={`${embedUrl}:${retryCount}`}
            ref={iframeRef}
            src={embedUrl}
            title={`Tráiler de ${title}`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
          />
        ) : posterUrl ? (
          <img src={posterUrl} alt={`Póster de ${title}`} />
        ) : (
          <div className="discover-trailer__missing-image">{title}</div>
        )}
      </div>
      {playbackError ? <div className="discover-trailer__video-error" role="status">
        <span>No pudimos reproducir este tráiler ahora.</span>
        <button type="button" onClick={() => { setPlaybackError(false); setRetryCount((value) => value + 1); }}>Reintentar</button>
      </div> : null}
      {embedUrl && !apiUnavailable ? (
        <div className={`discover-trailer__playback${playbackState === "playing" ? " is-playing" : ""}`} aria-label="Controles del tráiler">
          <button type="button" className="discover-trailer__playback-toggle" onClick={togglePlayback} disabled={!apiReady} aria-label={playbackState === "playing" ? "Pausar tráiler" : "Reproducir tráiler"}>
            <span className="discover-trailer__playback-label">{playbackState === "playing" ? "Pausar" : "Reproducir"}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true">{playbackState === "playing" ? <><rect x="7" y="5" width="3" height="14" rx="1" /><rect x="14" y="5" width="3" height="14" rx="1" /></> : <path d="M8 5.5 19 12 8 18.5Z" />}</svg>
          </button>
          <button type="button" className="discover-trailer__sound-toggle" disabled={!apiReady} aria-label={isMuted ? "Activar sonido del tráiler" : "Silenciar tráiler"} onClick={toggleSound}>
            <span className="discover-trailer__playback-label">{isMuted ? "Activar sonido" : "Silenciar"}</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" />{isMuted ? <path d="m17 9 5 6m0-6-5 6" /> : <><path d="M17 9a4 4 0 0 1 0 6" /><path d="M20 6a8 8 0 0 1 0 12" /></>}</svg>
          </button>
        </div>
      ) : <p className="discover-trailer__no-video">{availableUrl ? "Tráiler en pausa." : "Tráiler no disponible para este título."}</p>}
      {playbackState === "blocked" && !playbackError ? <p className="discover-trailer__sound-hint">El video no se inició automáticamente. Tocá Play para continuar.</p> : null}
    </div>
  );
}
