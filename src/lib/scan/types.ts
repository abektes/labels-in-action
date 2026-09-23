/**
 * Camera -> label suggestions.
 *
 * The seam exists because the two kinds of suggester are wildly different in
 * cost and privacy, and the UI must not care which one produced a chip:
 *
 *   - on-device (ML Kit): free, offline, no key, nothing leaves the phone
 *   - cloud (OpenRouter et al): costs money, needs the user's own key, and
 *     sends the photo to a third party
 *
 * A provider that needs setup reports isAvailable() === false rather than
 * throwing at scan time, so the tray can hide it instead of offering a button
 * that is guaranteed to fail.
 */

export type SuggestionSource = "ocr" | "barcode" | "ai";

export interface LabelSuggestion {
  /**
   * What goes on the label. Deliberately short: the default stock is 40x12mm,
   * which at 8 dots/mm is a 320x96px canvas. Anything past a few words stops
   * being a label and starts being a paragraph.
   */
  text: string;
  source: SuggestionSource;
  /**
   * Barcode symbology, when source is "barcode". Present so we can place a real
   * scannable barcode object rather than printing the digits as text.
   */
  encoding?: string;
  /** 0..1, only where a provider actually reports one. ML Kit does not. */
  confidence?: number;
  /**
   * A nickname rather than a name ("Sir Drips-a-Lot", not "Kettle"). Only the
   * cloud namer makes these, and only when fun names are switched on.
   */
  fun?: boolean;
}

export interface ScanInput {
  /**
   * Local file path to the captured image. ML Kit reads the file directly, so
   * this is the cheap path — no base64 round-trip through the WebView bridge.
   */
  path: string;
  /** Base64 JPEG (no data: prefix). Only populated when a cloud provider needs it. */
  base64?: string;
}

export interface SuggestionProvider {
  readonly id: string;
  /** Shown in the tray when more than one provider can run. */
  readonly label: string;
  /** Whether the photo leaves the device. Drives the privacy note in the UI. */
  readonly sendsImageOffDevice: boolean;
  isAvailable(): Promise<boolean>;
  suggest(input: ScanInput): Promise<LabelSuggestion[]>;
}
