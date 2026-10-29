// Stage space is y-down, origin at the top-left, matching the Pixi view.
// The gunner and the player share this fixed stage. A later pass can scroll
// both of them together; this pass does not move the lane.

export const STAGE = { width: 960, height: 540 } as const;
export const HOME = { x: 480, y: 270 } as const;
export const MAX_REACH = 132;
export const ENEMY = { x: 148, y: 272 } as const;
// Barrel tip. Local offset from ENEMY is (104, -2); the view draws to that tip.
export const MUZZLE = { x: 252, y: 270 } as const;
export const PLAYER = { radius: 18, lives: 3 } as const;
export const SHOT = { radius: 10, speed: 210 } as const;
export const FIRE = { opening: 0.75, telegraph: 0.5, gap: 0.9 } as const;
export const SPRING = { stiffness: 460, damping: 2 * Math.sqrt(460) } as const;
export const HURT_TIME = 0.28;
export const MUZZLE_FLASH = 0.12;
// Caps a hitch so a shot cannot jump farther than the combined hit radii in one frame.
export const MAX_FRAME = 1 / 20;
export const STICK_TRAVEL = 46;

export interface SpringStep {
	readonly x: number;
	readonly y: number;
	readonly vx: number;
	readonly vy: number;
}

export interface StickOffset {
	readonly x: number;
	readonly y: number;
	readonly knobX: number;
	readonly knobY: number;
}

export interface Volley {
	mode: 'wait' | 'telegraph';
	remaining: number;
	aimX: number;
	aimY: number;
	flash: number;
}

export const clampLength = (x: number, y: number, max: number): { x: number; y: number } => {
	if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(max) || max <= 0) return { x: 0, y: 0 };
	const length = Math.hypot(x, y);
	if (length <= max || length === 0) return { x, y };
	const scale = max / length;
	return { x: x * scale, y: y * scale };
};

export const stickOffset = (dx: number, dy: number, travel: number, reach: number): StickOffset => {
	if (travel <= 0 || reach <= 0) return { x: 0, y: 0, knobX: 0, knobY: 0 };
	const clamped = clampLength(dx, dy, travel);
	const scale = reach / travel;
	return { x: clamped.x * scale, y: clamped.y * scale, knobX: clamped.x, knobY: clamped.y };
};

// Keyboard is full deflection. A stick or pad in the same direction should not add to it.
export const aimFromDevices = (keyboardX: number, keyboardY: number, padX: number, padY: number): { x: number; y: number } => {
	const usingKeys = keyboardX !== 0 || keyboardY !== 0;
	const sourceX = usingKeys ? keyboardX : padX;
	const sourceY = usingKeys ? keyboardY : padY;
	const clamped = clampLength(sourceX, sourceY, 1);
	return { x: clamped.x * MAX_REACH, y: clamped.y * MAX_REACH };
};

export const shotDirection = (aimX: number, aimY: number): { x: number; y: number } => {
	const x = aimX - MUZZLE.x;
	const y = aimY - MUZZLE.y;
	if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x, y) < 1) return { x: 1, y: 0 };
	return { x, y };
};

// Offsets are relative to HOME. The target is pulled onto the reach circle.
export const integrateSpring = (x: number, y: number, vx: number, vy: number, targetX: number, targetY: number, dt: number): SpringStep => {
	if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(vx) || !Number.isFinite(vy)) {
		return { x: 0, y: 0, vx: 0, vy: 0 };
	}
	const target = clampLength(targetX, targetY, MAX_REACH);
	if (!(dt > 0)) return { x, y, vx, vy };
	const step = 1 / 120;
	let left = dt;
	while (left > 1e-8) {
		const h = Math.min(step, left);
		const ax = SPRING.stiffness * (target.x - x) - SPRING.damping * vx;
		const ay = SPRING.stiffness * (target.y - y) - SPRING.damping * vy;
		vx += ax * h;
		vy += ay * h;
		x += vx * h;
		y += vy * h;
		const clamped = clampLength(x, y, MAX_REACH);
		if (clamped.x !== x || clamped.y !== y) {
			const outward = vx * clamped.x + vy * clamped.y;
			if (outward > 0) {
				const denom = clamped.x * clamped.x + clamped.y * clamped.y;
				vx -= clamped.x * outward / denom;
				vy -= clamped.y * outward / denom;
			}
			x = clamped.x;
			y = clamped.y;
		}
		left -= h;
	}
	if (Math.hypot(target.x - x, target.y - y) < 0.05 && Math.hypot(vx, vy) < 0.5) {
		return { x: target.x, y: target.y, vx: 0, vy: 0 };
	}
	return { x, y, vx, vy };
};

// Mutates the volley. Each returned point is the aim locked when that shot fired.
export const advanceVolley = (volley: Volley, dt: number, playerX: number, playerY: number): readonly { x: number; y: number }[] => {
	if (!(dt > 0)) return [];
	volley.flash = Math.max(0, volley.flash - dt);
	const fired: { x: number; y: number }[] = [];
	let left = dt;
	for (let hop = 0; hop < 6 && left > 1e-8; hop += 1) {
		if (volley.remaining > left) {
			volley.remaining -= left;
			break;
		}
		left -= volley.remaining;
		if (volley.mode === 'wait') {
			volley.mode = 'telegraph';
			volley.remaining = FIRE.telegraph;
			volley.aimX = playerX;
			volley.aimY = playerY;
			continue;
		}
		fired.push({ x: volley.aimX, y: volley.aimY });
		volley.mode = 'wait';
		volley.remaining = FIRE.gap;
		volley.flash = MUZZLE_FLASH;
	}
	return fired;
};
