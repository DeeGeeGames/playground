export type GamepadSnapshot = Pick<Gamepad, 'axes' | 'buttons' | 'connected' | 'index' | 'mapping'>;
export interface PadInput {
	connected: boolean;
	drive: number;
	turn: number;
	aimX: number;
	aimY: number;
	cannon: boolean;
	laser: boolean;
	missile: boolean;
	coolant: boolean;
	stop: boolean;
	pause: boolean;
	confirm: boolean;
	back: boolean;
	navigate: number;
	adjust: number;
}
const deadZone = function (value: number, zone = 0.18) { return Math.abs(value) <= zone ? 0 : Math.sign(value) * (Math.min(1, Math.abs(value)) - zone) / (1 - zone); };
export const createGamepadInput = function () {
	let previous = new Set<number>();
	let navigation = 0;
	let repeatAt = 0;
	let index: number | undefined;
	const reset = function () { previous.clear(); navigation = 0; repeatAt = 0; index = undefined; };
	const read = function (pads: readonly (GamepadSnapshot | null)[], now: number): PadInput {
		const pad = pads.find(function (candidate) { return candidate?.connected && candidate.mapping === 'standard'; });
		const buttons = new Set<number>();
		pad?.buttons.forEach(function (button, at) { if (button.pressed || button.value > 0.35) buttons.add(at); });
		if (pad?.index !== index) { previous = new Set(buttons); index = pad?.index; }
		const pressed = function (button: number) { return buttons.has(button); };
		const edge = function (button: number) { return pressed(button) && !previous.has(button); };
		const x = deadZone(pad?.axes[0] ?? 0); const y = deadZone(pad?.axes[1] ?? 0);
		const direction = pressed(12) || pressed(14) || y < -0.55 || x < -0.55 ? -1 : pressed(13) || pressed(15) || y > 0.55 || x > 0.55 ? 1 : 0;
		let navigate = 0;
		if (direction && (navigation !== direction || now >= repeatAt)) { navigate = direction; repeatAt = now + (navigation === direction ? 160 : 400); }
		navigation = direction;
		const result: PadInput = {
			connected: Boolean(pad), drive: -y, turn: x, aimX: deadZone(pad?.axes[2] ?? 0), aimY: deadZone(pad?.axes[3] ?? 0),
			cannon: pressed(7), laser: pressed(6), missile: pressed(5), coolant: pressed(4), stop: pressed(2),
			pause: edge(9), confirm: edge(0), back: edge(1), navigate, adjust: pressed(14) || pressed(15) || Math.abs(x) > 0.55 ? navigate : 0,
		};
		previous = buttons;
		return result;
	};
	return { read, reset };
};
