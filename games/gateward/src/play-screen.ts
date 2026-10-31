import { contactIntel } from './sensors';
import type { State } from './simulation';
import { POWER_CHANNELS, POWER_PRESETS, type Allocation } from './systems';

export type Inspector = 'mounts' | 'reactor' | 'escorts' | 'sensors' | 'field' | 'contact';
export const inspectorName = function (value: string | undefined): Inspector | undefined {
	return value === 'mounts' || value === 'reactor' || value === 'escorts' || value === 'sensors' || value === 'field' || value === 'contact' ? value : undefined;
};
export const presetFor = function (allocation: Readonly<Allocation>) {
	return Object.entries(POWER_PRESETS).find(function ([, preset]) {
		return POWER_CHANNELS.every(function (channel) { return allocation[channel] === preset[channel]; });
	})?.[0];
};
export const contactDescription = function (state: State, id: number | undefined): string {
	const enemy = state.enemies.find(function (contact) { return contact.id === id && contact.hp > 0; });
	if (!enemy) return 'No selected contact remains. Select a hostile on the battlefield.';
	const intel = contactIntel(state, enemy);
	if (intel === 'unseen') return 'Contact outside sensor range. Nearby defense remains automatic.';
	const priority = state.priority === enemy.id ? 'Priority target. ' : '';
	return intel === 'classified'
		? `${priority}${enemy.kind} · ${Math.ceil(enemy.hp)} / ${enemy.maxHp} hull · ${Math.round(Math.hypot(enemy.x - state.ark.x, enemy.y - state.ark.y))}m away`
		: `${priority}Unclassified contact · within detection range`;
};
