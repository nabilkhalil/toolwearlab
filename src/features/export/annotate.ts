import { projectOntoLine } from '@/core/geometry';
import type { EdgeReference, LineMeasurement, WearPoint } from '@/core/types';

/**
 * Burn measurement overlays into a copy of the frame for reports. Drawn in
 * image coordinates and then scaled, so the overlay matches the stored data
 * exactly (independent of the on-screen zoom).
 */
export function annotateFrame(
  source: HTMLCanvasElement,
  edge: EdgeReference | null,
  points: WearPoint[],
  lines: LineMeasurement[],
  maxWidth = 1200,
): HTMLCanvasElement {
  const scale = Math.min(1, maxWidth / source.width);
  const out = document.createElement('canvas');
  out.width = Math.round(source.width * scale);
  out.height = Math.round(source.height * scale);
  const ctx = out.getContext('2d');
  if (!ctx) return out;
  ctx.drawImage(source, 0, 0, out.width, out.height);
  ctx.scale(scale, scale);
  const lw = 1.5 / scale;
  ctx.font = `${13 / scale}px sans-serif`;
  if (edge) {
    const dx = edge.b.x - edge.a.x;
    const dy = edge.b.y - edge.a.y;
    const k = (source.width + source.height) / Math.hypot(dx, dy);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = lw;
    ctx.setLineDash([10 / scale, 5 / scale]);
    ctx.beginPath();
    ctx.moveTo(edge.a.x - dx * k, edge.a.y - dy * k);
    ctx.lineTo(edge.b.x + dx * k, edge.b.y + dy * k);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  points.forEach((p, i) => {
    const f = edge ? projectOntoLine(p.p, edge.a, edge.b) : p.p;
    ctx.strokeStyle = '#f59e0b';
    ctx.fillStyle = '#f59e0b';
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(f.x, f.y);
    ctx.lineTo(p.p.x, p.p.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(p.p.x, p.p.y, 4 / scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillText(`${i + 1}`, p.p.x + 6 / scale, p.p.y + 14 / scale);
  });
  for (const l of lines) {
    ctx.strokeStyle = '#e879f9';
    ctx.fillStyle = '#e879f9';
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(l.a.x, l.a.y);
    ctx.lineTo(l.b.x, l.b.y);
    ctx.stroke();
    ctx.fillText(`${l.label} ${l.lengthUm.toFixed(0)} µm`, (l.a.x + l.b.x) / 2 + 6 / scale, (l.a.y + l.b.y) / 2);
  }
  return out;
}
