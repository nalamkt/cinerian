import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const panel = readFileSync(new URL("../src/components/RecommendationPanel.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");

test("círculo y filtros comparten la barra sin selector de plataformas", () => {
  const bar = panel.indexOf('<div className="discover-filterbar">');
  const circle = panel.indexOf('className="discover-circle-badge"', bar);
  const filter = panel.indexOf('className={`discover-filterbar__button', circle);
  const barEnd = panel.indexOf("</div>", filter);

  assert.ok(bar >= 0 && circle > bar && filter > circle && barEnd > filter);
  assert.doesNotMatch(panel, /<DiscoverModeSwitch/);
  assert.match(styles, /\.discover \.discover-filterbar,\s*\.discover:not\(\.is-filtered\) \.discover-filterbar\s*\{\s*display: grid;/);
  assert.match(styles, /grid-template-columns: minmax\(0, 1fr\) auto;/);
  assert.doesNotMatch(panel.slice(bar, barEnd), /discover-provider-summary|discover-filterbar__chips/);
  assert.match(styles, /\.discover-circle-badge\s*\{[^}]*grid-column: 1;[^}]*justify-self: start;/);
  assert.match(styles, /\.discover \.discover-filterbar__button,[\s\S]*?grid-column: 2;/);
  assert.doesNotMatch(styles, /\.discover:not\(\.is-filtered\) \.discover-filterbar\s*\{\s*display: contents;/);
  assert.doesNotMatch(panel, /discover-circle-select|setCircleChoice/);
  assert.match(styles, /\.discover-circle-badge\s*\{[^}]*background: #291e13;/);
  assert.match(styles, /\.discover-circle-badge__dot\s*\{[^}]*background: var\(--accent\);/);
});

test("el dock móvil no queda anclado al blur de la cabecera", () => {
  assert.match(styles, /@media \(max-width: 900px\)\s*\{\s*\/\* El blur del header[\s\S]*?\.app-topbar\s*\{\s*backdrop-filter: none;\s*-webkit-backdrop-filter: none;/);
  assert.match(styles, /\.app-topbar \.dock\s*\{ bottom: 0; padding: 0; \}/);
});

test("desktop conserva dos columnas, badge y acciones a la derecha", () => {
  const desktop = styles.match(/\/\* El trailer aprovecha[\s\S]*?@media \(min-width: 901px\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(desktop, /display: grid;/);
  assert.match(desktop, /grid-template-columns: minmax\(0, 1\.08fr\) minmax\(0, 0\.92fr\);/);
  assert.match(desktop, /\.discover-trailer__stage,\s*\.discover-trailer__current \{ display: contents; \}/);
  assert.match(desktop, /\.discover-trailer__media,[\s\S]*?grid-column: 1;[\s\S]*?align-self: start;/);
  assert.match(desktop, /\.discover-trailer__info \{ grid-column: 2; grid-row: 1;[^}]*align-self: start;/);
  assert.match(desktop, /\.discover-trailer__bottom \{ grid-column: 2; grid-row: 2;/);
  assert.doesNotMatch(desktop, /\.discover \.discover-filterbar \.discover-circle-badge \{ display: none;/);
  const info = panel.slice(panel.indexOf('className="discover-trailer__info"'), panel.indexOf('className="discover-trailer__bottom"'));
  assert.doesNotMatch(info, /DiscoverCircleRank[^>]+className="discover-trailer__circle"/);
});

test("tráilers desktop comparte la jerarquía informativa de Tarjetas", () => {
  const trailer = panel.slice(panel.indexOf('className="discover-trailer__info"'), panel.indexOf('className="discover-trailer__bottom"'));
  const order = [
    'className="discover-title-row"',
    'className="discover-title"',
    'className="discover-kind"',
    '<DiscoverSocialLine line={trailerSocialLine}',
    'className="discover-facts"',
    '<DiscoverWatchOptions options={shownTrailerWatchOptions}',
    '<DiscoverOverview key={itemKey(shownTrailerItem)}'
  ].map((fragment) => trailer.indexOf(fragment));
  assert.ok(order.every((position) => position >= 0));
  assert.ok(order.every((position, index) => index === 0 || position > order[index - 1]));
  assert.match(trailer, /shownTrailerItem\.score \? <span className="discover-trailer__score">/);
  assert.match(panel, /shownTrailerDetails\?\.runtimeLabel,[\s\S]*?shownTrailerSeasonCount \? `\$\{shownTrailerSeasonCount\} temporada/);
  assert.match(trailer, /\{shownTrailerFacts\}/);
  assert.doesNotMatch(styles, /\.discover-trailer__info \.discover-overview \{ order: 2; \}/);
  assert.doesNotMatch(styles, /\.discover-trailer__score-overlay\s*\{/);
  assert.match(panel, /<DiscoverSocialLine line=\{socialLine\} onOpenUserProfile=\{onOpenUserProfile\}/);
});

test("el círculo se muestra en la barra en mobile y desktop", () => {
  assert.match(panel, /<span\s+className="discover-circle-badge"/);
  assert.doesNotMatch(panel, /className="discover-trailer__circle"/);
  assert.doesNotMatch(styles, /\.discover \.discover-filterbar \.discover-circle-badge \{ display: none; \}/);
  assert.match(styles, /@media \(max-width: 900px\)[\s\S]*?\.discover-circle-badge \{ grid-column: 1; grid-row: 1;/);
});

test("tráilers desktop muestra sinopsis completa y controles compactos sin ayudas táctiles", () => {
  const desktop = styles.match(/\/\* El trailer aprovecha[\s\S]*?@media \(min-width: 901px\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
  assert.match(desktop, /\.discover-trailer__info \.discover-overview \{ height: auto; overflow: visible; \}/);
  assert.match(desktop, /\.discover-trailer__info \.discover-overview p,[\s\S]*?overflow: visible;[\s\S]*?-webkit-line-clamp: unset;/);
  assert.match(desktop, /\.discover-trailer__info \.discover-overview__more,[\s\S]*?\.discover-trailer__navigation,[\s\S]*?\.discover-swipe-hint \{ display: none; \}/);
  assert.match(styles, /\.discover-trailer__playback \{ position: absolute;[^}]*pointer-events: none;/);
  assert.match(styles, /\.discover-trailer__playback button \{\s*display: grid;[^}]*pointer-events: auto;/);
});

test("Watchlist compacta y En común usan la superficie compartida", () => {
  assert.match(styles, /\.workspace-content \.profile-panel \{[^}]*background: none;/);
  assert.match(styles, /\.profile-panel--watchlist \.profile-grid--library \{\s*grid-template-columns: repeat\(6, minmax\(0, 1fr\)\);/);
  assert.match(styles, /\.profile-panel--watchlist \.title-card__poster \{ object-fit: contain; \}/);
  const mutual = styles.match(/\.mutual-discovery \{([^}]*)\}/)?.[1] ?? "";
  assert.match(mutual, /background: rgba\(/);
  assert.doesNotMatch(mutual, /linear-gradient|radial-gradient/);
});

test("header desktop cubre el viewport sin alterar el dock mobile", () => {
  const shell = styles.match(/\.app-shell--immersive \{([^}]*)\}/)?.[1] ?? "";
  assert.match(shell, /width: 100%;/);
  assert.match(shell, /max-width: none;/);
  assert.match(shell, /margin: 0;/);
  assert.match(styles, /\.app-topbar \{\s*position: sticky;[\s\S]*?flex-wrap: nowrap;/);
  assert.match(styles, /@media \(max-width: 900px\)[\s\S]*?\.app-topbar \.dock\s*\{\s*position: fixed;/);
});
