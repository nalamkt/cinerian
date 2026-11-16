import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { readFileSync } from "node:fs";

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
after(() => vite.close());
const { DiscoverTrailerPlayer, buildDiscoverTrailerUrl } = await vite.ssrLoadModule("/src/components/DiscoverTrailerPlayer.tsx");
const { canFinishTrailerJourney, completesTrailerSwipe, moveTrailerCursor, shouldFetchMoreTrailerPages, shouldOpenTrailerInfo, shouldPlayDiscoverTrailer, splitTrailerTitleForBadge, trailerAvailability, trailerDragOffset, trailerEmptyPhase, youtubeThumbnailUrl } = await vite.ssrLoadModule("/src/lib/discoverTrailer.ts");
const { advanceTrailerProgress, parseTrailerProgress, serializeTrailerProgress, trailerProgressStorageKey } = await vite.ssrLoadModule("/src/lib/trailerProgress.ts");
const { getTrailerUrl } = await vite.ssrLoadModule("/src/lib/tmdb.ts");
const { DiscoverWatchOptions } = await vite.ssrLoadModule("/src/components/DiscoverWatchOptions.tsx");
const { DiscoverOverview } = await vite.ssrLoadModule("/src/components/DiscoverOverview.tsx");

test("Descubrí usa un feed único y no guarda el modo anterior", () => {
  const panel = readFileSync(new URL("../src/components/RecommendationPanel.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(panel, /<DiscoverModeSwitch|cinerian:discover-mode:|setDiscoverMode/);
  assert.match(panel, /const eligibleTrailerItems = useMemo\(\(\) => circleEntries\.map\(\(entry\) => entry\.item\)/);
});

test("el tráiler solo utiliza embeds seguros y conserva formato horizontal", () => {
  const url = buildDiscoverTrailerUrl("https://www.youtube.com/embed/AbC_123-xy", "https://cinerian.app");
  assert.ok(url);
  const parsed = new URL(url);
  assert.equal(parsed.searchParams.get("mute"), "1");
  assert.equal(parsed.searchParams.get("autoplay"), "0");
  assert.equal(parsed.searchParams.get("playsinline"), "1");
  assert.equal(parsed.searchParams.get("origin"), "https://cinerian.app");
  assert.equal(parsed.searchParams.get("cc_lang_pref"), "es");
  assert.equal(parsed.searchParams.has("cc_load_policy"), false);
  assert.equal(parsed.searchParams.get("controls"), "0");
  assert.equal(buildDiscoverTrailerUrl("https://evil.example/embed/AbC_123-xy", "https://cinerian.app"), null);
  assert.equal(buildDiscoverTrailerUrl("https://www.youtube.com/redirect?url=evil", "https://cinerian.app"), null);
});

test("el título mobile conserva la última palabra junto al badge sin alterar Tarjetas", () => {
  assert.deepEqual(splitTrailerTitleForBadge("Fuera de mí"), { prefix: "Fuera de", lastWord: "mí" });
  assert.deepEqual(splitTrailerTitleForBadge("Cafarnaúm: La ciudad olvidada"), { prefix: "Cafarnaúm: La ciudad", lastWord: "olvidada" });
  assert.deepEqual(splitTrailerTitleForBadge("Wolfblood: Familia lobo"), { prefix: "Wolfblood: Familia", lastWord: "lobo" });
  assert.deepEqual(splitTrailerTitleForBadge("Titanic"), { prefix: "", lastWord: "Titanic" });
  const panel = readFileSync(new URL("../src/components/RecommendationPanel.tsx", import.meta.url), "utf8");
  const trailer = panel.slice(panel.indexOf('className="discover-trailer__info"'), panel.indexOf('className="discover-trailer__bottom"'));
  const cards = panel.slice(panel.indexOf('className="discover-card__body"'));
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(trailer, /<h2 className="discover-title">\{shownTrailerItem\.title\}<\/h2>/);
  assert.match(trailer, /<h2 className="discover-title discover-trailer__title-mobile">[\s\S]*?className="discover-trailer__title-tail"[\s\S]*?\{"\\u00a0"\}<span className="discover-kind">/);
  assert.match(cards, /<h2 className="discover-title">\{spotlight\.title\}<\/h2>/);
  assert.match(styles, /@media \(max-width: 680px\) \{[\s\S]*?\.discover-trailer__title-tail \{ display: inline-block; white-space: nowrap; \}/);
});

test("sin tráiler muestra póster y acciones de reproducción ausentes", () => {
  const html = renderToStaticMarkup(createElement(DiscoverTrailerPlayer, { title: "Título", trailerUrl: null, posterUrl: "/poster.jpg", active: true, soundEnabled: false, onSoundEnabledChange: () => {} }));
  assert.match(html, /Imagen de Título/);
  assert.match(html, /discover-trailer__poster-fallback/);
  assert.match(html, /is-poster/);
  assert.doesNotMatch(html, /Tráiler no disponible/);
  assert.doesNotMatch(html, /<iframe|Activar sonido|Pausar/);
});

test("backdrop disponible tiene prioridad sobre el póster y no muestra puntuación flotante", () => {
  const html = renderToStaticMarkup(createElement(DiscoverTrailerPlayer, {
    title: "Una película", trailerUrl: "https://example.com/video", posterUrl: "/poster.jpg",
    backdropUrl: "https://image.tmdb.org/t/p/w780/backdrop.jpg", active: true, soundEnabled: false, onSoundEnabledChange: () => {}
  }));
  assert.match(html, /discover-trailer__backdrop/);
  assert.match(html, /backdrop\.jpg/);
  assert.doesNotMatch(html, /poster\.jpg|TMDB 8\.2|score-overlay/);
  assert.doesNotMatch(html, /<iframe|Reproducir tráiler/);
});

test("sin backdrop ni póster muestra el placeholder del título", () => {
  for (const posterUrl of ["", "/images/base.png"]) {
    const html = renderToStaticMarkup(createElement(DiscoverTrailerPlayer, {
      title: "Título sin imagen", trailerUrl: null, posterUrl, active: true, soundEnabled: false, onSoundEnabledChange: () => {}
    }));
    assert.match(html, /discover-trailer__missing-image/);
    assert.doesNotMatch(html, /<img|<iframe/);
  }
});

test("si YouTube falla, ofrece el póster sin saltar ni valorar el título", () => {
  const player = readFileSync(new URL("../src/components/DiscoverTrailerPlayer.tsx", import.meta.url), "utf8");
  const panel = readFileSync(new URL("../src/components/RecommendationPanel.tsx", import.meta.url), "utf8");
  assert.match(player, /onError: \(\{ data \}\) => \{[\s\S]*?setCanRetry\(!isPermanentYouTubeError\(data\)\);\s*setPlaybackError\(true\)/);
  assert.match(player, /embedUrl && !playbackError && !apiUnavailable \? \(/);
  assert.match(player, /playbackError && canRetry \? <button type="button" className="discover-trailer__retry"/);
  assert.doesNotMatch(panel, /onUnplayable=|blockedTrailerKeys/);
  assert.doesNotMatch(player, /saveStoredReaction|registerReaction/);
});

test("al ocultar la vista desmonta el video; solo el activo puede reproducirse", () => {
  const props = { title: "Título", trailerUrl: "https://www.youtube.com/embed/AbC_123-xy", posterUrl: "/poster.jpg", soundEnabled: false, onSoundEnabledChange: () => {} };
  const playing = renderToStaticMarkup(createElement(DiscoverTrailerPlayer, { ...props, active: true }));
  const paused = renderToStaticMarkup(createElement(DiscoverTrailerPlayer, { ...props, active: false }));
  assert.equal((playing.match(/<iframe/g) ?? []).length, 1);
  assert.doesNotMatch(playing, /Reproducir tráiler|Pausar tráiler|discover-trailer__playback-toggle/);
  assert.match(playing, /Activar sonido/);
  assert.doesNotMatch(playing, /score-overlay|TMDB/);
  assert.doesNotMatch(paused, /<iframe/);
  assert.match(paused, /Imagen de Título/);
});

test("búsqueda, ficha, filtros, pestaña oculta y cambio de modo apagan el video", () => {
  const ready = { active: true, documentVisible: true, mode: "trailers", detailsOpen: false, reviewOpen: false, filtersOpen: false, syncing: false };
  assert.equal(shouldPlayDiscoverTrailer(ready), true);
  for (const disabled of [
    { active: false }, { documentVisible: false }, { mode: "cards" },
    { detailsOpen: true }, { reviewOpen: true }, { filtersOpen: true }, { syncing: true }
  ]) {
    assert.equal(shouldPlayDiscoverTrailer({ ...ready, ...disabled }), false);
  }
});

test("avanzar y volver en Tráilers solo cambia el cursor, sin valorar títulos", () => {
  const items = [{ id: 1 }, { id: 2 }, { id: 3 }];
  const key = (item) => String(item.id);
  const first = moveTrailerCursor({ available: items, history: [], index: null, current: items[0], direction: "next", key });
  assert.deepEqual(first, { history: [items[0], items[1]], index: 1 });
  const second = moveTrailerCursor({ available: items, ...first, current: items[1], direction: "next", key });
  assert.deepEqual(second, { history: items, index: 2 });
  const previous = moveTrailerCursor({ available: items, ...second, current: items[2], direction: "previous", key });
  assert.equal(previous.index, 1);
  assert.equal(moveTrailerCursor({ available: items, ...second, current: items[2], direction: "next", key }), null);
  assert.deepEqual(items, [{ id: 1 }, { id: 2 }, { id: 3 }]);
});

test("video y póster comparten el mismo cursor y progreso", () => {
  const items = [
    { id: 1, kind: "video" }, { id: 2, kind: "poster" }, { id: 3, kind: "video" }
  ];
  const key = (item) => `movie-${item.id}`;
  const second = moveTrailerCursor({ available: items, history: [], index: null, current: items[0], direction: "next", key });
  assert.equal(second.history[second.index].kind, "poster");
  const progress = advanceTrailerProgress(parseTrailerProgress(null), second.history.map(key), second.index);
  assert.equal(parseTrailerProgress(serializeTrailerProgress(progress)).currentKey, "movie-2");
  const third = moveTrailerCursor({ available: items, ...second, current: items[1], direction: "next", key });
  assert.equal(third.history[third.index].kind, "video");
  const back = moveTrailerCursor({ available: items, ...third, current: items[2], direction: "previous", key });
  assert.equal(back.history[back.index].kind, "poster");
});

test("el swipe acompaña el dedo y vuelve si no alcanza distancia o velocidad", () => {
  assert.equal(trailerDragOffset(-47, true), -47);
  assert.equal(trailerDragOffset(100, false), 18);
  assert.equal(completesTrailerSwipe(-42, 500, 600, true), false);
  assert.equal(completesTrailerSwipe(-120, 500, 600, true), true);
  assert.equal(completesTrailerSwipe(45, 60, 600, true), true);
  assert.equal(completesTrailerSwipe(300, 50, 600, false), false);
});

test("el feed conserva títulos sin video y errores temporales", () => {
  assert.equal(trailerAvailability({ trailerUrl: "https://www.youtube.com/embed/abc" }), "playable");
  assert.equal(trailerAvailability({ trailerUrl: null, trailerLookupComplete: true }), "missing");
  assert.equal(trailerAvailability({ trailerUrl: null, trailerLookupComplete: false }), "unknown");
  assert.equal(trailerAvailability(null), "unknown");
  const source = readFileSync(new URL("../src/components/RecommendationPanel.tsx", import.meta.url), "utf8");
  assert.match(source, /const eligibleTrailerItems = useMemo\(\(\) => circleEntries\.map\(\(entry\) => entry\.item\)/);
  assert.doesNotMatch(source, /blockedTrailerKeys|availability === "playable"/);
  assert.match(source, /const current = circleEntries\.length/);
});

test("no declara vacío mientras escanea ni al cambiar plataformas; continúa hasta el límite", () => {
  const query = (page, scanComplete, unexploredCount, hasCurrent = false) =>
    shouldFetchMoreTrailerPages({ page, scanComplete, unexploredCount, hasCurrent, maxPages: 20, failed: false });
  assert.equal(trailerEmptyPhase({ page: 3, scanComplete: true, maxPages: 20, failed: false }), "loading");
  assert.equal(query(3, true, 0), true);
  assert.equal(query(3, false, 0), false);
  assert.equal(query(19, true, 0), true);
  assert.equal(query(20, true, 0), false);
  assert.equal(trailerEmptyPhase({ page: 20, scanComplete: true, maxPages: 20, failed: false }), "limit");
  assert.equal(trailerEmptyPhase({ page: 5, scanComplete: true, maxPages: 20, failed: true }), "error");
  const original = trailerProgressStorageKey("user-1", "all", [8, 2]);
  const withMovistar = trailerProgressStorageKey("user-1", "all", [8, 2, 22]);
  assert.notEqual(original, withMovistar);
  assert.equal(original, trailerProgressStorageKey("user-1", "all", [2, 8]));
  const source = readFileSync(new URL("../src/components/RecommendationPanel.tsx", import.meta.url), "utf8");
  assert.match(source, /const generation = deckGenerationRef\.current;[\s\S]*?if \(generation !== deckGenerationRef\.current\) return;/);
  assert.match(source, /setTrailerPageError\(false\); setPageRetryKey/);
});

test("el progreso se restaura por usuario y filtros sin escribir reacciones", () => {
  const a = trailerProgressStorageKey("user-1", "movie", [8]);
  const b = trailerProgressStorageKey("user-2", "movie", [8]);
  assert.notEqual(a, b);
  const first = advanceTrailerProgress(parseTrailerProgress(null), ["movie-1", "tv-2"], 1);
  assert.deepEqual(first, { visitedKeys: ["movie-1"], currentKey: "tv-2", historyKeys: ["movie-1", "tv-2"] });
  assert.deepEqual(parseTrailerProgress(serializeTrailerProgress(first)), first);
  const previous = advanceTrailerProgress(first, ["movie-1", "tv-2"], 0);
  assert.equal(previous.currentKey, "movie-1");
  assert.deepEqual(previous.visitedKeys, ["movie-1"]);
  assert.deepEqual(parseTrailerProgress("broken"), parseTrailerProgress(null));
  assert.deepEqual(parseTrailerProgress('{"version":99,"visitedKeys":["movie-1"]}'), parseTrailerProgress(null));
  assert.deepEqual(parseTrailerProgress('{"version":1,"visitedKeys":["password","movie-1"],"currentKey":"bad","historyKeys":[]}').visitedKeys, ["movie-1"]);
  const source = readFileSync(new URL("../src/components/RecommendationPanel.tsx", import.meta.url), "utf8");
  const navigation = source.slice(source.indexOf("function startTrailerTransition"), source.indexOf("function handleTrailerWheel"));
  assert.match(navigation, /saveTrailerProgress\(advanceTrailerProgress/);
  assert.doesNotMatch(navigation, /saveStoredReaction|registerReaction/);
  assert.doesNotMatch(source, /Reiniciar exploración/);
  const activePanel = source.slice(source.indexOf('<div className="discover-trailer__bottom">'), source.indexOf('</article>', source.indexOf('<div className="discover-trailer__bottom">')));
  assert.doesNotMatch(activePanel, /resetTrailerProgress|Volver a explorar/);
  assert.match(source, /isTrailerJourneyComplete && trailerProgress\?\.visitedKeys\.length \? <button[^>]+onClick=\{resetTrailerProgress\}>Volver a explorar/);
});

test("Volver a explorar solo corresponde al fin revisado, no a carga ni errores", () => {
  const input = { scanComplete: true, page: 20, maxPages: 20, pageFailed: false, scanFailed: false };
  assert.equal(canFinishTrailerJourney(input), true);
  assert.equal(canFinishTrailerJourney({ ...input, scanComplete: false }), false);
  assert.equal(canFinishTrailerJourney({ ...input, page: 19 }), false);
  assert.equal(canFinishTrailerJourney({ ...input, pageFailed: true }), false);
  assert.equal(canFinishTrailerJourney({ ...input, scanFailed: true }), false);
  const source = readFileSync(new URL("../src/components/RecommendationPanel.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(unexploredTrailerItems\.some\(\(item\) => !historyKeys\.has\(itemKey\(item\)\)\)\) setIsTrailerEnd\(false\)/);
  assert.match(source, /function resetTrailerProgress\(\) \{[\s\S]*?saveTrailerProgress\(EMPTY_TRAILER_PROGRESS\)/);
});

test("sin overlay de orientación ni intento de bloqueo no hay pantalla blanca", () => {
  const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const main = readFileSync(new URL("../src/main.tsx", import.meta.url), "utf8");
  const manifest = JSON.parse(readFileSync(new URL("../public/site.webmanifest", import.meta.url), "utf8"));
  assert.doesNotMatch(html, /orientation-guard|Girá el teléfono/);
  assert.doesNotMatch(css, /orientation-guard/);
  assert.doesNotMatch(main, /orientation\.lock/);
  assert.equal(manifest.orientation, undefined);
});

test("el swipe solo desplaza el video y la información; acciones y sinopsis quedan estables", () => {
  const panel = readFileSync(new URL("../src/components/RecommendationPanel.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const stage = panel.slice(panel.indexOf('<div className="discover-trailer__stage">'), panel.indexOf('className="discover-trailer__bottom"'));
  assert.match(stage, /discover-trailer__preview-info/);
  assert.match(stage, /discover-trailer__current/);
  assert.doesNotMatch(stage, /renderDiscoverActions/);
  assert.match(css, /\.discover-trailer__stage \{[^}]*overflow: hidden;/);
  assert.match(css, /\.discover-trailer__info \.discover-overview \{[^}]*height: clamp/);
  assert.match(css, /\.discover-trailer__info \.discover-overview p:not\(\.discover-overview__text--clamped\) \{[^}]*overflow-y: auto;/);
  assert.match(css, /\.discover-trailer__bottom \{[^}]*flex: none;/);
  assert.match(css, /\.discover-trailer__preview img \{[^}]*object-fit: contain;/);
  assert.doesNotMatch(stage, /<iframe/);
});

test("prioriza original rotulado subtitulado, doblado y luego original; no inventa subtítulos", () => {
  const video = (key, language, name, official = true) => ({ site: "YouTube", key, iso_639_1: language, name, type: "Trailer", official, size: 1080 });
  const payload = { original_language: "ja", videos: { results: [
    video("other", "en", "Official trailer"),
    video("original", "ja", "Original trailer"),
    video("dubbed", "es", "Trailer doblado"),
    video("subtitled", "es", "Trailer subtitulado")
  ] } };
  assert.match(getTrailerUrl(payload), /subtitled$/);
  payload.videos.results.pop();
  assert.match(getTrailerUrl(payload), /dubbed$/);
  payload.videos.results.splice(2, 1);
  assert.match(getTrailerUrl(payload), /original$/);
  assert.equal(getTrailerUrl({ original_language: "ja", videos: { results: [] } }), null);
  assert.equal(getTrailerUrl({ original_language: "ja", videos: { results: [video("bad!", "ja", "Trailer")] } }), null);
});

test("acciones, plataformas y sinopsis reutilizan piezas de ambos modos", () => {
  const source = readFileSync(new URL("../src/components/RecommendationPanel.tsx", import.meta.url), "utf8");
  assert.match(source, /renderDiscoverActions\(spotlight\)/);
  assert.match(source, /renderDiscoverActions\(shownTrailerItem, true\)/);
  assert.match(source, /DiscoverWatchOptions options=\{watchOptions\}/);
  assert.match(source, /DiscoverWatchOptions options=\{shownTrailerWatchOptions\}/);
  const options = { flatrate: [{ id: 1, name: "Servicio", logoUrl: "/logo.png", url: "/ver" }], hasRentOrBuy: false, link: null };
  assert.match(renderToStaticMarkup(createElement(DiscoverWatchOptions, { options })), /Servicio/);
  assert.equal(renderToStaticMarkup(createElement(DiscoverWatchOptions, { options: { flatrate: [], hasRentOrBuy: false, link: null } })), "");
  assert.match(renderToStaticMarkup(createElement(DiscoverOverview, { text: "Sinopsis" })), /discover-overview__text--clamped/);
});

test("la pista de deslizar queda siempre visible y el filtro activo conserva un nombre accesible", () => {
  const source = readFileSync(new URL("../src/components/RecommendationPanel.tsx", import.meta.url), "utf8");
  assert.match(source, /eligibleTrailerItems\.length > 1 \? \([\s\S]*?discover-swipe-hint/);
  assert.doesNotMatch(source, /trailer-swipe-learned:/);
  assert.match(source, /Filtros activos, abrir filtros/);
  assert.match(source, /discover-circle-badge/);
});

test("los gestos de navegación no pasan por el guardado de reacciones", () => {
  const panel = readFileSync(new URL("../src/components/RecommendationPanel.tsx", import.meta.url), "utf8");
  const navigation = panel.slice(panel.indexOf("function navigateTrailer"), panel.indexOf("function handleTrailerWheel"));
  assert.match(navigation, /moveTrailerCursor/);
  assert.doesNotMatch(navigation, /registerReaction|handleSkip|saveStoredReaction/);
  assert.match(panel, /renderDiscoverActions\(shownTrailerItem, true\)/);
});

test("Tráilers no scrollea internamente; solo la sinopsis expandida conserva scroll", () => {
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const trailer = styles.match(/\.discover-trailer\s*\{([^}]*)\}/)?.[1] ?? "";
  assert.match(trailer, /overflow: hidden;/);
  assert.doesNotMatch(trailer, /overflow-y: auto;/);
  assert.match(styles, /\.discover-trailer__info \.discover-overview p:not\(\.discover-overview__text--clamped\)\s*\{[^}]*overflow-y: auto;[^}]*touch-action: pan-y;/);
  const source = readFileSync(new URL("../src/components/RecommendationPanel.tsx", import.meta.url), "utf8");
  assert.match(source, /pane\.addEventListener\("touchmove", move, \{ passive: false \}\)/);
  assert.match(source, /event\.preventDefault\(\);\s*suppressTrailerInfoClickUntilRef/);
  assert.match(source, /\.discover-overview p:not\(\.discover-overview__text--clamped\)/);
});

test("tocar información abre ficha; plataformas, controles y sinopsis no la abren", () => {
  const target = (match) => ({ closest: (selector) => selector.includes(match) ? {} : null });
  assert.equal(shouldOpenTrailerInfo({ closest: () => null }, false), true);
  assert.equal(shouldOpenTrailerInfo({ closest: () => null }, true), false);
  for (const selector of ["a", "button", "[role='button']", ".discover-overview p:not(.discover-overview__text--clamped)", "select"]) {
    assert.equal(shouldOpenTrailerInfo(target(selector), false), false);
  }
  assert.equal(shouldOpenTrailerInfo({ closest: () => null }, false), true);
  const source = readFileSync(new URL("../src/components/RecommendationPanel.tsx", import.meta.url), "utf8");
  assert.match(source, /shouldOpenTrailerInfo\(event\.target as Element[\s\S]*?openMediaDetails\(shownTrailerItem\)/);
  assert.match(source, /onClickCapture=\{\(event\) => \{[\s\S]*?event\.stopPropagation\(\)/);
  assert.match(source, /<h2 className="discover-title">\{shownTrailerItem\.title\}<\/h2>/);
  assert.match(source, /className="discover-trailer__details" onClick=\{\(\) => openMediaDetails\(shownTrailerItem\)\}/);
  const overview = readFileSync(new URL("../src/components/DiscoverOverview.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(overview, /onClick=\{\(\) => \{ if \(clamped\)/);
  assert.match(overview, /className="discover-overview__more"/);
});

test("abrir y cerrar la ficha pausa el video sin cambiar el título", () => {
  const state = { active: true, documentVisible: true, mode: "trailers", detailsOpen: false, reviewOpen: false, filtersOpen: false, syncing: false };
  const current = { id: 12 };
  const history = [current, { id: 13 }];
  assert.equal(shouldPlayDiscoverTrailer(state), true);
  assert.equal(shouldPlayDiscoverTrailer({ ...state, detailsOpen: true }), false);
  assert.equal(shouldPlayDiscoverTrailer({ ...state, detailsOpen: false }), true);
  assert.equal(history[0], current);
  const source = readFileSync(new URL("../src/components/RecommendationPanel.tsx", import.meta.url), "utf8");
  assert.match(source, /const discoverMode: DiscoverMode = "trailers"/);
  assert.doesNotMatch(source, /cinerian:discover-mode:/);
  const infoClick = source.slice(source.indexOf('className="discover-trailer__info"'), source.indexOf('<div className="discover-trailer__bottom">'));
  assert.doesNotMatch(infoClick, /setTrailerHistory|setTrailerHistoryIndex|setDiscoverMode/);
});

test("el tráiler siguiente se precarga oculto y el actual muestra un cuadro del video mientras carga", () => {
  assert.equal(youtubeThumbnailUrl("https://www.youtube.com/embed/AbC_123-xy"), "https://i.ytimg.com/vi/AbC_123-xy/hqdefault.jpg");
  assert.equal(youtubeThumbnailUrl("https://evil.example/embed/AbC_123-xy"), null);
  assert.equal(youtubeThumbnailUrl(null), null);
  const preloading = renderToStaticMarkup(createElement(DiscoverTrailerPlayer, {
    title: "Dune", trailerUrl: "https://www.youtube.com/embed/AbC_123-xy", posterUrl: "/p.jpg",
    active: false, preload: true, soundEnabled: true, onSoundEnabledChange: () => {}
  }));
  assert.match(preloading, /discover-trailer__media is-preloading/);
  assert.match(preloading, /<iframe/);
  assert.match(preloading, /discover-trailer__cover/);
  assert.doesNotMatch(preloading, /discover-trailer__sound-toggle|discover-trailer__resume/);
  const panel = readFileSync(new URL("../src/components/RecommendationPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /key=\{itemKey\(upcomingTrailerItem\)\}[\s\S]*?active=\{false\}[\s\S]*?preload/);
  assert.match(panel, /const previewImage = previewTrailerFrame \|\| previewBackdrop \|\| \(item\.posterUrl !== "\/images\/base\.png"/);
});

test("Tarjetas pasa como TikTok: anterior y siguiente se mueven pegadas a la actual", () => {
  const panel = readFileSync(new URL("../src/components/RecommendationPanel.tsx", import.meta.url), "utf8");
  assert.match(panel, /renderNeighborCard\(previousEntry, preparedPreviousPayload, "previous"\)/);
  assert.match(panel, /renderNeighborCard\(nextEntry, preparedNextPayload, "next"\)/);
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.match(css, /\.discover-card--next \.discover-card__stage \{\s*transform: translate3d\(0, calc\(var\(--card-shift, 0px\) \+ var\(--card-drag, 0px\)\), 0\);/);
  assert.doesNotMatch(css, /is-swipe-exiting/);
});
