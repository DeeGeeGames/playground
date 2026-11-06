import { createMount } from './arsenal';
import { angleDelta, createState, distance, step, type Controls, type Point, type State } from './simulation';

export const TRAINING_STAGES = ['drive', 'neutral', 'steer', 'cannon', 'missiles', 'combined', 'heat', 'coolant', 'evade', 'complete'] as const;
export type TrainingStage = typeof TRAINING_STAGES[number];
export interface Training {
	state: State;
	stage: TrainingStage;
	distance: number;
	turn: number;
	combinedTime: number;
	startedAt: number;
	strikeOrigin: Point | undefined;
	strikeIssued: boolean;
}

// A separate, unscored range uses the same drive, weapons and warning rules as
// the operation. It never owns or writes the player's profile.
export const createTraining = function (): Training {
	const state = createState({ difficulty: 'story' });
	state.loadout = [createMount('autocannon'), createMount('laser'), createMount('cluster-missiles'), createMount('machine-gun')];
	state.spawnIn = 3600; state.draftsEnabled = false;
	return { state, stage: 'drive', distance: 0, turn: 0, combinedTime: 0, startedAt: 0, strikeOrigin: undefined, strikeIssued: false };
};

const placeTarget = function (state: State) {
	const p = state.player;
	const x = Math.max(80, Math.min(1720, p.x + Math.cos(p.turret) * 140));
	const y = Math.max(80, Math.min(1120, p.y + Math.sin(p.turret) * 140));
	state.enemies = [{ id: state.nextId++, x, y, angle: Math.atan2(p.y - y, p.x - x), hp: 150, maxHp: 150, cooldown: 3600, heavy: false, kind: 'scout' }];
};

const advance = function (training: Training, stage: TrainingStage) {
	training.stage = stage;
	training.startedAt = training.state.time;
	if (stage === 'cannon' || stage === 'missiles' || stage === 'combined') placeTarget(training.state);
	if (stage === 'combined') { training.state.player.heat = 0; training.state.player.overheated = false; }
	if (stage === 'heat') { training.state.enemies = []; training.state.player.heat = 0; }
	if (stage === 'coolant') training.state.coolantCharges = 3;
	if (stage === 'evade') {
		// Start the committed-strike exercise with clear runway in every direction.
		training.state.player.x = 900; training.state.player.y = 780;
		training.state.player.angle = -Math.PI / 2; training.state.player.turret = -Math.PI / 2;
		training.state.player.throttle = 0;
		training.state.player.speed = 0;
		training.state.shots = [];
		training.state.enemies = [];
	}
};

export const stepTraining = function (training: Training, controls: Controls, dt: number) {
	if (training.stage === 'complete') { training.state.events = []; return; }
	const state = training.state;
	const before = { x: state.player.x, y: state.player.y, angle: state.player.angle, hits: state.stats.shotsHit };
	state.spawnIn = 3600;
	if (training.stage === 'coolant') state.player.heat = Math.max(45, state.player.heat);
	step(state, { ...controls, fire: training.stage === 'combined' ? controls.fire : [training.stage === 'cannon' && controls.fire[0], training.stage === 'heat' && controls.fire[1], training.stage === 'missiles' && controls.fire[2], false], coolant: training.stage === 'coolant' && controls.coolant }, dt);
	// A missed drill is a retry, never a defeat or scored kill.
	state.player.hp = 100; state.relay = 100;
	training.distance += distance(before, state.player);
	training.turn += Math.abs(angleDelta(before.angle, state.player.angle));
	if (training.stage === 'drive' && training.distance >= 100) advance(training, 'neutral');
	else if (training.stage === 'neutral' && controls.stop && Math.abs(state.player.speed) < 8) {
		training.turn = 0; advance(training, 'steer');
	} else if (training.stage === 'steer' && training.turn >= Math.PI / 3) advance(training, 'cannon');
	else if (training.stage === 'cannon' && state.stats.shotsHit > before.hits) {
		state.shots = []; state.enemies = []; advance(training, 'missiles');
	} else if (training.stage === 'missiles' && state.stats.shotsHit > before.hits) {
		state.shots = []; state.enemies = []; advance(training, 'combined');
	} else if (training.stage === 'combined') {
		if (controls.fire.filter(Boolean).length >= 2 && !state.player.overheated) training.combinedTime += Math.min(Math.max(0, dt), 0.04);
		else training.combinedTime = 0;
		if (training.combinedTime >= 0.8) advance(training, 'heat');
	} else if (training.stage === 'heat' && state.player.heat >= 45) advance(training, 'coolant');
	else if (training.stage === 'coolant' && state.events.includes('coolant')) advance(training, 'evade');
	else if (training.stage === 'evade') {
		if (!training.strikeIssued && state.time - training.startedAt >= 2) {
			training.strikeOrigin = { x: state.player.x, y: state.player.y };
			state.strikes.push({ ...training.strikeOrigin, id: state.nextId++, life: 3.6, duration: 3.6, radius: 62, damage: 1 });
			state.events.push('artillery'); training.strikeIssued = true;
		}
		if (training.strikeIssued && state.strikes.length === 0 && training.strikeOrigin) {
			if (distance(state.player, training.strikeOrigin) > 82) advance(training, 'complete');
			else { training.strikeIssued = false; training.startedAt = state.time; }
		}
	}
	state.outcome = 'playing'; state.phase = 'combat';
};

