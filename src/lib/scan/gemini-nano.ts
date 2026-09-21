/**
 * Object naming, backed by Gemini Nano through ML Kit's GenAI Prompt API.
 *
 * The third suggestion source: OCR reads what is printed on a thing, barcodes
 * read what is encoded on it, and this one names the thing itself — useful for
 * a jar, a cable or a plant, none of which carry any text worth printing.
 *
 * Nano runs inside Android's AICore system service, so nothing is bundled in
 * the APK and nothing leaves the phone. The cost is that the model is
 * device-gated and weight-gated: most phones answer UNAVAILABLE, and the ones
 * that can run it may still need a large one-time download first. That download
 * is the user's decision, not a scan's, which is why isAvailable() is true only
 * for AVAILABLE and the tray asks before fetching anything.
 */
import { Capacitor } from "@capacitor/core";

import type { LabelSuggestion, ScanInput, SuggestionProvider } from "./types";

export type ObjectNamingStatus = "AVAILABLE" | "DOWNLOADABLE" | "DOWNLOADING" | "UNAVAILABLE";

/**
 * Written at the model, not at a person. Nano is small and drifts into prose
 * the moment the brief is vague, and prose is unprintable: the default stock is
 * 40x12mm, a 320x96px canvas that holds about three words. Hence the word cap,
 * the ban on punctuation, and the worked example — a demonstration of the
 * format survives paraphrasing better than a description of it.
 */
const NAMING_PROMPT = [
  "Name the main object in this photo for a printed storage label.",
  "Reply with 5 options, one per line, and nothing else.",
  "Each option is at most 3 words. No sentences, no punctuation, no numbering.",
  "Name the object itself, not the background, the setting or the colour.",
  "Use the words a person would write on a box or a jar.",
  "Example reply:",
  "Olive oil",
  "Glass jar",
  "Cooking oil",
  "Pantry oil",
  "Oil bottle",
].join("\n");

/** Five chips is already more than a 320x96 label can use; more is a wall. */
const MAX_OPTIONS = 5;

/** What the prompt asked for. Options this short sort first. */
const LABEL_WORDS = 3;

/** Past this the model ignored the brief and wrote a sentence. Drop it. */
const PROSE_WORDS = 6;
const PROSE_CHARS = 40;

/**
 * Caps the reply so inference stays short. Five three-word lines is ~30 tokens;
 * the headroom is for a model that insists on a preamble.
 */
const MAX_OUTPUT_TOKENS = 96;

function asStatus(raw: string): ObjectNamingStatus {
  // Anything the plugin grows later, or a value we do not recognise, is treated
  // as "cannot run" rather than optimistically offered to the user.
  return raw === "AVAILABLE" || raw === "DOWNLOADABLE" || raw === "DOWNLOADING" ? raw : "UNAVAILABLE";
}

/**
 * Never rejects: the tray needs a status to render, and a phone with no AICore
 * at all makes the check itself throw. That is a "no", not a fault.
 */
export async function checkObjectNamingStatus(): Promise<ObjectNamingStatus> {
  if (Capacitor.getPlatform() !== "android") {
    return "UNAVAILABLE";
  }

  try {
    const { GenAiPrompt } = await import("@capacitor-mlkit/genai-prompt");
    const { featureStatus } = await GenAiPrompt.checkFeatureStatus();
    return asStatus(String(featureStatus));
  } catch (err) {
    console.warn("[fichero] GenAI feature status check failed", err);
    return "UNAVAILABLE";
  }
}

/**
 * Resolves when the model is on the phone. Progress arrives as a running byte
 * count with no total — AICore does not announce the size up front — so a
 * caller can show megabytes but not a percentage.
 */
export async function downloadObjectNaming(
  onProgress?: (bytesDownloaded: number) => void,
): Promise<void> {
  const { GenAiPrompt } = await import("@capacitor-mlkit/genai-prompt");

  const handle =
    onProgress === undefined
      ? undefined
      : await GenAiPrompt.addListener("downloadProgress", (event) => {
          onProgress(event.totalBytesDownloaded);
        });

  try {
    await GenAiPrompt.downloadFeature();
  } finally {
    // The listener outlives the promise otherwise, and the next download would
    // report into a component that is long gone.
    await handle?.remove();
  }
}

