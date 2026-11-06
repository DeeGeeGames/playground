import { expect, test } from 'bun:test';
import { createTraining, stepTraining, type Training } from '../src/training';
import type { Controls } from '../src/simulation';

const idle = function (training: Training): Controls {
	return { aim: training.state.enemies[0] ?? training.state.player, drive: 0, turn: 0, stop: false, fire: [false, false, false, false], coolant: false };
};
const advanceToEvasion = function (training: Training) {
	for (let tick = 0; tick < 60 * 60 && training.stage !== 'evade'; tick++) {
		const stage = training.stage;
		stepTraining(training, { ...idle(training), drive: stage === 'drive' ? 1 : 0, stop: stage === 'neutral', turn: stage === 'steer' ? 1 : 0, fire: [stage === 'cannon', stage === 'heat' || stage === 'combined', stage === 'missiles', stage === 'combined'], coolant: stage === 'coolant' }, 1 / 60);
	}
	expect(training.stage).toBe('evade');
};

test('the real control sequence completes training without spawning an assault or ending the operation', function () {
	const training = createTraining();
	advanceToEvasion(training);
	for (let tick = 0; tick < 600 && training.stage !== 'complete'; tick++) stepTraining(training, { ...idle(training), drive: training.strikeIssued ? 1 : 0 }, 1 / 60);
	expect(training.stage).toBe('complete');
	expect(training.state.wave).toBe(1);
	expect(training.state.spawned).toBe(0);
	expect(training.state.player.hp).toBe(100);
	expect(training.state.relay).toBe(100);
	expect(training.state.outcome).toBe('playing');
	const stoppedAt = training.state.time;
	stepTraining(training, { ...idle(training), drive: 1, fire: [true, false, false, false] }, 1 / 60);
	expect(training.state.time).toBe(stoppedAt);
	expect(training.state.events).toEqual([]);
});

test('missing the artillery exercise retries safely and coolant instruction cannot cool into a dead end', function () {
	const training = createTraining();
	for (let tick = 0; tick < 3600 && training.stage !== 'coolant'; tick++) {
		const stage = training.stage;
		stepTraining(training, { ...idle(training), drive: stage === 'drive' ? 1 : 0, stop: stage === 'neutral', turn: stage === 'steer' ? 1 : 0, fire: [stage === 'cannon', stage === 'heat' || stage === 'combined', stage === 'missiles', stage === 'combined'] }, 1 / 60);
	}
	expect(training.stage).toBe('coolant');
	for (let tick = 0; tick < 3600; tick++) stepTraining(training, idle(training), 1 / 60);
	stepTraining(training, { ...idle(training), coolant: true }, 1 / 60);
	expect(training.stage).toBe('evade');
	for (let tick = 0; tick < 420; tick++) stepTraining(training, idle(training), 1 / 60);
	expect(training.stage).toBe('evade');
	expect(training.state.player.hp).toBe(100);
	for (let tick = 0; tick < 600 && training.stage !== 'complete'; tick++) stepTraining(training, { ...idle(training), drive: training.strikeIssued ? 1 : 0 }, 1 / 60);
	expect(training.stage).toBe('complete');
});

test('entering evasion from an outward-facing arena boundary still gives the instructed forward escape', function () {
	const training: Training = { ...createTraining(), stage: 'coolant' };
	training.state.player.x = 35; training.state.player.y = 600; training.state.player.angle = Math.PI;
	stepTraining(training, { ...idle(training), coolant: true }, 1 / 60);
	expect(training.stage).toBe('evade');
	for (let tick = 0; tick < 600 && training.stage !== 'complete'; tick++) stepTraining(training, { ...idle(training), drive: training.strikeIssued ? 1 : 0 }, 1 / 60);
	expect(training.stage).toBe('complete');
});

// This drill must exercise simultaneous mounts, including the new fourth input.
test('combined-fire drill rejects one mount and accepts two held mounts including mount four', function () {
	const training: Training = { ...createTraining(), stage: 'combined' };
	for (let tick = 0; tick < 90; tick++) stepTraining(training, { ...idle(training), fire: [false, false, false, true] }, 1 / 60);
	expect(training.stage).toBe('combined');
	expect(training.state.stats.shotsFired).toBeGreaterThan(0);
	for (let tick = 0; tick < 49; tick++) stepTraining(training, { ...idle(training), fire: [false, true, false, true] }, 1 / 60);
	expect(training.stage).toBe('heat');
});
