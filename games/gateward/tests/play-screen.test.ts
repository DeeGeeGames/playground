import { tactical } from '../src/combat-scale';
import { describe, expect, test } from 'bun:test';
import { contactDescription, inspectorName, presetFor } from '../src/play-screen';
import { createState } from '../src/simulation';
import { POWER_PRESETS } from '../src/systems';

describe('play screen information', function () {
	test('custom power never highlights a preset', function () {
		expect(presetFor({ engines: 4, weapons: 3, shields: 3 })).toBeUndefined();
		for (const [name, split] of Object.entries(POWER_PRESETS)) expect(presetFor(split)).toBe(name);
	});
	test('contact inspector responds to sensor degradation without leaking classification or hull', function () {
		const state = createState();
		const enemy = { id: 900, kind: 'bomber' as const, x: state.ark.x + tactical(300), y: state.ark.y, hp: 41, maxHp: 95, cooldown: 0 };
		state.enemies.push(enemy); state.priority = enemy.id;
		expect(contactDescription(state, enemy.id)).toContain('bomber');
		state.systems.sensors.integrity = 20;
		expect(contactDescription(state, enemy.id)).toBe('Priority target. Unclassified contact · within detection range');
		state.systems.sensors.integrity = 0;
		expect(contactDescription(state, enemy.id)).not.toContain('bomber');
		expect(contactDescription(state, enemy.id)).not.toContain('41');
		enemy.hp = 0;
		expect(contactDescription(state, enemy.id)).toContain('No selected contact');
	});
	test('only supported inspector sections can be opened', function () {
		expect(inspectorName('mounts')).toBe('mounts');
		expect(inspectorName('unknown')).toBeUndefined();
	});
});
