import { WAVE_COUNT, type State } from './simulation';
import { effectiveOutputs } from './systems';

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
	const speed = effectiveOutputs(systems).speed;
	return {
		result: state.status, reason: state.resultReason, elapsed: state.time,
		distance: systems.distanceTraveled, routeLength: systems.routeLength,
		eta: remaining === 0 ? 0 : speed > 0 ? remaining / speed : null,
		hull: state.hull, shield: systems.shield.charge, shieldAbsorbed: systems.shieldAbsorbed,
		powerChanges: systems.powerChanges, contacts: state.wave,
		totalContacts: WAVE_COUNT, kills: state.kills,
		sensorImpairments: systems.sensors.impairments, sensorRepairs: systems.sensors.repairs,
		fieldPlacements: systems.interdiction.placements, redirected: systems.interdiction.redirected,
		escortLosses: state.escortLosses, salvage: state.salvage,
	};
};

export const systemsResultMessage = function (state: State): string {
	if (state.status !== 'won' && state.status !== 'lost') return '';
	return state.status === 'won' ? 'Kepler reached. The ark broke through; surviving hostiles do not block arrival.' : 'Ark destroyed before reaching Kepler. Review shields, coverage and repair timing.';
};
