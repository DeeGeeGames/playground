import { tactical } from '../src/combat-scale';
import { assignGuardian, build, createState, deploy, placeInterdiction, repair, repairSensors, scramble, setAllocation, step, type Sector } from '../src/simulation';
import { POWER_PRESETS } from '../src/systems';
import { worldPoint } from '../src/space';
import { systemsSummary } from '../src/trial-summary';

export const runTrialStrategy = function (preset: keyof typeof POWER_PRESETS | 'weapons-then-balanced', field = false) {
	const state = createState({ scenario: 'systems' });
	build(state, 0, 'rail'); build(state, 4, 'flak'); deploy(state, 'guardian'); deploy(state, 'interceptor');
	setAllocation(state, POWER_PRESETS[preset === 'weapons-then-balanced' ? 'weapons' : preset]); state.status = 'running';
	const orders: { at: number; sector: Sector; wing?: boolean }[] = [
		{ at: 7, sector: 'port', wing: true }, { at: 23, sector: 'starboard' },
		{ at: 54, sector: 'port', wing: true }, { at: 75, sector: 'ahead' }, { at: 98, sector: 'astern' },
	];
	const repairs: { at: number; kind: 'hull' | 'sensors' }[] = [];
	let reallocated = false;
	let nextOrder = 0; let fieldAttempted = false; let refitAttempted = false;
	for (let tick = 0; tick < 10000 && state.status === 'running'; tick++) {
		if (preset === 'weapons-then-balanced' && !reallocated && state.time >= 50) { setAllocation(state, POWER_PRESETS.balanced); reallocated = true; }
		const order = orders[nextOrder];
		if (order && state.time >= order.at) {
			const wing = state.wings[0]; const guardian = state.escorts.find(function (escort) { return escort.kind === 'guardian'; });
			if (order.wing && wing) scramble(state, wing.id, order.sector);
			else if (guardian) assignGuardian(state, guardian.id, order.sector);
			nextOrder++;
		}
		if (field && !fieldAttempted && state.time >= 20) { placeInterdiction(state, worldPoint(state, { x: tactical(300), y: 0 })); fieldAttempted = true; }
		if (!refitAttempted && state.time >= 45) { build(state, 7, 'rail'); refitAttempted = true; }
		if (state.hull < 800 && repair(state)) repairs.push({ at: state.time, kind: 'hull' });
		if (state.systems && state.systems.sensors.integrity < 55 && repairSensors(state)) repairs.push({ at: state.time, kind: 'sensors' });
		step(state, 1 / 60);
	}
	return { state, repairs, summary: systemsSummary(state) };
};

if (import.meta.main) {
	const strategies = ['balanced', 'engines', 'weapons', 'shields', 'weapons-then-balanced'] as const;
	const comparisons = strategies.map(function (strategy) {
		const { summary } = runTrialStrategy(strategy); if (!summary) throw new Error('Missing trial summary');
		return { strategy, ...summary };
	});
	const { summary } = runTrialStrategy('balanced', true); if (!summary) throw new Error('Missing field comparison');
	console.log(JSON.stringify([...comparisons, { strategy: 'balanced + field', ...summary }], null, 2));
}