/**
 * Talk, not a label. "Here are 5 options:" is caught by the trailing colon, but
 * a model that ends on "Hope that helps!" produces a line that is short enough
 * and punctuation-free enough to pass every other test, so openers and
 * sign-offs are matched by their first word.
 */
const CHATTER = /^(sure|ok|okay|certainly|here|hope|these|those|i|let|the image|the photo)\b/i;

/** Markdown bullets, "1." numbering, quotes and trailing stops the brief banned. */
function clean(candidate: string): string {
  return candidate
    .replace(/^[\s\-*•–—]+/, "")
    .replace(/^\d+[.)]\s*/, "")
    .replace(/^(option\s*\d*|label|name|answer)\s*:\s*/i, "")
    .replace(/^["'`]+|["'`*]+$/g, "")
    .replace(/[.,;:!?]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * A model that ignores "one per line" almost always answers with one
 * comma-separated line instead, so a single line is split further.
 */
function lineCandidates(raw: string): string[] {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  return lines.length === 1 ? lines[0].split(/[,;|]/) : lines;
}

/** Strings, or the object shapes a model reaches for when told to return a list. */
function jsonCandidates(raw: string): string[] | undefined {
  const start = raw.indexOf("[");
  const end = raw.lastIndexOf("]");
  if (start < 0 || end <= start) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return undefined;
  }

  if (!Array.isArray(parsed)) {
    return undefined;
  }

  const out: string[] = [];
  for (const entry of parsed) {
    if (typeof entry === "string") {
      out.push(entry);
      continue;
    }
    if (typeof entry === "object" && entry !== null) {
      const record = entry as Record<string, unknown>;
      const value = record.text ?? record.label ?? record.name;
      if (typeof value === "string") {
        out.push(value);
      }
    }
  }

  return out.length > 0 ? out : undefined;
}

/**
 * Free text in, label options out. Exported because this is the part that has
 * to survive a model doing whatever it likes: the prompt is a request, not a
 * grammar, so the parser assumes nothing beyond "the names are in here
 * somewhere". JSON first because a model told to list things sometimes reaches
 * for it uninvited; lines otherwise, which is what the prompt actually asked
 * for.
 */
export function parseLabelOptions(raw: string): string[] {
  const candidates = jsonCandidates(raw) ?? lineCandidates(raw);
  const seen = new Set<string>();
  const short: string[] = [];
  const long: string[] = [];

  for (const candidate of candidates) {
    // "Here are five options:" and friends: a header, not a label.
    if (/[:：]\s*$/.test(candidate)) {
      continue;
    }

    const text = clean(candidate);
    const words = text.split(" ").length;
    if (text.length < 2 || text.length > PROSE_CHARS || words > PROSE_WORDS) {
      continue;
    }
    if (CHATTER.test(text)) {
      continue;
    }

    const key = text.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    // Over the brief but still label-shaped: offered, but after the ones that
    // fit the stock we actually ship.
    (words <= LABEL_WORDS ? short : long).push(text);
  }

  return [...short, ...long].slice(0, MAX_OPTIONS);
}

export const objectNamingProvider: SuggestionProvider = {
  id: "genai-object-naming",
  label: "Objects",
  sendsImageOffDevice: false,

  async isAvailable(): Promise<boolean> {
    // DOWNLOADABLE deliberately reads as unavailable: generateContent would
    // otherwise kick off a multi-hundred-megabyte download from inside a scan
    // the user thought was a photo of a jar.
    return (await checkObjectNamingStatus()) === "AVAILABLE";
  },

  async suggest({ path }: ScanInput): Promise<LabelSuggestion[]> {
    const { GenAiPrompt } = await import("@capacitor-mlkit/genai-prompt");

    const { text } = await GenAiPrompt.generateContent({
      imagePath: path,
      prompt: NAMING_PROMPT,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      // Naming wants the obvious word, not an inventive one.
      temperature: 0.3,
    });

    return parseLabelOptions(text).map((option) => ({ text: option, source: "ai" as const }));
  },
};
