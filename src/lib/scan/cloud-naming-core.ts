/**
 * The half of cloud naming that has no platform in it: what we ask the model,
 * how we read what comes back, what we tell the person when it goes wrong, and
 * which namer answers the button. Kept apart from the bridge so it can be
 * tested without a phone, a WebView or a key.
 */
import { parseLabelOptions } from "./gemini-nano";

export const DEFAULT_CLOUD_MODEL = "z-ai/glm-5.3-flash";

/**
 * Vision-capable models that answer in about a second. Prices are OpenRouter's
 * per million tokens (in / out) as of 2026-09; one name costs roughly 1,000
 * tokens in and 100 out, so every one of these is well under a tenth of a cent.
 * Anything else can be typed in the settings: a shortcut, not a whitelist.
 */
export const CLOUD_MODEL_PRESETS: { id: string; label: string }[] = [
  { id: DEFAULT_CLOUD_MODEL, label: "GLM 5.3 Flash · $0.15 / $0.50" },
  { id: "google/gemma-3-12b-it", label: "Gemma 3 12B · $0.05 / $0.15, no thinking" },
  { id: "qwen/qwen3.7-flash", label: "Qwen 3.7 Flash · $0.03 / $0.13" },
  { id: "deepseek/deepseek-v4.1-flash", label: "DeepSeek V4.1 Flash · $0.15 / $0.60" },
];

/**
 * "off" is what every request tries first: six short names do not need a chain
 * of thought, and flash models that think spend the budget on it. Some models
 * refuse to switch it off (GLM 5.3 Flash answers 400), so they get "light":
 * brief thinking, hidden from the reply, with room left to actually answer.
 */
export type ReasoningMode = "off" | "light";

/**
 * A 40x12mm label at a readable size holds about this many characters. A
 * nickname is only funny if it survives being printed whole.
 */
export const FUN_MAX_CHARS = 22;

const FUN_COUNT = 3;
const PLAIN_COUNT_WITH_FUN = 3;
const PLAIN_COUNT_ALONE = 5;

export interface CloudNames {
  plain: string[];
  fun: string[];
}

const PLAIN_BRIEF = [
  "Name the main object in this photo for a small printed sticker label.",
  "Plain names are at most 3 words, the words a person would write on a box or a jar.",
  "Name the object itself, not the background, the setting or the colour.",
];

/**
 * The fun brief is mostly guard rails. "Funny" alone gets you insults and puns
 * about the person holding the phone; "affectionate" and "specific to what you
 * see" is what turns a kettle into Sir Drips-a-Lot rather than Kettle Lol.
 */
const FUN_BRIEF = [
  `Also give ${FUN_COUNT} fun nicknames for this particular object, each at most ${FUN_MAX_CHARS} characters.`,
  "Make them affectionate and specific to what you can see: its colour, wear, shape or what it is for.",
  "Mix styles: a pun, a royal or grand title, a pet name, a dramatic title.",
  "Never nickname or describe a person. Nothing mean, crude or sexual.",
];

export function buildNamingRequest(opts: {
  model: string;
  imageDataUrl: string;
  fun: boolean;
  reasoning?: ReasoningMode;
}): Record<string, unknown> {
  const light = opts.reasoning === "light";
  const shape = opts.fun
    ? `Reply with only JSON: {"plain": [${PLAIN_COUNT_WITH_FUN} names], "fun": [${FUN_COUNT} nicknames]}`
    : `Reply with only JSON: {"plain": [${PLAIN_COUNT_ALONE} names]}`;

  const prompt = [...PLAIN_BRIEF, ...(opts.fun ? FUN_BRIEF : []), shape].join("\n");

  return {
    model: opts.model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: prompt },
          { type: "image_url", image_url: { url: opts.imageDataUrl } },
        ],
      },
    ],
    // Plain naming wants the obvious word; jokes need some room to wander.
    temperature: opts.fun ? 1 : 0.3,
    reasoning: light ? { effort: "low", exclude: true } : { enabled: false },
    // Reasoning tokens count against max_tokens. 300 is plenty for the names
    // alone and would be eaten whole by even a short think.
    max_tokens: light ? 2000 : 300,
  };
}

