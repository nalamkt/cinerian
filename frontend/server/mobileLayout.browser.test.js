import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";

const chromePath = process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function connectChrome() {
  const directory = mkdtempSync(join(tmpdir(), "cinerian-mobile-layout-"));
  const page = join(directory, "layout.html");
  writeFileSync(page, `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style><div id="root"></div>`);
  const process = spawn(chromePath, [
    "--headless", "--no-sandbox", "--disable-gpu", "--no-first-run",
    "--remote-debugging-port=0", `--user-data-dir=${directory}`, "about:blank"
  ], { stdio: "ignore" });
  let socket;
  try {
    let port;
    for (let attempt = 0; attempt < 80; attempt++) {
      const activePort = join(directory, "DevToolsActivePort");
      if (existsSync(activePort)) {
        port = Number(readFileSync(activePort, "utf8").split("\n")[0]);
        break;
      }
      await delay(100);
    }
    if (!port) throw new Error("Chrome no abrió el puerto de diagnóstico");
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const target = targets.find((item) => item.type === "page");
    if (!target) throw new Error("Chrome no creó una pestaña");
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    const pending = new Map();
    let nextId = 0;
    socket.addEventListener("message", ({ data }) => {
      const message = JSON.parse(data);
      const request = pending.get(message.id);
      if (!request) return;
      pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    });
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params }));
    });
    await send("Page.navigate", { url: pathToFileURL(page).href });
    for (let attempt = 0; attempt < 30; attempt++) {
      const result = await send("Runtime.evaluate", { expression: "document.readyState", returnByValue: true });
      if (result.result.value === "complete") break;
      await delay(50);
    }
    return { send, close: () => { socket.close(); process.kill(); rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); } };
  } catch (error) {
    socket?.close();
    process.kill();
    rmSync(directory, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    throw error;
  }
}

const chatMarkup = `<div class="app-shell app-shell--immersive" style="--inbox-visible-height:800px;--inbox-viewport-top:0px">
  <header class="app-topbar"><div class="app-topbar__navigation"><button class="app-topbar__brand">Cinerian</button></div><div class="app-topbar__actions"><button class="app-topbar__avatar">Perfil</button></div></header><div class="workspace-grid"><main class="workspace-content workspace-content--inbox"><div>
  <section class="feed-shell inbox-shell is-thread-open-mobile"><div class="feed-main inbox-main"><div class="inbox-category-tabs"></div>
  <div class="inbox-body is-mobile-thread-open"><div class="inbox-layout is-mobile"><div class="inbox-thread-column is-hidden-mobile"></div>
  <div class="inbox-thread-panel is-visible-mobile"><article class="inbox-thread-view">
  <div class="inbox-thread-view__summary"><div class="inbox-thread-view__header is-mobile"><button class="inbox-thread-view__back">Atrás</button><button class="inbox-thread-view__poster-button">Póster</button><div class="inbox-thread-view__header-copy"><button class="inbox-thread-view__title-button"><strong class="inbox-thread-view__title">Título recomendado</strong></button></div></div></div>
  <div class="inbox-thread-view__messages">${"<p>Mensaje de prueba</p>".repeat(60)}</div>
  <div class="inbox-thread-view__composer"><div class="inbox-thread-view__composer-row"><input aria-label="Respuesta"><button>Enviar</button></div></div>
  </article></div></div></div></div></section></div></main></div></div>`;

const watchlistMarkup = `<div class="app-shell app-shell--immersive"><header class="app-topbar"><div class="app-topbar__navigation"><button class="app-topbar__brand">Cinerian</button></div><div class="app-topbar__actions"><div class="app-topbar__search-slot is-open"><div class="app-topbar__search-popover"><input type="search" aria-label="Buscar"></div></div></div></header><div class="workspace-grid"><main class="workspace-content"><section class="panel profile-panel profile-panel--watchlist"><div class="profile-tabs profile-tabs--watchlist-mobile"><div class="watchlist-mobile-header"><div class="watchlist-mobile-header__row"><div class="watchlist-mobile-header__title"><h2>Watchlist</h2></div><button class="watchlist-filter-button">Filtrar</button></div></div><div class="profile-grid profile-grid--library"><article class="title-card">Película</article><article class="title-card">Serie</article></div></div></section></main></div></div>`;

