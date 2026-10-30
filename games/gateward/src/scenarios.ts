import type { EnemyKind, Sector } from './simulation';
export interface Encounter { at: number; sector: Sector; kind: EnemyKind; count: number; spacing: number }
export interface Scenario { name: string; duration: number; salvage: number; encounters: readonly Encounter[] }
export const ESCORT_DRILL: Scenario = {
	name: 'Escort Drill', duration: 90, salvage: 300,
	encounters: [
		{ at: 10, sector: 'port', kind: 'raider', count: 8, spacing: 0.65 },
		{ at: 23, sector: 'starboard', kind: 'bomber', count: 4, spacing: 1 },
		{ at: 49, sector: 'port', kind: 'armored', count: 3, spacing: 1 },
		{ at: 52, sector: 'ahead', kind: 'raider', count: 9, spacing: 0.5 },
	],
};
