import assert from "node:assert/strict";
import { after, test } from "node:test";
import { readFileSync } from "node:fs";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
after(() => vite.close());
const { readTrailerSoundPreference, saveTrailerSoundPreference, requestTrailerAutoplay, recoverBlockedTrailerAutoplay, decideTrailerAutoplayRecovery, shouldRestoreTrailerSound } =
  await vite.ssrLoadModule("/src/lib/trailerPlayback.ts");
const { DiscoverTrailerPlayer, buildDiscoverTrailerUrl } = await vite.ssrLoadModule("/src/components/DiscoverTrailerPlayer.tsx");
const playerSource = readFileSync(new URL("../src/components/DiscoverTrailerPlayer.tsx", import.meta.url), "utf8");
const deckSource = readFileSync(new URL("../src/components/RecommendationPanel.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

function controls() {
  const calls = [];
  return {
    calls,
    player: {
      playVideo: () => calls.push("play"),
      mute: () => calls.push("mute"),
      unMute: () => calls.push("unmute")
    }
  };
}

test("el sonido arranca encendido y respeta por cuenta a quien lo apagó", () => {
  const values = new Map();
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  assert.equal(readTrailerSoundPreference(storage, "isidoro"), true);
  saveTrailerSoundPreference(storage, "isidoro", false);
  assert.equal(readTrailerSoundPreference(storage, "isidoro"), false);
  assert.equal(readTrailerSoundPreference(storage, "mauro"), true);
  saveTrailerSoundPreference(storage, "isidoro", true);
  assert.equal(readTrailerSoundPreference(storage, "isidoro"), true);
  assert.equal(readTrailerSoundPreference(null, "isidoro"), true);
});

test("cada iframe nace silenciado para preservar autoplay sin cambiar la URL al alternar sonido", () => {
  const trailerUrl = "https://www.youtube.com/embed/AbC_123-xy";
  const muted = new URL(buildDiscoverTrailerUrl(trailerUrl, "https://cinerian.app"));
  assert.equal(muted.searchParams.get("mute"), "1");
  assert.equal(muted.searchParams.get("autoplay"), "0");

  const render = (soundEnabled) => renderToStaticMarkup(createElement(DiscoverTrailerPlayer, {
    title: "Título", trailerUrl, posterUrl: "/poster.jpg", active: true,
    soundEnabled, onSoundEnabledChange: () => {}
  }));
  assert.match(render(true), /<iframe[^>]+mute=1/);
  assert.match(render(false), /<iframe[^>]+mute=1/);
  assert.match(playerSource, /const availableUrl = useMemo\([\s\S]*?\[trailerUrl, retryCount\]/);
  assert.doesNotMatch(playerSource, /\[trailerUrl, retryCount, soundEnabled\]/);
});

test("se observa el estado real de audio sin cambiar la preferencia ni forzar otro play", () => {
  const soundCheck = playerSource.slice(playerSource.indexOf("function checkActualSound("), playerSource.indexOf("function restorePreferredSoundAfterPlaying("));
  assert.match(soundCheck, /const muted = player\.isMuted\(\)/);
  assert.match(soundCheck, /logTrailerDiagnostic\(diagnosticPlayerId\.current, "sound_state_confirmed", \{ preferredSound: soundEnabledRef\.current, muted \}\)/);
  assert.doesNotMatch(soundCheck, /onSoundEnabledChange|playVideo|unMute\(/);
  assert.match(playerSource, /checkActualSound\(player\)/);
  assert.match(playerSource, /recoverBlockedTrailerAutoplay\(player, "sound"\)/);
  assert.match(playerSource, /onAutoplayBlocked: \(\) => \{[\s\S]*?retryAutoplayMuted\(player, "youtube_blocked"\)/);
  assert.match(playerSource, /retryAutoplayMuted\(player, "timeout_not_playing"\)/);
});

test("un timeout no silencia un video ya reproduciéndose ni se confunde con bloqueo de Safari", () => {
  assert.equal(decideTrailerAutoplayRecovery("timeout", "sound", 1), "playing");
  assert.equal(decideTrailerAutoplayRecovery("blocked", "sound", 1), "playing");
  assert.equal(decideTrailerAutoplayRecovery("timeout", "sound", 3), "unconfirmed");
  assert.equal(decideTrailerAutoplayRecovery("timeout", "sound", 0), "unconfirmed");
  assert.equal(decideTrailerAutoplayRecovery("timeout", "sound", -1), "retry-muted");
  assert.equal(decideTrailerAutoplayRecovery("blocked", "sound", 3), "retry-muted");
  assert.equal(decideTrailerAutoplayRecovery("blocked", "muted", -1), "unconfirmed");
  assert.match(playerSource, /const state = player\.getPlayerState\(\);\s*const decision = decideTrailerAutoplayRecovery\("timeout", attempted, state\)/);
  assert.match(playerSource, /if \(decision === "playing"\) \{\s*confirmPlaybackStarted\(player, "timeout"\)/);
  assert.match(playerSource, /logTrailerDiagnostic\(diagnosticPlayerId\.current, "mute_requested", \{ reason \}\)/);
  assert.match(playerSource, /preferredSound: soundEnabledRef\.current/);
});

test("un título nuevo intenta autoplay silenciado y conserva la preferencia para restaurarla al reproducir", () => {
  for (const direction of ["entrada", "siguiente", "anterior", "recarga"]) {
    const { player, calls } = controls();
    assert.equal(requestTrailerAutoplay(player, false), "muted", direction);
    assert.deepEqual(calls, ["mute", "play"], direction);
  }
  assert.match(playerSource, /onReady: \(\{ target \}\) => \{[\s\S]*?setApiReady\(true\)/);
  assert.match(playerSource, /if \(!userPausedRef\.current && !autoplayBlockedRef\.current\) attemptPlayback\(player, hasPlayedRef\.current && soundEnabledRef\.current\)/);
  assert.match(playerSource, /hasPlayedRef\.current = true;[\s\S]*?restorePreferredSoundAfterPlaying\(player\)/);
  assert.match(deckSource, /<DiscoverTrailerPlayer\s+key=\{itemKey\(shownTrailerItem\)\}/);
});

test("la restauración posterior a PLAYING se decide una sola vez y nunca cambia la preferencia", () => {
  assert.equal(shouldRestoreTrailerSound(true, false, true, true), true);
  assert.equal(shouldRestoreTrailerSound(false, false, true, true), false);
  assert.equal(shouldRestoreTrailerSound(true, true, true, true), false);
  assert.equal(shouldRestoreTrailerSound(true, false, false, true), false);
  assert.equal(shouldRestoreTrailerSound(true, false, true, false), false);
  const restore = playerSource.slice(playerSource.indexOf("function restorePreferredSoundAfterPlaying("), playerSource.indexOf("function confirmPlaybackStarted("));
  assert.match(restore, /postPlaySoundAttemptedRef\.current = true;[\s\S]*?player\.unMute\(\)/);
  assert.match(restore, /const actualMuted = player\.isMuted\(\)/);
  assert.match(restore, /playerRef\.current !== player \|\| !activeRef\.current/);
  assert.match(restore, /"post_play_unmute_requested"/);
  assert.match(restore, /"post_play_unmute_result"/);
  assert.match(restore, /"post_play_unmute_failed"/);
  assert.doesNotMatch(restore, /onSoundEnabledChange|loadVideoById|retryCount/);
  assert.match(playerSource, /postPlaySoundPendingRef\.current = false;[\s\S]*?"post_play_unmute_recovery"[\s\S]*?attemptPlayback\(playerRef\.current, false\)/);
  assert.match(playerSource, /"post_play_unmute_result", \{ preferredSound: soundEnabledRef\.current, muted: playerRef\.current\.isMuted\(\), playerState: data \}/);
});

test("preferencia silenciada inicia silenciada y bloqueos de audio no la sobrescriben", () => {
  const { player, calls } = controls();
  assert.equal(requestTrailerAutoplay(player, false), "muted");
  assert.deepEqual(calls, ["mute", "play"]);
  calls.length = 0;
  assert.equal(recoverBlockedTrailerAutoplay(player, "sound"), "muted");
  assert.deepEqual(calls, ["mute", "play"]);
  calls.length = 0;
  assert.equal(recoverBlockedTrailerAutoplay(player, "muted"), "blocked");
  assert.deepEqual(calls, []);
  assert.match(playerSource, /onAutoplayBlocked: \(\) => \{/);
  assert.match(playerSource, /logTrailerDiagnostic\(diagnosticPlayerId\.current, "muted_retry_requested"/);
  assert.doesNotMatch(playerSource, /onAutoplayBlocked:[\s\S]*?onError:[\s\S]*?onSoundEnabledChange\(false\)/);
});

test("un único iframe permanece al pausar temporalmente y se desmonta al cambiar de modo", () => {
  assert.match(playerSource, /const embedUrl = hasMounted \? availableUrl : null/);
  assert.match(playerSource, /if \(!active\) \{[\s\S]*?player\.pauseVideo\(\)/);
  assert.match(playerSource, /if \(playerRef\.current && iframe\.isConnected\) \{[\s\S]*?playerRef\.current\.pauseVideo\(\)/);
  assert.match(deckSource, /discoverMode === "trailers" && shownTrailerItem && !isTrailerEnd \? \(/);
  assert.match(deckSource, /active=\{canPlayTrailer\}/);
  assert.match(deckSource, /soundEnabled=\{trailerSoundEnabled\}/);
});

test("el autoplay silenciado no muestra avisos ni deja un bloque visual vacío", () => {
  assert.doesNotMatch(playerSource, /El navegador inició el video sin sonido|Tocá el control para activarlo|audioRestricted/);
  assert.match(playerSource, /className="discover-trailer__sound-toggle"/);
  assert.match(playerSource, /"sound_state_confirmed"|"post_play_unmute_result"/);
  assert.match(playerSource, /El video no se inició automáticamente\. Tocá Play para continuar\./);
});

test("Play y Pausa usan el mismo control SVG, con foco visible y sin cubrir el iframe", () => {
  assert.match(playerSource, /aria-label=\{playbackState === "playing" \? "Pausar tráiler" : "Reproducir tráiler"\}/);
  assert.match(playerSource, /<svg viewBox="0 0 24 24" aria-hidden="true">\{playbackState === "playing"/);
  assert.match(styles, /\.discover-trailer__playback \{[^}]*pointer-events: none;/);
  assert.match(styles, /\.discover-trailer__playback button \{[^}]*border: 1px solid var\(--accent\);[^}]*pointer-events: auto;/);
  assert.match(styles, /\.discover-trailer__playback button:focus-visible \{ outline: 2px solid #fff;/);
  assert.doesNotMatch(playerSource, /▶|Ⅱ|♪/);
});

test("el diagnóstico de autoplay es opt-in y distingue preparación, intento, bloqueo, inicio y error", () => {
  assert.match(playerSource, /localStorage\.getItem\("cinerian:trailer-diagnostics"\) !== "1"\) return/);
  for (const event of ["player_not_ready", "player_ready", "autoplay_requested", "autoplay_blocked", "playback_started", "playback_failed", "playback_timeout"]) {
    assert.match(playerSource, new RegExp(`logTrailerDiagnostic\\(diagnosticPlayerId\\.current, "${event}"`));
  }
  assert.match(playerSource, /"autoplay_blocked", \{ active: activeRef\.current, attempted: autoplayAttemptRef\.current, playerState, muted:/);
  assert.doesNotMatch(playerSource, /logTrailerDiagnostic\([^\n]*title|logTrailerDiagnostic\([^\n]*trailerUrl/);
});
