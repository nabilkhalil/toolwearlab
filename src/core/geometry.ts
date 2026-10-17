import type { Vec2 } from './types';

export function distance(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Perpendicular distance from p to the infinite line through a and b. */
export function pointLineDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const len = distance(a, b);
  if (len === 0) throw new Error('Reference line is degenerate: its two points coincide.');
  return Math.abs((b.x - a.x) * (a.y - p.y) - (a.x - p.x) * (b.y - a.y)) / len;
}

/** Foot of the perpendicular from p onto the line ab. */
export function projectOntoLine(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy);
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/** Angle of the line ab against the image x axis (degrees). */
export function lineAngleDeg(a: Vec2, b: Vec2): number {
  return (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
}
