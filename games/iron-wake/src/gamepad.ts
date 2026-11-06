import type { FireInputs } from './arsenal';

export type GamepadSnapshot = Pick<Gamepad, 'axes' | 'buttons' | 'connected' | 'index' | 'mapping' | 'id'>;
export interface PadInput {
	connected: boolean;
	available: boolean;
	lost: boolean;
	claimed: boolean;
	activity: boolean;
	ready: boolean;
	index: number | undefined;
	drive: number;
	turn: number;
	aimX: number;
	aimY: number;
	fire: FireInputs;
	coolant: boolean;
	stop: boolean;
	pause: boolean;
	confirm: boolean;
	back: boolean;
	navigate: number;
	adjust: number;
	scroll: number;
}
const deadZone = function (value: number, zone = 0.18) {
	return !Number.isFinite(value) || Math.abs(value) <= zone ? 0 : Math.sign(value) * (Math.min(1, Math.abs(value)) - zone) / (1 - zone);
};
const identity = function (pad: GamepadSnapshot) { return `${pad.index}:${pad.id}`; };
const pressedButtons = function (pad: GamepadSnapshot) {
	const buttons = new Set<number>();
	pad.buttons.forEach(function (button, index) { if (button.pressed || button.value > 0.35) buttons.add(index); });
	return buttons;
};

export const createGamepadInput = function () {
	let previous = new Map<string, ReadonlySet<number>>();
	let owner: string | undefined;
	let navigation = 0;
	let repeatAt = 0;
	let gameplayReady = false;
	let menuReady = true;
	const requireNeutral = function () { gameplayReady = false; menuReady = false; navigation = 0; };
	const suspend = function () { previous.clear(); navigation = 0; menuReady = false; requireNeutral(); };
	const reset = function () { suspend(); owner = undefined; repeatAt = 0; };
	const read = function (pads: readonly (GamepadSnapshot | null)[], now: number): PadInput {
		const connected = pads.filter(function (candidate): candidate is GamepadSnapshot { return candidate !== null && candidate.connected && candidate.mapping === 'standard'; });
		const samples = connected.map(function (pad) { return { pad, key: identity(pad), buttons: pressedButtons(pad) }; });
		let sample = samples.find(function (candidate) { return candidate.key === owner; });
		const lost = owner !== undefined && !sample;
		let claimed = false;
		if (lost) { owner = undefined; navigation = 0; requireNeutral(); }
		// A replacement never takes over on the loss frame. Newly exposed/held
		// buttons are baselined, so connecting a pad cannot deploy or resume a run.
		if (!owner && !lost) {
			sample = samples.find(function (candidate) {
				const before = previous.get(candidate.key);
				return before !== undefined && [0, 9].some(function (button) { return candidate.buttons.has(button) && !before.has(button); });
			});
			if (sample) { owner = sample.key; claimed = true; navigation = 0; repeatAt = 0; menuReady = false; requireNeutral(); }
		}
		const buttons = sample?.buttons ?? new Set<number>();
		const before = sample ? previous.get(sample.key) : undefined;
		const pressed = function (button: number) { return buttons.has(button); };
		const edge = function (button: number) { return menuReady && !claimed && before !== undefined && pressed(button) && !before.has(button); };
		const x = deadZone(sample?.pad.axes[0] ?? 0); const y = deadZone(sample?.pad.axes[1] ?? 0);
		const aimX = deadZone(sample?.pad.axes[2] ?? 0); const aimY = deadZone(sample?.pad.axes[3] ?? 0);
		const neutral = x === 0 && y === 0 && aimX === 0 && aimY === 0 && ![1, 2, 4, 5, 6, 7].some(pressed);
		if (sample && !claimed && neutral) gameplayReady = true;
		if (sample && x === 0 && y === 0 && aimX === 0 && aimY === 0 && ![0, 1, 9, 12, 13, 14, 15].some(pressed)) menuReady = true;
		const direction = pressed(12) || pressed(14) || y < -0.55 || x < -0.55 ? -1 : pressed(13) || pressed(15) || y > 0.55 || x > 0.55 ? 1 : 0;
		let navigate = 0;
		if (menuReady && !claimed && direction && (navigation !== direction || now >= repeatAt)) { navigate = direction; repeatAt = now + (navigation === direction ? 160 : 400); }
		navigation = direction;
		const ready = gameplayReady && !claimed;
		const result: PadInput = {
			connected: Boolean(sample), available: connected.length > 0, lost, claimed,
			activity: Boolean(sample) && (claimed || buttons.size > 0 || x !== 0 || y !== 0 || aimX !== 0 || aimY !== 0), ready, index: sample?.pad.index,
			drive: ready ? -y : 0, turn: ready ? x : 0, aimX: ready ? aimX : 0, aimY: ready ? aimY : 0,
			fire: [ready && pressed(7), ready && pressed(6), ready && pressed(5), ready && pressed(4)],
			coolant: ready && pressed(1), stop: ready && pressed(2),
			pause: edge(9), confirm: edge(0), back: edge(1), navigate,
			adjust: pressed(14) || pressed(15) || Math.abs(x) > 0.55 ? navigate : 0,
			scroll: claimed || !menuReady ? 0 : aimY,
		};
		previous = new Map(samples.map(function (candidate) { return [candidate.key, candidate.buttons]; }));
		return result;
	};
	return { read, reset, requireNeutral, suspend };
};
