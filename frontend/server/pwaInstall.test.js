import assert from "node:assert/strict";
import test from "node:test";
import {
  getPwaInstallState,
  initializePwaInstall,
  promptPwaInstall,
  subscribePwaInstall
} from "../src/lib/pwaInstall.ts";

test("ofrece instalación solo con beforeinstallprompt y respeta cancelación y appinstalled", async () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const window = new EventTarget();
  let standalone = false;
  let onDisplayModeChange = null;
  window.matchMedia = () => ({
    get matches() { return standalone; },
    addEventListener(_type, listener) { onDisplayModeChange = listener; }
  });
  globalThis.window = window;
  globalThis.document = { referrer: "" };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { standalone: false }
  });

  try {
    initializePwaInstall();
    assert.equal(getPwaInstallState().promptAvailable, false);
    assert.equal(await promptPwaInstall(), "unavailable");

    let promptCount = 0;
    const offer = (outcome) => {
      const event = new Event("beforeinstallprompt", { cancelable: true });
      event.prompt = async () => { promptCount += 1; };
      event.userChoice = Promise.resolve({ outcome });
      window.dispatchEvent(event);
      assert.equal(event.defaultPrevented, true);
    };
    let updates = 0;
    const unsubscribe = subscribePwaInstall(() => { updates += 1; });
    offer("dismissed");
    assert.equal(getPwaInstallState().promptAvailable, true);
    assert.equal(await promptPwaInstall(), "dismissed");
    assert.equal(getPwaInstallState().promptAvailable, false);
    assert.equal(promptCount, 1);

    offer("accepted");
    assert.equal(await promptPwaInstall(), "accepted");
    assert.equal(getPwaInstallState().runningAsApp, false);
    window.dispatchEvent(new Event("appinstalled"));
    assert.equal(getPwaInstallState().installedThisSession, true);
    assert.equal(getPwaInstallState().promptAvailable, false);
    assert.equal(await promptPwaInstall(), "unavailable");
    assert.equal(promptCount, 2);
    assert.ok(updates > 0);
    unsubscribe();

    standalone = true;
    onDisplayModeChange();
    assert.equal(getPwaInstallState().runningAsApp, true);
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator);
    else delete globalThis.navigator;
  }
});
