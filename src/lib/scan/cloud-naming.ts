/**
 * Object naming through the user's own OpenRouter key.
 *
 * The key never reaches this file. It lives in the app-local CloudNaming
 * plugin (android/app/src/main/java/nl/abektes/fichero/cloudnaming), encrypted
 * under an Android Keystore key, and the plugin makes the HTTP call itself.
 * All this side can do is store a key, forget it, learn whether one is stored,
 * and hand over a request body. See the spec in docs/superpowers/specs for why
 * that line is drawn where it is.
 *
 * Unlike Nano, this sends the photo off the phone, so it is only in a scan once
 * the user has pasted a key: that paste is the opt-in.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";
import { get, writable, type Readable } from "svelte/store";

import { appConfig } from "$/stores";

import {
  DEFAULT_CLOUD_MODEL,
  buildNamingRequest,
  describeCloudError,
  extractMessageText,
  parseCloudReply,
} from "./cloud-naming-core";
import type { LabelSuggestion, ScanInput, SuggestionProvider } from "./types";

interface KeyStatus {
  configured: boolean;
  /** "sk-or-…a1b2": enough to recognise the key, not to use it. */
  hint?: string;
}

interface HttpResult {
  status: number;
  body: string;
}

interface CloudNamingPlugin {
  setKey(options: { key: string }): Promise<KeyStatus>;
  clearKey(): Promise<void>;
  keyStatus(): Promise<KeyStatus>;
  checkKey(): Promise<HttpResult>;
  complete(options: { body: string }): Promise<HttpResult>;
}

const CloudNaming = registerPlugin<CloudNamingPlugin>("CloudNaming");

/** The only platform with the plugin. Web and iOS never offer cloud naming. */
const supported = (): boolean => Capacitor.getPlatform() === "android";

const keyStatusStore = writable<KeyStatus>({ configured: false });

/** Whether a key is stored. Refreshed on load and after every change. */
export const cloudKeyStatus: Readable<KeyStatus> = { subscribe: keyStatusStore.subscribe };

export async function refreshCloudKeyStatus(): Promise<void> {
  if (!supported()) {
    return;
  }
  try {
    keyStatusStore.set(await CloudNaming.keyStatus());
  } catch (err) {
    // An APK built before the plugin existed rejects here. That is "no key".
    console.warn("[fichero] Cloud key status check failed", err);
    keyStatusStore.set({ configured: false });
  }
}

void refreshCloudKeyStatus();

export interface KeyCheck {
  ok: boolean;
  message: string;
}

/**
 * A human-readable sentence about a status/body pair from OpenRouter, raw
 * details kept for the debug panel via the thrown error's `cause`.
 */
class CloudError extends Error {
  constructor(status: number | undefined, raw: string) {
    super(describeCloudError(status, raw), { cause: { status, raw } });
    this.name = "CloudNamingError";
  }
}

function errorMessageFrom(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: unknown } };
    if (parsed.error?.message !== undefined) {
      return String(parsed.error.message);
    }
  } catch {
    // Not JSON: an HTML error page from a proxy, most likely. Keep it short.
  }
  return body.slice(0, 200);
}

async function call(fn: () => Promise<HttpResult>): Promise<string> {
  let result: HttpResult;
  try {
    result = await fn();
  } catch (err) {
    // Transport failure: offline, timeout, TLS. The plugin rejects these and
    // only these, so there is no status to word.
    throw new CloudError(undefined, err instanceof Error ? err.message : String(err));
  }
  if (result.status < 200 || result.status >= 300) {
    throw new CloudError(result.status, errorMessageFrom(result.body));
  }
  return result.body;
}

const dollars = (n: number): string => `$${n.toFixed(2)}`;

/** "Key works · $0.02 of $5.00 used", or why it doesn't. */
export async function checkCloudKey(): Promise<KeyCheck> {
  try {
    const body = await call(() => CloudNaming.checkKey());
    const data = (JSON.parse(body) as { data?: { usage?: unknown; limit?: unknown } }).data ?? {};
    const usage = typeof data.usage === "number" ? data.usage : undefined;
    const limit = typeof data.limit === "number" ? data.limit : undefined;

    if (usage !== undefined && limit !== undefined) {
      return { ok: true, message: `Key works · ${dollars(usage)} of ${dollars(limit)} used` };
    }
    if (usage !== undefined) {
      return {
        ok: true,
        message: `Key works · ${dollars(usage)} used, no credit limit set on this key`,
      };
    }
    return { ok: true, message: "Key works" };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/** Stores the key, then tests it. A key that fails the test stays stored: it may be a blip. */
export async function saveCloudKey(key: string): Promise<KeyCheck> {
  try {
    keyStatusStore.set(await CloudNaming.setKey({ key }));
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
  return checkCloudKey();
}

export async function removeCloudKey(): Promise<void> {
  await CloudNaming.clearKey();
  await refreshCloudKeyStatus();
}

/**
 * Longest edge sent to the model. Naming an object does not need a 12MP
 * photo, and every pixel is paid for twice: upload time and image tokens.
 */
const MAX_EDGE = 768;

/**
 * The file is served back to the WebView from its own origin, so the canvas
 * is not tainted and toDataURL works.
 */
async function downscaledDataUrl(path: string): Promise<string> {
  const img = new Image();
  img.decoding = "async";
  img.src = Capacitor.convertFileSrc(path);
  await img.decode();

  const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));

  const ctx = canvas.getContext("2d");
  if (ctx === null) {
    throw new Error("Couldn't prepare the photo for upload.");
  }
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.8);
}

/** Fun chips first when there are any: they are why the user flipped the switch. */
export async function nameWithCloud(path: string, fun: boolean): Promise<LabelSuggestion[]> {
  const model = get(appConfig).cloudModel?.trim() || DEFAULT_CLOUD_MODEL;
  const imageDataUrl = await downscaledDataUrl(path);
  const body = JSON.stringify(buildNamingRequest({ model, imageDataUrl, fun }));

  const raw = await call(() => CloudNaming.complete({ body }));

  let response: unknown;
  try {
    response = JSON.parse(raw);
  } catch {
    throw new CloudError(200, "OpenRouter sent back something that isn't JSON.");
  }

  const names = parseCloudReply(extractMessageText(response), fun);

  return [
    ...names.fun.map((text) => ({ text, source: "ai" as const, fun: true })),
    ...names.plain.map((text) => ({ text, source: "ai" as const })),
  ];
}

export const cloudNamingProvider: SuggestionProvider = {
  id: "cloud-naming",
  label: "AI names (OpenRouter)",
  sendsImageOffDevice: true,

  async isAvailable(): Promise<boolean> {
    if (!supported()) {
      return false;
    }
    await refreshCloudKeyStatus();
    return get(keyStatusStore).configured;
  },

  async suggest({ path }: ScanInput): Promise<LabelSuggestion[]> {
    return nameWithCloud(path, get(appConfig).funNames ?? false);
  },
};
