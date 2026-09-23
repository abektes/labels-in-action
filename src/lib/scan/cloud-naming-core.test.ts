import { describe, expect, it } from "vitest";

import {
  FUN_MAX_CHARS,
  buildNamingRequest,
  chooseNamer,
  describeCloudError,
  extractMessageText,
  isReasoningRequired,
  parseCloudReply,
} from "./cloud-naming-core";

describe("parseCloudReply", () => {
  it("reads a clean JSON object", () => {
    const raw = JSON.stringify({
      plain: ["Kettle", "Electric kettle", "Water boiler"],
      fun: ["Sir Drips-a-Lot", "The Steam Queen", "Bubbles"],
    });
    expect(parseCloudReply(raw, true)).toEqual({
      plain: ["Kettle", "Electric kettle", "Water boiler"],
      fun: ["Sir Drips-a-Lot", "The Steam Queen", "Bubbles"],
    });
  });

  it("finds JSON inside a fenced block with chatter around it", () => {
    const raw = 'Sure! Here you go:\n```json\n{"plain":["Mug"],"fun":["Captain Coffee"]}\n```\nEnjoy!';
    expect(parseCloudReply(raw, true)).toEqual({ plain: ["Mug"], fun: ["Captain Coffee"] });
  });

  it("falls back to lines when the model ignores JSON", () => {
    const raw = "Olive oil\nGlass jar\nCooking oil";
    expect(parseCloudReply(raw, false)).toEqual({
      plain: ["Olive oil", "Glass jar", "Cooking oil"],
      fun: [],
    });
  });

  it("drops fun names that would not fit the label", () => {
    const long = "The Magnificent Emperor of All Kitchen Appliances";
    expect(long.length).toBeGreaterThan(FUN_MAX_CHARS);
    const raw = JSON.stringify({ plain: ["Toaster"], fun: [long, "Toasty McToastface"] });
    expect(parseCloudReply(raw, true).fun).toEqual(["Toasty McToastface"]);
  });

  it("does not repeat a plain name as a fun one", () => {
    const raw = JSON.stringify({ plain: ["Plant"], fun: ["plant", "Leafy Larry"] });
    expect(parseCloudReply(raw, true).fun).toEqual(["Leafy Larry"]);
  });

  it("ignores fun names when fun is off", () => {
    const raw = JSON.stringify({ plain: ["Cable"], fun: ["Noodle"] });
    expect(parseCloudReply(raw, false)).toEqual({ plain: ["Cable"], fun: [] });
  });

  it("caps plain at 3 with fun on and 5 with fun off", () => {
    const plain = ["A1", "B2", "C3", "D4", "E5", "F6"];
    const raw = JSON.stringify({ plain, fun: ["x1", "x2", "x3", "x4"] });
    expect(parseCloudReply(raw, true).plain).toHaveLength(3);
    expect(parseCloudReply(raw, true).fun).toHaveLength(3);
    expect(parseCloudReply(raw, false).plain).toHaveLength(5);
  });

  it("cleans quotes and trailing punctuation off fun names", () => {
    const raw = JSON.stringify({ plain: ["Jar"], fun: ['"Jammy Dodger!"', "  Lid Vicious. "] });
    expect(parseCloudReply(raw, true).fun).toEqual(["Jammy Dodger!", "Lid Vicious"]);
  });
});

describe("extractMessageText", () => {
  it("reads string content", () => {
    expect(extractMessageText({ choices: [{ message: { content: "hi" } }] })).toBe("hi");
  });

  it("joins array-of-parts content", () => {
    const response = {
      choices: [{ message: { content: [{ type: "text", text: "a" }, { type: "text", text: "b" }] } }],
    };
    expect(extractMessageText(response)).toBe("ab");
  });

  it("throws on an empty response", () => {
    expect(() => extractMessageText({ choices: [] })).toThrow();
  });

  it("surfaces an error the API put in a 200 body", () => {
    expect(() => extractMessageText({ error: { message: "Provider down" } })).toThrow(/Provider down/);
  });
});

describe("describeCloudError", () => {
  it.each([
    [401, /rejected the key/],
    [402, /credits/],
    [429, /Too many requests/],
    [undefined, /Couldn't reach OpenRouter/],
  ])("status %s", (status, pattern) => {
    expect(describeCloudError(status, "raw")).toMatch(pattern);
  });

  it("keeps the raw message for anything else", () => {
    expect(describeCloudError(500, "upstream exploded")).toMatch(/500.*upstream exploded/);
  });
});

describe("chooseNamer", () => {
  it.each([
    [{ fun: false, nanoAvailable: true, keyConfigured: true }, "nano"],
    [{ fun: false, nanoAvailable: true, keyConfigured: false }, "nano"],
    [{ fun: false, nanoAvailable: false, keyConfigured: true }, "cloud"],
    [{ fun: false, nanoAvailable: false, keyConfigured: false }, "none"],
    [{ fun: true, nanoAvailable: true, keyConfigured: true }, "cloud"],
    [{ fun: true, nanoAvailable: false, keyConfigured: true }, "cloud"],
    // Fun without a key cannot be honoured; plain Nano beats nothing at all.
    [{ fun: true, nanoAvailable: true, keyConfigured: false }, "nano"],
    [{ fun: true, nanoAvailable: false, keyConfigured: false }, "none"],
  ] as const)("%o -> %s", (input, expected) => {
    expect(chooseNamer(input)).toBe(expected);
  });
});

describe("buildNamingRequest", () => {
  const image = "data:image/jpeg;base64,AAAA";

  it("asks for fun names with a warm temperature", () => {
    const body = buildNamingRequest({ model: "z-ai/glm-5.3-flash", imageDataUrl: image, fun: true });
    expect(body.model).toBe("z-ai/glm-5.3-flash");
    expect(body.temperature).toBe(1);
    expect(body.max_tokens).toBe(300);
    expect(body.reasoning).toEqual({ enabled: false });
    expect(JSON.stringify(body)).toContain(image);
    expect(JSON.stringify(body)).toMatch(/fun nicknames/);
  });

  it("lets a model that insists on reasoning think briefly, with room to answer", () => {
    const body = buildNamingRequest({ model: "m", imageDataUrl: image, fun: true, reasoning: "light" });
    expect(body.reasoning).toEqual({ effort: "low", exclude: true });
    // Reasoning tokens count against max_tokens; 300 would all go on thinking.
    expect(body.max_tokens as number).toBeGreaterThanOrEqual(1500);
  });

  it("keeps plain naming cool and leaves the fun key out of the brief", () => {
    const body = buildNamingRequest({ model: "m", imageDataUrl: image, fun: false });
    expect(body.temperature).toBe(0.3);
    expect(JSON.stringify(body)).not.toMatch(/nickname/i);
  });
});

describe("isReasoningRequired", () => {
  it("spots the 400 a thinking-only model sends when reasoning is switched off", () => {
    expect(isReasoningRequired(400, "Reasoning is mandatory for this endpoint and cannot be disabled.")).toBe(true);
  });

  it("ignores other 400s and other statuses", () => {
    expect(isReasoningRequired(400, "Invalid image")).toBe(false);
    expect(isReasoningRequired(500, "reasoning backend down")).toBe(false);
    expect(isReasoningRequired(undefined, "reasoning")).toBe(false);
  });
});
