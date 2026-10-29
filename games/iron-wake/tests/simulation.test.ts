import { describe, expect, test } from 'bun:test';
import { angleDelta, createState, step, type Controls, type State } from '../src/simulation';
const idle: Controls = { drive: 0, turn: 0, aim: { x: 900, y: 200 }, cannon: false, laser: false, missile: false };
const run = function (state: State, seconds: number, input = idle) { for (let i = 0; i < seconds * 60; i++) step(state, input, 1 / 60); };
const target = function (state: State, x = 900, y = 580) { state.enemies.push({ id: state.nextId++, x, y, angle: 0, cooldown: 100, hp: 100, heavy: false }); };
describe('Iron Wake combat', function () {
	test('heavy drive accelerates gradually and turning uses the shortest angle', function () {
		const state = createState(); run(state, 0.1, { ...idle, drive: 1 });
		expect(state.player.speed).toBeGreaterThan(0); expect(state.player.speed).toBeLessThan(20);
		expect(Math.abs(angleDelta(Math.PI - 0.1, -Math.PI + 0.1) - 0.2)).toBeLessThan(0.001);
	});
	test('cannon shell damages a target and has a reload interval', function () {
		const state = createState(); target(state); run(state, 0.4, { ...idle, cannon: true });
		expect(state.enemies[0]?.hp).toBe(62); expect(state.cannonIn).toBeGreaterThan(0);
	});
	test('laser hits the nearest target and overheats under sustained fire', function () {
		const state = createState(); target(state); target(state, 900, 500);
		run(state, 0.2, { ...idle, laser: true });
		expect(state.enemies[0]?.hp).toBeLessThan(100); expect(state.enemies[1]?.hp).toBe(100);
		run(state, 3.5, { ...idle, laser: true }); expect(state.player.overheated).toBe(true);
		const heat = state.player.heat; run(state, 0.2, { ...idle, cannon: true });
		expect(state.cannonIn).toBe(0); expect(state.player.heat).toBeLessThan(heat);
		run(state, 6); expect(state.player.overheated).toBe(false);
	});
	test('missiles lock closest to aim and salvo cannot spam', function () {
		const state = createState(); target(state); target(state, 1000, 550);
		step(state, { ...idle, missile: true, aim: { x: 1000, y: 550 } }, 1 / 60);
		expect(state.shots).toHaveLength(3); expect(state.shots.every(function (shot) { return shot.target === 2; })).toBe(true);
		step(state, { ...idle, missile: true }, 1 / 60); expect(state.shots).toHaveLength(3);
	});
	test('relay destruction loses and terminal states freeze', function () {
		const state = createState(); state.relay = 0; step(state, idle, 1 / 60);
		expect(state.outcome).toBe('lost'); const time = state.time; run(state, 1); expect(state.time).toBe(time);
	});
	test('clear waves repair armor and final wave wins', function () {
		const state = createState(); state.player.hp = 50; state.spawned = 5; run(state, 4.1);
		expect(state.wave).toBe(2); expect(state.player.hp).toBe(70);
		state.wave = 3; state.spawned = 9; state.enemies = []; state.shots = []; state.intermission = 0; run(state, 4.1);
		expect(state.outcome).toBe('won');
	});
	test('ignoring the assault eventually loses the relay', function () {
		const state = createState(); run(state, 160); expect(state.outcome).toBe('lost');
	});
});
