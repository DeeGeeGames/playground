export type WeaponId = 'laser' | 'machine-gun' | 'autocannon' | 'ppc' | 'stream-missiles' | 'cluster-missiles' | 'stream-rockets' | 'cluster-rockets';
export type FireInputs = readonly [boolean, boolean, boolean, boolean];
export interface WeaponMount { weapon: WeaponId; level: number; cooldown: number; firing: boolean }
export interface WeaponDefinition {
	id: WeaponId;
	name: string;
	type: string;
	description: string;
	role: string;
	color: string;
	icon: string;
	kind: 'laser' | 'cannon' | 'bullet' | 'ppc' | 'missile' | 'rocket';
	damage: number;
	interval: number;
	heat: number;
	range: number;
	speed: number;
	projectiles: number;
	spread: number;
	splash: number;
}
export const MAX_WEAPON_LEVEL = 3;
export const DRAFT_MILESTONES: readonly number[] = [2, 5, 9, 14, 20, 27, 35];
export const WEAPONS: readonly WeaponDefinition[] = [
	{ id: 'autocannon', name: 'AC/38', type: 'Auto Cannon', role: 'Precise impact', description: 'Heavy, accurate shells. Reliable opening fire with modest reactor demand.', color: '#ffd28b', icon: '╋', kind: 'cannon', damage: 38, interval: 0.65, heat: 6, range: 845, speed: 650, projectiles: 1, spread: 0, splash: 0 },
	{ id: 'laser', name: 'ARC', type: 'Laser', role: 'Continuous beam', description: 'A continuous beam that stops at the first target. Track steadily; watch your heat.', color: '#8ff5e7', icon: 'ϟ', kind: 'laser', damage: 56, interval: 0, heat: 24, range: 620, speed: 0, projectiles: 1, spread: 0, splash: 0 },
	{ id: 'machine-gun', name: 'RATTLER', type: 'Machine Gun', role: 'Cool sustained fire', description: 'Rapid low-heat tracers with a narrow spread. Best against nearby light frames.', color: '#fff2ba', icon: '≋', kind: 'bullet', damage: 8, interval: 0.105, heat: 0.7, range: 700, speed: 1000, projectiles: 1, spread: 0.035, splash: 0 },
	{ id: 'ppc', name: 'TEMPEST', type: 'Particle Projection Cannon', role: 'Piercing pulse', description: 'A charged particle bolt punches through a line of frames. Powerful, slow and hot.', color: '#b1a0ff', icon: '◉', kind: 'ppc', damage: 82, interval: 1.6, heat: 17, range: 1000, speed: 550, projectiles: 1, spread: 0, splash: 0 },
	{ id: 'stream-missiles', name: 'NEEDLE', type: 'Stream Missiles', role: 'Guided pressure', description: 'A steady stream of guided missiles follows the target nearest your aim.', color: '#9be99e', icon: '↗', kind: 'missile', damage: 25, interval: 0.48, heat: 3.5, range: 1050, speed: 300, projectiles: 1, spread: 0, splash: 0 },
	{ id: 'cluster-missiles', name: 'TRIDENT', type: 'Cluster Missiles', role: 'Guided area salvo', description: 'Three guided warheads fan out, converge and burst against clustered enemies.', color: '#b7e876', icon: '⋀', kind: 'missile', damage: 30, interval: 2.1, heat: 13, range: 1080, speed: 270, projectiles: 3, spread: 0.28, splash: 65 },
	{ id: 'stream-rockets', name: 'LANCE', type: 'Stream Rockets', role: 'Unguided pressure', description: 'Fast rockets fly straight along the turret bearing. Lead moving targets.', color: '#ffad6a', icon: '⇢', kind: 'rocket', damage: 31, interval: 0.42, heat: 3, range: 1000, speed: 520, projectiles: 1, spread: 0, splash: 0 },
	{ id: 'cluster-rockets', name: 'HAILSTORM', type: 'Cluster Rockets', role: 'Unguided area volley', description: 'Five unguided rockets spread into an explosive fan. Close the range to concentrate fire.', color: '#ff837a', icon: '⋔', kind: 'rocket', damage: 24, interval: 1.8, heat: 12, range: 900, speed: 470, projectiles: 5, spread: 0.13, splash: 80 },
];
export const getWeapon = function (id: WeaponId): WeaponDefinition {
	const weapon = WEAPONS.find(function (candidate) { return candidate.id === id; });
	if (!weapon) throw new RangeError(`Unknown Iron Wake weapon: ${id}`);
	return weapon;
};
export const createMount = function (weapon: WeaponId): WeaponMount { return { weapon, level: 1, cooldown: 0, firing: false }; };
export const weaponDamage = function (weapon: WeaponDefinition, level: number) { return weapon.damage * (1 + (level - 1) * 0.3); };
