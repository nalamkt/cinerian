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
