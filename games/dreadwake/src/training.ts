import { createArsenalCampaign, localPoint, angleDelta, type State, type Controls } from './simulation';
import { installStarter, prepareDraft } from './arsenal';
import { createMount } from './weapons';

export interface Training { lesson: number; progress: number; originAngle: number }
const draftCopy = 'This practice salvage choice freezes combat. Choose an upgrade, or install a weapon and select its socket. Damage earns these choices in the campaign.';
const chargeCopy = 'Training refit: Helios is now fitted on port. Its charge grows visibly, then the aim line locks before firing. Keep the hulk on your port flank. Hold Fire or armor lock cancels a charge.';
export const trainingInstructions = [
	{ title: '01 / Bring the drive online',
		keyboard: 'Hold W or slide the throttle up to at least 70% ahead. The throttle holds its setting. Hold S to lower it, or press X or select Neutral to coast.',
		gamepad: 'Hold D-pad up to raise thrust or down to lower it. The drive keeps its order. Press D-pad left to coast.',
		touch: 'Slide the throttle up to at least 70% ahead. It holds its setting after release. Tap Neutral at midscale to coast.' },
	{ title: '02 / Commit to a turn',
		keyboard: 'Click away from the ship to order a heading, or turn with A / D or the rudder slider. Turn by 20°. Use the wheel to zoom.',
		gamepad: 'Lean the left stick left or right to turn by 20°. Move the right stick up or down to zoom.',
		touch: 'Tap away from the ship to order a heading, or slide the rudder left or right to turn. Release to hold the nearest mark. Turn by 20°. Pinch the battlefield to zoom.' },
	{ title: '03 / Hold fire',
		keyboard: 'A Spark turret is fitted on port. Press G or click Weapons Free to select Hold Fire. Every fitted weapon stops, including flak interception.',
		gamepad: 'A Spark turret is fitted on port. Press D-pad right to select Hold Fire. Every fitted weapon stops, including flak interception.',
		touch: 'A Spark turret is fitted on port. Tap Weapons Free to select Hold Fire. Every fitted weapon stops, including flak interception.' },
	{ title: '04 / Let the crew work',
		keyboard: 'Press G or click Hold Fire to select Weapons Free. The port turret finds and fires at the hulk automatically.',
		gamepad: 'Press D-pad right again to select Weapons Free. The port turret finds and fires at the hulk automatically.',
		touch: 'Tap Hold Fire to select Weapons Free. The port turret finds and fires at the hulk automatically.' },
	{ title: '05 / Build the battery', keyboard: draftCopy,
		gamepad: 'This practice salvage choice freezes combat. Navigate with the D-pad and select with A. Upgrade, or install a weapon and select its socket. Damage earns choices in the campaign.',
		touch: draftCopy },
	{ title: '06 / Watch the charge', keyboard: chargeCopy, gamepad: chargeCopy, touch: chargeCopy },
	{ title: '07 / Layer your defenses',
		keyboard: 'Hold Space for Armor Lock, then press F for Aegis. Armor reduces damage and inhibits weapons. Aegis gives brief stronger protection. Defenses do not stack.',
		gamepad: 'Hold LB for Armor Lock, then press A for Aegis. Armor reduces damage and inhibits weapons. Aegis gives brief stronger protection. Defenses do not stack.',
		touch: 'Hold Armor Lock with one finger and tap Aegis with another. Armor reduces damage and inhibits weapons. Aegis gives brief stronger protection. Defenses do not stack.' },
] as const;

const positionTarget = function (state: State, lesson: number) {
	const target = state.enemies[0]; if (!target) return;
	const point = localPoint(state.player, 0, lesson < 2 ? -1400 : -480);
	target.x = point.x; target.y = point.y; target.angle = state.player.angle + Math.PI;
	target.vx = 0; target.vy = 0; target.training = true;
	target.hp = 100000; target.maxHp = 100000; target.cooldown = 10000; target.warning = 0;
};
export const createTraining = function (): { state: State; training: Training } {
	const state = createArsenalCampaign(); delete state.campaign;
	state.enemies = state.enemies.slice(0, 1); installStarter(state, 'spark', 0);
	positionTarget(state, 0);
	return { state, training: { lesson: 0, progress: 0, originAngle: state.player.angle } };
};

// The scripted draft and charge refit are isolated practice fixtures. No campaign
// checkpoint is read or written, and training targets cannot award real salvage.
export const advanceTraining = function (training: Training, state: State, input: Controls, dt: number): boolean {
	state.player.hp = state.player.maxHp;
	const target = state.enemies[0]; if (target) target.hp = target.maxHp;
	const arsenal = state.arsenal; if (!arsenal) return false;
	const practicedMount = arsenal.mounts[0];
	if (training.lesson === 2 && !state.fireControl.automatic) training.progress += dt;
	if (training.lesson === 6 && input.brace) training.progress += dt;
	const passed = training.lesson === 0 ? state.player.throttle >= 0.7
		: training.lesson === 1 ? Math.abs(angleDelta(training.originAngle, state.player.angle)) > Math.PI / 9
		: training.lesson === 2 ? training.progress > 0.3
		: training.lesson === 3 ? state.fireControl.automatic && (practicedMount?.fired ?? 0) > 0
		: training.lesson === 4 ? arsenal.pending === 0
		: training.lesson === 5 ? practicedMount?.weapon === 'helios' && practicedMount.fired > 0
		: training.progress > 0 && state.shield.active > 0;
	if (!passed) return false;
	training.lesson++; training.progress = 0; training.originAngle = state.player.angle;
	state.player.throttle = 0; state.player.vx = 0; state.player.vy = 0; state.player.yaw = 0;
	if (training.lesson === 3 && practicedMount) { practicedMount.fired = 0; practicedMount.reload = 0; }
	if (training.lesson === 4) { arsenal.pending = 1; arsenal.rewards = 1; prepareDraft(state); }
	if (training.lesson === 5) {
		arsenal.mounts = arsenal.mounts.map(function (_, slot) { return slot === 0 ? createMount(0, 'helios', 1, state.player.angle) : null; });
		state.fireControl.automatic = true; state.shells = []; state.beams = [];
	}
	positionTarget(state, training.lesson);
	return training.lesson >= trainingInstructions.length;
};
