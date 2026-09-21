/**
 * Capture a photo and turn it into label suggestions.
 *
 * Providers run concurrently and independently: a barcode model that is still
 * downloading must not take the OCR results down with it, so a rejected
 * provider logs and contributes nothing rather than failing the whole scan.
 */
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";

import { onDeviceProviders } from "./mlkit";
import type { LabelSuggestion, ScanInput, SuggestionProvider } from "./types";

export type { LabelSuggestion, ScanInput, SuggestionProvider } from "./types";
export { onDeviceProviders } from "./mlkit";

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

    return { path: photo.path };
  } catch (err) {
    if (isCancellation(err)) {
      throw new ScanCancelledError();
    }
    throw err;
  }
}

export async function collectSuggestions(
  input: ScanInput,
  providers: SuggestionProvider[] = onDeviceProviders,
): Promise<LabelSuggestion[]> {
  const available = await Promise.all(
    providers.map(async (p) => ((await p.isAvailable()) ? p : undefined)),
  );

  const settled = await Promise.allSettled(
    available.filter((p): p is SuggestionProvider => p !== undefined).map((p) => p.suggest(input)),
  );

  const suggestions: LabelSuggestion[] = [];
  for (const result of settled) {
    if (result.status === "fulfilled") {
      suggestions.push(...result.value);
    } else {
      console.warn("[fichero] Suggestion provider failed", result.reason);
    }
  }

  return suggestions;
}

export { CameraSource };
