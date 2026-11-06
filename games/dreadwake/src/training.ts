import { createArsenalCampaign, localPoint, angleDelta, type State, type Controls } from './simulation';
import { installStarter, prepareDraft } from './arsenal';
import { createMount } from './weapons';

export interface Training { lesson: number; progress: number; originAngle: number }
export const trainingInstructions = [
	{ title: '01 / Bring the drive online', keyboard: 'Hold W or the + helm button to raise thrust. Release it: the order stays set. X or Neutral selects coast; momentum takes time to decay.', gamepad: 'Hold D-pad up to raise thrust. Release it: the order stays set. D-pad left selects neutral; momentum takes time to decay.' },
	{ title: '02 / Commit to a turn', keyboard: 'Hold A / D or the turn buttons. Bring the heading around by 20°. Turrets cover the flank where you install them.', gamepad: 'Lean the left stick left or right. Bring the heading around by 20°. Turrets cover the flank where you install them.' },
	{ title: '03 / Hold fire', keyboard: 'A Spark turret is fitted on port. Press G or the Weapons Free button to select Hold Fire. Every fitted weapon stops, including flak interception.', gamepad: 'A Spark turret is fitted on port. Press D-pad right to select Hold Fire. Every fitted weapon stops, including flak interception.' },
	{ title: '04 / Let the crew work', keyboard: 'Press G or Hold Fire again to select Weapons Free. The port turret finds and fires at the hulk automatically. You control position, not individual guns.', gamepad: 'Press D-pad right again to select Weapons Free. The port turret finds and fires at the hulk automatically. You control position, not individual guns.' },
	{ title: '05 / Build the battery', keyboard: 'This practice salvage choice freezes combat. Choose an upgrade, or install a weapon and select its socket. Damage earns these choices in the campaign.', gamepad: 'This practice salvage choice freezes combat. Navigate with the D-pad and select with A. Upgrade, or install a weapon and select its socket. Damage earns choices in the campaign.' },
	{ title: '06 / Watch the charge', keyboard: 'Training refit: Helios is now fitted on port. Its charge grows visibly, then the aim line locks before firing. Keep the hulk on your port flank. Hold Fire or armor lock cancels a charge.', gamepad: 'Training refit: Helios is now fitted on port. Its charge grows visibly, then the aim line locks before firing. Keep the hulk on your port flank. Hold Fire or armor lock cancels a charge.' },
	{ title: '07 / Layer your defenses', keyboard: 'Hold Space or Armor Lock, then press F or Aegis. Armor reduces damage and inhibits weapons. Aegis gives brief stronger protection. Defenses do not stack.', gamepad: 'Hold LB for armor lock, then press A for Aegis. Armor reduces damage and inhibits weapons. Aegis gives brief stronger protection. Defenses do not stack.' },
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
