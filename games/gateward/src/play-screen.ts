import { contactIntel } from './sensors';
import { covered, coverageFor, distance, type State } from './simulation';
import { mountWorld } from './space';
import { POWER_CHANNELS, POWER_PRESETS, type Allocation } from './systems';

// Only the explicit trial opts Full Voyage into directional coverage.
export const voyageCoverage = function (search: string): 240 | 360 {
	return new URLSearchParams(search).get('coverage') === '240' ? 240 : 360;
};
export const priorityCoverage = function (state: State, selected: number): string {
	const target = state.enemies.find(function (enemy) { return enemy.id === state.priority && enemy.hp > 0; });
	const mount = state.mounts[selected];
	if (!target || !mount?.weapon || contactIntel(state, target) === 'unseen') return '';
	const name = `Mount ${selected + 1}`;
	if (distance(mountWorld(state, mount), target) > coverageFor(state, mount).range + 1e-8) return `${name}: priority outside range.`;
	return covered(state, mount, target) ? `${name}: priority within range and coverage; turret must turn before firing.` : `${name}: priority outside firing arc; other eligible weapons may engage.`;
};

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
