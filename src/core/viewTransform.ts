import type { Vec2 } from './types';

/**
 * Digital zoom / pan of a captured image. Purely a display transform:
 *   screen = image · scale + offset
 * Measurement points are always stored in image coordinates, so changing
 * the view never alters a measurement. Optical magnification (objective)
 * is a separate quantity that changes µm/px and requires recalibration.
 */
export interface ViewTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export const MIN_DIGITAL_ZOOM = 0.1;
export const MAX_DIGITAL_ZOOM = 16;

export function imageToScreen(p: Vec2, v: ViewTransform): Vec2 {
  return { x: p.x * v.scale + v.offsetX, y: p.y * v.scale + v.offsetY };
}

export function screenToImage(p: Vec2, v: ViewTransform): Vec2 {
  return { x: (p.x - v.offsetX) / v.scale, y: (p.y - v.offsetY) / v.scale };
}

/** Zoom by `factor` about a screen anchor, keeping the image point under the anchor fixed. */
export function zoomAt(v: ViewTransform, anchor: Vec2, factor: number): ViewTransform {
  const scale = Math.min(MAX_DIGITAL_ZOOM, Math.max(MIN_DIGITAL_ZOOM, v.scale * factor));
  const img = screenToImage(anchor, v);
  return { scale, offsetX: anchor.x - img.x * scale, offsetY: anchor.y - img.y * scale };
}

/** Fit an image of size (w, h) inside a viewport, centred. */
export function fitToViewport(w: number, h: number, vw: number, vh: number): ViewTransform {
  const scale = Math.min(vw / w, vh / h);
  return { scale, offsetX: (vw - w * scale) / 2, offsetY: (vh - h * scale) / 2 };
}

/** Snap an image coordinate to the pixel centre grid (0.5, 1.5, …) when requested. */
export function snapToPixelCentre(p: Vec2): Vec2 {
  return { x: Math.floor(p.x) + 0.5, y: Math.floor(p.y) + 0.5 };
}
