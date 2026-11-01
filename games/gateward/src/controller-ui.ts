export interface ControllerCommands {
	readonly toggleDrawer: () => void;
	readonly back: () => void;
	readonly nextTab: (direction: -1 | 1) => void;
	readonly pause: () => void;
}

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
	const pads = new Map<number, ReturnType<typeof createButtonEdges>>();
	let focused = document.hasFocus();
	const reset = function () { pads.clear(); };
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
		return [...scope().querySelectorAll<HTMLElement>('button, select, summary, a[href]')].filter(function (node) {
			return !(node instanceof HTMLButtonElement || node instanceof HTMLSelectElement ? node.disabled : false) && visible(node);
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
		if (!(node instanceof HTMLSelectElement) || !controls().includes(node)) return;
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
		poll: function () {
			if (signal.aborted || !focused || document.hidden || typeof navigator.getGamepads !== 'function') return;
			const connected = new Set<number>();
			for (const pad of navigator.getGamepads()) {
				if (!pad?.connected || pad.mapping !== 'standard') continue;
				connected.add(pad.index);
				let edges = pads.get(pad.index);
				if (!edges) { edges = createButtonEdges(); pads.set(pad.index, edges); }
				const pressed = edges.read(pad.buttons.map(function (button) { return button.pressed; }));
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
			}
			for (const index of pads.keys()) if (!connected.has(index)) pads.delete(index);
		},
	};
};
