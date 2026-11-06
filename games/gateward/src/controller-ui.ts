export interface ControllerCommands {
	readonly toggleDrawer: () => void;
	readonly back: () => void;
	readonly nextTab: (direction: -1 | 1) => void;
	readonly pause: () => void;
	readonly camera?: (horizontal: number, vertical: number, zoom: number, deltaSeconds: number) => void;
	readonly cameraEnabled?: () => boolean;
}

const finiteAxis = function (value: number | undefined): number { return value !== undefined && Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0; };

/** Analog controls must return to neutral after every connection or UI boundary. */
export const createCameraInput = function () {
	let armed = false;
	return {
		read: function (axes: readonly number[], leftTrigger: number, rightTrigger: number, enabled: boolean) {
			const x = finiteAxis(axes[2]); const y = finiteAxis(axes[3]);
			const left = Math.max(0, finiteAxis(leftTrigger)); const right = Math.max(0, finiteAxis(rightTrigger));
			const magnitude = Math.hypot(x, y);
			const neutral = magnitude <= 0.18 && left <= 0.12 && right <= 0.12;
			if (!enabled) armed = false;
			else if (neutral) armed = true;
			if (!enabled || !armed) return { horizontal: 0, vertical: 0, zoom: 0 };
			const strength = Math.max(0, Math.min(1, (magnitude - 0.18) / 0.82));
			const trigger = function (value: number) { return Math.max(0, (value - 0.12) / 0.88); };
			return { horizontal: strength > 0 ? x / magnitude * strength : 0, vertical: strength > 0 ? y / magnitude * strength : 0, zoom: trigger(right) - trigger(left) };
		},
	};
};

/** A newly connected/focused pad must release a held button before issuing it. */
export const createButtonEdges = function () {
	let previous: readonly boolean[] | undefined;
	return {
		reset: function () { previous = undefined; },
		read: function (pressed: readonly boolean[]): readonly number[] {
			const old = previous;
			previous = [...pressed];
			return old ? pressed.flatMap(function (down, index) { return down && !old[index] ? [index] : []; }) : [];
		},
	};
};

export const createControllerUI = function (root: HTMLElement, commands: ControllerCommands, signal: AbortSignal) {
	const pads = new Map<number, { edges: ReturnType<typeof createButtonEdges>; camera: ReturnType<typeof createCameraInput> }>();
	let focused = document.hasFocus();
	let lastPoll: number | undefined;
	const reset = function () { pads.clear(); lastPoll = undefined; };
	window.addEventListener('blur', function () { focused = false; reset(); }, { signal });
	window.addEventListener('focus', function () { focused = true; reset(); }, { signal });
	document.addEventListener('visibilitychange', reset, { signal });
	signal.addEventListener('abort', reset, { once: true });
	const visible = function (node: HTMLElement) {
		return !node.closest('[hidden], [inert]') && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden';
	};
	const scope = function () {
		return [...root.querySelectorAll<HTMLElement>('.overlay, #radar, #inspector')].find(function (node) {
			return visible(node) && (node.classList.contains('overlay') || node.id === 'radar');
		}) ?? [...root.querySelectorAll<HTMLElement>('#inspector')].find(visible) ?? root;
	};
	const controls = function () {
		return [...scope().querySelectorAll<HTMLElement>('button, select, input[type="range"], summary, a[href]')].filter(function (node) {
			return !(node instanceof HTMLButtonElement || node instanceof HTMLSelectElement || node instanceof HTMLInputElement ? node.disabled : false) && visible(node);
		});
	};
	const move = function (direction: -1 | 1) {
		const items = controls();
		const index = items.findIndex(function (node) { return node === document.activeElement; });
		const next = index < 0 ? direction === 1 ? 0 : items.length - 1 : (index + direction + items.length) % items.length;
		items[next]?.focus();
	};
	const adjust = function (direction: -1 | 1) {
		const node = document.activeElement;
		if (!(node instanceof HTMLElement) || !controls().includes(node)) return;
		if (node instanceof HTMLInputElement && node.type === 'range') {
			const previous = node.value;
			if (node.step === 'any') {
				const min = node.min === '' ? 0 : Number(node.min); const max = node.max === '' ? 100 : Number(node.max);
				node.valueAsNumber += direction * (max - min) / 100;
			} else if (direction > 0) node.stepUp(); else node.stepDown();
			if (node.value !== previous) { node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true })); }
			return;
		}
		if (!(node instanceof HTMLSelectElement)) return;
		const choices = [...node.options].filter(function (option) {
			return !option.disabled && !(option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled);
		});
		const index = choices.findIndex(function (option) { return option.selected; });
		const next = choices[index + direction];
		if (!next) return;
		node.value = next.value;
		node.dispatchEvent(new Event('change', { bubbles: true }));
	};
	const activate = function () {
		const node = document.activeElement;
		if (node instanceof HTMLSelectElement) { adjust(1); return; }
		if (node instanceof HTMLElement && controls().includes(node)) node.click();
		else move(1);
	};
	return {
		poll: function (deltaSeconds?: number) {
			const now = performance.now();
			const elapsed = deltaSeconds ?? (lastPoll === undefined ? 0 : (now - lastPoll) / 1000); lastPoll = now;
			const dt = Number.isFinite(elapsed) ? Math.max(0, Math.min(0.05, elapsed)) : 0;
			if (signal.aborted || !focused || document.hidden || typeof navigator.getGamepads !== 'function') return;
			const connected = new Set<number>();
			let cameraMoved = false;
			for (const pad of navigator.getGamepads()) {
				if (!pad?.connected || pad.mapping !== 'standard') continue;
				connected.add(pad.index);
				let input = pads.get(pad.index);
				if (!input) { input = { edges: createButtonEdges(), camera: createCameraInput() }; pads.set(pad.index, input); }
				const pressed = input.edges.read(pad.buttons.map(function (button) { return button.pressed; }));
				// One command per poll avoids a simultaneous close and activation leaking into battle.
				if (pressed.includes(9)) commands.pause();
				else if (pressed.includes(1)) commands.back();
				else if (pressed.includes(3)) commands.toggleDrawer();
				else if (pressed.includes(4)) commands.nextTab(-1);
				else if (pressed.includes(5)) commands.nextTab(1);
				else if (pressed.includes(12)) move(-1);
				else if (pressed.includes(13)) move(1);
				else if (pressed.includes(14)) adjust(-1);
				else if (pressed.includes(15)) adjust(1);
				else if (pressed.includes(0)) activate();
				// Re-evaluate after buttons: opening a modal must suppress analog
				// movement in the same frame, and closing it requires neutral again.
				const camera = input.camera.read(pad.axes, pad.buttons[6]?.value ?? 0, pad.buttons[7]?.value ?? 0, commands.cameraEnabled?.() ?? false);
				if (!cameraMoved && (camera.horizontal !== 0 || camera.vertical !== 0 || camera.zoom !== 0)) {
					commands.camera?.(camera.horizontal, camera.vertical, camera.zoom, dt); cameraMoved = true;
				}
			}
			for (const index of pads.keys()) if (!connected.has(index)) pads.delete(index);
		},
	};
};
