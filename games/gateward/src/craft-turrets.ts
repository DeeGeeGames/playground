import type { Point } from './simulation';

export type TurretCraft = 'guardian' | 'bomber' | 'armored' | 'flagship';
export interface CraftMount extends Point { height: number; bearing: number; arc: number; barrel: number }
export interface CraftAim { mount: number; angle: number; muzzle: Point; aim: Point; height: number }
const sideBanks = function (x: number, y: number, height: number, barrel: number): readonly CraftMount[] {
	return [-1, 1].map(function (side) { return { x, y: side * y, height, barrel, bearing: side * Math.PI / 2, arc: 100 * Math.PI / 180 }; });
};
const perimeter = function (front: number, back: number, side: number, height: number): readonly CraftMount[] {
	return [
		{ x: front, y: 0, bearing: 0 }, { x: back, y: 0, bearing: Math.PI },
		{ x: 0, y: -side, bearing: -Math.PI / 2 }, { x: 0, y: side, bearing: Math.PI / 2 },
	].map(function (mount) { return { ...mount, height, barrel: 5, arc: 140 * Math.PI / 180 }; });
};
// Coordinates are the final model proportions, including baked slender scaling.
// Pivots sit outside the hull footprint; every legal ray points away from it.
export const CRAFT_MOUNTS: Record<TurretCraft, readonly CraftMount[]> = {
	guardian: perimeter(28, -27, 10, 5),
	bomber: perimeter(27, -24, 13.5, 4),
	armored: sideBanks(12, 16, 6, 7),
	flagship: sideBanks(12, 38, 7, 11),
};
export const hasCraftTurrets = function (kind: string): kind is TurretCraft {
	return kind === 'guardian' || kind === 'bomber' || kind === 'armored' || kind === 'flagship';
};
const deltaAngle = function (angle: number): number { return Math.atan2(Math.sin(angle), Math.cos(angle)); };
export const craftTurretSolution = function (kind: TurretCraft, craft: Point, heading: number, predict: (from: Point) => Point): CraftAim | undefined {
	for (const [index, mount] of CRAFT_MOUNTS[kind].entries()) {
		const c = Math.cos(heading); const s = Math.sin(heading);
		const pivot = { x: craft.x + c * mount.x - s * mount.y, y: craft.y + s * mount.x + c * mount.y };
		let aim = predict(pivot);
		let angle = Math.atan2(aim.y - pivot.y, aim.x - pivot.x);
		// Recompute lead at the barrel tip rather than firing from the hull center.
		let muzzle = { x: pivot.x + Math.cos(angle) * mount.barrel, y: pivot.y + Math.sin(angle) * mount.barrel };
		aim = predict(muzzle); angle = Math.atan2(aim.y - pivot.y, aim.x - pivot.x);
		const local = deltaAngle(angle - heading);
		if (Math.abs(deltaAngle(local - mount.bearing)) > mount.arc / 2) continue;
		if (Math.hypot(aim.x - pivot.x, aim.y - pivot.y) <= mount.barrel) continue;
		muzzle = { x: pivot.x + Math.cos(angle) * mount.barrel, y: pivot.y + Math.sin(angle) * mount.barrel };
		return { mount: index, angle: local, muzzle, aim, height: mount.height };
	}
	return undefined;
};
