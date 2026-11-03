import { tactical } from './combat-scale';

export const FORMATION_RADII = { inner: tactical(230), middle: tactical(370), future: tactical(510) } as const;
export const FORMATION = ['ahead', 'starboard', 'inner-aft-starboard', 'astern', 'port', 'inner-fore-port', 'middle-1', 'middle-2', 'middle-3', 'middle-4', 'middle-5', 'middle-6', 'middle-7', 'middle-8'] as const;
export type Formation = typeof FORMATION[number];
const station = function (ring: 'inner' | 'middle', degrees: number, label: string) {
	const angle = degrees * Math.PI / 180;
	return { x: Math.cos(angle) * FORMATION_RADII[ring], y: Math.sin(angle) * FORMATION_RADII[ring], ring, label };
};
export const FORMATION_SLOTS = {
	ahead: station('inner', 30, 'Inner 1 · Fore starboard'),
	starboard: station('inner', 90, 'Inner 2 · Starboard'),
	'inner-aft-starboard': station('inner', 150, 'Inner 3 · Aft starboard'),
	astern: station('inner', 210, 'Inner 4 · Aft port'),
	port: station('inner', 270, 'Inner 5 · Port'),
	'inner-fore-port': station('inner', 330, 'Inner 6 · Fore port'),
	'middle-1': station('middle', 22.5, 'Middle 1 · Fore starboard'),
	'middle-2': station('middle', 67.5, 'Middle 2 · Starboard fore'),
	'middle-3': station('middle', 112.5, 'Middle 3 · Starboard aft'),
	'middle-4': station('middle', 157.5, 'Middle 4 · Aft starboard'),
	'middle-5': station('middle', 202.5, 'Middle 5 · Aft port'),
	'middle-6': station('middle', 247.5, 'Middle 6 · Port aft'),
	'middle-7': station('middle', 292.5, 'Middle 7 · Port fore'),
	'middle-8': station('middle', 337.5, 'Middle 8 · Fore port'),
} satisfies Record<Formation, { x: number; y: number; ring: 'inner' | 'middle'; label: string }>;
export const HULLS = {
	corvette: { name: 'Corvette', cost: 120, hp: 160, mounts: 1, radius: 34, scale: 0.75 },
	frigate: { name: 'Frigate', cost: 220, hp: 240, mounts: 2, radius: 48, scale: 1 },
	cruiser: { name: 'Cruiser', cost: 380, hp: 400, mounts: 4, radius: 64, scale: 1.4 },
} as const;
export type HullKind = keyof typeof HULLS;
