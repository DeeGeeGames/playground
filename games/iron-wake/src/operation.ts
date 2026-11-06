import type { EnemyKind } from './simulation';

export type Difficulty = 'story' | 'standard' | 'veteran';
export type RefitChoice = 'arsenal' | 'cooling' | 'bastion';
export interface DifficultyDefinition {
	id: Difficulty;
	name: string;
	description: string;
	enemyArmor: number;
	enemyDamage: number;
	scoreMultiplier: number;
}
export const DIFFICULTIES: readonly DifficultyDefinition[] = [
	{ id: 'story', name: 'Field recruit', description: 'Lighter enemy armor and damage. Learn the frame, finish the operation.', enemyArmor: 0.85, enemyDamage: 0.55, scoreMultiplier: 0.75 },
	{ id: 'standard', name: 'Pilot', description: 'The intended fight. Manage heat, intercept artillery, protect the relay.', enemyArmor: 1, enemyDamage: 1, scoreMultiplier: 1 },
	{ id: 'veteran', name: 'Veteran', description: 'Reinforced hostiles and harder hits. Every refit matters.', enemyArmor: 1.2, enemyDamage: 1.3, scoreMultiplier: 1.4 },
];
export interface RefitDefinition {
	id: RefitChoice;
	name: string;
	label: string;
	description: string;
}
export const REFITS: readonly RefitDefinition[] = [
	{ id: 'arsenal', name: 'Overpressure kit', label: '+15% weapon damage', description: 'Increase cannon, laser and missile damage. Stacks with previous kits.' },
	{ id: 'cooling', name: 'Cryogenic loop', label: '+18% heat dissipation', description: 'Sustain fire longer. Adds a coolant charge and purges the reactor.' },
	{ id: 'bastion', name: 'Bastion plating', label: '−10% incoming frame damage', description: 'Reinforce the frame and restore 12 relay integrity. Resistance stacks.' },
];
export interface EnemySpawn { kind: EnemyKind; commander?: boolean }
export interface WaveDefinition {
	number: number;
	name: string;
	briefing: string;
	interval: number;
	bearing: number;
	enemies: readonly EnemySpawn[];
}
const scout: EnemySpawn = { kind: 'scout' };
const striker: EnemySpawn = { kind: 'striker' };
const siege: EnemySpawn = { kind: 'siege' };
const commander: EnemySpawn = { kind: 'siege', commander: true };
export const WAVES: readonly WaveDefinition[] = [
	{ number: 1, name: 'First contact', briefing: 'Recon frames are crossing the perimeter. Keep moving and get a feel for the guns.', interval: 5, bearing: 1.6, enemies: [scout, scout, striker, scout, striker] },
	{ number: 2, name: 'Crossfire', briefing: 'Armored artillery is joining the assault. Flank its shielded front, or strike while its armor vents after firing.', interval: 6, bearing: 3.2, enemies: [scout, striker, scout, striker, siege, scout, striker] },
	{ number: 3, name: 'Hammerfall', briefing: 'Artillery braces for repeated impacts. Clear the orange markers, then punish the exposed cooling cycle.', interval: 6, bearing: 4.8, enemies: [siege, scout, striker, siege, striker, scout, siege, striker] },
	{ number: 4, name: 'Breaking point', briefing: 'The main assault is committing. Recover salvage and keep a coolant charge in reserve.', interval: 6, bearing: 0.8, enemies: [striker, scout, siege, striker, scout, striker, siege, striker, siege] },
	{ number: 5, name: 'Iron crown', briefing: 'The Crown is deploying a siege barrage. Leave its marked impact field, then attack the open armor. Below half integrity, its barrage spreads.', interval: 5, bearing: 2.4, enemies: [striker, siege, scout, striker, commander, scout, siege, striker, siege, striker] },
];
export const TOTAL_HOSTILES = WAVES.reduce(function (total, wave) { return total + wave.enemies.length; }, 0);
export const getWaveDefinition = function (wave: number): WaveDefinition {
	const definition = WAVES.find(function (candidate) { return candidate.number === wave; });
	if (!definition) throw new RangeError(`Unknown Iron Wake wave: ${wave}`);
	return definition;
};
export const getDifficultyDefinition = function (difficulty: Difficulty): DifficultyDefinition {
	const definition = DIFFICULTIES.find(function (candidate) { return candidate.id === difficulty; });
	if (!definition) throw new RangeError(`Unknown Iron Wake difficulty: ${difficulty}`);
	return definition;
};
