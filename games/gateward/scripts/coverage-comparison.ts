import { build, createState, invested, step } from '../src/simulation';
import { runSpendingControl } from './combat-pressure';

const fittings = { port: [0, 3], starboard: [4, 7], split: [0, 4] } as const;
// Full Voyage rules, a bounded mirrored opening attack, no spending after fitting.
// This fixture isolates placement; it is not a new playable mission.
export const runFlankComparison = function (coverageDegrees: 120 | 240 | 360, fitting: keyof typeof fittings, flank: -1 | 1) {
	const state = createState({ coverageDegrees });
	for (const mount of fittings[fitting]) build(state, mount, 'rail');
	const spent = state.mounts.reduce(function (total, mount) { return total + invested(mount); }, 0);
	state.nextWave = Infinity;
	state.arrivals = [{ at: 0, kind: 'bomber', x: -96, y: flank * 340 }, { at: 0, kind: 'bomber', x: 96, y: flank * 340 }];
	state.status = 'running';
	let minimumShield = state.systems.shield.charge;
	for (let tick = 0; tick < 30 * 60; tick++) {
		step(state, 1 / 60);
		minimumShield = Math.min(minimumShield, state.systems.shield.charge);
	}
	return { coverageDegrees, fitting, flank: flank < 0 ? 'port' : 'starboard', spent, kills: state.kills, hull: state.hull, minimumShield };
};
if (import.meta.main) {
	for (const coverage of [360, 240, 120] as const) {
		console.table(Object.keys(fittings).flatMap(function (fitting) {
			if (fitting !== 'port' && fitting !== 'starboard' && fitting !== 'split') throw new Error('Unknown fitting');
			return ([-1, 1] as const).map(function (flank) { return runFlankComparison(coverage, fitting, flank); });
		}));
		const { purchases, samples, ...summary } = runSpendingControl(coverage);
		console.log({ coverage, ...summary, spent: purchases.reduce(function (sum, purchase) { return sum + purchase.cost; }, 0), purchaseCount: purchases.length, sampleCount: samples.length });
	}
}
