import { expect, test } from 'bun:test';
import { createSoundObserver } from '../src/audio-events';
import { build, createState, pulse, repair, step } from '../src/simulation';

test('audio observes real orders once and resets across voyages', function () {
	const read = createSoundObserver(); const state = createState();
	expect(read(state)).toEqual([]);
	state.status = 'running';
	expect(read(state)).toEqual(['depart']);
	expect(read(state)).toEqual([]);
	pulse(state); expect(read(state)).toEqual(['pulse']);
	pulse(state); expect(read(state)).toEqual([]);
	state.hull -= 100; expect(read(state)).toEqual(['damage']);
	repair(state); expect(read(state)).toEqual(['repair']);
	state.status = 'lost'; expect(read(state)).toEqual(['lost']);
	expect(read(createState())).toEqual([]);
});

test('combat sounds are deduplicated and paused simulation produces no new cues', function () {
	const read = createSoundObserver(); const state = createState();
	build(state, 0, 'flak'); build(state, 1, 'flak');
	state.status = 'running'; read(state);
	state.enemies.push({ id: state.nextId++, kind: 'armored', x: -80, y: -140, hp: 260, maxHp: 260, cooldown: 10 });
	step(state, 1 / 60);
	expect(read(state)).toEqual(['flak']); expect(read(state)).toEqual([]);
	state.paused = true;
	for (let i = 0; i < 120; i++) { step(state, 1 / 60); expect(read(state)).toEqual([]); }
	state.paused = false;
	const enemy = state.enemies[0]; if (enemy) enemy.hp = 0;
	step(state, 1 / 60); expect(read(state)).toContain('explosion'); expect(read(state)).toEqual([]);
});

test('point-blank railgun fire is audible even when its projectile hits in the same step', function () {
	const read = createSoundObserver(); const state = createState();
	build(state, 0, 'rail'); state.status = 'running';
	state.enemies.push({ id: state.nextId++, kind: 'armored', x: -96, y: -53, hp: 260, maxHp: 260, cooldown: 10 });
	read(state); step(state, 1 / 60);
	expect(state.shots).toHaveLength(0);
	expect(read(state)).toEqual(['rail', 'impact']);
	expect(read(state)).toEqual([]);
});

test('a hidden systems encounter does not leak its arrival through the contact cue', function () {
	const state = createState({ scenario: 'drill', systems: true }); const sensors = state.systems?.sensors;
	if (!sensors) throw new Error('Missing sensors');
	sensors.integrity = 0; state.status = 'running'; state.time = 9.99;
	state.enemies.push({ id: state.nextId++, kind: 'raider', x: 0, y: -100, hp: 45, maxHp: 45, cooldown: 99 });
	const read = createSoundObserver(); read(state); step(state, 1 / 60);
	expect(state.wave).toBe(1); expect(read(state)).not.toContain('contact');
	const healthy = createState({ scenario: 'drill', systems: true }); healthy.status = 'running'; healthy.time = 9.99;
	read(healthy); step(healthy, 1 / 60); expect(read(healthy)).toContain('contact');
});
