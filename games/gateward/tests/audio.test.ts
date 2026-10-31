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
	for (const mount of state.mounts) mount.aim = Math.atan2(-140 - mount.y, -80 - mount.x);
	step(state, 1 / 60);
	expect(read(state)).toEqual(['flak', 'contact']); expect(read(state)).toEqual([]);
	state.paused = true;
	for (let i = 0; i < 120; i++) { step(state, 1 / 60); expect(read(state)).toEqual([]); }
	state.paused = false;
	const enemy = state.enemies[0]; if (enemy) enemy.hp = 0;
	step(state, 1 / 60); expect(read(state)).toContain('explosion'); expect(read(state)).toEqual([]);
});

test('point-blank railgun fire is audible even when its projectile hits in the same step', function () {
	const read = createSoundObserver(); const state = createState();
	build(state, 0, 'rail'); state.status = 'running';
	state.systems.allocation = { engines: 0, weapons: 4, shields: 6 };
	state.enemies.push({ id: state.nextId++, kind: 'armored', x: -96, y: -53, hp: 260, maxHp: 260, cooldown: 10 });
	read(state); step(state, 1 / 60);
	expect(state.shots).toHaveLength(0);
	expect(read(state)).toEqual(['rail', 'impact']);
	expect(read(state)).toEqual([]);
});

test('hidden approaches stay silent until their first real detection, then cue once', function () {
	const state = createState({ scenario: 'drill' });
	state.status = 'running';
	const read = createSoundObserver(); read(state); step(state, 1 / 60);
	expect(state.wave).toBe(1); expect(read(state)).not.toContain('contact');
	state.nextWave = Infinity; state.arrivals = [];
	const enemy = state.enemies[0]; if (!enemy) throw new Error('Missing approach');
	state.enemies = [enemy];
	enemy.x = state.ark.x; enemy.y = state.ark.y - 1500;
	expect(read(state)).toContain('contact'); expect(read(state)).not.toContain('contact');
	state.systems.sensors.integrity = 0; read(state);
	enemy.y = state.ark.y - 1000;
	expect(read(state)).not.toContain('contact');
	state.systems.sensors.integrity = 100;
	expect(read(state)).toContain('contact'); expect(read(state)).not.toContain('contact');
});
