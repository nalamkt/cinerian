import { useEffect, useRef, useState } from "react";

type DiscoverTrailerPlayerProps = {
  title: string;
  trailerUrl: string | null;
  posterUrl: string;
  active: boolean;
  onUnplayable?: () => void;
};

type YouTubePlayer = {
  playVideo: () => void;
  pauseVideo: () => void;
  mute: () => void;
  unMute: () => void;
  getPlayerState: () => number;
  destroy: () => void;
};

type YouTubeApi = {
  Player: new (element: HTMLIFrameElement, options: {
    events: {
      onReady: (event: { target: YouTubePlayer }) => void;
      onStateChange: (event: { data: number }) => void;
      onError: (event: { data: number }) => void;
    };
  }) => YouTubePlayer;
};

type YouTubeWindow = Window & { YT?: YouTubeApi; onYouTubeIframeAPIReady?: () => void };
let apiPromise: Promise<YouTubeApi> | null = null;

function loadYouTubeApi(): Promise<YouTubeApi> {
  const page = window as YouTubeWindow;
  if (page.YT?.Player) return Promise.resolve(page.YT);
  if (apiPromise) return apiPromise;
  apiPromise = new Promise((resolve, reject) => {
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
  });
  return apiPromise;
}

export function buildDiscoverTrailerUrl(trailerUrl: string | null, origin: string): string | null {
  if (!trailerUrl) return null;
  try {
    const source = new URL(trailerUrl);
    const match = source.pathname.match(/^\/embed\/([A-Za-z0-9_-]+)$/);
    if (source.origin !== "https://www.youtube.com" || !match) return null;
    const url = new URL(`https://www.youtube.com/embed/${match[1]}`);
    url.searchParams.set("autoplay", "1");
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

export function DiscoverTrailerPlayer({ title, trailerUrl, posterUrl, active, onUnplayable }: DiscoverTrailerPlayerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const playerRef = useRef<YouTubePlayer | null>(null);
  const onUnplayableRef = useRef(onUnplayable);
  onUnplayableRef.current = onUnplayable;
  const [apiReady, setApiReady] = useState(false);
  const [apiUnavailable, setApiUnavailable] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [isPaused, setIsPaused] = useState(true);
  const [feedback, setFeedback] = useState<"play" | "pause" | null>(null);
  const [playbackError, setPlaybackError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const feedbackTimerRef = useRef<number | null>(null);
  useEffect(() => () => {
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
  }, []);
  const availableUrl = buildDiscoverTrailerUrl(trailerUrl, typeof window === "undefined" ? "https://cinerian.app" : window.location.origin);
  const embedUrl = active ? availableUrl : null;

  function showFeedback(next: "play" | "pause") {
    setFeedback(next);
    if (feedbackTimerRef.current !== null) window.clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = window.setTimeout(() => setFeedback(null), 700);
  }

  useEffect(() => {
    if (!embedUrl || !iframeRef.current) return;
    let cancelled = false;
    const iframe = iframeRef.current;
    setApiReady(false);
    setIsPaused(true);
    setIsMuted(true);
    setPlaybackError(false);
    void loadYouTubeApi().then((api) => {
      if (cancelled || !iframe.isConnected) return;
      playerRef.current = new api.Player(iframe, { events: {
        onReady: () => { if (!cancelled) setApiReady(true); },
        onStateChange: ({ data }) => {
          if (!cancelled && (data === 1 || data === 2)) {
            setIsPaused(data === 2);
            showFeedback(data === 1 ? "play" : "pause");
          }
        },
        onError: ({ data }) => {
          if (cancelled) return;
          if (isPermanentYouTubeError(data)) onUnplayableRef.current?.();
          else setPlaybackError(true);
        }
      } });
    }).catch(() => {
      if (!cancelled) setApiUnavailable(true);
    });
    return () => {
      cancelled = true;
      if (playerRef.current && iframe.isConnected) {
        try { playerRef.current.pauseVideo(); }
        catch { /* El iframe ya puede estar desmontado al cambiar de título. */ }
      }
      playerRef.current = null;
    };
  }, [embedUrl, retryCount]);

  function togglePlayback() {
    const player = playerRef.current;
    if (!player) return;
    if (player.getPlayerState() === 1) player.pauseVideo();
    else player.playVideo();
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
        <div className="discover-trailer__playback" aria-label="Controles del tráiler">
          <button type="button" onClick={togglePlayback} disabled={!apiReady} aria-label={isPaused ? "Reproducir tráiler" : "Pausar tráiler"}>
            <span className="discover-trailer__playback-label">{isPaused ? "Reproducir" : "Pausar"}</span>
            <span className="discover-trailer__playback-icon" aria-hidden="true">{isPaused ? "▶" : "Ⅱ"}</span>
          </button>
          <button type="button" disabled={!apiReady} aria-label={isMuted ? "Activar sonido del tráiler" : "Silenciar tráiler"} onClick={() => { const player = playerRef.current; if (!player) return; if (isMuted) player.unMute(); else player.mute(); setIsMuted(!isMuted); }}>
            <span className="discover-trailer__playback-label">{isMuted ? "Activar sonido" : "Silenciar"}</span>
            <span className="discover-trailer__playback-icon" aria-hidden="true">{isMuted ? "♪̸" : "♪"}</span>
          </button>
          {feedback ? <span className="discover-trailer__playback-feedback" aria-hidden="true">{feedback === "play" ? "▶" : "Ⅱ"}</span> : null}
        </div>
      ) : <p className="discover-trailer__no-video">{availableUrl ? "Tráiler en pausa." : "Tráiler no disponible para este título."}</p>}
    </div>
  );
}
