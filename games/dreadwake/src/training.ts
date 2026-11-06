import { createState, localPoint, type State, type Controls } from './simulation';

export interface Training { lesson: number; progress: number; originAngle: number }
export const trainingInstructions = [
	{ title: '01 / Bring the drive online', keyboard: 'Hold W to raise thrust. The order stays set when you release it. X selects neutral; momentum takes time to decay.', gamepad: 'Hold D-pad up to raise thrust. The order stays set when released. D-pad left selects neutral; momentum takes time to decay.' },
	{ title: '02 / Commit to a turn', keyboard: 'Hold A or D. A capital ship turns slowly and drifts through the turn. Bring the heading around by 20°.', gamepad: 'Lean the left stick left or right. A capital ship turns slowly and drifts through the turn. Bring the heading around by 20°.' },
	{ title: '03 / Six guns, one broadside', keyboard: 'The practice hulk is on your port side. Hold Q to commit a six-gun salvo. Cyan side arcs show where the array can acquire.', gamepad: 'The practice hulk is on your port side. Hold LT to commit a six-gun salvo. Cyan side arcs show where the array can acquire.' },
	{ title: '04 / Heavy bow torpedoes', keyboard: 'Target ahead. Tap T to ripple three heavy homing torpedoes. They need a bow solution; each salvo keeps its target.', gamepad: 'Target ahead. Press Y to ripple three heavy homing torpedoes. They need a bow solution; each salvo keeps its target.' },
	{ title: '05 / All-aspect missiles', keyboard: 'The hulk is behind you. Tap V to launch a guided missile swarm. These can acquire around the ship while you turn.', gamepad: 'The hulk is behind you. Press X to launch a guided missile swarm. These can acquire around the ship while you turn.' },
	{ title: '06 / Hold the lance on target', keyboard: 'Target ahead. Hold C to burn with the beam lance. Stay aligned through the narrow bow arc; release to recharge.', gamepad: 'Target ahead. Hold RB to burn with the beam lance. Stay aligned through the narrow bow arc; release to recharge.' },
	{ title: '07 / Layer your defenses', keyboard: 'Hold Space for armor lock, then tap F for Aegis. Armor limits your weapons and drive. Shields give a brief stronger defense.', gamepad: 'Hold LB for armor lock, then press A for Aegis. Armor limits your weapons and drive. Shields give a brief stronger defense.' },
] as const;

const positionTarget = function (state: State, lesson: number) {
	const target = state.enemies[0]; if (!target) return;
	const side = lesson === 2 ? -420 : 0;
	const forward = lesson === 4 ? -500 : lesson === 2 ? 0 : 480;
	const point = localPoint(state.player, forward, side);
	target.x = point.x; target.y = point.y; target.angle = state.player.angle + Math.PI;
	target.vx = 0; target.vy = 0; target.training = true;
	target.hp = 100000; target.maxHp = 100000; target.cooldown = 10000; target.warning = 0;
};
export const createTraining = function (): { state: State; training: Training } {
	const state = createState(); state.enemies = state.enemies.slice(0, 1);
	positionTarget(state, 0);
	return { state, training: { lesson: 0, progress: 0, originAngle: state.player.angle } };
};

// Flight school is deliberately outside campaign persistence and grants invulnerability.
// Advancement measures executed ship actions, never button labels or elapsed time alone.
export const advanceTraining = function (training: Training, state: State, input: Controls, dt: number): boolean {
	state.player.hp = state.player.maxHp;
	const target = state.enemies[0]; if (target) target.hp = target.maxHp;
	const passed = training.lesson === 0 ? state.player.throttle >= 0.7
		: training.lesson === 1 ? Math.abs(state.player.angle - training.originAngle) > Math.PI / 9
		: training.lesson === 2 ? state.batteries.port.reload > 0 && state.batteries.port.remaining === 0
		: training.lesson === 3 ? state.stats.torpedoSalvos > 0 && state.torpedoes.remaining === 0
		: training.lesson === 4 ? state.missiles.reload > 0 && state.missiles.remaining === 0
		: training.lesson === 5 ? state.beam.firing && state.beam.target === state.enemies[0]?.id
		: training.progress > 0 && state.shield.active > 0;
	if (training.lesson === 5) { if (passed) training.progress += dt; if (training.progress < 0.8) return false; }
	else if (training.lesson === 6) { if (input.brace) training.progress += dt; if (!passed) return false; }
	else if (!passed) return false;
	training.lesson++; training.progress = 0; training.originAngle = state.player.angle;
	state.player.throttle = 0; state.player.vx = 0; state.player.vy = 0; state.player.yaw = 0;
	positionTarget(state, training.lesson);
	return training.lesson >= trainingInstructions.length;
};
