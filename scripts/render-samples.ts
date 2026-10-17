/**
 * Renders sample frames of every specimen to PNG for visual inspection and
 * documentation:  npx tsx scripts/render-samples.ts <outDir>
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { join } from 'node:path';
import { renderFrame, assessQuality } from '../src/core/renderer';
import { SPECIMENS } from '../src/data/specimens';
import type { MicroscopeState, ObjectiveId } from '../src/core/types';

function crc32(buf: Buffer): number {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w: number, h: number, rgba: Uint8ClampedArray): Buffer {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const out = process.argv[2] ?? 'samples';
mkdirSync(out, { recursive: true });
const objectives: ObjectiveId[] = ['2x', '5x', '10x'];
for (const sp of SPECIMENS) {
  for (const objectiveId of objectives) {
    for (const mode of ['coaxial', 'ring'] as const) {
      const st: MicroscopeState = {
        specimenId: sp.id,
        objectiveId,
        stage: { ...sp.homeStage },
        focusZUm: sp.surfaceZUm,
        illumination: { mode, intensity: 0.75 },
        camera: { brightness: 0, contrast: 1, exposure: 1 },
      };
      const t0 = performance.now();
      const f = renderFrame(st, sp, { scale: 0.5, noiseSeed: 1 });
      const ms = performance.now() - t0;
      const q = assessQuality(f, st, sp);
      writeFileSync(join(out, `${sp.id}_${objectiveId}_${mode}.png`), png(f.width, f.height, f.rgba));
      console.log(`${sp.id} ${objectiveId} ${mode}: ${ms.toFixed(0)} ms, mean ${q.meanGrey.toFixed(0)}, sat ${(q.saturatedFraction * 100).toFixed(2)}%, ok=${q.acceptable}`);
    }
  }
}