export const trainingCopy = function (training: Training, controller: boolean): { title: string; instruction: string; progress: string } {
	const controls = controller
		? { drive: 'Push the left stick up', stop: 'Hold X / □', steer: 'Move the left stick left or right', aim: 'Aim with the right stick', cannon: 'RT', missile: 'RB', laser: 'LT', coolant: 'B / ○' }
		: { drive: 'Hold W / ↑ or the + control', stop: 'Hold X or STOP', steer: 'Hold A / D or a turn arrow', aim: 'Point at the target', cannon: '1 / Space / AC/38', missile: '3 / Q / TRIDENT', laser: '2 / E / ARC', coolant: 'V / VENT COOLANT' };
	const copy: Record<TrainingStage, [string, string]> = {
		drive: ['SET THE FRAME IN MOTION', `${controls.drive} to raise throttle. Release it to cruise. Travel 100 meters.`],
		neutral: ['BRING IT TO NEUTRAL', `${controls.stop} until the frame settles. Neutral cuts engine demand; eighty tons still need time to stop.`],
		steer: ['TURN THE HULL', `${controls.steer}. The hull and your turret turn independently.`],
		cannon: ['PUT A ROUND ON TARGET', `${controls.aim}; fire ${controls.cannon}. The turret needs a moment to track your aim.`],
		missiles: ['GUIDED FIRE', `${controls.aim}; fire ${controls.missile}. Trident follows a locked target.`],
		combined: ['COMBINE YOUR FIRE', controller ? 'Hold any two of RT, LT, RB and LB together for a moment. All four mounts can fire at once, but share reactor heat.' : 'Hold any two weapon buttons together for a moment: mouse left/right/middle/thumb, keys 1–4, or two on-screen mounts. All four can fire at once.'],
		heat: ['FEEL THE REACTOR', `Hold ${controls.laser} to build heat to 45%. Every weapon heats the same reactor.`],
		coolant: ['VENT THE HEAT', `Press ${controls.coolant}. One charge purges 55 heat. At 100% heat, weapons lock until the reactor cools.`],
		evade: ['CLEAR THE IMPACT ZONE', `Frame reset to the practice lane. ${controls.drive} when the orange circle appears. Leave it before impact; the strike stays where marked.`],
		complete: ['FRAME QUALIFICATION COMPLETE', 'You are ready for the operation. Flank armored siege frames and strike while they recover from a barrage.'],
	};
	const [title, instruction] = copy[training.stage];
	return { title, instruction, progress: `${Math.min(TRAINING_STAGES.length - 1, TRAINING_STAGES.indexOf(training.stage) + 1)} / ${TRAINING_STAGES.length - 1}` };
};
