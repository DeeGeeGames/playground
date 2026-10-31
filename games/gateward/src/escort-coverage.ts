import type { EscortKind, Point, Sector, State } from './simulation';
import { localPoint, worldPoint } from './space';

export const COVERAGE_SECTORS = ['ahead', 'starboard', 'astern', 'port'] as const;
export const SECTOR_NAMES: Record<Sector, string> = { ahead: 'Fore', astern: 'Aft', port: 'Port', starboard: 'Starboard' };
export const COVERAGE_PRIORITIES = ['off', 'low', 'normal', 'high', 'all'] as const;
export type CoveragePriority = typeof COVERAGE_PRIORITIES[number];
export type RegularPriority = Exclude<CoveragePriority, 'all'>;
export interface EscortCoverage {
	enabled: boolean;
	priorities: Record<Sector, RegularPriority>;
	all: Sector | undefined;
}
export const createEscortCoverage = function (): EscortCoverage {
	return { enabled: true, priorities: { port: 'normal', starboard: 'normal', ahead: 'normal', astern: 'normal' }, all: undefined };
};
export const isCoveragePriority = function (value: string): value is CoveragePriority {
	return COVERAGE_PRIORITIES.some(function (priority) { return priority === value; });
};
export const coverageWeight = function (coverage: EscortCoverage, sector: Sector): number {
	if (coverage.all) return Number(coverage.all === sector);
	return { off: 0, low: 1, normal: 2, high: 3 }[coverage.priorities[sector]];
};
export const pointSector = function (state: State, point: Point): Sector {
	const local = localPoint(state, point);
	return Math.abs(local.x) >= Math.abs(local.y) ? local.x >= 0 ? 'ahead' : 'astern' : local.y >= 0 ? 'starboard' : 'port';
};
export interface CoverageGroup { readonly id: string; readonly kind: EscortKind; readonly craft: readonly number[]; readonly sector: Sector | undefined }
export const coverageGroups = function (state: State): readonly CoverageGroup[] {
	return [
		...state.wings.filter(function (wing) { return wing.craft.some(function (craft) { return craft.hp > 0; }); }).map(function (wing): CoverageGroup { return { id: `wing-${wing.id}`, kind: 'interceptor', craft: wing.craft.filter(function (craft) { return craft.hp > 0; }).map(function (craft) { return craft.id; }), sector: wing.assignment }; }),
		...state.escorts.filter(function (craft) { return craft.hp > 0 && craft.wingId === undefined; }).map(function (craft): CoverageGroup { return { id: `craft-${craft.id}`, kind: craft.kind, craft: [craft.id], sector: craft.sector }; }),
	];
};

// Allocate each role separately. Keep wings intact and retain existing stations
// whenever they satisfy the quotas, so assignments do not churn each tick.
export const coveragePlan = function (state: State): ReadonlyMap<string, Sector | undefined> {
	const groups = coverageGroups(state); const result = new Map<string, Sector | undefined>();
	const sectors = ['port', 'starboard', 'ahead', 'astern'] as const;
	const total = sectors.reduce(function (sum, sector) { return sum + coverageWeight(state.coverage, sector); }, 0);
	for (const kind of ['interceptor', 'guardian'] as const) {
		const role = groups.filter(function (group) { return group.kind === kind; });
		const quotas = sectors.map(function (sector, index) { const exact = total ? role.length * coverageWeight(state.coverage, sector) / total : 0; return { sector, index, exact, count: Math.floor(exact) }; });
		const remainder = total ? role.length - quotas.reduce(function (sum, quota) { return sum + quota.count; }, 0) : 0;
		const ranked = [...quotas].sort(function (a, b) { return (b.exact - b.count) - (a.exact - a.count) || a.index - b.index; });
		for (const quota of ranked.slice(0, remainder)) quota.count++;
		for (const group of role) { const quota = quotas.find(function (quota) { return quota.sector === group.sector && quota.count > 0; }); if (quota) { result.set(group.id, quota.sector); quota.count--; } }
		for (const group of role) { if (result.has(group.id)) continue; const quota = quotas.find(function (quota) { return quota.count > 0; }); result.set(group.id, quota?.sector); if (quota) quota.count--; }
	}
	return result;
};

export const coverageStation = function (state: State, craftId: number, sector: Sector | undefined): Point {
	if (!sector) return worldPoint(state, { x: -100, y: 0 });
	const craft = state.escorts.find(function (craft) { return craft.id === craftId; });
	const peers = state.escorts.filter(function (other) { return other.hp > 0 && other.sector === sector && other.kind === craft?.kind; }).sort(function (a, b) { return a.id - b.id; });
	const index = Math.max(0, peers.findIndex(function (other) { return other.id === craftId; }));
	const spread = (index - (peers.length - 1) / 2) * 30;
	const radius = craft?.kind === 'guardian' ? 230 : 280;
	const offset = sector === 'ahead' ? { x: radius, y: spread } : sector === 'astern' ? { x: -radius, y: spread } : sector === 'port' ? { x: spread, y: -radius } : { x: spread, y: radius };
	return worldPoint(state, offset);
};
export const coverageReadiness = function (state: State, sector: Sector) {
	const plan = coveragePlan(state); const groups = coverageGroups(state).filter(function (group) { return plan.get(group.id) === sector; });
	const ids = new Set(groups.flatMap(function (group) { return [...group.craft]; }));
	const active = state.escorts.filter(function (craft) { const wing = state.wings.find(function (wing) { return wing.id === craft.wingId; }); return ids.has(craft.id) && craft.sector === sector && craft.hp > 0 && (!wing || wing.phase === 'sortie'); });
	const onStation = active.filter(function (craft) { const station = coverageStation(state, craft.id, sector); return pointSector(state, craft) === sector && Math.hypot(craft.x - station.x, craft.y - station.y) <= 180; }).length;
	return { planned: ids.size, onStation, inbound: active.length - onStation, unavailable: ids.size - active.length };
};
