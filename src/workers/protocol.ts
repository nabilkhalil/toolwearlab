import type { ImageQualityReport, MicroscopeState } from '@/core/types';

export interface RenderRequest {
  id: number;
  state: MicroscopeState;
  scale: number;
  noiseSeed: number;
}

export type RenderResponse =
  | { id: number; ok: true; width: number; height: number; buffer: ArrayBuffer; quality: ImageQualityReport }
  | { id: number; ok: false; error: string };

export interface RenderResult {
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  quality: ImageQualityReport;
}
