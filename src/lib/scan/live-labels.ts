/**
 * Bridge to the app-local LiveLabels plugin
 * (android/app/src/main/java/nl/abektes/fichero/livelabels).
 *
 * The native side runs a CameraX preview behind a transparent WebView and
 * streams detected objects per frame. Everything drawn over that preview is
 * ordinary DOM, which is why the boxes arrive as fractions: the WebView never
 * learns what resolution the analyser ran at.
 */
import { Capacitor, registerPlugin, type PluginListenerHandle } from "@capacitor/core";

export interface DetectedLabel {
  text: string;
  confidence: number;
}

export interface DetectedObject {
  /** Stable across frames while ML Kit keeps tracking the same thing; -1 if untracked. */
  trackingId: number;
  /** All four are fractions of the upright source frame, 0..1. */
  left: number;
  top: number;
  width: number;
  height: number;
  labels: DetectedLabel[];
}

export interface ObjectsDetectedEvent {
  objects: DetectedObject[];
  sourceWidth: number;
  sourceHeight: number;
}

interface LiveLabelsPlugin {
  isSupported(): Promise<{ supported: boolean }>;
  start(): Promise<void>;
  stop(): Promise<void>;
  addListener(
    eventName: "objectsDetected",
    listener: (event: ObjectsDetectedEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "liveLabelsError",
    listener: (event: { message: string }) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: "liveLabelsStarted" | "liveLabelsStopped",
    listener: () => void,
  ): Promise<PluginListenerHandle>;
  removeAllListeners(): Promise<void>;
}

export const LiveLabels = registerPlugin<LiveLabelsPlugin>("LiveLabels");

export interface PixelRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Map a detected box onto the preview element.
 *
 * PreviewView uses FILL_CENTER, which is object-fit: cover — the frame is
 * scaled to cover the view and the overflow is cropped evenly on both sides.
 * Ignoring that is the classic way to get boxes that drift further off-target
 * the more the aspect ratios differ, so the crop offset is subtracted here.
 *
 * Pure, so it can be reasoned about without a camera.
 */
export function projectOntoPreview(
  object: DetectedObject,
  sourceWidth: number,
  sourceHeight: number,
  viewWidth: number,
  viewHeight: number,
): PixelRect {
  if (sourceWidth <= 0 || sourceHeight <= 0) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }

  const scale = Math.max(viewWidth / sourceWidth, viewHeight / sourceHeight);
  const renderedWidth = sourceWidth * scale;
  const renderedHeight = sourceHeight * scale;
  const offsetX = (viewWidth - renderedWidth) / 2;
  const offsetY = (viewHeight - renderedHeight) / 2;

  return {
    left: offsetX + object.left * renderedWidth,
    top: offsetY + object.top * renderedHeight,
    width: object.width * renderedWidth,
    height: object.height * renderedHeight,
  };
}

/**
 * ML Kit's own classifier knows five coarse categories, so this is a hint about
 * what you are pointing at, not a label anyone would print. Naming happens
 * after the user picks a box.
 */
export function bestLabel(object: DetectedObject): string | undefined {
  if (object.labels.length === 0) {
    return undefined;
  }
  return [...object.labels].sort((a, b) => b.confidence - a.confidence)[0].text;
}

export async function isLiveLabelsSupported(): Promise<boolean> {
  if (Capacitor.getPlatform() !== "android") {
    return false;
  }
  try {
    const { supported } = await LiveLabels.isSupported();
    return supported;
  } catch {
    // An unregistered plugin rejects here. That is a "no", not a fault worth
    // surfacing — the photo-based Scan tray keeps working either way.
    return false;
  }
}
