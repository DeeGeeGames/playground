import type { WeaponId } from './arsenal';

export type FrameId = 'warden' | 'kestrel' | 'maul' | 'longbow' | 'morrow';
export interface FrameDefinition {
	id: FrameId; name: string; designation: string; role: string; description: string; tradeoff: string;
	starter: WeaponId; color: string; mass: number;
	speed: number; reverseSpeed: number; acceleration: number; turnRate: number; turretRate: number;
	cooling: number; incomingDamage: number;
	size: number; stride: number; suspension: number; recoil: number;
}
// Integrity is a normalized percentage on every frame. Resistance changes the
// cost of a hit without changing repair, report, or persisted record formats.
export const FRAMES: readonly FrameDefinition[] = [
	{ id: 'warden', name: 'WARDEN', designation: '08', role: 'Line fighter', description: 'A balanced siege chassis. Accurate shells and steady handling hold the relay line.', tradeoff: 'Balanced armor and mobility; no specialized advantage.', starter: 'autocannon', color: '#d7ad61', mass: 80, speed: 90, reverseSpeed: 48, acceleration: 1.5, turnRate: 1.05, turretRate: 2.3, cooling: 12, incomingDamage: 1, size: 1, stride: 1, suspension: 1, recoil: 1 },
	{ id: 'kestrel', name: 'KESTREL', designation: '21', role: 'Skirmisher', description: 'A compact pursuit frame. Rapid tracers and quick tracking reward flanking and constant movement.', tradeoff: '30% more incoming damage and a smaller cooling plant.', starter: 'machine-gun', color: '#8dddc8', mass: 40, speed: 125, reverseSpeed: 65, acceleration: 2.2, turnRate: 1.5, turretRate: 3.1, cooling: 10, incomingDamage: 1.3, size: 0.86, stride: 0.78, suspension: 0.7, recoil: 0.45 },
	{ id: 'maul', name: 'MAUL', designation: '34', role: 'Brawler', description: 'An armored breaching frame. Close the distance to concentrate a five-rocket Hailstorm volley.', tradeoff: '22% less incoming damage; slow hull and turret traverse.', starter: 'cluster-rockets', color: '#ed9c75', mass: 100, speed: 82, reverseSpeed: 40, acceleration: 2, turnRate: 0.82, turretRate: 1.9, cooling: 11, incomingDamage: 0.78, size: 1.12, stride: 1.08, suspension: 1.3, recoil: 1.25 },
	{ id: 'longbow', name: 'LONGBOW', designation: '16', role: 'Precision gunner', description: 'A tall particle-gun platform. Line up piercing shots and use the oversized cooling plant to sustain fire.', tradeoff: '25% faster cooling; 12% more incoming damage and slow tracking.', starter: 'ppc', color: '#b7a8ed', mass: 65, speed: 86, reverseSpeed: 42, acceleration: 1.5, turnRate: 0.95, turretRate: 1.8, cooling: 15, incomingDamage: 1.12, size: 1.04, stride: 1, suspension: 0.85, recoil: 1.4 },
	{ id: 'morrow', name: 'MORROW', designation: '52', role: 'Missile support', description: 'A mobile salvo carrier. Guided Trident warheads converge on targets and burst into nearby enemies.', tradeoff: 'Guided area fire and quick traverse; 10% more incoming damage.', starter: 'cluster-missiles', color: '#b7d98b', mass: 70, speed: 88, reverseSpeed: 48, acceleration: 1.7, turnRate: 1.15, turretRate: 2.5, cooling: 12, incomingDamage: 1.1, size: 0.98, stride: 0.95, suspension: 1.05, recoil: 0.8 },
];
export const getFrame = function (id: FrameId): FrameDefinition {
	const frame = FRAMES.find(function (candidate) { return candidate.id === id; });
	if (!frame) throw new RangeError(`Unknown Iron Wake frame: ${id}`);
	return frame;
};