test("el hilo mantiene cabecera y compositor visibles mientras solo se desplazan mensajes", { skip: !existsSync(chromePath) }, async () => {
  const browser = await connectChrome();
  try {
    for (const width of [320, 375, 390, 430]) {
      await browser.send("Emulation.setDeviceMetricsOverride", { width, height: 800, screenWidth: width, screenHeight: 800, deviceScaleFactor: 1, mobile: true });
      const result = await browser.send("Runtime.evaluate", {
        expression: `(() => { document.body.className = 'inbox-mobile-thread-open'; document.querySelector('#root').innerHTML = ${JSON.stringify(chatMarkup)}; const appHeader = document.querySelector('.app-topbar'); const header = document.querySelector('.inbox-thread-view__summary'); const title = document.querySelector('.inbox-thread-view__title-button'); const messages = document.querySelector('.inbox-thread-view__messages'); const composer = document.querySelector('.inbox-thread-view__composer'); const before = header.getBoundingClientRect().top; messages.scrollTop = messages.scrollHeight; return { viewport: innerWidth, appHeaderBottom: appHeader.getBoundingClientRect().bottom, appHeaderVisible: getComputedStyle(appHeader).display !== 'none', top: before, after: header.getBoundingClientRect().top, headerBottom: header.getBoundingClientRect().bottom, titleTop: title.getBoundingClientRect().top, titleBottom: title.getBoundingClientRect().bottom, composerBottom: composer.getBoundingClientRect().bottom, messagesScrollable: messages.scrollHeight > messages.clientHeight, pageScroll: document.documentElement.scrollWidth > innerWidth }; })()`,
        returnByValue: true
      });
      const measured = result.result.value;
      assert.equal(measured.viewport, width);
      assert.equal(measured.appHeaderVisible, true, `${width}px: la barra superior está oculta`);
      assert.ok(measured.top >= measured.appHeaderBottom && measured.headerBottom < 800, `${width}px: cabecera superpuesta a la barra: ${JSON.stringify(measured)}`);
      assert.ok(measured.titleTop >= measured.top && measured.titleBottom <= measured.headerBottom, `${width}px: título o acceso a ficha recortado`);
      assert.equal(measured.after, measured.top, `${width}px: se desplazó el panel completo`);
      assert.ok(measured.composerBottom <= 800, `${width}px: compositor fuera del viewport: ${JSON.stringify(measured)}`);
      assert.equal(measured.messagesScrollable, true, `${width}px: los mensajes no tienen scroll interno`);
      assert.equal(measured.pageScroll, false, `${width}px: hay desborde horizontal`);

      await browser.send("Emulation.setDeviceMetricsOverride", { width, height: 500, screenWidth: width, screenHeight: 800, deviceScaleFactor: 1, mobile: true });
      const keyboard = await browser.send("Runtime.evaluate", {
        expression: "(() => { document.querySelector('.app-shell--immersive').style.setProperty('--inbox-visible-height', '500px'); document.querySelector('.inbox-thread-view__composer input').focus(); return { appHeaderBottom: document.querySelector('.app-topbar').getBoundingClientRect().bottom, headerTop: document.querySelector('.inbox-thread-view__summary').getBoundingClientRect().top, composerBottom: document.querySelector('.inbox-thread-view__composer').getBoundingClientRect().bottom, messagesScrollable: document.querySelector('.inbox-thread-view__messages').scrollHeight > document.querySelector('.inbox-thread-view__messages').clientHeight }; })()",
        returnByValue: true
      });
      assert.ok(keyboard.result.value.headerTop >= keyboard.result.value.appHeaderBottom, `${width}px: teclado recortó la cabecera`);
      assert.ok(keyboard.result.value.composerBottom <= 500, `${width}px: teclado tapó el compositor: ${JSON.stringify(keyboard.result.value)}`);
      assert.equal(keyboard.result.value.messagesScrollable, true);

      await browser.send("Emulation.setDeviceMetricsOverride", { width, height: 800, screenWidth: width, screenHeight: 800, deviceScaleFactor: 1, mobile: true });
      const returnToThread = await browser.send("Runtime.evaluate", {
        expression: "(() => { document.querySelector('.app-shell--immersive').style.setProperty('--inbox-visible-height', '800px'); document.querySelector('.inbox-thread-view__title').textContent = 'Otra película recomendada'; const title = document.querySelector('.inbox-thread-view__title-button').getBoundingClientRect(); return { titleTop: title.top, titleBottom: title.bottom, appHeaderBottom: document.querySelector('.app-topbar').getBoundingClientRect().bottom }; })()",
        returnByValue: true
      });
      assert.ok(returnToThread.result.value.titleTop >= returnToThread.result.value.appHeaderBottom, `${width}px: otra conversación se superpone con la barra`);
      assert.ok(returnToThread.result.value.titleBottom < 800);

      const shiftedViewport = await browser.send("Runtime.evaluate", {
        expression: "(() => { const shell = document.querySelector('.app-shell--immersive'); shell.style.setProperty('--inbox-viewport-top', '80px'); shell.style.setProperty('--inbox-visible-height', '500px'); const appHeader = document.querySelector('.app-topbar').getBoundingClientRect(); const summary = document.querySelector('.inbox-thread-view__summary').getBoundingClientRect(); const composer = document.querySelector('.inbox-thread-view__composer').getBoundingClientRect(); return { appHeaderTop: appHeader.top, appHeaderBottom: appHeader.bottom, summaryTop: summary.top, composerBottom: composer.bottom }; })()",
        returnByValue: true
      });
      assert.ok(shiftedViewport.result.value.appHeaderTop >= 80, `${width}px: barra fuera del viewport desplazado`);
      assert.ok(shiftedViewport.result.value.summaryTop >= shiftedViewport.result.value.appHeaderBottom, `${width}px: hilo invade la barra con visualViewport desplazado`);
      assert.ok(shiftedViewport.result.value.composerBottom <= 580, `${width}px: compositor fuera del viewport desplazado`);
    }
  } finally { browser.close(); }
});

