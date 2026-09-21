/**
 * Capture a photo and turn it into label suggestions.
 *
 * Providers run concurrently and independently: a barcode model that is still
 * downloading must not take the OCR results down with it, so a rejected
 * provider contributes nothing rather than failing the whole scan.
 *
 * What it must NOT do is swallow the reason. An empty suggestion list means
 * either "the photo has nothing on it", "the model blew up" or "this build has
 * no scanner at all", and the three want three different answers from the UI.
 * So the outcome carries the failures and the skipped providers alongside the
 * results, and the last raw fault per provider is kept for the debug panel.
 */
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

import { objectNamingProvider } from "./gemini-nano";
import { onDeviceProviders } from "./mlkit";
import type { LabelSuggestion, ScanInput, SuggestionProvider } from "./types";

export type { LabelSuggestion, ScanInput, SuggestionProvider } from "./types";
export { onDeviceProviders } from "./mlkit";
export {
  checkObjectNamingStatus,
  downloadObjectNaming,
  objectNamingProvider,
  type ObjectNamingStatus,
} from "./gemini-nano";

/**
 * Every provider this build knows about, in chip order: codes, then printed
 * text, then the model's guess at what the thing is.
 *
 * Not the default for collectSuggestions — that stays onDeviceProviders, which
 * runs everywhere and needs no opt-in. Object naming is only in a scan once the
 * tray has seen an AVAILABLE feature status, so the caller assembles the list
 * rather than the scan discovering it.
 */
export const allProviders: SuggestionProvider[] = [...onDeviceProviders, objectNamingProvider];

/** "mlkit-barcode" is not a thing to say to a person; "Barcodes" is. */
export function providerLabel(id: string): string {
  return allProviders.find((p) => p.id === id)?.label ?? id;
}

export class ScanCancelledError extends Error {
  constructor() {
    super("Scan cancelled");
    this.name = "ScanCancelledError";
  }
}

/**
 * Capacitor signals a dismissed picker by rejecting, and the message is the
 * only thing distinguishing "user changed their mind" from a real failure.
 * Cancelling is not an error worth a toast.
 */
function isCancellation(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /cancel/i.test(message) || /no image (picked|selected)/i.test(message);
}

/**
 * Faults are surfaced on screen (see DebugStuff), so they have to survive as
 * strings rather than as objects whose shape nobody can predict. Native plugin
 * rejections in particular are often plain objects with a `message` and no
 * prototype worth trusting.
 */
export function describeScanError(err: unknown): string {
  if (err instanceof Error) {
    return err.message.length > 0 ? `${err.name}: ${err.message}` : err.name;
  }
  if (typeof err === "object" && err !== null && "message" in err) {
    return String((err as { message: unknown }).message);
  }
  return String(err);
}

export interface ProviderFailure {
  providerId: string;
  error: unknown;
}

export interface ScanOutcome {
  suggestions: LabelSuggestion[];
  /** Providers whose suggest() rejected. Empty on a clean run. */
  failures: ProviderFailure[];
  /**
   * Providers that reported isAvailable() === false (or whose availability
   * check itself threw). Nothing ran for these, so a caller can tell "this
   * build has no scanner" apart from "the photo was blank".
   */
  unavailable: string[];
  /** Providers whose suggest() was actually called, failed or not. */
  attempted: string[];
}

export interface ProviderDiagnostics {
  /** Result of the most recent isAvailable() check, if one has run. */
  available?: boolean;
  /** How many suggestions the last successful run produced. */
  lastCount?: number;
  /** Raw, unfriendly error text from the last failure. Never cleared by a later success. */
  lastError?: string;
  lastErrorAt?: number;
}

export interface ScanDiagnostics {
  /** Path of the most recent capture — the file ML Kit was pointed at. */
  lastPhotoPath?: string;
  lastCaptureError?: string;
  lastScanAt?: number;
  providers: Record<string, ProviderDiagnostics>;
}

const diagnostics: ScanDiagnostics = { providers: {} };

