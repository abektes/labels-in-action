import "$/styles/style.scss";
import "@popperjs/core";
import "toastify-js/src/toastify.css";
import "bootstrap/js/dist/dropdown";
import "bootstrap/js/dist/collapse";
import { initNativeBleShim } from "$/capacitor/ble-shim";
import App from "$/App.svelte";
import { mount } from "svelte";
import { configureFabric } from "$/defaults";

configureFabric();

void (async () => {
  await initNativeBleShim();
  mount(App, {
    target: document.getElementById("app")!,
  });
})();
