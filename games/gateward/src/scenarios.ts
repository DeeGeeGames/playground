import type { EnemyKind, Sector } from './simulation';
export interface Encounter { at: number; sector: Sector; kind: EnemyKind; count: number; spacing: number }
export interface Scenario { name: string; duration: number; deadline?: number; salvage: number; encounters: readonly Encounter[] }
export const ESCORT_DRILL: Scenario = {
	name: 'Escort Drill', duration: 90, salvage: 300,
	encounters: [
		{ at: 10, sector: 'port', kind: 'raider', count: 8, spacing: 0.65 },
		{ at: 23, sector: 'starboard', kind: 'bomber', count: 4, spacing: 1 },
		{ at: 49, sector: 'port', kind: 'armored', count: 3, spacing: 1 },
		{ at: 52, sector: 'ahead', kind: 'raider', count: 9, spacing: 0.5 },
	],
};

export const SYSTEMS_TRIAL: Scenario = {
	name: 'Systems Trial', duration: 120, deadline: 155, salvage: 500,
	encounters: [
		{ at: 8, sector: 'port', kind: 'raider', count: 8, spacing: 0.65 },
		{ at: 26, sector: 'starboard', kind: 'bomber', count: 6, spacing: 1 },
		{ at: 58, sector: 'port', kind: 'armored', count: 3, spacing: 1 },
		{ at: 72, sector: 'ahead', kind: 'raider', count: 10, spacing: 0.5 },
		{ at: 98, sector: 'astern', kind: 'bomber', count: 3, spacing: 1 },
	],
};