function providerSlot(providerId: string): ProviderDiagnostics {
  const existing = diagnostics.providers[providerId];
  if (existing !== undefined) {
    return existing;
  }
  const created: ProviderDiagnostics = {};
  diagnostics.providers[providerId] = created;
  return created;
}

/**
 * A copy, so the debug panel renders a stable snapshot rather than an object
 * a scan in flight can mutate underneath it.
 */
export function getScanDiagnostics(): ScanDiagnostics {
  const providers: Record<string, ProviderDiagnostics> = {};
  for (const [id, slot] of Object.entries(diagnostics.providers)) {
    providers[id] = { ...slot };
  }
  return { ...diagnostics, providers };
}

/**
 * Re-run the availability checks without taking a photo, so the debug panel can
 * answer "is the scanner even here?" on demand.
 */
export async function probeProviderAvailability(
  providers: SuggestionProvider[] = onDeviceProviders,
): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {};

  await Promise.all(
    providers.map(async (p) => {
      out[p.id] = await checkAvailable(p);
    }),
  );

  return out;
}

/**
 * isAvailable() is a probe, not a promise of good behaviour: a plugin that is
 * missing from the build can reject here instead of returning false. Either way
 * the provider cannot run, so treat a throw as "unavailable" and keep the text.
 */
async function checkAvailable(provider: SuggestionProvider): Promise<boolean> {
  const slot = providerSlot(provider.id);
  try {
    const available = await provider.isAvailable();
    slot.available = available;
    return available;
  } catch (err) {
    slot.available = false;
    slot.lastError = describeScanError(err);
    slot.lastErrorAt = Date.now();
    console.warn(`[fichero] Provider ${provider.id} availability check failed`, err);
    return false;
  }
}

export async function capturePhoto(source: CameraSource): Promise<ScanInput> {
  try {
    const photo = await Camera.getPhoto({
      // Uri keeps the bytes on disk. ML Kit reads the file directly, so there
      // is no reason to haul a base64 blob across the WebView bridge.
      resultType: CameraResultType.Uri,
      source,
      // Recognition accuracy stops improving long before full sensor
      // resolution, and large images make the ML Kit call noticeably slower.
      quality: 85,
      width: 1600,
      correctOrientation: true,
      allowEditing: false,
    });

    if (photo.path === undefined) {
      throw new Error("Camera returned no file path");
    }

    diagnostics.lastPhotoPath = photo.path;
    diagnostics.lastCaptureError = undefined;
    return { path: photo.path };
  } catch (err) {
    if (isCancellation(err)) {
      throw new ScanCancelledError();
    }
    diagnostics.lastCaptureError = describeScanError(err);
    throw err;
  }
}

export async function collectSuggestions(
  input: ScanInput,
  providers: SuggestionProvider[] = onDeviceProviders,
): Promise<ScanOutcome> {
  diagnostics.lastScanAt = Date.now();

  const checked = await Promise.all(
    providers.map(async (p) => ({ provider: p, available: await checkAvailable(p) })),
  );

  const unavailable = checked.filter((c) => !c.available).map((c) => c.provider.id);
  const runnable = checked.filter((c) => c.available).map((c) => c.provider);

  // allSettled, not all: a barcode model that is still downloading must not
  // take the OCR results down with it.
  const settled = await Promise.allSettled(runnable.map((p) => p.suggest(input)));

  const suggestions: LabelSuggestion[] = [];
  const failures: ProviderFailure[] = [];

  settled.forEach((result, i) => {
    const provider = runnable[i];
    const slot = providerSlot(provider.id);

    if (result.status === "fulfilled") {
      slot.lastCount = result.value.length;
      suggestions.push(...result.value);
    } else {
      slot.lastError = describeScanError(result.reason);
      slot.lastErrorAt = Date.now();
      failures.push({ providerId: provider.id, error: result.reason });
      console.warn(`[fichero] Suggestion provider ${provider.id} failed`, result.reason);
    }
  });

  return {
    suggestions,
    failures,
    unavailable,
    attempted: runnable.map((p) => p.id),
  };
}

export { CameraSource };
