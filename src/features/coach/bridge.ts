import type { Vec2 } from '@/core/types';

/**
 * Lets the tour overlay place "click here" markers on the measurement
 * canvas. FrameView publishes its current image → browser-window mapping
 * here; the overlay polls it. Display only: nothing is stored from it.
 */
export const frameViewBridge: { toClient: ((imagePoint: Vec2) => Vec2) | null } = { toClient: null };
