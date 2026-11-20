import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
after(() => vite.close());
const { chooseTrailerPresentation, shouldExpandTrailerOnRotation, shouldLeaveTrailerOnRotation } = await vite.ssrLoadModule("/src/lib/trailerFullscreen.ts");
const { DiscoverTrailerPlayer, buildDiscoverTrailerUrl } = await vite.ssrLoadModule("/src/components/DiscoverTrailerPlayer.tsx");
const source = readFileSync(new URL("../src/components/DiscoverTrailerPlayer.tsx", import.meta.url), "utf8");
const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

const playing = {
  wasLandscape: false, isLandscape: true, mobile: true, active: true,
  playing: true, hasVideo: true, dismissed: false, mode: "inline"
};

test("vertical a horizontal expande solo un trailer activo y reproduciendose", () => {
  assert.equal(shouldExpandTrailerOnRotation(playing), true);
  for (const change of [{ playing: false }, { active: false }, { hasVideo: false }, { mobile: false }, { wasLandscape: true }]) {
    assert.equal(shouldExpandTrailerOnRotation({ ...playing, ...change }), false);
  }
});

test("horizontal a vertical sale del modo inmersivo o nativo", () => {
  assert.equal(shouldLeaveTrailerOnRotation(true, false, "immersive"), true);
  assert.equal(shouldLeaveTrailerOnRotation(true, false, "native"), true);
  assert.equal(shouldLeaveTrailerOnRotation(true, false, "inline"), false);
  assert.equal(shouldLeaveTrailerOnRotation(false, true, "immersive"), false);
  assert.match(source, /if \(!isLandscape\) \{[\s\S]*?leavePresentation\(false\)/);
  assert.match(source, /document\.fullscreenElement === mediaRef\.current/);
});

test("Safari iPhone y PWA usan presentacion inmersiva cuando el fullscreen nativo no existe", () => {
  assert.equal(chooseTrailerPresentation({ nativeSupported: false, userActivated: false }), "immersive");
  assert.equal(chooseTrailerPresentation({ nativeSupported: false, userActivated: true }), "immersive");
  assert.match(css, /\.discover-trailer__media\.is-immersive[\s\S]*?position: fixed;/);
  assert.match(css, /height: 100dvh;/);
  assert.match(css, /env\(safe-area-inset-left, 0px\)/);
});

test("Android solo solicita fullscreen nativo con activacion valida; denegacion vuelve al modo inmersivo", () => {
  assert.equal(chooseTrailerPresentation({ nativeSupported: true, userActivated: false }), "immersive");
  assert.equal(chooseTrailerPresentation({ nativeSupported: true, userActivated: true }), "native");
  assert.match(source, /media\.requestFullscreen\(\)\.then\(/);
  assert.match(source, /\.catch\(\(\) => \{[\s\S]*?present\("immersive"\)/);
  assert.match(source, /nativeRequestPendingRef\.current/);
});

test("salida manual no reingresa hasta otra rotacion", () => {
  assert.equal(shouldExpandTrailerOnRotation({ ...playing, dismissed: true }), false);
  assert.equal(shouldExpandTrailerOnRotation({ ...playing, mode: "immersive" }), false);
  assert.match(source, /if \(manual\) dismissedRef\.current = true/);
  assert.match(source, /if \(wasLandscape === isLandscape\) return/);
  assert.match(source, /dismissedRef\.current = false;/);
});

test("rotar y regresar no cambia src, key, video, sonido ni estado del feed", () => {
  const original = buildDiscoverTrailerUrl("https://www.youtube.com/embed/AbC_123-xy", "https://cinerian.app");
  assert.equal(original, buildDiscoverTrailerUrl("https://www.youtube.com/embed/AbC_123-xy", "https://cinerian.app"));
  assert.match(source, /const availableUrl = useMemo\([\s\S]*?\[trailerUrl, retryCount\]/);
  assert.match(source, /const embedUrl = hasMounted \? availableUrl : null/);
  assert.match(source, /if \(!active\) \{[\s\S]*?player\.pauseVideo\(\)/);
  assert.doesNotMatch(source.slice(source.indexOf("function enterPresentation"), source.indexOf("useEffect(() => {\n    if (preload)")), /loadVideoById|seekTo|setRetryCount|onSoundEnabledChange/);
});

test("backdrop sin video no ofrece pantalla completa", () => {
  const markup = renderToStaticMarkup(createElement(DiscoverTrailerPlayer, {
    title: "Sin trailer", trailerUrl: null, posterUrl: "/poster.jpg", backdropUrl: "/backdrop.jpg",
    active: true, soundEnabled: true, onSoundEnabledChange: () => {}
  }));
  assert.match(markup, /discover-trailer__backdrop/);
  assert.doesNotMatch(markup, /discover-trailer__fullscreen-toggle|<iframe/);
});