/** Quotes, bullets and a trailing full stop; a "!" is part of the joke, so it stays. */
function cleanFun(candidate: string): string {
  return candidate
    .trim()
    .replace(/^[\s\-*•–—]+/, "")
    .replace(/^\d+[.)]\s*/, "")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/[.,;:]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function stringsOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

function jsonObject(raw: string): Record<string, unknown> | undefined {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(raw.slice(start, end + 1));
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The prompt asks for JSON, but a model is free to wrap it in a code fence,
 * chat around it, or ignore it and write lines. Anything that is not a clean
 * object goes through the same forgiving parser Nano uses, as plain names.
 */
export function parseCloudReply(raw: string, fun: boolean): CloudNames {
  const obj = jsonObject(raw);
  const plainLimit = fun ? PLAIN_COUNT_WITH_FUN : PLAIN_COUNT_ALONE;

  const plainSource = obj === undefined ? raw : JSON.stringify(stringsOf(obj.plain));
  const plain = parseLabelOptions(plainSource).slice(0, plainLimit);

  if (!fun || obj === undefined) {
    return { plain, fun: [] };
  }

  const seen = new Set(plain.map((p) => p.toLowerCase()));
  const funNames: string[] = [];
  for (const candidate of stringsOf(obj.fun)) {
    const text = cleanFun(candidate);
    const key = text.toLowerCase();
    if (text.length < 2 || text.length > FUN_MAX_CHARS || seen.has(key)) {
      continue;
    }
    seen.add(key);
    funNames.push(text);
  }

  return { plain, fun: funNames.slice(0, FUN_COUNT) };
}

/**
 * Chat-completions content is a string for most models and an array of parts
 * for some. OpenRouter can also answer 200 with an `error` in the body when the
 * upstream provider fails mid-way, which must not read as "no names".
 */
export function extractMessageText(response: unknown): string {
  const r = response as {
    error?: { message?: unknown };
    choices?: { message?: { content?: unknown } }[];
  };

  if (r?.error !== undefined) {
    throw new Error(`OpenRouter: ${String(r.error.message ?? "unknown error")}`);
  }

  const content = r?.choices?.[0]?.message?.content;
  if (typeof content === "string" && content.trim().length > 0) {
    return content;
  }
  if (Array.isArray(content)) {
    const text = content
      .map((part: unknown) => {
        const p = part as { text?: unknown };
        return typeof p?.text === "string" ? p.text : "";
      })
      .join("");
    if (text.trim().length > 0) {
      return text;
    }
  }

  throw new Error("The model sent back an empty answer.");
}

/**
 * Written for the person holding the phone. The raw status and message still
 * reach the Scan diagnostics panel through the thrown error's cause.
 */
export function describeCloudError(status: number | undefined, message: string): string {
  switch (status) {
    case undefined:
      return "Couldn't reach OpenRouter. Check your connection and try again.";
    case 401:
    case 403:
      return "OpenRouter rejected the key. Check it in ⋯ → AI naming.";
    case 402:
      return "Your OpenRouter key is out of credits, or hit its credit limit.";
    case 429:
      return "Too many requests to OpenRouter. Wait a moment and try again.";
    default:
      return `OpenRouter error ${status}: ${message}`;
  }
}

/** The 400 a thinking-only model sends back when a request switches reasoning off. */
export function isReasoningRequired(status: number | undefined, message: string): boolean {
  return status === 400 && /reason/i.test(message);
}

export type Namer = "nano" | "cloud" | "none";

/**
 * On-device first whenever it can do the job: free, offline and private. The
 * cloud answers when Nano cannot run, and always for fun names, which Nano is
 * not asked for. Fun with no key falls back to plain Nano rather than nothing.
 */
export function chooseNamer(o: { fun: boolean; nanoAvailable: boolean; keyConfigured: boolean }): Namer {
  if (o.keyConfigured && (o.fun || !o.nanoAvailable)) {
    return "cloud";
  }
  return o.nanoAvailable ? "nano" : "none";
}
