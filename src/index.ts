import "$/styles/style.scss";
import "@popperjs/core";
import "toastify-js/src/toastify.css";
import "bootstrap/js/dist/dropdown";
import "bootstrap/js/dist/collapse";
import { initNativeBleShim } from "$/capacitor/ble-shim";
import App from "$/App.svelte";
import { mount } from "svelte";
import { configureFabric } from "$/defaults";
import { Capacitor } from "@capacitor/core";

configureFabric();

/**
 * Register the service worker in a browser only. Inside the Capacitor WebView
 * the app is already served from local assets, so a service worker would add
 * nothing but a second cache to go stale against the installed APK.
 */
async function registerServiceWorker(): Promise<void> {
  if (Capacitor.isNativePlatform() || !("serviceWorker" in navigator)) {
    return;
  }

  try {
    const { registerSW } = await import("virtual:pwa-register");
    registerSW({ immediate: true });
  } catch (err) {
    // An unavailable service worker must never stop the app starting.
    console.warn("[fichero] Service worker registration skipped", err);
  }
}

void (async () => {
  await initNativeBleShim();
  mount(App, {
    target: document.getElementById("app")!,
  });
  void registerServiceWorker();
})();
