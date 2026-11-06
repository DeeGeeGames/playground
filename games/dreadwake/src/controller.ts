export interface PadSample {
	index: number;
	buttons: readonly { pressed: boolean; value: number }[];
	axes: readonly number[];
}
export interface PadFrame {
	turn: number; drive: number; zoom: number;
	port: boolean; starboard: boolean; brace: boolean; beam: boolean;
	pulse: boolean; missile: boolean; torpedo: boolean; target: boolean; neutral: boolean; autoFire: boolean;
	pause: boolean; confirm: boolean; cancel: boolean;
	direction: 'up' | 'down' | 'left' | 'right' | undefined;
	used: boolean;
}
const idle = function (): PadFrame {
	return { turn: 0, drive: 0, zoom: 0, port: false, starboard: false, brace: false, beam: false,
		pulse: false, missile: false, torpedo: false, target: false, neutral: false, autoFire: false,
		pause: false, confirm: false, cancel: false, direction: undefined, used: false };
};
const axis = function (value = 0) {
	if (!Number.isFinite(value) || Math.abs(value) <= 0.2) return 0;
	return Math.sign(value) * Math.min(1, (Math.abs(value) - 0.2) / 0.8);
};

// Transitions require a neutral controller before arming. A held trigger can never
// carry a salvo through a menu, reconnect, refit or new campaign.
export const createController = function (autonomousWeapons = false) {
	let previous = new Set<number>();
	let blocked = true;
	let lastDirection: PadFrame['direction'];
	let repeatAt = 0;
	return {
		clear: function () { blocked = true; previous.clear(); lastDirection = undefined; },
		read: function (pad: PadSample | undefined, now: number): PadFrame {
			if (!pad) { blocked = true; previous.clear(); return idle(); }
			const held = new Set(pad.buttons.flatMap(function (button, index) { return button.pressed || button.value > 0.5 ? [index] : []; }));
			const x = axis(pad.axes[0]); const y = axis(pad.axes[1]); const zoom = axis(pad.axes[3]);
			const used = held.size > 0 || x !== 0 || y !== 0 || zoom !== 0;
			if (blocked) { previous = held; if (!used) blocked = false; return idle(); }
			const down = function (index: number) { return held.has(index); };
			const pressed = function (index: number) { return down(index) && !previous.has(index); };
			const direction = down(12) || y < -0.55 ? 'up' : down(13) || y > 0.55 ? 'down'
				: down(14) || x < -0.55 ? 'left' : down(15) || x > 0.55 ? 'right' : undefined;
			const move = direction !== lastDirection || now >= repeatAt;
			if (direction !== lastDirection) repeatAt = now + 380;
			else if (move) repeatAt = now + 140;
			lastDirection = direction;
			const frame: PadFrame = {
				turn: x, drive: Number(down(12)) - Number(down(13)), zoom: -zoom,
				port: !autonomousWeapons && down(6), starboard: !autonomousWeapons && down(7), brace: down(4), beam: !autonomousWeapons && down(5),
				pulse: pressed(0), target: !autonomousWeapons && pressed(1), missile: !autonomousWeapons && pressed(2), torpedo: !autonomousWeapons && pressed(3),
				neutral: pressed(14), autoFire: pressed(15), pause: pressed(9),
				confirm: pressed(0), cancel: pressed(1), direction: move ? direction : undefined, used,
			};
			previous = held;
			return frame;
		},
	};
};

export const connectedController = function (): Gamepad | undefined {
	try { return [...navigator.getGamepads()].find(function (pad): pad is Gamepad { return pad !== null && pad.connected && pad.mapping === 'standard'; }); }
	catch { return undefined; }
};
