import { WAVE_COUNT, type State } from './simulation';
import { powerOutputs } from './systems';

export interface SystemsSummary {
	result: State['status']; reason: State['resultReason']; elapsed: number;
	distance: number; routeLength: number; eta: number | null;
	hull: number; shield: number; shieldAbsorbed: number; powerChanges: number;
	contacts: number; totalContacts: number; kills: number;
	sensorImpairments: number; sensorRepairs: number; fieldPlacements: number;
	redirected: number; escortLosses: number; salvage: number;
}

export const systemsSummary = function (state: State): SystemsSummary {
	const systems = state.systems;
	const remaining = Math.max(0, systems.routeLength - systems.distanceTraveled);
	const speed = powerOutputs(systems.allocation).speed;
	return {
		result: state.status, reason: state.resultReason, elapsed: state.time,
		distance: systems.distanceTraveled, routeLength: systems.routeLength,
		eta: remaining === 0 ? 0 : speed > 0 ? remaining / speed : null,
		hull: state.hull, shield: systems.shield.charge, shieldAbsorbed: systems.shieldAbsorbed,
		powerChanges: systems.powerChanges, contacts: state.wave,
		totalContacts: state.scenario?.encounters.length ?? WAVE_COUNT, kills: state.kills,
		sensorImpairments: systems.sensors.impairments, sensorRepairs: systems.sensors.repairs,
		fieldPlacements: systems.interdiction.placements, redirected: systems.interdiction.redirected,
		escortLosses: state.escortLosses, salvage: state.salvage,
	};
};

export const systemsResultMessage = function (state: State): string {
	const systems = state.systems;
	if (state.status !== 'won' && state.status !== 'lost') return '';
	if (!state.scenario) return state.status === 'won' ? 'Kepler reached. The ark broke through; surviving hostiles were left behind.' : 'Ark destroyed before reaching Kepler. Review shields, coverage and repair timing.';
	if (state.status === 'won') return `Kepler reached and every required contact resolved${state.scenario?.deadline === undefined ? '.' : ' before the deadline.'}`;
	if (state.resultReason !== 'deadline') return 'Ark destroyed before arrival and contact clearance. Review shields, coverage and repair timing.';
	const remaining = Math.max(0, systems.routeLength - systems.distanceTraveled);
	if (remaining > 0) return `Deadline missed with ${Math.ceil(remaining)}m left to travel. More engine power shortens arrival time.`;
	const unresolved = state.wave < (state.scenario?.encounters.length ?? WAVE_COUNT) || state.enemies.length > 0 || state.arrivals.length > 0;
	return unresolved ? 'Gate reached, but required contacts remained unresolved at the deadline. Review weapon power and escort coverage.' : 'Arrival completed at the deadline. Arrival and contact clearance must finish before the time limit.';
};
