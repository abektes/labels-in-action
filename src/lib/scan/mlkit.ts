/**
 * On-device suggestion providers, backed by Google ML Kit.
 *
 * No API key, no network, no per-scan cost, and the photo never leaves the
 * phone. Both plugins are Android/iOS only, so isAvailable() gates on the
 * native platform exactly like the BLE path does.
 */
import { Capacitor } from "@capacitor/core";

import type { LabelSuggestion, ScanInput, SuggestionProvider } from "./types";

/**
 * Past this many characters a line stops being printable on a 320x96px label
 * without shrinking the type into illegibility. Such lines are still offered —
 * the user may be printing on 50x30mm stock — but they sort last.
 */
const COMFORTABLE_LABEL_CHARS = 28;

/** ML Kit returns lines in reading order; trim and drop the empties. */
function usableLines(blocks: { lines: { text: string }[] }[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  for (const block of blocks) {
    for (const line of block.lines) {
      const text = line.text.trim().replace(/\s+/g, " ");
      // Single stray characters are nearly always OCR noise off an edge or a logo.
      if (text.length < 2 || seen.has(text)) {
        continue;
      }
      seen.add(text);
      out.push(text);
    }
  }

  return out;
}

export const ocrProvider: SuggestionProvider = {
  id: "mlkit-ocr",
  label: "Text",
  sendsImageOffDevice: false,

  async isAvailable(): Promise<boolean> {
    return Capacitor.isNativePlatform();
  },

  async suggest({ path }: ScanInput): Promise<LabelSuggestion[]> {
    const { TextRecognition } = await import("@capacitor-mlkit/text-recognition");
    const { blocks } = await TextRecognition.processImage({ path });

    return usableLines(blocks)
      .sort((a, b) => {
        // Label-sized lines first; within each group keep reading order.
        const aFits = a.length <= COMFORTABLE_LABEL_CHARS ? 0 : 1;
        const bFits = b.length <= COMFORTABLE_LABEL_CHARS ? 0 : 1;
        return aFits - bFits;
      })
      .map((text) => ({ text, source: "ocr" as const }));
  },
};

export const barcodeProvider: SuggestionProvider = {
  id: "mlkit-barcode",
  label: "Barcodes",
  sendsImageOffDevice: false,

  async isAvailable(): Promise<boolean> {
    return Capacitor.isNativePlatform();
  },

  async suggest({ path }: ScanInput): Promise<LabelSuggestion[]> {
    const { BarcodeScanner } = await import("@capacitor-mlkit/barcode-scanning");
    const { barcodes } = await BarcodeScanner.readBarcodesFromImage({ path });

    return barcodes
      .map((b) => ({
        // displayValue is the human-readable form; rawValue keeps the check
        // digit and any symbology prefix, which is what we need to re-encode.
        text: b.rawValue ?? b.displayValue,
        source: "barcode" as const,
        encoding: b.format,
      }))
      .filter((s) => s.text.length > 0);
  },
};

export const onDeviceProviders: SuggestionProvider[] = [barcodeProvider, ocrProvider];
