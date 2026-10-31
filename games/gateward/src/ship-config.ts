import { tactical } from './combat-scale';
export const FLIGHT_HEIGHT = 130;
export const DECK_HEIGHT = 22;
export const TURRET_SCALE = 0.8;
export const TURRET_RISE = 9;

// Presentation envelope only; Aegis gameplay ranges live in simulation.ts.
export const SHIELD_CENTER = Object.freeze({ x: 0, y: 8, z: 0 });
export const SHIELD_RADII = Object.freeze({ x: 360, y: 155, z: 140 });

// Shared by rendering, launch geometry, weapon origins and contact envelopes.
export const craftScale = function (kind: string): number {
	return kind === 'raider' || kind === 'interceptor' ? 0.5 : 1.5;
};
export const enemyRadius = function (kind: string): number {
	return (kind === 'carrier' ? 85 : kind === 'flagship' ? 38 : kind === 'armored' ? 23 : 15) * craftScale(kind);
};
export const CARRIER_BAYS = [
	{ x: -6, y: 53 }, { x: -6, y: -53 }, { x: 69, y: 28 }, { x: 69, y: -28 },
] as const;
export const CARRIER_LAUNCH = { interval: 0.9, range: tactical(620), clearanceTime: 1.5, speed: tactical(90) } as const;
