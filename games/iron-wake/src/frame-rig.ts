import type { FrameId } from './frames';

export interface LegRig {
	readonly hipHeight: number;
	readonly hipForward: number;
	readonly hipWidth: number;
	readonly upper: number;
	readonly lower: number;
	readonly kneeDirection: -1 | 1;
	readonly torsoRise?: number;
}
export const STANDARD_LEG_RIG: LegRig = { hipHeight: 48, hipForward: -2, hipWidth: 18, upper: 30, lower: 34, kneeDirection: -1 };

// Presentation anatomy, independent of frame balance and hitboxes.
export const FRAME_RIGS: Readonly<Record<FrameId, LegRig>> = {
	warden: STANDARD_LEG_RIG,
	kestrel: { hipHeight: 56, hipForward: -6, hipWidth: 16, upper: 30, lower: 40, kneeDirection: -1 },
	maul: { hipHeight: 78, hipForward: -2, hipWidth: 19, upper: 32, lower: 36, kneeDirection: 1, torsoRise: 22 },
	longbow: { hipHeight: 91, hipForward: -2, hipWidth: 16, upper: 38, lower: 43, kneeDirection: 1, torsoRise: 23 },
	morrow: { hipHeight: 43, hipForward: -5, hipWidth: 23, upper: 29, lower: 33, kneeDirection: -1 },
};