test("el buscador global mobile no dispara el umbral de autozoom ni ensancha Watchlist", { skip: !existsSync(chromePath) }, async () => {
  const browser = await connectChrome();
  try {
    for (const width of [320, 375, 390, 430]) {
      await browser.send("Emulation.setDeviceMetricsOverride", { width, height: 800, screenWidth: width, screenHeight: 800, deviceScaleFactor: 1, mobile: true });
      const result = await browser.send("Runtime.evaluate", {
        expression: `(() => { document.body.className = ''; document.querySelector('#root').innerHTML = ${JSON.stringify(watchlistMarkup)}; const input = document.querySelector('.app-topbar__search-popover input'); input.focus(); const panel = document.querySelector('.profile-panel--watchlist').getBoundingClientRect(); return { viewport: innerWidth, fontSize: parseFloat(getComputedStyle(input).fontSize), panelWidth: panel.width, pageWidth: document.documentElement.scrollWidth }; })()`,
        returnByValue: true
      });
      const measured = result.result.value;
      assert.equal(measured.viewport, width);
      assert.ok(measured.fontSize >= 16, `${width}px: buscador de ${measured.fontSize}px`);
      assert.ok(measured.panelWidth <= width, `${width}px: Watchlist ensanchó el viewport`);
      assert.ok(measured.pageWidth <= width, `${width}px: desborde horizontal de Watchlist`);
    }
  } finally { browser.close(); }
});

const hybridMarkup = (variant) => `<section class="discover discover--trailers" style="height:800px">
  <div class="discover-filterbar"><span class="discover-circle-badge">En tu círculo</span><button class="discover-filterbar__button">Filtros</button></div>
  <article class="discover-trailer"><div class="discover-trailer__stage"><div class="discover-trailer__current">
    <div class="discover-trailer__media${variant === "video" ? "" : " is-poster"}"><div class="discover-trailer__frame">${variant === "video" ? '<iframe title="Tráiler"></iframe>' : variant === "backdrop" ? '<img class="discover-trailer__backdrop" alt="Imagen horizontal">' : variant === "poster" ? '<img class="discover-trailer__poster-fallback" alt="Póster">' : '<div class="discover-trailer__missing-image">Título sin imagen</div>'}</div></div>
    <div class="discover-trailer__info"><div class="discover-title-row"><h2 class="discover-title">Cafarnaúm: La ciudad olvidada</h2><p class="discover-kind">Película</p><h2 class="discover-title discover-trailer__title-mobile">Cafarnaúm: La ciudad <span class="discover-trailer__title-tail">olvidada&nbsp;<span class="discover-kind">Película</span></span></h2></div>
      <div class="discover-circle">A una persona le gustó</div><p class="discover-facts">2024 · Drama · 2h 10min · <span class="discover-trailer__score">TMDB 8.2</span></p>
      <div class="discover-watch">Ver en: Netflix</div><div class="discover-overview"><p class="discover-overview__text--clamped">Una sinopsis de la película.</p></div><button class="discover-synopsis-button">Sinopsis</button>
    </div></div></div><div class="discover-trailer__bottom"><div class="discover-actions"><button>No me interesa</button><button>Ya la vi</button><button>Guardar</button></div></div>
  </article></section>`;

