/**
 * On-device suggestion providers, backed by Google ML Kit.
 *
 * No API key, no network, no per-scan cost, and the photo never leaves the
 * phone. Both plugins are Android/iOS only, so isAvailable() gates on the
 * native platform exactly like the BLE path does.
 */
import { Capacitor } from "@capacitor/core";

import type { BarcodeCoding } from "$/fabric-object/barcode";
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

/** What the canvas should place for a scanned code. */
export type ScanPlacement =
  | { kind: "qrcode" }
  | { kind: "barcode"; encoding: BarcodeCoding }
  | { kind: "text" };

/** ean13() takes the 12 data digits, or all 13 with the check digit appended. */
const EAN13_PAYLOAD = /^\d{12,13}$/;

/**
 * ML Kit recognises 13 symbologies; the canvas can draw three things (QR,
 * EAN13, CODE128B). Pure on purpose — the placement decision is the part worth
 * reasoning about, and it needs no canvas to do so.
 */
export function planScanPlacement(format: string | undefined, text: string): ScanPlacement {
  switch (format) {
    case "QR_CODE":
      return { kind: "qrcode" };

    case "EAN_13":
    case "EAN_8":
    case "UPC_A":
    case "UPC_E":
      // EAN_8 and UPC_E payloads are shorter than EAN13, and ean13() zero-pads
      // a short input into a different number, so anything that is not already
      // a full-length numeric payload goes out as CODE128B, which carries the
      // exact digits that were scanned.
      return EAN13_PAYLOAD.test(text) ? { kind: "barcode", encoding: "EAN13" } : { kind: "barcode", encoding: "CODE128B" };

    case "CODE_128":
    case "CODE_39":
    case "CODE_93":
    case "ITF":
    case "CODABAR":
      return { kind: "barcode", encoding: "CODE128B" };

    default:
      // AZTEC, DATA_MATRIX, PDF_417, UNKNOWN: 2D or unnamed symbologies neither
      // canvas object can represent. Text keeps the payload; a linear barcode
      // would quietly claim to be a code it is not.
      return { kind: "text" };
  }
}
