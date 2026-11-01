import { build, createState, step, upgrade, type State, type Weapon } from '../src/simulation';

const initial: readonly (readonly [number, Weapon])[] = [[0, 'flak'], [3, 'rail'], [4, 'flak']];
const expansion: readonly (readonly [number, Weapon])[] = [[7, 'rail'], [1, 'missile'], [6, 'missile'], [2, 'flak'], [5, 'flak']];

// Issue #51's control: orders at t=0 and every simulated second, before stepping.
// Sample every tick so sector-clear healing cannot hide damage.
interface ControlResult {
	status: State['status']; time: number; kills: number;
	minimumHull: number; finalHull: number; minimumShield: number; minimumSensors: number;
	impairments: number;
	purchases: { time: number; mount: number; action: string; cost: number }[];
	samples: { time: number; hull: number; shield: number; sensors: number; salvage: number }[];
}
export const runSpendingControl = function (coverageDegrees: 120 | 240 | 360 = 360): ControlResult {
	const state = createState({ coverageDegrees });
	for (const [mount, weapon] of initial) build(state, mount, weapon);
	state.status = 'running';
	let minimumHull = state.hull;
	let minimumShield = state.systems.shield.charge;
	let minimumSensors = state.systems.sensors.integrity;
	const samples: { time: number; hull: number; shield: number; sensors: number; salvage: number }[] = [];
	const purchases: { time: number; mount: number; action: string; cost: number }[] = [];
	const recordPurchase = function (mount: number, action: string, order: (state: State) => boolean) {
		const before = state.salvage;
		if (order(state)) purchases.push({ time: state.time, mount, action, cost: before - state.salvage });
	};
	for (let second = 0; second < 840 && state.status === 'running'; second++) {
		for (const [mount, weapon] of expansion) recordPurchase(mount, weapon, function (current) { return build(current, mount, weapon); });
		for (let mount = 0; mount < 8; mount++) recordPurchase(mount, 'upgrade', function (current) { return upgrade(current, mount); });
		for (let tick = 0; tick < 60 && state.status === 'running'; tick++) {
			step(state, 1 / 60);
			minimumHull = Math.min(minimumHull, state.hull);
			minimumShield = Math.min(minimumShield, state.systems.shield.charge);
			minimumSensors = Math.min(minimumSensors, state.systems.sensors.integrity);
		}
		samples.push({ time: state.time, hull: state.hull, shield: state.systems.shield.charge, sensors: state.systems.sensors.integrity, salvage: state.salvage });
	}
	return {
		status: state.status, time: state.time, kills: state.kills,
		minimumHull, finalHull: state.hull, minimumShield, minimumSensors,
		impairments: state.systems.sensors.impairments, purchases, samples,
	};
};

if (import.meta.main) console.log(JSON.stringify(runSpendingControl(), null, 2));