test("el feed híbrido conserva proporción, jerarquía y acciones con video o imagen de respaldo", { skip: !existsSync(chromePath) }, async () => {
  const browser = await connectChrome();
  try {
    for (const width of [320, 375, 390, 430, 1024, 1280, 1440, 1920]) {
      await browser.send("Emulation.setDeviceMetricsOverride", { width, height: 800, screenWidth: width, screenHeight: 800, deviceScaleFactor: 1, mobile: width < 901 });
      for (const variant of ["video", "backdrop", "poster", "missing"]) {
        const result = await browser.send("Runtime.evaluate", {
          expression: `(() => { document.querySelector('#root').innerHTML = ${JSON.stringify(hybridMarkup(variant))}; const rect = (selector) => { const r = document.querySelector(selector).getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height }; }; const media = document.querySelector('.discover-trailer__frame'); const image = media.querySelector('iframe, img, .discover-trailer__missing-image'); return { viewport: innerWidth, pageWidth: document.documentElement.scrollWidth, media: rect('.discover-trailer__frame'), circleBadge: rect('.discover-filterbar .discover-circle-badge'), filterButton: rect('.discover-filterbar__button'), bar: rect('.discover-filterbar'), badge: rect(innerWidth <= 680 ? '.discover-trailer__title-mobile .discover-kind' : '.discover-title-row > .discover-kind'), title: rect(innerWidth <= 680 ? '.discover-trailer__title-mobile' : '.discover-title-row > .discover-title'), score: rect('.discover-trailer__score'), social: rect('.discover-circle'), facts: rect('.discover-facts'), watch: rect('.discover-watch'), overview: rect('.discover-overview'), synopsisButton: rect('.discover-synopsis-button'), synopsis: rect(innerWidth <= 900 ? '.discover-synopsis-button' : '.discover-overview'), actions: rect('.discover-trailer__bottom'), image: rect('.discover-trailer__frame iframe, .discover-trailer__frame img, .discover-trailer__missing-image'), fit: image instanceof HTMLImageElement ? getComputedStyle(image).objectFit : null, floatingScore: Boolean(document.querySelector('.discover-trailer__score-overlay')) }; })()`,
          returnByValue: true
        });
        const m = result.result.value;
        assert.equal(m.viewport, width);
        assert.ok(m.pageWidth <= width, `${width}px: desborde horizontal ${JSON.stringify(m)}`);
        assert.ok(m.circleBadge.left >= m.bar.left && m.circleBadge.right < m.filterButton.left, `${width}px: badge no queda a la izquierda`);
        assert.ok(m.circleBadge.top < m.filterButton.bottom && m.filterButton.top < m.circleBadge.bottom, `${width}px: badge y filtros no comparten fila`);
        assert.ok(m.media.width > 0 && m.image.width > 0, `${width}px/${variant}: medio vacío`);
        assert.ok(Math.abs(m.media.width / m.media.height - 16 / 9) < 0.03, `${width}px/${variant}: medio no es 16:9`);
        assert.equal(m.floatingScore, false, `${width}px/${variant}: puntuación sobre el medio`);
        assert.ok(m.score.top >= m.facts.top && m.score.bottom <= m.facts.bottom + 1, `${width}px/${variant}: puntuación fuera de los metadatos`);
        if (variant === "backdrop") assert.equal(m.fit, "cover");
        if (variant === "poster") assert.equal(m.fit, "contain");
        assert.ok(m.badge.right <= width && m.badge.top >= m.title.top, `${width}px: badge fuera del título`);
        if (width <= 680) assert.ok(m.badge.bottom <= m.title.bottom + 3, `${width}px: badge separado de la última palabra`);
        assert.ok(m.social.top >= m.title.top && m.facts.top >= m.social.top && m.watch.top >= m.facts.top && m.synopsis.top >= m.watch.top, `${width}px: bloques fuera de orden`);
        // Mobile: la sinopsis es un botón que abre una hoja; desktop muestra el texto como siempre.
        if (width < 901) assert.ok(m.overview.height === 0 && m.synopsisButton.height > 0, `${width}px: en mobile debe verse el botón Sinopsis y no el texto`);
        else assert.ok(m.overview.height > 0 && m.synopsisButton.height === 0, `${width}px: en desktop debe verse el texto y no el botón`);
        assert.ok(m.actions.left >= 0 && m.actions.right <= width, `${width}px: acciones fuera del viewport`);
        if (width < 901) assert.ok(m.synopsis.bottom <= m.actions.top && m.actions.bottom <= 800, `${width}px: información o acciones recortadas`);
      }
    }
  } finally { browser.close(); }
});

