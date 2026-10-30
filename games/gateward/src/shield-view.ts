import type { State } from './simulation';

// Presentation derives entirely from simulation timers, so pause freezes hits too.
export const shieldAppearance = function (state: State) {
	const shield = state.systems?.shield;
	return {
		aegisVisible: state.aegisRemaining > 0,
		energyVisible: !!shield && (shield.charge > 0 || shield.hitFlash > 0),
		energyOpacity: shield ? 0.012 + Math.min(1, shield.hitFlash / 0.25) * 0.09 : 0,
		energyColor: shield?.charge === 0 ? '#efad79' : '#75bfe8',
	};
};