const desktopHeaderMarkup = (open) => `<div class="app-shell app-shell--immersive${open ? " app-shell--search" : ""}"><header class="app-topbar">
  <div class="app-topbar__navigation"><button class="app-topbar__brand">CINERIAN</button><nav class="dock"><div class="dock__items"><div class="dock__nav">
    <button class="dock__button is-active"><span class="dock__icon"></span><span class="dock__label">Descubrí</span></button>
    <button class="dock__button"><span class="dock__icon"></span><span class="dock__label">En común</span></button>
    <button class="dock__button"><span class="dock__icon"></span><span class="dock__label">Viendo</span></button>
    <button class="dock__button watchlist-tab"><span class="dock__icon"></span><span class="dock__label">Watchlist</span></button>
  </div></div></nav></div>
  <div class="app-topbar__actions">
    <div class="app-topbar__search-slot" id="app-topbar-search-slot">${open ? '<div class="app-topbar-search"><div class="input-stack search-panel__input search-panel__input--glass"><svg class="search-panel__input-icon"></svg><input type="search" aria-label="Buscar"></div><button class="app-topbar-search__close">Cerrar</button></div>' : ""}</div>
    <button class="app-topbar__search-trigger">Buscar</button>
    <div class="app-activity-anchor"><button class="app-notifications-button">Actividad</button></div>
    <button class="app-topbar__avatar">P</button>
  </div>
</header></div>`;

test("en desktop el buscador abierto ocupa el header, entre Watchlist y las notificaciones", { skip: !existsSync(chromePath) }, async () => {
  const browser = await connectChrome();
  try {
    for (const width of [1024, 1280, 1440, 1920]) {
      await browser.send("Emulation.setDeviceMetricsOverride", { width, height: 900, screenWidth: width, screenHeight: 900, deviceScaleFactor: 1, mobile: false });
      const measure = async (open) => (await browser.send("Runtime.evaluate", {
        expression: `(() => { document.querySelector('#root').innerHTML = ${JSON.stringify(desktopHeaderMarkup(open))}; document.querySelectorAll('.app-topbar-search').forEach((node) => { node.style.animation = 'none'; }); const rect = (selector) => { const node = document.querySelector(selector); if (!node) return null; const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, height: r.height, width: r.width }; }; return { header: rect('.app-topbar'), watchlist: rect('.watchlist-tab'), search: rect('.app-topbar-search'), input: rect('.app-topbar-search input'), bell: rect('.app-notifications-button'), trigger: rect('.app-topbar__search-trigger'), pageWidth: document.documentElement.scrollWidth }; })()`,
        returnByValue: true
      })).result.value;
      const closed = await measure(false);
      const open = await measure(true);
      assert.ok(open.search.left >= open.watchlist.right + 12, `${width}px: el buscador pisa la navegación ${JSON.stringify(open)}`);
      assert.ok(open.search.right <= open.bell.left, `${width}px: el buscador pisa las notificaciones`);
      assert.ok(open.input.width >= 200, `${width}px: el campo quedó demasiado angosto (${open.input.width}px)`);
      assert.ok(open.input.top >= open.header.top && open.input.bottom <= open.header.bottom, `${width}px: el campo sale del header`);
      assert.ok(Math.abs(open.header.height - closed.header.height) <= 1, `${width}px: abrir el buscador cambió el alto del header`);
      if (width >= 1280) assert.ok(open.search.left - open.watchlist.right <= 200, `${width}px: queda demasiado espacio vacío antes del buscador`);
      assert.equal(open.trigger.width, 0, `${width}px: la lupa sigue visible con el buscador abierto`);
      assert.ok(open.pageWidth <= width, `${width}px: desborde horizontal`);
    }
  } finally { browser.close(); }
});
